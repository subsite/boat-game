import Phaser from "phaser";
import { SEA_TILE, SHEEN_TILE, SEA_STYLES, DEFAULT_SEA, clearPixels } from "./sea";
import { GAME_WIDTH, PANEL_HEIGHT } from "./config";

// Instrument positions on the dashboard, relative to its top-left corner;
// shared with the scene, which places the moving parts on top.
export const DASH_GAUGES = {
  compass: { x: 76, y: 84, r: 44 },
  rev: { x: 372, y: 62, r: 34 },
  fuel: { x: 346, y: 128, r: 17 },
  temp: { x: 400, y: 128, r: 17 },
};

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

// Per-pixel variant of make(), for textures Graphics shapes can't express.
type Pixel = (x: number, y: number) => [number, number, number, number];

function makeCanvas(scene: Phaser.Scene, key: string, w: number, h: number, pixel: Pixel) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = pixel(x, y);
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

export const FROTH_VARIANTS = 4;

/**
 * The sea's look, picked with ?sea=<key> in the URL (see SEA_STYLES in
 * sea.ts). Defaults to storybook_swell.
 */
export function seaStyle() {
  const key = new URLSearchParams(window.location.search).get("sea") ?? DEFAULT_SEA;
  return SEA_STYLES[key] ?? SEA_STYLES[DEFAULT_SEA];
}

type Tree = "spruce" | "pine";

export interface RockSpec {
  key: string;
  rockW: number; // granite hump width at the waterline
  rockH: number; // hump height above the waterline
  treeH: number; // room above the hump for trees (0 = bare)
  trees: Tree[];
  marker?: "south" | "west"; // cardinal buoy post on top, so small rocks stand out
  weight: number; // relative spawn frequency
}

// Canvas layout shared by drawing and hitboxes: foam margin at the sides and
// the waterline 12 px above the bottom (room for foam and reflection).
export function rockLayout(s: RockSpec) {
  return { w: s.rockW + 24, h: s.rockH + s.treeH + 16, waterline: s.rockH + s.treeH + 4 };
}

// Finnish archipelago in side view, from bare skerries to wooded islands.
// Each entry is one randomly shaped texture; bigger ones spawn less often.
export const ROCKS: RockSpec[] = [
  { key: "rock_small_0", rockW: 46, rockH: 18, treeH: 44, trees: [], marker: "west", weight: 2 },
  { key: "rock_small_1", rockW: 46, rockH: 15, treeH: 44, trees: [], marker: "south", weight: 2 },
  { key: "rock_0", rockW: 78, rockH: 30, treeH: 0, trees: [], weight: 2 },
  { key: "rock_1", rockW: 84, rockH: 25, treeH: 0, trees: [], weight: 2 },
  { key: "islet_spruce", rockW: 96, rockH: 32, treeH: 58, trees: ["spruce"], weight: 2 },
  { key: "islet_pine", rockW: 96, rockH: 30, treeH: 58, trees: ["pine"], weight: 2 },
  { key: "island_0", rockW: 140, rockH: 42, treeH: 60, trees: ["spruce", "pine", "spruce"], weight: 1 },
  { key: "island_1", rockW: 140, rockH: 38, treeH: 60, trees: ["pine", "pine"], weight: 1 },
];

// Spruce from the side: a narrow dark cone of drooping tiers, lit from the left.
function drawSpruce(g: Phaser.GameObjects.Graphics, x: number, base: number, H: number) {
  g.fillStyle(0x4a3524, 1);
  g.fillRect(x - 1.5, base - H * 0.12, 3, H * 0.12 + 2);
  const W = H * 0.38;
  const tiers = 7;
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const y = base - H * 0.08 - f * H * 0.8;
    const half = (W / 2) * (1 - f * 0.85);
    const tierH = H * 0.22;
    g.fillStyle(0x1b3626, 1);
    g.fillTriangle(x - half, y + 1.5, x + half, y + 1.5, x, y - tierH);
    g.fillStyle(0x2b5439, 1);
    g.fillTriangle(x - half * 0.85, y, x, y, x, y - tierH * 0.9);
  }
  g.lineStyle(1.5, 0x1b3626, 1);
  g.lineBetween(x, base - H * 0.86, x, base - H);
}

