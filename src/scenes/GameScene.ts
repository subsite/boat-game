import Phaser from "phaser";

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
  }

  preload() {
    // Load assets here
  }

  create() {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, "Boat Game", {
        fontSize: "48px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
  }

  update() {
    // Game loop
  }
}
