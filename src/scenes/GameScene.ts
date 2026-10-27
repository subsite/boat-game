import Phaser from "phaser";
import { createTextures, ROCKS, rockLayout, FROTH_VARIANTS, DASH_GAUGES } from "../textures";
import { playBloink, playSink } from "../sfx";
import {
  GAME_WIDTH,
  PANEL_HEIGHT,
  PLAY_HEIGHT,
  SCROLL_SPEED,
  DAYCRUISER_SPEED,
  FREIGHTER_SPEED,
  MIN_SPAWN_GAP,
  SPAWN_DELAY,
  FREIGHTER_CHANCE,
  WIDE_WIDTH,
  WIDE_GAP,
  SPAWN_MIN_Y,
  SPAWN_MAX_Y,
  GRAVITY,
  THRUST,
  MAX_FALL,
} from "../config";

type Body = Phaser.Physics.Arcade.Body;
type GameState = "ready" | "playing" | "docked" | "over";

type ObstacleType = "rock" | "daycruiser" | "freighter";

// A point on the wake line, left in the water at the stern.
interface WakePoint {
  x: number;
  y: number;
  age: number; // ms
  side: number; // which arm its froth fleck sits on (-1 or 1)
  fx: number; // fleck offset and size, fixed per point so it never flickers
  fy: number;
  fr: number;
}
// A wake trailing behind one boat (the player's or a vessel's).
interface Wake {
  owner: Phaser.GameObjects.GameObject; // the wake is dropped once this is gone and faded
  stern: () => { x: number; y: number } | null; // null while not leaving a wake
  spread: number; // px/s sideways speed of each arm
  size: number; // line width / fleck scale
  points: WakePoint[];
  sinceEmit: number; // ms
}
const WAKE_LIFE = 1800; // ms before a wake point has faded out
const WAKE_EMIT = 30; // ms between wake points
// Each arm spreads sideways at this fraction of the boat's speed through the
// water, opening a V of roughly 20 degrees like a real boat's wake.
const WAKE_ANGLE = 0.35;

/**
 * Painter's order for boats and obstacles: whatever has its hitbox centre
 * lower on screen is nearer the viewer and drawn in front. Kept between the
 * sea/wakes (below 1) and the splash/deck/HUD (6 and up).
 */
const depthAt = (y: number) => 1 + y / 1000;

// Draw scale per obstacle type (art, hitbox and wake scale together).
const SCALES: Record<ObstacleType, number> = {
  rock: 1,
  daycruiser: 0.8,
  freighter: 1,
};

const SPEEDS: Record<ObstacleType, number> = {
  rock: SCROLL_SPEED,
  daycruiser: DAYCRUISER_SPEED,
  freighter: FREIGHTER_SPEED,
};

export class GameScene extends Phaser.Scene {
  private state: GameState = "ready";

  private boat!: Phaser.Physics.Arcade.Sprite;
  private wheel!: Phaser.GameObjects.Image;
  private wheelShadow!: Phaser.GameObjects.Image;
  private compassCard!: Phaser.GameObjects.Image;
  private revNeedle!: Phaser.GameObjects.Image;
  private revAngle = 135; // tracked here: Phaser wraps .angle to ±180, the dial sweeps 135..405
  private hazards!: Phaser.Physics.Arcade.Group;
  private ripples: Phaser.GameObjects.Image[] = [];
  private seaBase!: Phaser.GameObjects.TileSprite;
  private seaSheen!: Phaser.GameObjects.TileSprite;

  private spawnTimer?: Phaser.Time.TimerEvent;
  private lastWide = false;
  private lastSpawn = 0;
  private lastArrival = 0;
  // Control sources currently held down ("p<id>" per pointer, or a key name).
  // The boat rises while any is held, so a lifted palm or second finger
  // doesn't drop it while another touch is still down.
  private held = new Set<string>();
  private canRestart = false;

  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private medalGraphics!: Phaser.GameObjects.Graphics;
  private medalScoreText!: Phaser.GameObjects.Text;
  private arrow!: Phaser.GameObjects.Image;
  private arrowTween?: Phaser.Tweens.Tween;