// Scots pine from the side: tall bare trunk, orange bark higher up, and a
// flat, irregular crown of needle clumps.
function drawPine(g: Phaser.GameObjects.Graphics, x: number, base: number, H: number) {
  const lean = Phaser.Math.FloatBetween(-3, 3);
  const topX = x + lean;
  g.lineStyle(3.5, 0x5d4a3c, 1);
  g.lineBetween(x, base + 1, x + lean * 0.4, base - H * 0.35);
  g.lineStyle(2.5, 0xb5652f, 1);
  g.lineBetween(x + lean * 0.4, base - H * 0.35, topX, base - H * 0.78);
  g.lineStyle(1.2, 0x8a5a34, 1);
  g.lineBetween(x + lean * 0.5, base - H * 0.55, x + lean * 0.5 - 6, base - H * 0.64);
  g.lineBetween(x + lean * 0.6, base - H * 0.62, x + lean * 0.6 + 5, base - H * 0.7);
  const clumps = Array.from({ length: 5 }, () => {
    const rw = Phaser.Math.FloatBetween(H * 0.14, H * 0.22);
    return {
      cx: topX + Phaser.Math.FloatBetween(-H * 0.2, H * 0.2),
      cy: base - H * Phaser.Math.FloatBetween(0.75, 0.87),
      rw,
      rh: rw * 0.55,
    };
  });
  g.fillStyle(0x2d4f2a, 1);
  for (const c of clumps) g.fillEllipse(c.cx, c.cy, c.rw * 2, c.rh * 2);
  g.fillStyle(0x4c7a3a, 1);
  for (const c of clumps) g.fillEllipse(c.cx - c.rw * 0.25, c.cy - c.rh * 0.35, c.rw * 1.1, c.rh * 0.8);
}

// Cardinal mark (IALA) from the side: a banded post with two black cones on
// top. Both kinds used here are yellow at the top, to stand out on the dark
// sea. South: yellow over black, both cones pointing down. West: yellow,
// black, yellow, cones point to point.
function drawCardinal(g: Phaser.GameObjects.Graphics, x: number, base: number, H: number, kind: "south" | "west") {
  const YELLOW = 0xf1c40f;
  const BLACK = 0x1c1c1c;
  const postTop = base - H * 0.68;
  const w = 6;
  const len = base - postTop;
  const bands: [number, number][] =
    kind === "south"
      ? [
          [YELLOW, 0.5],
          [BLACK, 0.5],
        ]
      : [
          [YELLOW, 1 / 3],
          [BLACK, 1 / 3],
          [YELLOW, 1 / 3],
        ];
  let y = postTop;
  for (const [color, part] of bands) {
    g.fillStyle(color, 1);
    g.fillRect(x - w / 2, y, w, len * part);
    y += len * part;
  }
  // lit left edge, shadowed right edge
  g.fillStyle(0xffffff, 0.3);
  g.fillRect(x - w / 2, postTop, 1.5, len);
  g.fillStyle(0x000000, 0.3);
  g.fillRect(x + w / 2 - 1.5, postTop, 1.5, len);
  // topmark mast and cones
  g.lineStyle(1.5, BLACK, 1);
  g.lineBetween(x, postTop, x, base - H);
  const cone = (cy: number, up: boolean) => {
    const hh = 4;
    if (up) g.fillTriangle(x - 5, cy + hh, x + 5, cy + hh, x, cy - hh);
    else g.fillTriangle(x - 5, cy - hh, x + 5, cy - hh, x, cy + hh);
  };
  g.fillStyle(BLACK, 1);
  cone(base - H + 5, false);
  cone(base - H + 14, kind === "west");
}

