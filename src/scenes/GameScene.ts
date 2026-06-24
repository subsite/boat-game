import Phaser from "phaser";
import { createTextures } from "../textures";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  PANEL_HEIGHT,
  PLAY_HEIGHT,
  SCROLL_SPEED,
  SPAWN_DELAY,
  SPAWN_MIN_Y,
  SPAWN_MAX_Y,
  GRAVITY,
  THRUST,
  MAX_FALL,
} from "../config";

type Body = Phaser.Physics.Arcade.Body;
type GameState = "ready" | "playing" | "over";

const OBSTACLE_TYPES = ["rock", "lighthouse", "rowboat"] as const;
type ObstacleType = (typeof OBSTACLE_TYPES)[number];

export class GameScene extends Phaser.Scene {
  private state: GameState = "ready";

  private boat!: Phaser.Physics.Arcade.Sprite;
  private wheel!: Phaser.GameObjects.Image;
  private hazards!: Phaser.Physics.Arcade.Group;
  private ripples: Phaser.GameObjects.Image[] = [];

  private spawnTimer?: Phaser.Time.TimerEvent;
  private holding = false;
  private canRestart = false;

  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Rectangle;

  private pressIndicator!: Phaser.GameObjects.Arc;
  private bobTween?: Phaser.Tweens.Tween;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    createTextures(this);

    // Reset per-run state (field initializers only run once, not on scene.restart).
    this.ripples = [];
    this.holding = false;
    this.canRestart = false;
    this.score = 0;

    // Bounds keep the boat inside the play area (it clamps to the edges instead
    // of dying there — the only way to fail is touching an obstacle).
    this.physics.world.setBounds(0, 0, GAME_WIDTH, PLAY_HEIGHT);

    this.buildBackground();
    this.buildBoat();
    this.hazards = this.physics.add.group();
    this.buildControl();
    this.buildHud();

    this.physics.add.overlap(this.boat, this.hazards, () => this.endGame());