  private pressIndicator!: Phaser.GameObjects.Arc;
  private bobTween?: Phaser.Tweens.Tween;
  private wakeGfx!: Phaser.GameObjects.Graphics;
  private wakes: Wake[] = [];
  // How fast the world (sea, rocks, spawning) moves past the boat, 0..1.
  // Eased down when docking and back up when leaving, so nothing jolts.
  private worldSpeed = 1;
  private worldTween?: Phaser.Tweens.Tween;

  constructor() {
    super({ key: "GameScene" });
  }

  preload() {
    this.load.image("falko", "falko.png");
  }

  create() {
    createTextures(this);

    // Reset per-run state (field initializers only run once, not on scene.restart).
    this.ripples = [];
    this.wakes = [];
    this.worldSpeed = 1;
    this.held = new Set();
    this.canRestart = false;
    this.score = 0;

    // Bounds keep the boat inside the play area (it clamps to the edges instead
    // of dying there — the only way to fail is touching an obstacle).
    // Bottom set 4 px short so the sprite's visual bottom (24 px below centre)
    // lands exactly on the deck line rather than crossing it.
    this.physics.world.setBounds(0, 0, GAME_WIDTH, PLAY_HEIGHT - 4);

    this.buildBackground();
    this.buildBoat();
    this.buildWake();
    this.hazards = this.physics.add.group();
    this.buildControl();
    this.buildHud();

    // Obstacles only hit while playing; "ghost" ones were overlapping the boat
    // when it left the dock and are let through.
    this.physics.add.overlap(
      this.boat,
      this.hazards,
      () => this.endGame(),
      (_boat, ob) => this.state === "playing" && !(ob as Phaser.GameObjects.Sprite).getData("ghost")
    );

    this.bindInput();
    this.enterReady();
  }

  // ---------------------------------------------------------------- build

  private buildBackground() {
    // Dark Baltic water seen from above, with a ripple-sparkle layer scrolled
    // over it at a slightly different speed so the surface moves calmly.
    this.seaBase = this.add
      .tileSprite(0, 0, GAME_WIDTH, PLAY_HEIGHT, "sea")
      .setOrigin(0)
      .setDepth(-20);
    this.seaSheen = this.add
      .tileSprite(0, 0, GAME_WIDTH, PLAY_HEIGHT, "sea_sheen")
      .setOrigin(0)
      .setDepth(-18);

    // Drifting froth patches, angled along the swell crests.
    this.ripples = [];
    for (let i = 0; i < 8; i++) {
      this.ripples.push(
        this.add
          .image(
            Phaser.Math.Between(0, GAME_WIDTH),
            Phaser.Math.Between(20, PLAY_HEIGHT - 20),
            `wave_${Phaser.Math.Between(0, FROTH_VARIANTS - 1)}`
          )
          .setDepth(-15)
          .setAngle(28 + Phaser.Math.FloatBetween(-8, 8))
          .setScale(Phaser.Math.FloatBetween(0.8, 1.4), Phaser.Math.FloatBetween(0.8, 1.1))
          .setAlpha(Phaser.Math.FloatBetween(0.35, 0.8))
      );
    }
  }

  private buildBoat() {
    this.boat = this.physics.add
      .sprite(110, PLAY_HEIGHT / 2, "falko")
      .setDisplaySize(140, 48);
    const body = this.boat.body as Body;
    body.setGravityY(GRAVITY);
    body.setAllowGravity(false);
    body.setMaxVelocity(0, MAX_FALL);
    // Hitbox covers the main hull only (below superstructure), forgiving collisions.
    // Values are in display px; Arcade measures bodies in source-image px and
    // scales them with the sprite, so divide by the scale (falko.png is ~1300 px wide).
    const sx = this.boat.scaleX;
    const sy = this.boat.scaleY;
    body.setSize(110 / sx, 18 / sy, false);
    body.setOffset(15 / sx, 26 / sy);
    this.boat.setCollideWorldBounds(true);
  }

