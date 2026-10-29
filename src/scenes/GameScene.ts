import Phaser from "phaser";
import { Capacitor } from "@capacitor/core";
import { createTextures, ROCKS, rockLayout, FROTH_VARIANTS, DASH_GAUGES, seaStyle } from "../textures";
import { playBloink, playBoatHorn, playShipHorn, playSink } from "../sfx";
import { isMusicMuted, musicActive, musicIdle, setMusicMuted, startMusic } from "../music";
import {
  GAME_WIDTH,
  PANEL_HEIGHT,
  PLAY_HEIGHT,
  SCROLL_SPEED,
  FERRY_SPEED,
  SUOMENLINNA_SPEED,
  FALKO_SPEED,
  MIN_SPAWN_GAP,
  SPAWN_DELAY,
  FERRY_CHANCE,
  FERRY_WIDTH,
  SUOMENLINNA_CHANCE,
  SUOMENLINNA_WIDTH,
  FALKO_CHANCE,
  FALKO_WIDTH,
  OBJECT_SCALE,
  WIDE_WIDTH,
  WIDE_GAP,
  ROCK_GAP,
  SPAWN_MIN_Y,
  SPAWN_MAX_Y,
  GRAVITY,
  THRUST,
  MAX_FALL,
  ABOUT_URL,
} from "../config";

type Body = Phaser.Physics.Arcade.Body;
type GameState = "ready" | "playing" | "docked" | "over";

type ObstacleType = "rock" | "ferry" | "suomenlinna" | "falko";

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
// Boats the player can choose on the start screen. Values are in source-image
// px: the forgiving hitbox (hull only), the stern at the waterline (where the
// wake starts) and the bow contact point, where the hull meets the water and
// the bow wave and spray come from. All face right.
interface PlayerBoat {
  key: string;
  width: number; // display width before OBJECT_SCALE
  hit: [x: number, y: number, w: number, h: number];
  stern: [x: number, y: number];
  bow: [x: number, y: number];
  // Bow spray is thrown from the hull between the waterline and this line
  // (two points; the boundary of the dark bottom), from the bow contact aft.
  chine: [[x: number, y: number], [x: number, y: number]];
  // Stretch along the hull the spray comes from, as shares of the way from
  // the bow contact point (0) to the stern (1); below 0 reaches forward.
  spray: [from: number, to: number];
}
const PLAYER_BOATS: PlayerBoat[] = [
  {
    key: "vejde_right",
    width: 140,
    hit: [76, 163, 400, 58],
    stern: [61, 234],
    bow: [332, 237],
    chine: [
      [61, 234],
      [505, 187],
    ],
    spray: [0.2, 0.9],
  },
  // Buster XL is 6 m to the Vejde's 9 m; both images are hull plus a little
  // extra (pulpit/platform, outboard), so width scales with real length.
  {
    key: "buster",
    width: 93,
    hit: [180, 185, 620, 80],
    stern: [115, 300],
    bow: [320, 300],
    chine: [
      [115, 289],
      [700, 195],
    ],
    // the Buster's contact point is far aft, so its spray reaches forward
    // too, and back past the transom to the outboard (above 1)
    spray: [-0.2, 1.3],
  },
];

// Best score per player boat, kept on the device. Loaded lazily, on first
// use, so the one-time migration below can see the chosen boat.
/**
 * Open the project page outside the game: in the app, a plain navigation is
 * handed by Capacitor to the system browser; on the web, a new tab.
 */
function openAbout() {
  if (Capacitor.isNativePlatform()) window.location.href = ABOUT_URL;
  else window.open(ABOUT_URL, "_blank", "noopener");
}

const BEST_KEY = "boatgame.bestByBoat";
const OLD_BEST_KEY = "boatgame.best"; // the single record from before per-boat scores
let bests: Record<string, number> | null = null;

function loadBests(): Record<string, number> {
  if (bests) return bests;
  bests = {};
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw) bests = JSON.parse(raw) ?? {};
    else {
      // the old single record goes to the boat that is selected now
      const old = Number(localStorage.getItem(OLD_BEST_KEY)) || 0;
      if (old > 0) bests![PLAYER_BOATS[chosenBoat].key] = old;
    }
  } catch {
    // storage unavailable or unreadable: start from zero
  }
  return bests!;
}

function bestFor(key: string) {
  return Math.max(0, Number(loadBests()[key]) || 0);
}

