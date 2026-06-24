import Phaser from "phaser";

// All artwork is generated at runtime as textures so the prototype runs with no
// binary assets. Shapes are kept bold, high-contrast and simple for clarity.

type Draw = (g: Phaser.GameObjects.Graphics) => void;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

export function createTextures(scene: Phaser.Scene) {
  // --- Steering wheel button (150 x 150) ---
  make(scene, "wheel", 150, 150, (g) => {
    const cx = 75;
    const cy = 75;
    const ring = 54;
    g.lineStyle(13, 0x8b5a2b, 1);
    g.strokeCircle(cx, cy, ring);
    g.lineStyle(9, 0x6b4423, 1);
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      g.lineBetween(cx, cy, cx + Math.cos(a) * ring, cy + Math.sin(a) * ring);
      g.fillStyle(0xa9692f, 1);
      g.fillCircle(cx + Math.cos(a) * (ring + 11), cy + Math.sin(a) * (ring + 11), 8);
    }
    g.fillStyle(0xc8852b, 1);
    g.fillCircle(cx, cy, 15);
    g.fillStyle(0x6b4423, 1);
    g.fillCircle(cx, cy, 6);
  });

  // --- Free-floating rock islet (96 x 86) ---
  make(scene, "rock_island", 96, 86, (g) => {
    g.fillStyle(0x7a8a8a, 1);
    g.fillEllipse(48, 44, 92, 70);
    g.fillStyle(0x8b9a9a, 1);
    g.fillEllipse(34, 30, 42, 30);
    g.fillStyle(0x6b7b7b, 1);
    g.fillEllipse(66, 50, 44, 38);
    const blotches = [0x5d6d6d, 0x99a6a6, 0x6b7b7b];
    for (let i = 0; i < 12; i++) {
      g.fillStyle(Phaser.Utils.Array.GetRandom(blotches), 1);
      g.fillCircle(Phaser.Math.Between(12, 84), Phaser.Math.Between(14, 66), Phaser.Math.Between(4, 9));
    }
    // waterline shadow
    g.fillStyle(0x4a5a5a, 1);
    g.fillEllipse(48, 76, 78, 16);
  });

  // --- Lighthouse on a rock base (64 x 122), a self-contained floating obstacle ---
  make(scene, "lighthouse", 64, 122, (g) => {
    const top = 44;
    const bot = 104;
    const edges = (y: number) => {
      const t = (y - top) / (bot - top);
      return { lx: 22 - t * 6, rx: 42 + t * 6 };
    };
    // rock base
    g.fillStyle(0x6b7b7b, 1);
    g.fillEllipse(32, 104, 60, 32);
    g.fillStyle(0x4a5a5a, 1);
    g.fillEllipse(32, 114, 52, 16);
    // tower
    g.fillStyle(0xecf0f1, 1);
    g.fillPoints(
      [
        { x: 22, y: top },
        { x: 42, y: top },
        { x: edges(bot).rx, y: bot },
        { x: edges(bot).lx, y: bot },
      ],
      true
    );
    // red bands following the taper
    g.fillStyle(0xe74c3c, 1);
    for (const [y1, y2] of [
      [56, 68],
      [80, 92],
    ]) {
      const a = edges(y1);
      const b = edges(y2);
      g.fillPoints(
        [
          { x: a.lx, y: y1 },
          { x: a.rx, y: y1 },
          { x: b.rx, y: y2 },
          { x: b.lx, y: y2 },
        ],
        true
      );
    }
    // lantern room + light
    g.fillStyle(0x34495e, 1);
    g.fillRect(20, 30, 24, 15);
    g.fillStyle(0xf1c40f, 1);
    g.fillCircle(32, 37, 6);
    // roof
    g.fillStyle(0xc0392b, 1);
    g.fillPoints(
      [
        { x: 16, y: 30 },
        { x: 48, y: 30 },
        { x: 32, y: 16 },
      ],
      true
    );
  });

  // --- Row boat (90 x 42) ---
  make(scene, "rowboat", 90, 42, (g) => {
    g.fillStyle(0x8b5a2b, 1);
    g.fillPoints(
      [
        { x: 6, y: 14 },
        { x: 84, y: 14 },
        { x: 74, y: 36 },
        { x: 16, y: 36 },
      ],
      true
    );
    g.fillStyle(0xa9692f, 1);
    g.fillRect(6, 11, 78, 6);
    g.fillStyle(0x5d4037, 1);
    g.fillRect(16, 18, 58, 4);
    g.fillStyle(0xc8852b, 1);
    g.fillRect(30, 16, 9, 13);
    g.fillRect(54, 16, 9, 13);
    g.lineStyle(4, 0x6b4423, 1);
    g.lineBetween(42, 18, 20, 4);
  });

  // --- Down arrow for start / replay prompt (60 x 56) ---
  make(scene, "arrow_down", 60, 56, (g) => {
    // dark outline layer
    g.fillStyle(0x1c3d5a, 1);
    g.fillRect(18, 0, 24, 34);
    g.fillTriangle(0, 30, 60, 30, 30, 56);
    // gold fill on top
    g.fillStyle(0xf1c40f, 1);
    g.fillRect(21, 2, 18, 30);
    g.fillTriangle(4, 31, 56, 31, 30, 53);
  });

  // --- Foam / wave streak (84 x 18) for the top-down water ---
  make(scene, "wave", 84, 18, (g) => {
    g.fillStyle(0xffffff, 0.5);
    g.fillEllipse(42, 9, 80, 8);
    g.fillStyle(0xffffff, 0.35);
    g.fillEllipse(42, 9, 56, 4);
  });
}