  private buildWake() {
    this.wakeGfx = this.add.graphics().setDepth(0.5);
    // Only a boat under way leaves a wake (not when docked or sunk).
    this.wakes.push({
      owner: this.boat,
      stern: () => {
        if (this.state !== "ready" && this.state !== "playing") return null;
        const c = Math.cos(this.boat.rotation);
        const s = Math.sin(this.boat.rotation);
        const ox = -64; // stern, in display px from the boat's centre
        const oy = 16; // waterline
        return { x: this.boat.x + c * ox - s * oy, y: this.boat.y + s * ox + c * oy };
      },
      spread: WAKE_ANGLE * SCROLL_SPEED,
      size: 1,
      points: [],
      sinceEmit: WAKE_EMIT,
    });
  }

  /** Trail a wake behind a vessel, from its stern (offset from its centre) at the waterline. */
  private addVesselWake(ob: Phaser.GameObjects.Sprite, type: ObstacleType, ox: number, oy: number, size: number) {
    this.wakes.push({
      owner: ob,
      stern: () => (this.state === "over" || !ob.active ? null : { x: ob.x + ox, y: ob.y + oy }),
      spread: WAKE_ANGLE * (SPEEDS[type] - SCROLL_SPEED),
      size,
      points: [],
      sinceEmit: WAKE_EMIT,
    });
  }

  /**
   * Wakes are drawn like a plotter pen: points are dropped at the stern
   * waterline and drift off with the water while two arms spread apart into a
   * V, with a short-lived wash of churned water between them; everything
   * widens and fades with age.
   */
  private updateWakes(delta: number, drift: number) {
    const g = this.wakeGfx.clear();
    this.wakes = this.wakes.filter((w) => w.owner.active || w.points.length > 0);
    for (const w of this.wakes) {
      for (const p of w.points) {
        p.x -= drift;
        p.age += delta;
      }
      while (w.points.length > 0 && w.points[0].age > WAKE_LIFE) w.points.shift();
      w.sinceEmit += delta;
      const stern = w.stern();
      if (stern && w.sinceEmit >= WAKE_EMIT) {
        w.sinceEmit = 0;
        w.points.push({
          ...stern,
          age: 0,
          side: Math.random() < 0.5 ? -1 : 1,
          fx: Phaser.Math.FloatBetween(-2, 2),
          fy: Phaser.Math.FloatBetween(0.5, 1.3),
          fr: Phaser.Math.FloatBetween(0.8, 1.8),
        });
      }
      this.drawWake(g, w);
    }
  }

  private drawWake(g: Phaser.GameObjects.Graphics, w: Wake) {
    const pts = w.points;
    const k = w.size;
    const spread = (p: WakePoint) => (w.spread * p.age) / 1000;
    // Squared fade: stays fairly even near the boat, then tapers off smoothly.
    const fade = (t: number) => (1 - t) * (1 - t);
    const segments = (width: (t: number) => number, alpha: (t: number) => number, offset: (p: WakePoint) => number) => {
      for (let i = 1; i < pts.length; i++) {
        const t = pts[i].age / WAKE_LIFE;
        const a = alpha(t);
        if (a <= 0) continue;
        g.lineStyle(width(t) * k, 0xffffff, a);
        g.lineBetween(pts[i - 1].x, pts[i - 1].y + offset(pts[i - 1]), pts[i].x, pts[i].y + offset(pts[i]));
      }
    };
    // churned wash straight behind the stern, gone before the arms are
    segments(
      (t) => 5 + t * 12,
      (t) => 0.14 * (1 - t * 1.6),
      () => 0
    );
    for (const sign of [-1, 1]) {
      segments(
        (t) => 3 + t * 6,
        (t) => 0.1 * fade(t),
        (p) => sign * spread(p)
      );
      segments(
        (t) => 1.8 - t,
        (t) => 0.5 * fade(t),
        (p) => sign * spread(p)
      );
    }
    // froth flecks scattered along the arms
    for (const p of pts) {
      const t = p.age / WAKE_LIFE;
      g.fillStyle(0xffffff, 0.4 * fade(t));
      g.fillCircle(p.x + p.fx, p.y + p.side * spread(p) * p.fy, p.fr * k);
    }
  }