// Side-view archipelago rock: a glacier-smoothed granite hump with a dark wet
// band and foam at the waterline, sunlit from the upper left; wooded ones get
// moss, juniper and trees. Shape is randomised per texture.
function drawSkerry(g: Phaser.GameObjects.Graphics, spec: RockSpec) {
  const { w, waterline: wl } = rockLayout(spec);
  const { rockW, rockH } = spec;
  const x0 = (w - rockW) / 2;
  const skew = Phaser.Math.FloatBetween(0.75, 1.3);
  const harmonics = [2, 3, 5].map((n) => ({
    n,
    a: Phaser.Math.FloatBetween(0.03, 0.07),
    p: Phaser.Math.FloatBetween(0, Math.PI * 2),
  }));
  // Height above the waterline at t = 0..1 across the hump.
  const top = (t: number) => {
    const base = Math.pow(Math.sin(Math.PI * Math.pow(t, skew)), 0.6);
    const wobble = harmonics.reduce((sum, { n, a, p }) => sum + a * Math.sin(n * Math.PI * t + p), 0);
    return Math.max(0, rockH * base * (1 + wobble));
  };
  const N = 48;
  const xAt = (t: number) => x0 + t * rockW;
  // Polygon between an upper and a lower height curve over t0..t1.
  const band = (upper: (t: number) => number, lower: (t: number) => number, t0 = 0, t1 = 1) => {
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i <= N; i++) {
      const t = t0 + ((t1 - t0) * i) / N;
      pts.push({ x: xAt(t), y: wl - upper(t) });
    }
    for (let i = N; i >= 0; i--) {
      const t = t0 + ((t1 - t0) * i) / N;
      pts.push({ x: xAt(t), y: wl - lower(t) });
    }
    return pts;
  };

  // dark reflection just below the waterline
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(w / 2, wl + 4, rockW * 0.95, 8);
  // shadowed granite, then the sunlit upper-left faces
  g.fillStyle(0x7d6862, 1);
  g.fillPoints(band(top, () => 0), true);
  g.fillStyle(0xa48c84, 1);
  g.fillPoints(band(top, (t) => top(t) * (0.35 + 0.4 * t)), true);
  g.fillStyle(0xc4ada3, 0.85);
  g.fillPoints(band((t) => top(t) - 1, (t) => top(t) * (0.72 + 0.2 * t), 0.05, 0.7), true);
  // exfoliation sheets following the rounded top
  g.lineStyle(1.2, 0x5e4f4b, 0.55);
  for (let i = 0; i < Math.max(1, Math.round(rockW / 35)); i++) {
    const d = rockH * Phaser.Math.FloatBetween(0.25, 0.55);
    const t0 = Phaser.Math.FloatBetween(0.05, 0.5);
    const t1 = Math.min(0.95, t0 + Phaser.Math.FloatBetween(0.25, 0.45));
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let t = t0; t <= t1; t += 0.03) {
      if (top(t) - d > 4) pts.push({ x: xAt(t), y: wl - top(t) + d });
    }
    if (pts.length > 1) g.strokePoints(pts, false);
  }
  // grain speckles
  const speckles = [0x6e5d58, 0xd9c8bf, 0x8f7a72];
  for (let i = 0; i < Math.round((rockW * rockH) / 40); i++) {
    const t = Math.random();
    const hgt = top(t);
    if (hgt < 6) continue;
    g.fillStyle(Phaser.Utils.Array.GetRandom(speckles), 0.7);
    g.fillCircle(xAt(t), wl - Phaser.Math.FloatBetween(3, hgt - 2), Phaser.Math.FloatBetween(0.6, 1.3));
  }
  // lichen on the upper faces
  const lichen = [0xd4a83a, 0xb5b86a, 0xc98a3a];
  for (let i = 0; i < Math.max(1, Math.round(rockW / 20)); i++) {
    const t = Phaser.Math.FloatBetween(0.1, 0.9);
    const hgt = top(t);
    if (hgt < 6) continue;
    g.fillStyle(Phaser.Utils.Array.GetRandom(lichen), 0.8);
    g.fillEllipse(xAt(t), wl - hgt + Phaser.Math.FloatBetween(2, 6), Phaser.Math.Between(4, 8), Phaser.Math.Between(2, 4));
  }
  // dark wet band at the waterline
  g.fillStyle(0x3e3533, 1);
  g.fillPoints(band((t) => Math.min(top(t), 4), () => 0), true);

  if (spec.trees.length > 0) {
    // moss along the crown, juniper bushes on the slopes
    g.fillStyle(0x5f7a34, 1);
    g.fillPoints(band((t) => top(t) + 1, (t) => top(t) - 4, 0.18, 0.82), true);
    g.fillStyle(0x2f4a2a, 1);
    for (let i = 0; i < Math.round(rockW / 18); i++) {
      const t = Phaser.Math.FloatBetween(0.12, 0.88);
      g.fillEllipse(xAt(t), wl - top(t) - 2, Phaser.Math.Between(7, 12), Phaser.Math.Between(5, 8));
    }
    const n = spec.trees.length;
    spec.trees.forEach((tree, i) => {
      const t =
        n === 1 ? Phaser.Math.FloatBetween(0.4, 0.55) : 0.25 + (0.5 * i) / (n - 1) + Phaser.Math.FloatBetween(-0.05, 0.05);
      const H = spec.treeH * (n === 1 ? Phaser.Math.FloatBetween(0.85, 0.95) : Phaser.Math.FloatBetween(0.7, 0.95));
      const base = wl - top(t) + 2;
      if (tree === "spruce") drawSpruce(g, xAt(t), base, H);
      else drawPine(g, xAt(t), base, H);
    });
  }

  if (spec.marker) {
    const t = Phaser.Math.FloatBetween(0.4, 0.6);
    drawCardinal(g, xAt(t), wl - top(t) + 2, spec.treeH * 0.95, spec.marker);
  }

  // broken foam where the swell meets the rock
  g.fillStyle(0xe8eef0, 0.55);
  g.fillEllipse(w / 2, wl, rockW + 8, 4);
  for (let i = 0; i < Math.round(rockW / 4); i++) {
    g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.4, 0.85));
    g.fillEllipse(
      x0 - 6 + Math.random() * (rockW + 12),
      wl + Phaser.Math.FloatBetween(-1.5, 2),
      Phaser.Math.FloatBetween(3, 9),
      Phaser.Math.FloatBetween(1.5, 3.5)
    );
  }
}

