import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { GAME_WIDTH, GAME_HEIGHT } from "./config";

new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#aee3f5",
  scene: [GameScene],
  // Track several touches so a palm or extra finger doesn't break holding.
  input: { activePointers: 4 },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