  /**
   * Gentle instrument life: the compass card swings slowly against the boat's
   * heading (its tilt), and the rev counter rises while the control is held.
   */
  private updateInstruments() {
    const heading = this.state === "playing" ? this.boat.angle : 0;
    this.compassCard.angle += (-heading * 1.5 - this.compassCard.angle) * 0.05;
    const revs =
      this.state === "over" ? 0 : this.state === "playing" && this.held.size > 0 ? 0.75 : this.state === "docked" ? 0.1 : 0.3;
    const target = 135 + revs * 270;
    this.revAngle += (target - this.revAngle) * 0.06;
    this.revNeedle.angle = this.revAngle;
  }

  /** WebAudio context for synthesised sounds, or undefined if muted/unavailable. */
  private audio() {
    if (this.sound.mute || !(this.sound instanceof Phaser.Sound.WebAudioSoundManager)) return undefined;
    return this.sound.context;
  }

  private buildControl() {
    // The whole bottom deck is the single control — a large, easy target.
    this.add.image(0, PLAY_HEIGHT, "dash").setOrigin(0).setDepth(10);
    const { compass, rev } = DASH_GAUGES;
    this.compassCard = this.add.image(compass.x, PLAY_HEIGHT + compass.y, "compass_card").setDepth(10.5);
    this.add.image(compass.x, PLAY_HEIGHT + compass.y, "compass_glass").setDepth(10.6);
    this.revNeedle = this.add
      .image(rev.x, PLAY_HEIGHT + rev.y, "rev_needle")
      .setOrigin(6 / 80, 0.5)
      .setAngle(135)
      .setDepth(10.5);
    this.revAngle = 135;

    const cx = GAME_WIDTH / 2;
    const cy = PLAY_HEIGHT + PANEL_HEIGHT / 2;
    // Dark copy of the wheel offset as a shadow, so it stands off the boards.
    this.wheelShadow = this.add.image(cx + 5, cy + 6, "wheel").setTint(0x000000).setAlpha(0.4).setDepth(11);
    this.wheel = this.add.image(cx, cy, "wheel").setDepth(12);

    this.pressIndicator = this.add
      .circle(0, 0, 38, 0xffffff, 0.28)
      .setDepth(13)
      .setVisible(false);

    const zone = this.add
      .zone(cx, cy, GAME_WIDTH, PANEL_HEIGHT)
      .setOrigin(0.5)
      .setInteractive();
    zone.on("pointerdown", (pointer: Phaser.Input.Pointer) =>
      this.pressSource(`p${pointer.id}`, pointer.x, pointer.y)
    );
  }