    this.bindInput();
    this.enterReady();
  }

  // ---------------------------------------------------------------- build

  private buildBackground() {
    // Top-down open water filling the whole play area.
    this.add.rectangle(0, 0, GAME_WIDTH, PLAY_HEIGHT, 0x2e86c1).setOrigin(0).setDepth(-20);
    // Subtle, calm depth patches so the water is not flat.
    this.add.ellipse(120, PLAY_HEIGHT * 0.3, 260, 160, 0x3a93c9).setDepth(-19).setAlpha(0.5);
    this.add.ellipse(330, PLAY_HEIGHT * 0.7, 300, 180, 0x2a7fb5).setDepth(-19).setAlpha(0.5);

    // Drifting foam streaks convey the water flowing past the boat.
    this.ripples = [];
    for (let i = 0; i < 8; i++) {
      this.ripples.push(
        this.add
          .image(
            Phaser.Math.Between(0, GAME_WIDTH),
            Phaser.Math.Between(20, PLAY_HEIGHT - 20),
            "wave"
          )
          .setDepth(-15)
          .setAlpha(Phaser.Math.FloatBetween(0.25, 0.6))
      );
    }
  }

  private buildBoat() {
    this.boat = this.physics.add.sprite(110, PLAY_HEIGHT / 2, "boat").setDepth(5);
    const body = this.boat.body as Body;
    body.setGravityY(GRAVITY);
    body.setAllowGravity(false);
    body.setMaxVelocity(0, MAX_FALL);
    // Slightly smaller hitbox than the art — forgiving collisions.
    body.setSize(50, 34);
    body.setOffset(13, 16);
    this.boat.setCollideWorldBounds(true);
  }

  private buildControl() {
    // The whole bottom deck is the single control — a large, easy target.
    this.add
      .rectangle(0, PLAY_HEIGHT, GAME_WIDTH, PANEL_HEIGHT, 0x6b4423)
      .setOrigin(0)
      .setDepth(10);
    this.add
      .rectangle(0, PLAY_HEIGHT, GAME_WIDTH, 6, 0x8b5a2b)
      .setOrigin(0)
      .setDepth(11);

    const cx = GAME_WIDTH / 2;
    const cy = PLAY_HEIGHT + PANEL_HEIGHT / 2;
    this.wheel = this.add.image(cx, cy, "wheel").setDepth(12);

    this.pressIndicator = this.add
      .circle(0, 0, 38, 0xffffff, 0.28)
      .setDepth(13)
      .setVisible(false);

    const zone = this.add
      .zone(cx, cy, GAME_WIDTH, PANEL_HEIGHT)
      .setOrigin(0.5)
      .setInteractive();
    zone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.pressIndicator.setPosition(pointer.x, pointer.y).setVisible(true);
      this.holding = true;
      this.press();
    });
  }

  private buildHud() {
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
      .setDepth(20);

    this.overlay = this.add
      .rectangle(GAME_WIDTH / 2, PLAY_HEIGHT / 2, GAME_WIDTH, PLAY_HEIGHT, 0x000000, 0.35)
      .setDepth(19)
      .setVisible(false);

    this.messageText = this.add
      .text(GAME_WIDTH / 2, PLAY_HEIGHT / 2 - 40, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "44px",
        color: "#ffffff",
        fontStyle: "bold",
        align: "center",
        stroke: "#1c3d5a",
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(21);

    this.hintText = this.add
      .text(GAME_WIDTH / 2, PLAY_HEIGHT / 2 + 40, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "26px",
        color: "#ffffff",
        align: "center",
        stroke: "#1c3d5a",
        strokeThickness: 5,
        wordWrap: { width: GAME_WIDTH - 60 },
      })
      .setOrigin(0.5)
      .setDepth(21);
  }

  private bindInput() {
    const releasePointer = () => {
      this.holding = false;
      this.pressIndicator.setVisible(false);
    };
    this.input.on("pointerup", releasePointer);
    this.input.on("pointerupoutside", releasePointer);
    this.input.on("gameout", releasePointer);

    // Switch / keyboard access: many assistive switches emit Space or Enter.
    const kb = this.input.keyboard;
    if (kb) {
      const onDown = () => {
        this.holding = true;
        this.press();
      };
      kb.on("keydown-SPACE", onDown);
      kb.on("keydown-ENTER", onDown);
      kb.on("keyup-SPACE", () => (this.holding = false));
      kb.on("keyup-ENTER", () => (this.holding = false));
    }
  }

  // ---------------------------------------------------------------- states

  private enterReady() {
    this.state = "ready";
    this.score = 0;
    this.scoreText.setText("0");
    this.overlay.setVisible(true);
    this.messageText.setText("Set Sail!");
    this.hintText.setText("Hold the wheel to steer up.\nLet go to sail down.\nWeave around the obstacles!");
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
    this.overlay.setVisible(false);
    this.messageText.setText("");
    this.hintText.setText("");
    (this.boat.body as Body).setAllowGravity(true);
    this.spawnObstacle();
    this.spawnTimer = this.time.addEvent({
      delay: SPAWN_DELAY,
      loop: true,
      callback: this.spawnObstacle,
      callbackScope: this,
    });
  }

  private endGame() {
    if (this.state !== "playing") return;
    this.state = "over";
    this.spawnTimer?.remove();
    this.cameras.main.shake(180, 0.008);

    // Freeze the obstacles; let the boat sink behind the deck.
    this.hazards.getChildren().forEach((o) => {
      const b = (o as Phaser.GameObjects.Sprite).body as Body;
      if (b) b.setVelocity(0, 0);
    });
    this.boat.setCollideWorldBounds(false);

    this.overlay.setVisible(true);
    this.messageText.setText("Good Sailing!");
    this.hintText.setText(
      `You passed ${this.score} ${this.score === 1 ? "obstacle" : "obstacles"}.\nPress the wheel to play again.`
    );

    this.canRestart = false;
    this.time.delayedCall(700, () => (this.canRestart = true));
  }

  /** Single entry point for the one control: starts, or restarts when over. */
  private press() {
    if (this.state === "ready") this.startGame();
    else if (this.state === "over" && this.canRestart) this.scene.restart();
  }

  // ---------------------------------------------------------------- spawning

  private spawnObstacle() {
    const type = Phaser.Math.RND.pick([...OBSTACLE_TYPES]) as ObstacleType;
    const key = type === "rock" ? "rock_island" : type;
    const y = Phaser.Math.Between(SPAWN_MIN_Y, SPAWN_MAX_Y);
    const x = GAME_WIDTH + 70;

    const ob = this.hazards.create(x, y, key) as Phaser.Physics.Arcade.Sprite;
    ob.setDepth(2);
    const b = ob.body as Body;
    b.setAllowGravity(false);
    b.setImmovable(true);
    b.setVelocityX(-SCROLL_SPEED);

    // Per-type forgiving hitbox (smaller than the art).
    if (type === "rock") {
      b.setCircle(36, 12, 6);
    } else if (type === "lighthouse") {
      b.setSize(30, 84);
      b.setOffset(17, 22);
    } else {
      b.setSize(70, 24);
      b.setOffset(10, 10);
    }

    ob.setData("scored", false);
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number) {
    // Drifting foam streaks (decorative motion, always on, slow).
    for (const r of this.ripples) {
      r.x -= 0.03 * delta;
      if (r.x < -50) {
        r.x = GAME_WIDTH + 50;
        r.y = Phaser.Math.Between(20, PLAY_HEIGHT - 20);
      }
    }

    if (this.state === "playing") {
      const body = this.boat.body as Body;
      body.setAccelerationY(this.holding ? -THRUST : 0);
      this.boat.angle = Phaser.Math.Clamp(body.velocity.y * 0.05, -18, 40);
      this.updateScoreAndCull();
    } else if (this.state === "over") {
      const body = this.boat.body as Body;
      this.boat.angle = Phaser.Math.Clamp(body.velocity.y * 0.05, -18, 70);
    }

    // Wheel spin is driven by the boat's vertical velocity: CCW when rising, CW when
    // sinking, slow through zero when changing direction, stopped at boundaries.
    if (this.state === "playing") {
      const body = this.boat.body as Body;
      this.wheel.rotation += (body.velocity.y / MAX_FALL) * 0.12;
    }
  }

  private updateScoreAndCull() {
    this.hazards.getChildren().forEach((o) => {
      const ob = o as Phaser.Physics.Arcade.Sprite;
      if (!ob.getData("scored") && ob.x + ob.width / 2 < this.boat.x) {
        ob.setData("scored", true);
        this.score += 1;
        this.scoreText.setText(String(this.score));
      }
      if (ob.x < -80) ob.destroy();
    });
  }
}
