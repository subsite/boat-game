import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { GAME_WIDTH, GAME_HEIGHT } from "./config";

const game = new Phaser.Game({
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
      // Open the game with ?debug in the URL to draw every hitbox.
      debug: new URLSearchParams(window.location.search).has("debug"),
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

// Fade out the loading screen (index.html) once the scene has built its art.
game.events.once(Phaser.Core.Events.READY, () => {
  game.scene.getScene("GameScene").events.once(Phaser.Scenes.Events.CREATE, () => {
    const loading = document.getElementById("loading");
    if (!loading) return;
    loading.classList.add("done");
    setTimeout(() => loading.remove(), 500);
  });
});