  private buildHud() {
    // Score — visible only during play.
    this.scoreText = this.add
      .text(GAME_WIDTH / 2, 58, "0", {
        fontFamily: "Arial, sans-serif",
        fontSize: "68px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#1c3d5a",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);

    // Gold medal — visible only on game over.
    const mx = GAME_WIDTH / 2;
    const my = PLAY_HEIGHT / 2 - 30;
    this.medalGraphics = this.add.graphics().setDepth(21).setVisible(false);
    this.medalGraphics.fillStyle(0xb8860b, 1);
    this.medalGraphics.fillCircle(mx, my, 62);
    this.medalGraphics.fillStyle(0xffd700, 1);
    this.medalGraphics.fillCircle(mx, my, 55);
    this.medalGraphics.lineStyle(3, 0xb8860b, 1);
    this.medalGraphics.strokeCircle(mx, my, 40);

    this.medalScoreText = this.add
      .text(mx, my, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "56px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#b8860b",
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(22)
      .setVisible(false);

    // Bouncing arrow — points at the wheel during ready and game over.
    this.arrow = this.add
      .image(GAME_WIDTH / 2, PLAY_HEIGHT - 38, "arrow_down")
      .setDepth(20)
      .setVisible(false);
  }

  private bindInput() {
    const releasePointer = (pointer: Phaser.Input.Pointer) => this.releaseSource(`p${pointer.id}`);
    this.input.on("pointerup", releasePointer);
    this.input.on("pointerupoutside", releasePointer);
    // Only the mouse can leave the canvas while held (it is pointer 0).
    this.input.on("gameout", () => this.releaseSource("p0"));

    // Switch / keyboard access: many assistive switches emit Space or Enter.
    // Auto-repeat is ignored so a held switch is one press, never a restart.
    // Feedback shows at the wheel centre since a key has no touch point.
    const kb = this.input.keyboard;
    if (kb) {
      for (const key of ["SPACE", "ENTER"]) {
        kb.on(`keydown-${key}`, (e: KeyboardEvent) => {
          if (!e.repeat) this.pressSource(key, this.wheel.x, this.wheel.y);
        });
        kb.on(`keyup-${key}`, () => this.releaseSource(key));
      }
    }

    // Losing focus swallows keyup/pointerup events; drop everything so the
    // boat can't get stuck rising.
    const releaseAll = () => {
      this.held.clear();
      this.pressIndicator.setVisible(false);
    };
    this.game.events.on(Phaser.Core.Events.BLUR, releaseAll);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.game.events.off(Phaser.Core.Events.BLUR, releaseAll)
    );
  }

  private pressSource(id: string, x: number, y: number) {
    this.held.add(id);
    this.pressIndicator.setPosition(x, y).setVisible(true);
    this.press();
  }

  private releaseSource(id: string) {
    this.held.delete(id);
    if (this.held.size === 0) this.pressIndicator.setVisible(false);
  }

  // ---------------------------------------------------------------- states

  private enterReady() {
    this.state = "ready";
    this.score = 0;
    this.scoreText.setVisible(false);
    this.medalGraphics.setVisible(false);
    this.medalScoreText.setVisible(false);
    this.showArrow();
    this.bobTween = this.tweens.add({
      targets: this.boat,
      y: PLAY_HEIGHT / 2 - 14,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  private startGame() {
    this.state = "playing";
    this.bobTween?.stop();
    this.arrowTween?.stop();
    this.arrow.setVisible(false);
    this.scoreText.setText("0").setVisible(true);
    (this.boat.body as Body).setAllowGravity(true);
    this.lastWide = false;
    this.lastSpawn = -Infinity;
    this.lastArrival = -Infinity;
    this.scheduleSpawn(this.pickType());
  }

  private endGame() {
    if (this.state !== "playing") return;
    this.state = "over";
    this.spawnTimer?.remove();
    this.cameras.main.shake(180, 0.008);
    const ctx = this.audio();
    if (ctx) playSink(ctx);

    // Freeze the obstacles; the boat sinks where it hit.
    this.hazards.getChildren().forEach((o) => {
      const b = (o as Phaser.GameObjects.Sprite).body as Body;
      if (b) b.setVelocity(0, 0);
    });
    this.boat.disableBody(false, false);

    this.canRestart = false;
    this.sinkBoat(() => this.showMedal());
  }

  /** Nose-down dive into foam at the crash point; calls onDone once it is gone. */
  private sinkBoat(onDone: () => void) {
    const { x, y } = this.boat;

    const waterline = y + 16;

    // Water thrown up from the hull: a tall column of droplets that arcs up
    // and falls back under gravity, plus lower, wider side spray.
    const jets = this.add
      .particles(0, 0, "droplet", {
        x: { min: -50, max: 50 },
        angle: { min: 245, max: 295 },
        speed: { min: 220, max: 460 },
        gravityY: 750,
        scale: { min: 0.6, max: 1.4 },
        alpha: { start: 1, end: 0, ease: "Quad.in" },
        lifespan: { min: 1000, max: 1500 },
        emitting: false,
      })
      .setDepth(6);
    const spray = this.add
      .particles(0, 0, "droplet", {
        x: { min: -60, max: 60 },
        angle: { min: 200, max: 340 },
        speed: { min: 110, max: 260 },
        gravityY: 750,
        scale: { min: 0.35, max: 0.8 },
        alpha: { start: 1, end: 0, ease: "Quad.in" },
        lifespan: { min: 700, max: 1100 },
        emitting: false,
      })
      .setDepth(6);
    jets.explode(70, x, waterline);
    spray.explode(45, x, waterline);
    // a smaller second surge as the hull goes under
    this.time.delayedCall(450, () => {
      jets.explode(30, this.boat.x, waterline + 6);
      spray.explode(25, this.boat.x, waterline + 6);
    });

    // White water churning flat along the waterline as the hull goes under.
    const churn = this.add
      .particles(0, 0, "wave_0", {
        x: { min: -55, max: 55 },
        y: { min: 10, max: 20 },
        speedX: { min: -40, max: 40 },
        speedY: { min: -6, max: 6 },
        scaleX: { start: 0.8, end: 1.8 },
        scaleY: { start: 0.7, end: 1.2 },
        alpha: { start: 0.9, end: 0 },
        lifespan: 1100,
        frequency: 60,
        quantity: 2,
      })
      .setDepth(6);
    churn.startFollow(this.boat);

    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(i * 300, () => {
        const ring = this.add.image(x, y, "foam_ring").setDepth(6).setScale(0.3).setAlpha(0.85);
        this.tweens.add({
          targets: ring,
          scaleX: 2.2,
          scaleY: 1.6,
          alpha: 0,
          duration: 1600,
          ease: "Sine.out",
          onComplete: () => ring.destroy(),
        });
      });
    }

    // Boat faces right, so a positive angle tips the bow down.
    this.tweens.chain({
      targets: this.boat,
      tweens: [
        { angle: 30, duration: 450, ease: "Quad.out" },
        {
          angle: 50,
          y: y + 18,
          alpha: 0,
          scaleX: this.boat.scaleX * 0.85,
          scaleY: this.boat.scaleY * 0.85,
          duration: 1100,
          ease: "Quad.in",
        },
      ],
      onComplete: () => {
        churn.stop();
        onDone();
      },
    });
  }

  private showMedal() {
    this.scoreText.setVisible(false);
    this.medalScoreText.setText(String(this.score));
    this.medalGraphics.setVisible(true);
    this.medalScoreText.setVisible(true);
    this.showArrow();
    this.canRestart = true;
  }

  /**
   * Docking pauses the game: releasing the control with the boat resting on
   * the bottom edge eases the sea, the rocks (anchored in it) and spawning to
   * a stop. Vessels already on screen keep their own speed through the water
   * and sail off; they can't hit the docked boat and don't score.
   */
  private dock() {
    this.state = "docked";
    const body = this.boat.body as Body;
    body.setVelocityY(0);
    body.setAccelerationY(0);
    this.boat.angle = 0;
    this.easeWorld(0, 900, "Sine.out");
    this.showArrow();
  }

  private undock() {
    // A vessel still overlapping the boat would sink it the moment it left the dock.
    this.hazards.getChildren().forEach((o) => {
      if (this.physics.overlap(this.boat, o)) o.setData("ghost", true);
    });
    this.arrowTween?.stop();
    this.arrow.setVisible(false);
    this.state = "playing";
    this.easeWorld(1, 700, "Sine.in");
  }

  private easeWorld(to: number, duration: number, ease: string) {
    this.worldTween?.stop();
    this.worldTween = this.tweens.add({ targets: this, worldSpeed: to, duration, ease });
  }

  /**
   * Apply worldSpeed each frame: rocks move with the water; vessels move at
   * their own speed through the water plus the water's drift, so they don't
   * appear to speed up when the world stops. The spawn timer slows with the
   * world, and the spawn plan is pushed back by the time lost, keeping gaps fair.
   */
  private applyWorldSpeed(delta: number) {
    const f = this.worldSpeed;
    this.hazards.getChildren().forEach((o) => {
      const type = o.getData("type") as ObstacleType;
      const v = type === "rock" ? SCROLL_SPEED * f : SPEEDS[type] - SCROLL_SPEED * (1 - f);
      ((o as Phaser.GameObjects.Sprite).body as Body).setVelocityX(-v);
    });
    if (this.spawnTimer) this.spawnTimer.timeScale = f;
    const lost = delta * (1 - f);
    this.lastSpawn += lost;
    this.lastArrival += lost;
  }

  /** Single entry point for the one control: starts, or restarts when over. */
  private press() {
    if (this.state === "ready") this.startGame();
    else if (this.state === "docked") this.undock();
    else if (this.state === "over" && this.canRestart) this.scene.restart();
  }

  private showArrow() {
    const baseY = PLAY_HEIGHT - 38;
    this.arrow.y = baseY;
    this.arrow.setVisible(true);
    this.arrowTween = this.tweens.add({
      targets: this.arrow,
      y: baseY + 16,
      duration: 550,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  // ---------------------------------------------------------------- spawning

  private pickType(): ObstacleType {
    if (Math.random() < FREIGHTER_CHANCE) return "freighter";
    return Math.random() < 0.5 ? "rock" : "daycruiser";
  }

  /**
   * Obstacles move at different speeds, so each is timed by when it reaches
   * the boat: SPAWN_DELAY apart there (stretched around freighters). A minimum
   * spawn gap keeps a fast vessel from overlapping a slower one at the edge.
   */
  private scheduleSpawn(type: ObstacleType) {
    const now = this.time.now;
    const key = type === "rock" ? this.pickRock() : type;
    const width = this.textures.getFrame(key).width * SCALES[type];
    const x = GAME_WIDTH + width / 2 + 10; // just off-screen, so nothing pops in
    const travel = ((x - this.boat.x) / SPEEDS[type]) * 1000;
    const wide = width > WIDE_WIDTH;
    const spawnAt = Math.max(
      this.lastArrival + SPAWN_DELAY * (wide || this.lastWide ? WIDE_GAP : 1) - travel,
      this.lastSpawn + MIN_SPAWN_GAP,
      now
    );
    this.spawnTimer = this.time.delayedCall(spawnAt - now, () => {
      this.spawnObstacle(type, key, x);
      this.lastWide = wide;
      this.lastSpawn = this.time.now;
      this.lastArrival = this.time.now + travel;
      this.scheduleSpawn(this.pickType());
    });
  }

  /** Weighted pick from ROCKS, so big islands are rarer. */
  private pickRock() {
    let roll = Math.random() * ROCKS.reduce((sum, r) => sum + r.weight, 0);
    for (const r of ROCKS) {
      roll -= r.weight;
      if (roll < 0) return r.key;
    }
    return ROCKS[0].key;
  }

  private spawnObstacle(type: ObstacleType, key: string, x: number) {
    const y = Phaser.Math.Between(SPAWN_MIN_Y, SPAWN_MAX_Y);

    const ob = this.hazards.create(x, y, key) as Phaser.Physics.Arcade.Sprite;
    const scale = SCALES[type];
    ob.setScale(scale);
    const b = ob.body as Body;
    b.setAllowGravity(false);
    b.setImmovable(true);
    b.setVelocityX(-SPEEDS[type]);

    // Per-type forgiving hitbox (smaller than the art).
    if (type === "rock") {
      // Lower part of the granite hump only; trees and foam never count.
      const spec = ROCKS.find((r) => r.key === key)!;
      const { w, waterline } = rockLayout(spec);
      const bw = spec.rockW * 0.72;
      const bh = spec.rockH * 0.75;
      b.setSize(bw, bh);
      b.setOffset((w - bw) / 2, waterline - bh);
    } else if (type === "daycruiser") {
      b.setSize(68, 16);
      b.setOffset(14, 18);
    } else {
      b.setSize(150, 26);
      b.setOffset(16, 30);
    }

    // Hitbox centre sets the draw order against the player's boat.
    // (Body sizes/offsets are in source px and scale with the sprite.)
    ob.setDepth(depthAt(ob.y + scale * (b.offset.y + b.sourceHeight / 2 - ob.displayOriginY)));
    // Stern offsets are in source px too.
    if (type === "daycruiser") this.addVesselWake(ob, type, 38 * scale, 10 * scale, scale);
    else if (type === "freighter") this.addVesselWake(ob, type, 86 * scale, 18 * scale, 1.4 * scale);

    ob.setData("scored", false);
    ob.setData("type", type);
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number) {
    // Water and froth drift at the rocks' speed so rocks read as anchored;
    // the world stops once the boat has hit something. The sparkle layer
    // keeps a small drift of its own so the surface still shimmers.
    const f = this.state === "over" ? 0 : this.worldSpeed;
    const drift = (SCROLL_SPEED / 1000) * delta * f;
    this.seaBase.tilePositionX += drift;
    this.seaSheen.tilePositionX += drift + 0.012 * delta * f;
    this.seaSheen.tilePositionY += 0.006 * delta * f;
    if (this.state === "playing" || this.state === "docked") this.applyWorldSpeed(delta);
    for (const r of this.ripples) {
      r.x -= drift;
      if (r.x < -50) {
        r.x = GAME_WIDTH + 50;
        r.y = Phaser.Math.Between(20, PLAY_HEIGHT - 20);
        r.setTexture(`wave_${Phaser.Math.Between(0, FROTH_VARIANTS - 1)}`);
      }
    }

    this.updateWakes(delta, drift);
    // The boat passes behind obstacles whose hitbox centre is lower on screen.
    if (this.state !== "over") this.boat.setDepth(depthAt((this.boat.body as Body).center.y));

    if (this.state === "playing") {
      const body = this.boat.body as Body;
      body.setAccelerationY(this.held.size > 0 ? -THRUST : 0);
      // Taper angle to 0 as the boat nears the deck so rotation doesn't drive
      // the hull visually past the boundary.
      const deckApproach = PLAY_HEIGHT - this.boat.displayHeight / 2;
      const taper = Phaser.Math.Clamp((deckApproach - this.boat.y) / this.boat.displayHeight, 0, 1);
      this.boat.angle = Phaser.Math.Clamp(body.velocity.y * 0.05, -18, 18) * taper;
      this.updateScoreAndCull();
      if (this.held.size === 0 && body.blocked.down) this.dock();
    } else if (this.state === "docked") {
      this.updateScoreAndCull();
    }

    // Wheel spin is driven by the boat's vertical velocity: CCW when rising, CW when
    // sinking, slow through zero when changing direction, stopped at boundaries.
    if (this.state === "playing") {
      const body = this.boat.body as Body;
      this.wheel.rotation += (body.velocity.y / MAX_FALL) * 0.12;
      this.wheelShadow.rotation = this.wheel.rotation;
    }
    this.updateInstruments();
  }

  private updateScoreAndCull() {
    this.hazards.getChildren().forEach((o) => {
      const ob = o as Phaser.Physics.Arcade.Sprite;
      if (!ob.getData("scored") && ob.x + ob.displayWidth / 2 < this.boat.x) {
        ob.setData("scored", true);
        // Vessels passing a docked boat don't count.
        if (this.state === "playing") {
          this.score += 1;
          const ctx = this.audio();
          if (ctx) playBloink(ctx);
          this.scoreText.setText(String(this.score));
        }
      }
      if (ob.x + ob.displayWidth / 2 < 0) ob.destroy();
    });
  }
}