export function createTextures(scene: Phaser.Scene) {
  // --- Ship's wheel (150 x 150): varnished teak with turned handles and a
  // brass hub. Shading is symmetric (rounded profiles, no light direction)
  // because the wheel spins. ---
  make(scene, "wheel", 150, 150, (g) => {
    const cx = 75;
    const cy = 75;
    const rim = 46;
    const spokes = 8;
    const DARK = 0x4a2810;
    const BASE = 0x7a4520;
    const LIGHT = 0xb8733a;
    const SHINE = 0xd9965a;
    const BRASS = 0xc89a35;
    const at = (a: number, r: number) => ({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });

    for (let i = 0; i < spokes; i++) {
      const a = ((Math.PI * 2) / spokes) * i;
      const n = a + Math.PI / 2; // normal, for the taper
      const quad = (r0: number, w0: number, r1: number, w1: number) => {
        const p0 = at(a, r0);
        const p1 = at(a, r1);
        return [
          { x: p0.x + Math.cos(n) * w0, y: p0.y + Math.sin(n) * w0 },
          { x: p1.x + Math.cos(n) * w1, y: p1.y + Math.sin(n) * w1 },
          { x: p1.x - Math.cos(n) * w1, y: p1.y - Math.sin(n) * w1 },
          { x: p0.x - Math.cos(n) * w0, y: p0.y - Math.sin(n) * w0 },
        ];
      };
      // tapered spoke with a lighter rounded centre
      g.fillStyle(DARK, 1);
      g.fillPoints(quad(12, 5, 58, 3.5), true);
      g.fillStyle(BASE, 1);
      g.fillPoints(quad(12, 3.8, 58, 2.6), true);
      g.fillStyle(LIGHT, 1);
      g.fillPoints(quad(12, 1.2, 58, 0.9), true);
      // turned handle beyond the rim: neck, groove, bulb, end knob
      const neck = at(a, 60);
      const bulb = at(a, 66);
      const knob = at(a, 71.5);
      g.fillStyle(DARK, 1);
      g.fillCircle(neck.x, neck.y, 3.6);
      g.fillCircle(bulb.x, bulb.y, 5.6);
      g.fillCircle(knob.x, knob.y, 3.4);
      g.fillStyle(BASE, 1);
      g.fillCircle(neck.x, neck.y, 2.6);
      g.fillCircle(bulb.x, bulb.y, 4.6);
      g.fillCircle(knob.x, knob.y, 2.5);
      g.fillStyle(SHINE, 1);
      g.fillCircle(bulb.x, bulb.y, 1.8);
      g.fillCircle(knob.x, knob.y, 1);
    }

    // rim: dark edges, rounded lighter crown, thin shine line
    g.lineStyle(13, DARK, 1);
    g.strokeCircle(cx, cy, rim);
    g.lineStyle(10, BASE, 1);
    g.strokeCircle(cx, cy, rim);
    g.lineStyle(4, LIGHT, 1);
    g.strokeCircle(cx, cy, rim);
    g.lineStyle(1, SHINE, 0.9);
    g.strokeCircle(cx, cy, rim + 0.5);
    // seams between the rim segments, brass pins where the spokes go through
    g.lineStyle(1.5, DARK, 0.9);
    for (let i = 0; i < spokes; i++) {
      const a = ((Math.PI * 2) / spokes) * (i + 0.5);
      const p0 = at(a, rim - 5.5);
      const p1 = at(a, rim + 5.5);
      g.lineBetween(p0.x, p0.y, p1.x, p1.y);
      const pin = at(((Math.PI * 2) / spokes) * i, rim);
      g.fillStyle(BRASS, 1);
      g.fillCircle(pin.x, pin.y, 1.8);
    }

    // hub: wooden boss, brass cap, centre bolt
    g.fillStyle(DARK, 1);
    g.fillCircle(cx, cy, 17);
    g.fillStyle(0x8a6316, 1);
    g.fillCircle(cx, cy, 13.5);
    g.fillStyle(BRASS, 1);
    g.fillCircle(cx, cy, 12);
    g.fillStyle(0xe6c060, 1);
    g.fillCircle(cx, cy, 8);
    g.fillStyle(0x6b4c12, 1);
    g.fillCircle(cx, cy, 4);
    g.fillStyle(0xf2dc9a, 1);
    g.fillCircle(cx - 1, cy - 1, 1.2);
  });

  // --- Dashboard (GAME_WIDTH x PANEL_HEIGHT): a plain varnished teak panel
  // like a vintage motor yacht's, with brass-bezelled, dark-faced instruments. The
  // moving parts (compass card, rev counter needle) are separate textures. ---
  make(scene, "dash", GAME_WIDTH, PANEL_HEIGHT, (g) => {
    const H = PANEL_HEIGHT;
    // Darker oiled teak than the wheel, so the wheel stands out against it.
    g.fillStyle(0x5a3418, 1);
    g.fillRect(0, 0, GAME_WIDTH, H);
    // long horizontal grain: fine wavy lines, a few broad darker streaks
    for (let i = 0; i < 70; i++) {
      const y0 = Math.random() * H;
      const amp = Phaser.Math.FloatBetween(0.5, 2.5);
      const freq = Phaser.Math.FloatBetween(0.004, 0.012);
      const phase = Math.random() * Math.PI * 2;
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      for (let x = 0; x <= GAME_WIDTH; x += 10) pts.push({ x, y: y0 + Math.sin(x * freq + phase) * amp });
      const dark = Math.random() < 0.6;
      g.lineStyle(Phaser.Math.FloatBetween(0.6, 1.6), dark ? 0x3e220e : 0x7a4a26, Phaser.Math.FloatBetween(0.25, 0.6));
      g.strokePoints(pts, false);
    }
    for (let i = 0; i < 4; i++) {
      g.fillStyle(0x3e220e, 0.18);
      g.fillRect(0, Math.random() * H, GAME_WIDTH, Phaser.Math.Between(6, 14));
    }
    // varnish sheen: a soft lighter band near the top
    for (let i = 0; i < 6; i++) {
      g.fillStyle(0xffffff, 0.025);
      g.fillRect(0, 14 + i * 3, GAME_WIDTH, 24 - i * 6);
    }
    // brass strip along the water edge, dark shadow line under it
    g.fillStyle(0x8a6316, 1);
    g.fillRect(0, 0, GAME_WIDTH, 7);
    g.fillStyle(0xd4a537, 1);
    g.fillRect(0, 1, GAME_WIDTH, 2);
    g.fillStyle(0x24140a, 1);
    g.fillRect(0, 7, GAME_WIDTH, 2);

    const bezel = (x: number, y: number, r: number) => {
      g.fillStyle(0x000000, 0.35);
      g.fillCircle(x + 2, y + 3, r + 6);
      // polished brass: dark outer edge, lit crown, darker inner lip
      g.fillStyle(0x6b4c12, 1);
      g.fillCircle(x, y, r + 6);
      g.fillStyle(0xb8862b, 1);
      g.fillCircle(x, y, r + 5);
      g.fillStyle(0xe6c060, 1);
      g.fillCircle(x - 1, y - 1, r + 3);
      g.fillStyle(0x8a6316, 1);
      g.fillCircle(x, y, r + 1.5);
    };
    const ticks = (x: number, y: number, r: number, from: number, to: number, n: number, len: number) => {
      g.lineStyle(1.5, 0xf1ead8, 1);
      for (let i = 0; i <= n; i++) {
        const a = Phaser.Math.DegToRad(from + ((to - from) * i) / n);
        g.lineBetween(x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a) * (r - len), y + Math.sin(a) * (r - len));
      }
    };
    const needle = (x: number, y: number, r: number, deg: number) => {
      const a = Phaser.Math.DegToRad(deg);
      g.lineStyle(2, 0xf1ead8, 1);
      g.lineBetween(x, y, x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75);
      g.fillStyle(0xb8862b, 1);
      g.fillCircle(x, y, 2.5);
    };

    // compass: brass bezel and dark bowl (its card is the separate "compass_card")
    bezel(DASH_GAUGES.compass.x, DASH_GAUGES.compass.y, DASH_GAUGES.compass.r);
    g.fillStyle(0x1a1f24, 1);
    g.fillCircle(DASH_GAUGES.compass.x, DASH_GAUGES.compass.y, DASH_GAUGES.compass.r);

    // rev counter: dark face, ticks over a 270 degree sweep, red zone
    const rev = DASH_GAUGES.rev;
    bezel(rev.x, rev.y, rev.r);
    g.fillStyle(0x1a1f24, 1);
    g.fillCircle(rev.x, rev.y, rev.r);
    g.lineStyle(4, 0xc0392b, 1);
    g.beginPath();
    g.arc(rev.x, rev.y, rev.r - 4, Phaser.Math.DegToRad(10), Phaser.Math.DegToRad(45));
    g.strokePath();
    ticks(rev.x, rev.y, rev.r - 2, 135, 405, 10, 6);
    ticks(rev.x, rev.y, rev.r - 2, 135, 405, 20, 3);

    // fuel and water temperature: small static gauges
    for (const [gauge, deg] of [
      [DASH_GAUGES.fuel, 250],
      [DASH_GAUGES.temp, 285],
    ] as const) {
      bezel(gauge.x, gauge.y, gauge.r);
      g.fillStyle(0x1a1f24, 1);
      g.fillCircle(gauge.x, gauge.y, gauge.r);
      ticks(gauge.x, gauge.y, gauge.r - 2, 200, 340, 4, 4);
      needle(gauge.x, gauge.y, gauge.r, deg);
    }
  });

  // --- Compass card (100 x 100): dark card, cream points, N in red ---
  const card = DASH_GAUGES.compass.r - 3;
  make(scene, "compass_card", 100, 100, (g) => {
    const c = 50;
    g.fillStyle(0x1a1f24, 1);
    g.fillCircle(c, c, card);
    g.lineStyle(1, 0xf1ead8, 1);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const len = i % 9 === 0 ? 7 : i % 3 === 0 ? 4 : 2;
      g.lineBetween(c + Math.cos(a) * card, c + Math.sin(a) * card, c + Math.cos(a) * (card - len), c + Math.sin(a) * (card - len));
    }
    // star: 4 long cardinal points (north red), 4 short intercardinal
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const len = i % 2 === 0 ? card - 9 : card * 0.45;
      const w = i % 2 === 0 ? 5 : 3;
      const tip = { x: c + Math.cos(a) * len, y: c + Math.sin(a) * len };
      const l = { x: c + Math.cos(a - Math.PI / 2) * w, y: c + Math.sin(a - Math.PI / 2) * w };
      const r = { x: c + Math.cos(a + Math.PI / 2) * w, y: c + Math.sin(a + Math.PI / 2) * w };
      g.fillStyle(i === 0 ? 0xe74c3c : 0xf1ead8, 1);
      g.fillTriangle(l.x, l.y, r.x, r.y, tip.x, tip.y);
    }
    g.fillStyle(0xb8862b, 1);
    g.fillCircle(c, c, 3);
  });

  // --- Compass glass (100 x 100): fixed lubber line and a soft reflection ---
  make(scene, "compass_glass", 100, 100, (g) => {
    const c = 50;
    g.fillStyle(0xc0392b, 1);
    g.fillTriangle(c - 4, c - card - 3, c + 4, c - card - 3, c, c - card + 6);
    g.lineStyle(5, 0xffffff, 0.18);
    g.beginPath();
    g.arc(c, c, card - 6, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(260));
    g.strokePath();
  });

  // --- Rev counter needle (80 x 12), pivot at the left end (6, 6) ---
  make(scene, "rev_needle", 80, 12, (g) => {
    const len = DASH_GAUGES.rev.r - 6;
    g.fillStyle(0xe74c3c, 1);
    g.fillTriangle(6, 4.5, 6, 7.5, 6 + len, 6);
    g.fillStyle(0xb8862b, 1);
    g.fillCircle(6, 6, 4);
    g.fillStyle(0xe6c060, 1);
    g.fillCircle(5.5, 5.5, 1.5);
  });

  // --- Granite skerries and wooded islets, see ROCKS ---
  for (const spec of ROCKS) {
    const { w, h } = rockLayout(spec);
    make(scene, spec.key, w, h, (g) => drawSkerry(g, spec));
  }

  // --- Trophy (40 x 44) for the best-score display: gold cup with handles ---
  make(scene, "trophy", 40, 44, (g) => {
    const GOLD = 0xf1c40f;
    const DARK = 0x9a6b05;
    const LIGHT = 0xffe680;
    g.lineStyle(4, DARK, 1);
    g.strokeCircle(8, 14, 6);
    g.strokeCircle(32, 14, 6);
    g.fillStyle(DARK, 1);
    g.fillPoints(
      [
        { x: 7, y: 4 },
        { x: 33, y: 4 },
        { x: 29, y: 24 },
        { x: 11, y: 24 },
      ],
      true
    );
    g.fillStyle(GOLD, 1);
    g.fillPoints(
      [
        { x: 9, y: 6 },
        { x: 31, y: 6 },
        { x: 27.5, y: 22.5 },
        { x: 12.5, y: 22.5 },
      ],
      true
    );
    g.fillStyle(LIGHT, 1);
    g.fillRect(13, 8, 4, 12);
    // stem and base
    g.fillStyle(DARK, 1);
    g.fillRect(17, 24, 6, 9);
    g.fillRect(10, 33, 20, 8);
    g.fillStyle(GOLD, 1);
    g.fillRect(18.5, 24, 3, 9);
    g.fillRect(12, 35, 16, 4);
  });

  // --- Music toggle icons (56 x 56): beamed notes on a dark disc; the
  // muted one is dimmed with a slash across it ---
  for (const muted of [false, true]) {
    make(scene, muted ? "music_off" : "music_on", 56, 56, (g) => {
      g.fillStyle(0x000000, 0.45);
      g.fillCircle(28, 28, 27);
      g.lineStyle(2, 0xffffff, 0.5);
      g.strokeCircle(28, 28, 26);
      const ink = muted ? 0x9aa5ab : 0xffffff;
      // two note heads, stems and a thick beam
      g.fillStyle(ink, 1);
      g.fillEllipse(20, 37, 11, 8);
      g.fillEllipse(36, 34, 11, 8);
      g.fillRect(24, 15, 3, 22);
      g.fillRect(40, 12, 3, 22);
      g.fillPoints(
        [
          { x: 24, y: 15 },
          { x: 43, y: 12 },
          { x: 43, y: 18 },
          { x: 24, y: 21 },
        ],
        true
      );
      if (muted) {
        g.lineStyle(7, 0x000000, 0.6);
        g.lineBetween(13, 13, 43, 43);
        g.lineStyle(4, 0xffffff, 1);
        g.lineBetween(13, 13, 43, 43);
      }
    });
  }

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

  // --- Froth patches (64 x 20), a few irregular variants so they don't
  // look stamped: 2-3 overlapping blobs of speckle each ---
  for (let v = 0; v < FROTH_VARIANTS; v++) {
    const blobs = Array.from({ length: Phaser.Math.Between(2, 3) }, () => ({
      x: Phaser.Math.FloatBetween(18, 46),
      y: Phaser.Math.FloatBetween(8, 12),
      rx: Phaser.Math.FloatBetween(8, 18),
      ry: Phaser.Math.FloatBetween(3, 6),
    }));
    makeCanvas(scene, `wave_${v}`, 64, 20, (x, y) => {
      const density = blobs.reduce((d, b) => {
        const dx = (x - b.x) / b.rx;
        const dy = (y - b.y) / b.ry;
        return Math.max(d, Math.pow(Math.max(0, 1 - dx * dx - dy * dy), 1.5));
      }, 0);
      return Math.random() < density * 0.6 ? [0xe6, 0xec, 0xee, 110 + Math.random() * 110] : [0, 0, 0, 0];
    });
  }

  // --- Tileable dark Baltic sea and its ripple-sparkle overlay, see sea.ts ---
  // (guarded here too: building the pixel fields is the slow part)
  const style = seaStyle();
  if (!scene.textures.exists("sea")) makeCanvas(scene, "sea", SEA_TILE, SEA_TILE, style.sea());
  if (!scene.textures.exists("sea_sheen")) {
    if (style.sheen) makeCanvas(scene, "sea_sheen", SHEEN_TILE, SHEEN_TILE, style.sheen());
    else makeCanvas(scene, "sea_sheen", 8, 8, clearPixels); // style without sparkle
  }

  // --- Water droplet (10 x 10) for the sinking splash: hard-edged so it
  // reads as water, not smoke ---
  make(scene, "droplet", 10, 10, (g) => {
    g.fillStyle(0xcfe3ec, 1);
    g.fillCircle(5, 5, 4.5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4.2, 4.2, 3);
  });

  // --- Foam ring (128 x 128) spreading out where the boat goes down ---
  make(scene, "foam_ring", 128, 128, (g) => {
    g.lineStyle(6, 0xffffff, 0.7);
    g.strokeCircle(64, 64, 58);
    g.lineStyle(2, 0xffffff, 0.5);
    g.strokeCircle(64, 64, 50);
  });
}