function saveBest(key: string, score: number) {
  const all = loadBests();
  all[key] = score;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: the record lasts until the app closes
  }
}

// The chosen boat is remembered (here across restarts, in storage across launches).
const BOAT_KEY = "boatgame.playerBoat";
let chosenBoat = loadChosenBoat();

function loadChosenBoat() {
  try {
    const i = PLAYER_BOATS.findIndex((b) => b.key === localStorage.getItem(BOAT_KEY));
    return Math.max(0, i);
  } catch {
    return 0;
  }
}

function saveChosenBoat(i: number) {
  chosenBoat = i;
  try {
    localStorage.setItem(BOAT_KEY, PLAYER_BOATS[i].key);
  } catch {
    // storage unavailable: the choice lasts until the app closes
  }
}

// A V-shaped wake trailing behind an obstacle vessel (the player's boat has a
// bow wave instead, see updateBowWave).
interface Wake {
  owner: Phaser.GameObjects.GameObject; // the wake is dropped once this is gone and faded
  stern: () => { x: number; y: number } | null; // null while not leaving a wake
  spread: number; // px/s sideways speed of each arm
  size: number; // line width / fleck scale
  arms: number[]; // which arms to draw: -1 far side, 1 near side (lower on screen)
  wash: boolean; // churned water straight behind (sterns only)
  points: WakePoint[];
  sinceEmit: number; // ms
}
const WAKE_LIFE = 1800; // ms before a wake point has faded out
const WAKE_EMIT = 30; // ms between wake points
// Each arm spreads sideways at this fraction of the boat's speed through the
// water, opening a V of roughly 20 degrees like a real boat's wake.
const WAKE_ANGLE = 0.35;
const SHIP_HORN_GAP = 8000; // ms between big-vessel horns
// Obstacle vessels' bow-wave leg spreads this many times faster than a wake arm.
const BOW_WAVE_SPREAD = 2.5;

/**
 * Painter's order for boats and obstacles: whatever has its hitbox centre
 * lower on screen is nearer the viewer and drawn in front. Kept between the
 * sea/wakes (below 1) and the splash/deck/HUD (6 and up).
 */
const depthAt = (y: number) => 1 + y / 1000;

const SPEEDS: Record<ObstacleType, number> = {
  rock: SCROLL_SPEED,
  ferry: FERRY_SPEED,
  suomenlinna: SUOMENLINNA_SPEED,
  falko: FALKO_SPEED,
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
  private lastRock = false;
  private lastShipHorn = -Infinity;
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
  private bestPill!: Phaser.GameObjects.Graphics;
  private bestTrophy!: Phaser.GameObjects.Image;
  private bestText!: Phaser.GameObjects.Text;
  private recordBurst!: Phaser.GameObjects.Graphics;
  private arrow!: Phaser.GameObjects.Image;
  private arrowTween?: Phaser.Tweens.Tween;

  private pressIndicator!: Phaser.GameObjects.Arc;
  private wakeGfx!: Phaser.GameObjects.Graphics;
  private wakes: Wake[] = [];
  private bowSpray!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sprayClock = 0;
  private picker!: Phaser.GameObjects.Container;
  private pickerCards: Phaser.GameObjects.Graphics[] = [];
  private bobTween?: Phaser.Tweens.Tween;
  // How fast the world (sea, rocks, spawning) moves past the boat, 0..1.
  // Eased down when docking and back up when leaving, so nothing jolts.
  private worldSpeed = 1;
  private worldTween?: Phaser.Tweens.Tween;

  constructor() {
    super({ key: "GameScene" });
  }

  preload() {
    // Falkö cargo ferry as an obstacle: mirrored to face left, name painted out
    // (tools/art/mirror_falko.py).
    this.load.image("falko_left", "falko_left.png");
    // Player boats the picker offers (see PLAYER_BOATS).
    this.load.image("vejde_right", "vejde_right.png");
    this.load.image("buster", "buster.png");
    // Archipelago ferry Utö (bow left), traced artwork; mirrored lettering removed.
    this.load.image("ferry", "ferry.png");
    // Helsinki's double-ended Suomenlinna II passenger ferry, flat schematic.
    this.load.image("suomenlinna", "suomenlinna.png");
    // (Schematic boat images are drawn by the scripts in tools/art.)
  }

  create() {
    createTextures(this);

    // Reset per-run state (field initializers only run once, not on scene.restart).
    this.ripples = [];
    this.worldSpeed = 1;
    this.wakes = [];
    this.held = new Set();
    this.canRestart = false;
    this.score = 0;

    this.buildBackground();
    this.buildBoat();
    this.wakeGfx = this.add.graphics().setDepth(0.5);
    this.buildBowWave();
    this.hazards = this.physics.add.group();
    this.buildControl();
    this.buildHud();
    this.buildPicker();

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

    // Drifting froth patches, angled along the swell crests (not every sea
    // style has them).
    this.ripples = [];
    for (let i = 0; i < (seaStyle().froth ? 8 : 0); i++) {
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
    this.boat = this.physics.add.sprite(110, PLAY_HEIGHT / 2, PLAYER_BOATS[chosenBoat].key);
    const body = this.boat.body as Body;
    body.setGravityY(GRAVITY);
    body.setAllowGravity(false);
    body.setMaxVelocity(0, MAX_FALL);
    this.boat.setCollideWorldBounds(true);
    this.applyBoat();
  }

  private get boatSpec() {
    return PLAYER_BOATS[chosenBoat];
  }

  /** Dress the player sprite as the chosen boat: art, size, hitbox, bounds. */
  private applyBoat() {
    const spec = this.boatSpec;
    this.boat.setTexture(spec.key);
    this.boat.setScale((spec.width * OBJECT_SCALE) / this.boat.frame.width);
    // Hitbox covers the main hull only, for forgiving collisions. Arcade takes
    // these in source-image px and scales them with the sprite.
    const [hx, hy, hw, hh] = spec.hit;
    const body = this.boat.body as Body;
    body.setSize(hw, hh, false);
    body.setOffset(hx, hy);
    // Bounds keep the boat inside the play area (it clamps to the edges instead
    // of dying there — the only way to fail is touching an obstacle). The
    // bottom is raised by the art below the hitbox, so the hull's visual
    // bottom lands on the deck line rather than crossing it.
    const below = (this.boat.frame.height - hy - hh) * this.boat.scaleY;
    this.physics.world.setBounds(0, 0, GAME_WIDTH, PLAY_HEIGHT - below);
  }

  /** A point on the player's boat in source-image px, as world coordinates (follows its tilt). */
  private boatPoint(px: number, py: number) {
    const ox = (px - this.boat.frame.width / 2) * this.boat.scaleX;
    const oy = (py - this.boat.frame.height / 2) * this.boat.scaleY;
    const c = Math.cos(this.boat.rotation);
    const s = Math.sin(this.boat.rotation);
    return { x: this.boat.x + c * ox - s * oy, y: this.boat.y + s * ox + c * oy };
  }

  /**
   * Boat picker on the start screen: one big card per boat in a row across
   * the top of the sea. Tapping a card (or Left/Right) swaps the boat; the
   * wheel still starts the game. Shown whenever the game is "ready", which
   * includes retrying after sinking.
   */
  private buildPicker() {
    const n = PLAYER_BOATS.length;
    const cardW = 132;
    const cardH = 104;
    const thumbH = 62; // boat picture area; the trophy row sits below it
    const gap = 12;
    const x0 = (GAME_WIDTH - (n * cardW + (n - 1) * gap)) / 2;
    const y = 92;
    this.picker = this.add.container(0, 0).setDepth(20);
    this.pickerCards = PLAYER_BOATS.map((spec, i) => {
      const x = x0 + i * (cardW + gap);
      const card = this.add.graphics();
      const thumb = this.add.image(x + cardW / 2, y + 8 + thumbH / 2, spec.key);
      thumb.setScale(Math.min((cardW - 16) / thumb.width, thumbH / thumb.height));
      // this boat's own record: small trophy and number, centred under it
      const rowY = y + cardH - 17;
      const trophy = this.add.image(0, rowY, "trophy").setScale(0.55);
      const count = this.add
        .text(0, rowY + 1, String(bestFor(spec.key)), {
          fontFamily: "Arial, sans-serif",
          fontSize: "22px",
          color: "#ffe680",
          fontStyle: "bold",
          stroke: "#3d2a05",
          strokeThickness: 5,
        })
        .setOrigin(0, 0.5);
      const rowW = trophy.displayWidth + 5 + count.width;
      trophy.setX(x + cardW / 2 - rowW / 2 + trophy.displayWidth / 2);
      count.setX(x + cardW / 2 - rowW / 2 + trophy.displayWidth + 5);
      const hit = this.add
        .zone(x, y, cardW, cardH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => this.chooseBoat(i));
      card.setData("rect", [x, y, cardW, cardH]);
      this.picker.add([card, thumb, trophy, count, hit]);
      return card;
    });
    // Small "About" link in the lower right corner, away from the wheel and
    // the cards, to the project page. Part of the picker, so only on the
    // start screen.
    const about = this.add
      .text(GAME_WIDTH - 12, PLAY_HEIGHT - 10, "About", {
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        color: "#ffffff",
        stroke: "#1c3d5a",
        strokeThickness: 4,
      })
      .setOrigin(1, 1)
      .setAlpha(0.75)
      .setPadding(10, 8, 0, 0) // a bit more to tap than the word itself
      .setInteractive({ useHandCursor: true });
    about.on("pointerdown", openAbout);
    this.picker.add(about);
    this.input.keyboard?.on("keydown-LEFT", () => this.chooseBoat((chosenBoat + n - 1) % n));
    this.input.keyboard?.on("keydown-RIGHT", () => this.chooseBoat((chosenBoat + 1) % n));
    this.drawPicker();
  }

  /** Card frames: dark translucent cards, the chosen one with a thick gold border. */
  private drawPicker() {
    this.pickerCards.forEach((card, i) => {
      const [x, y, w, h] = card.getData("rect") as number[];
      const chosen = i === chosenBoat;
      card.clear();
      card.fillStyle(0x000000, chosen ? 0.55 : 0.4);
      card.fillRoundedRect(x, y, w, h, 12);
      card.lineStyle(chosen ? 5 : 2, chosen ? 0xf1c40f : 0xffffff, chosen ? 1 : 0.45);
      card.strokeRoundedRect(x, y, w, h, 12);
    });
  }

  private chooseBoat(i: number) {
    if (this.state !== "ready" || i === chosenBoat) return;
    saveChosenBoat(i);
    this.applyBoat();
    this.drawPicker();
  }

  private buildBowWave() {
    // Drops are emitted at world positions (the emitter stays at 0,0), so
    // drops already in the air fly free of the boat.
    const k = OBJECT_SCALE;
    this.bowSpray = this.add.particles(0, 0, "droplet", {
      // backwards and up; speeds and gravity are 0.7x and 0.7²x of the
      // first version, so drops trace the same arcs 30% slower
      speedX: { min: -133 * k, max: -35 * k },
      speedY: { min: -119 * k, max: -42 * k },
      gravityY: 320 * k,
      scale: { min: 0.25 * k, max: 0.6 * k },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 220, max: 420 }, // gone quickly, no lingering trail
      emitting: false,
    });
  }

  /**
   * Bow wave of the player's boat while under way: lots of small round drops
   * thrown up and back off the hull between the bow contact point (where the
   * tilted hull meets the water) and the stern, densest at the contact point.
   * They fly free of the boat and fade within a fraction of a second. Emission
   * follows the world's speed, so the spray dies away as the boat docks.
   */
  private updateBowWave(delta: number) {
    const f = this.state === "ready" || this.state === "playing" ? this.worldSpeed : 0;
    this.bowSpray.setDepth(this.boat.depth + 0.002); // just in front of the hull
    if (f < 0.05) return;
    const spec = this.boatSpec;
    const bow = this.boatPoint(...spec.bow);
    const stern = this.boatPoint(...spec.stern);
    const c0 = this.boatPoint(...spec.chine[0]);
    const c1 = this.boatPoint(...spec.chine[1]);
    const water = bow.y;
    // the hull line the water climbs up to, at a given x
    const chineAt = (x: number) => Math.min(water, c0.y + ((c1.y - c0.y) * (x - c0.x)) / (c1.x - c0.x));

    // a longer stretch gets proportionally more drops, so density stays even
    const interval = 4.5 * (0.7 / (spec.spray[1] - spec.spray[0]));
    this.sprayClock += delta;
    while (this.sprayClock > interval) {
      this.sprayClock -= interval;
      if (Math.random() > f) continue;
      // evenly along the boat's spray stretch
      const u = spec.spray[0] + Math.random() * (spec.spray[1] - spec.spray[0]);
      const x = bow.x + (stern.x - bow.x) * u;
      const y = water - (water - chineAt(x)) * Math.random();
      this.bowSpray.emitParticleAt(x, y, 1);
    }
  }

  /** Trail a wake behind a vessel, from its stern (offset from its centre) at the waterline. */
  private addVesselWake(ob: Phaser.GameObjects.Sprite, type: ObstacleType, ox: number, oy: number, size: number) {
    this.addWake(ob, type, ox, oy, size, [-1, 1], true);
  }

  /** Bow wave of a vessel: one leg of a V, on the near side, from the bow waterline. */
  private addVesselBowWave(ob: Phaser.GameObjects.Sprite, type: ObstacleType, ox: number, oy: number, size: number) {
    // The bow pushes water out harder than the stern wake spreads, so its leg
    // opens wider.
    this.addWake(ob, type, ox, oy, size, [1], false, BOW_WAVE_SPREAD);
  }

  private addWake(
    ob: Phaser.GameObjects.Sprite,
    type: ObstacleType,
    ox: number,
    oy: number,
    size: number,
    arms: number[],
    wash: boolean,
    spreadScale = 1
  ) {
    this.wakes.push({
      owner: ob,
      stern: () => (this.state === "over" || !ob.active ? null : { x: ob.x + ox, y: ob.y + oy }),
      spread: WAKE_ANGLE * (SPEEDS[type] - SCROLL_SPEED) * spreadScale,
      size,
      arms,
      wash,
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
    if (w.wash) {
      segments(
        (t) => 5 + t * 12,
        (t) => 0.14 * (1 - t * 1.6),
        () => 0
      );
    }
    for (const sign of w.arms) {
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
      if (!w.arms.includes(p.side)) continue;
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
    // Called from a press on first use, so resuming here unlocks audio right
    // away instead of waiting for Phaser's own unlock.
    if (this.sound.context.state === "suspended") void this.sound.context.resume();
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

    // Best score, top left (opposite the music button): a gold trophy and the
    // number on a dark pill, shown all the time.
    this.bestPill = this.add.graphics().setDepth(20);
    this.bestTrophy = this.add.image(32, 36, "trophy").setDepth(20.5);
    this.bestText = this.add
      .text(56, 37, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "30px",
        color: "#ffe680",
        fontStyle: "bold",
        stroke: "#3d2a05",
        strokeThickness: 6,
      })
      .setOrigin(0, 0.5)
      .setDepth(20.5);
    this.updateBest();

    // Golden starburst behind the medal for a new record (hidden until then).
    this.recordBurst = this.add.graphics({ x: mx, y: my }).setDepth(20.8).setVisible(false);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const b = a + Math.PI / 24;
      this.recordBurst.fillStyle(0xf1c40f, i % 2 ? 0.35 : 0.55);
      this.recordBurst.fillTriangle(0, 0, Math.cos(a - Math.PI / 24) * 120, Math.sin(a - Math.PI / 24) * 120, Math.cos(b) * 120, Math.sin(b) * 120);
    }

    // Music on/off toggle, top right. Large touch target, away from the
    // wheel so it can't be hit by accident; M toggles it from a keyboard.
    const musicButton = this.add
      .image(GAME_WIDTH - 36, 36, isMusicMuted() ? "music_off" : "music_on")
      .setDepth(20)
      .setInteractive({ useHandCursor: true });
    const toggleMusic = () => {
      setMusicMuted(!isMusicMuted());
      musicButton.setTexture(isMusicMuted() ? "music_off" : "music_on");
    };
    musicButton.on("pointerdown", toggleMusic);
    this.input.keyboard?.on("keydown-M", (e: KeyboardEvent) => {
      if (!e.repeat) toggleMusic();
    });

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
    musicIdle();
    this.score = 0;
    this.scoreText.setVisible(false);
    this.medalGraphics.setVisible(false);
    this.medalScoreText.setVisible(false);
    this.showArrow();
    this.picker.setVisible(true);
    this.setBestVisible(false); // each picker card shows its boat's record
    this.bobTween = this.tweens.add({
      targets: this.boat,
      y: PLAY_HEIGHT / 2 - 14,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  /** The player's small boat toots as it casts off: at the start and when leaving the dock. */
  private hornBlast() {
    const ctx = this.audio();
    if (ctx) playBoatHorn(ctx);
  }

  /**
   * A big vessel sounds its horn as it comes into view: quieter than the
   * player's toot and at most every SHIP_HORN_GAP ms, so it stays occasional.
   */
  private shipHorn() {
    if (this.time.now - this.lastShipHorn < SHIP_HORN_GAP) return;
    const ctx = this.audio();
    if (!ctx) return;
    this.lastShipHorn = this.time.now;
    playShipHorn(ctx, 0.15);
  }

  private startGame() {
    this.state = "playing";
    musicActive();
    this.hornBlast();
    this.bobTween?.stop();
    this.arrowTween?.stop();
    this.arrow.setVisible(false);
    this.picker.setVisible(false);
    this.scoreText.setText("0").setVisible(true).setColor("#ffffff").setStroke("#1c3d5a", 8);
    // The record corner would be in the way while sailing; the score itself
    // turns gold once this boat's record is beaten.
    this.setBestVisible(false);
    (this.boat.body as Body).setAllowGravity(true);
    this.lastWide = false;
    this.lastRock = false;
    this.lastShipHorn = -Infinity;
    this.lastSpawn = -Infinity;
    this.lastArrival = -Infinity;
    this.scheduleSpawn(this.pickType());
  }

  private endGame() {
    if (this.state !== "playing") return;
    this.state = "over";
    musicIdle();
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

    const k = OBJECT_SCALE;
    const waterline = this.boatPoint(this.boat.frame.width / 2, this.boatSpec.stern[1]).y;

    // Water thrown up from the hull: a tall column of droplets that arcs up
    // and falls back under gravity, plus lower, wider side spray.
    const jets = this.add
      .particles(0, 0, "droplet", {
        x: { min: -50 * k, max: 50 * k },
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
        x: { min: -60 * k, max: 60 * k },
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
        x: { min: -55 * k, max: 55 * k },
        y: { min: 10 * k, max: 20 * k },
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
          y: y + 18 * k,
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

  private setBestVisible(visible: boolean) {
    this.bestPill.setVisible(visible);
    this.bestTrophy.setVisible(visible);
    this.bestText.setVisible(visible);
  }

  private updateBest() {
    this.bestText.setText(String(bestFor(this.boatSpec.key)));
    const w = 56 + this.bestText.width + 10;
    this.bestPill.clear();
    this.bestPill.fillStyle(0x000000, 0.45);
    this.bestPill.fillRoundedRect(8, 10, w, 52, 26);
    this.bestPill.lineStyle(2, 0xffffff, 0.5);
    this.bestPill.strokeRoundedRect(8, 10, w, 52, 26);
  }

  private showMedal() {
    this.scoreText.setVisible(false);
    this.medalScoreText.setText(String(this.score));
    this.medalGraphics.setVisible(true);
    this.medalScoreText.setVisible(true);
    if (this.score > bestFor(this.boatSpec.key)) {
      // New record for this boat: slow golden starburst behind the medal, and
      // the trophy gives a few gentle pulses as its number updates. No flashing.
      saveBest(this.boatSpec.key, this.score);
      this.updateBest();
      this.recordBurst.setVisible(true).setScale(0.2).setAlpha(0);
      this.tweens.add({ targets: this.recordBurst, scale: 1, alpha: 1, duration: 600, ease: "Back.out" });
      this.tweens.add({ targets: this.recordBurst, angle: 360, duration: 20000, repeat: -1 });
      this.tweens.add({
        targets: [this.bestTrophy, this.bestText],
        scale: 1.25,
        duration: 350,
        yoyo: true,
        repeat: 2,
        ease: "Sine.inOut",
      });
    }
    this.setBestVisible(true);
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
    musicIdle();
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
    musicActive();
    this.hornBlast();
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
    startMusic(); // presses are user gestures, which browsers require for audio
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

  /**
   * Random next obstacle. The same vessel never comes twice in a row (it
   * would look like a repeat); rocks and islands may, since they vary.
   */
  private pickType(previous?: ObstacleType): ObstacleType {
    let type = this.rollType();
    while (type !== "rock" && type === previous) type = this.rollType();
    return type;
  }

  private rollType(): ObstacleType {
    const roll = Math.random();
    if (roll < FERRY_CHANCE) return "ferry";
    if (roll < FERRY_CHANCE + SUOMENLINNA_CHANCE) return "suomenlinna";
    if (roll < FERRY_CHANCE + SUOMENLINNA_CHANCE + FALKO_CHANCE) return "falko";
    return "rock"; // the rest: rocks and islands, the archipelago itself
  }

  /**
   * Obstacles move at different speeds, so each is timed by when it reaches
   * the boat: SPAWN_DELAY apart there (stretched around wide ones and between consecutive rocks). A minimum
   * spawn gap keeps a fast vessel from overlapping a slower one at the edge.
   */
  private scheduleSpawn(type: ObstacleType) {
    const now = this.time.now;
    const key = type === "rock" ? this.pickRock() : type === "falko" ? "falko_left" : type;
    const width = this.textures.getFrame(key).width * this.obstacleScale(type);
    const x = GAME_WIDTH + width / 2 + 10; // just off-screen, so nothing pops in
    const travel = ((x - this.boat.x) / SPEEDS[type]) * 1000;
    const wide = width > WIDE_WIDTH * OBJECT_SCALE;
    const gap = Math.max(wide || this.lastWide ? WIDE_GAP : 1, type === "rock" && this.lastRock ? ROCK_GAP : 1);
    const spawnAt = Math.max(
      this.lastArrival + SPAWN_DELAY * gap - travel,
      this.lastSpawn + MIN_SPAWN_GAP,
      now
    );
    this.spawnTimer = this.time.delayedCall(spawnAt - now, () => {
      this.spawnObstacle(type, key, x);
      this.lastWide = wide;
      this.lastRock = type === "rock";
      this.lastSpawn = this.time.now;
      this.lastArrival = this.time.now + travel;
      this.scheduleSpawn(this.pickType(type));
    });
  }

  /** Draw scale for an obstacle: art, hitbox and wake all scale with it. */
  private obstacleScale(type: ObstacleType) {
    if (type === "ferry") return (FERRY_WIDTH * OBJECT_SCALE) / this.textures.getFrame("ferry").width;
    if (type === "suomenlinna") return (SUOMENLINNA_WIDTH * OBJECT_SCALE) / this.textures.getFrame("suomenlinna").width;
    if (type === "falko") return (FALKO_WIDTH * OBJECT_SCALE) / this.textures.getFrame("falko_left").width;
    return OBJECT_SCALE;
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
    const scale = this.obstacleScale(type);
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
    } else if (type === "ferry") {
      // ferry image (600 px wide): lower hull only, not the superstructure
      b.setSize(504, 65);
      b.setOffset(48, 186);
    } else if (type === "suomenlinna") {
      // Suomenlinna image (591 x 216): lower white hull and waterline band
      b.setSize(473, 47);
      b.setOffset(59, 158);
    } else {
      // Falkö image (1300 x 393, mirrored, cut at the waterline): main hull
      // below the superstructure
      b.setSize(1021, 145);
      b.setOffset(140, 243);
    }

    // Hitbox centre sets the draw order against the player's boat.
    // (Body sizes/offsets are in source px and scale with the sprite.)
    ob.setDepth(depthAt(ob.y + scale * (b.offset.y + b.sourceHeight / 2 - ob.displayOriginY)));
    // Stern and bow waterline points (from the image centre, source px) where
    // each vessel's wake and bow wave start.
    if (type === "ferry") {
      this.addVesselWake(ob, type, 295 * scale, 120 * scale, 1.4 * OBJECT_SCALE);
      this.addVesselBowWave(ob, type, -277 * scale, 120 * scale, 1.7 * OBJECT_SCALE);
    } else if (type === "suomenlinna") {
      this.addVesselWake(ob, type, 290 * scale, 96 * scale, 1.2 * OBJECT_SCALE);
      this.addVesselBowWave(ob, type, -287 * scale, 96 * scale, 1.5 * OBJECT_SCALE);
    } else if (type === "falko") {
      this.addVesselWake(ob, type, 593 * scale, 194 * scale, 1.2 * OBJECT_SCALE);
      this.addVesselBowWave(ob, type, -532 * scale, 194 * scale, 1.5 * OBJECT_SCALE);
    }

    ob.setData("scored", false);
    ob.setData("type", type);
    // Vessels sound their horn as they come into view (they spawn just off the
    // right edge).
    if (type !== "rock") this.time.delayedCall(600, () => this.state === "playing" && this.shipHorn());
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
    this.updateBowWave(delta);

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
          const best = bestFor(this.boatSpec.key);
          if (this.score === best + 1 && best > 0) {
            // Just beat the record: the score turns gold, with one gentle pulse.
            this.scoreText.setColor("#ffd700").setStroke("#6b4c00", 8);
            this.tweens.add({ targets: this.scoreText, scale: 1.25, duration: 300, yoyo: true, ease: "Sine.inOut" });
          }
        }
      }
      if (ob.x + ob.displayWidth / 2 < 0) ob.destroy();
    });
  }
}
