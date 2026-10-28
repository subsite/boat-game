// Pixel generators for the tileable Baltic sea textures. Pure functions (no
// Phaser) so they can be rendered and tuned outside the game too.

// The sea tile is large and the sheen overlay uses a different size, so the
// two repeat out of step and the pattern doesn't read as stamped.
export const SEA_TILE = 512;
export const SHEEN_TILE = 384;

type RGBA = [number, number, number, number];
type Wave = [kx: number, ky: number, amp: number, phase: number];

// Small seeded PRNG so the sea looks the same every launch.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/**
 * Many sines at whole-number frequencies across the tile (so it wraps
 * seamlessly) with spread-out directions, so it reads as irregular water.
 * Frequencies are in cycles per 256 px and scaled to the tile. The field is
 * precomputed into an array, normalised to roughly -1..1.
 */
function field(size: number, seed: number, count: number, fmin: number, fmax: number, dir: number, spread: number) {
  const r = rng(seed);
  const waves: Wave[] = [];
  for (let i = 0; i < count; i++) {
    const f = (fmin + (fmax - fmin) * r()) * (size / 256);
    const a = dir + (r() * 2 - 1) * spread;
    const kx = Math.round(Math.cos(a) * f);
    const ky = Math.round(Math.sin(a) * f);
    if (kx === 0 && ky === 0) continue;
    waves.push([kx, ky, 1 / f, r() * Math.PI * 2]);
  }
  const total = waves.reduce((sum, [, , a]) => sum + a, 0);
  const out = new Float32Array(size * size);
  for (const [kx, ky, a, p] of waves) {
    for (let y = 0; y < size; y++) {
      const py = (2 * Math.PI * ky * y) / size + p;
      for (let x = 0; x < size; x++) {
        out[y * size + x] += (a / total) * Math.sin((2 * Math.PI * kx * x) / size + py);
      }
    }
  }
  const wrap = (v: number) => ((v % size) + size) % size;
  const at = (x: number, y: number) => out[wrap(y) * size + wrap(x)];
  // Bilinear lookup at fractional (e.g. warped) coordinates; still tiles.
  const sample = (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
  // Slope facing the top of the screen (where the sky light comes from).
  const slope = (x: number, y: number) =>
    -(sample(x, y + 1) - sample(x, y - 1)) - (sample(x + 1, y) - sample(x - 1, y)) * 0.3;
  return { at, sample, slope };
}

const DEEP = [0x0b, 0x17, 0x1e];
const FACET = [0x2c, 0x42, 0x4b];
const SHEEN = [0x9f, 0xb1, 0xb8];
const FROTH = [0xdd, 0xe4, 0xe6];

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (e0: number, e1: number, v: number) => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/**
 * Dark Baltic water lit by an overcast sky: facets tilted toward the top of
 * the screen reflect light, the rest stays near black-green. A slow
 * "roughness" field makes some areas choppier than others, and froth gathers
 * on the highest swell crests where the chop is also up.
 */
export function seaPixels() {
  const size = SEA_TILE;
  const swell = field(size, 7, 10, 1.5, 4.5, -0.7, 0.9);
  const chop = field(size, 11, 18, 5, 12, -0.7, 1.4);
  const ripple = field(size, 23, 30, 16, 40, 0, Math.PI);
  const rough = field(size, 5, 6, 1, 3, 0, Math.PI);
  // Domain warp: smooth, tileable offsets bend the sine crests so they stop
  // lining up into a woven, fabric-like grid.
  const warpX = field(size, 101, 8, 1.5, 4, 0, Math.PI);
  const warpY = field(size, 103, 8, 1.5, 4, 0, Math.PI);
  // Gusts: ripples only show in drifting patches, as wind catches the water.
  const gust = field(size, 61, 10, 3, 8, 0, Math.PI);
  return (x: number, y: number): RGBA => {
    const dx = warpX.at(x, y);
    const dy = warpY.at(x, y);
    const k = 0.45 + 0.9 * smooth(-0.6, 0.6, rough.at(x, y));
    const g = 0.15 + smooth(-0.3, 0.6, gust.at(x, y));
    const rel =
      swell.slope(x + dx * 3, y + dy * 3) * 8 +
      (chop.slope(x + dx * 5, y + dy * 5) * 3 + ripple.slope(x + dx * 8, y + dy * 8) * 2 * g) * k;
    const b = clamp01(0.3 + rel);
    let c = mix(DEEP, FACET, Math.pow(b, 1.6));
    const spec = clamp01((rel - 0.5) * 2.2);
    c = mix(c, SHEEN, spec * spec * 0.8);

    const froth =
      smooth(0.4, 0.75, swell.sample(x + dx * 3, y + dy * 3)) *
      smooth(0.15, 0.6, chop.sample(x + dx * 5, y + dy * 5)) *
      smooth(-0.1, 0.4, ripple.sample(x + dx * 8, y + dy * 8)) *
      k *
      g;
    if (froth > 0 && Math.random() < froth * 0.8) {
      c = mix(c, FROTH, 0.3 + Math.random() * 0.6 * Math.min(1, froth));
    }
    return [c[0], c[1], c[2], 255];
  };
}

/** Fine ripple sparkle, scrolled over the sea at a slightly different speed. */
export function sheenPixels() {
  const fine = field(SHEEN_TILE, 41, 22, 18, 36, 0, Math.PI);
  const patchy = field(SHEEN_TILE, 3, 5, 1, 2.5, 0, Math.PI);
  const warpX = field(SHEEN_TILE, 107, 8, 1.5, 4, 0, Math.PI);
  const warpY = field(SHEEN_TILE, 109, 8, 1.5, 4, 0, Math.PI);
  return (x: number, y: number): RGBA => {
    const wx = x + warpX.at(x, y) * 8;
    const wy = y + warpY.at(x, y) * 8;
    const v = clamp01(fine.slope(wx, wy) * 2.5 - 0.35) * smooth(-0.2, 0.6, patchy.at(x, y));
    return [0xb8, 0xc6, 0xcc, v * v * 80];
  };
}

// ---------------------------------------------------------------- styles
// Alternative looks, chosen with ?sea=<key> in the URL (see SEA_STYLES).

type PixelFn = (x: number, y: number) => RGBA;
const CLEAR: PixelFn = () => [0, 0, 0, 0];

// Deterministic 0..1 hash of a grid cell and an index, for scattered marks
// that still tile (cells wrap at the tile edge).
function cellHash(cx: number, cy: number, i: number) {
  const v = Math.sin(cx * 127.1 + cy * 311.7 + i * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Scatter marks over a grid of CELL px cells (one mark set per cell, jittered)
 * and return the strongest coverage 0..1 at a pixel. `mark` gets the pixel
 * relative to the cell's mark centre and the cell's hash function.
 */
function scatter(size: number, cell: number, mark: (dx: number, dy: number, h: (i: number) => number) => number) {
  const n = size / cell;
  return (x: number, y: number) => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    let best = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = gx + ox;
        const cy = gy + oy;
        const wx = ((cx % n) + n) % n;
        const wy = ((cy % n) + n) % n;
        const h = (i: number) => cellHash(wx, wy, i);
        const mx = (cx + 0.2 + 0.6 * h(0)) * cell;
        const my = (cy + 0.2 + 0.6 * h(1)) * cell;
        best = Math.max(best, mark(x - mx, y - my, h));
      }
    }
    return best;
  };
}

/** Calm: the same Baltic tones, but only long smooth swells — no fine ripple pattern. */
function calmPixels(): PixelFn {
  const size = SEA_TILE;
  const swell = field(size, 7, 10, 1.5, 4.5, -0.7, 0.9);
  const chop = field(size, 11, 10, 4, 8, -0.7, 1.0);
  const deep = [12, 36, 54];
  const light = [38, 86, 112];
  return (x, y) => {
    const rel = swell.slope(x, y) * 7 + chop.slope(x, y) * 1.5;
    const c = mix(deep, light, clamp01(0.35 + rel));
    return [c[0], c[1], c[2], 255];
  };
}

/** Cartoon: flat blue with soft tone patches and white "∼" wave squiggles. */
function cartoonPixels(): PixelFn {
  const size = SEA_TILE;
  const tone = field(size, 5, 6, 1, 3, 0, Math.PI);
  const dark = [22, 78, 120];
  const light = [36, 108, 156];
  const marks = scatter(size, 64, (dx, dy, h) => {
    if (h(2) < 0.25) return 0; // some cells stay empty
    const L = 8 + 5 * h(3); // half length
    if (Math.abs(dx) > L) return 0;
    const curve = -2.6 * Math.sin((dx / L) * Math.PI); // one full ∼ wave
    const taper = 1 - Math.pow(Math.abs(dx) / L, 4); // round, thinner ends
    return clamp01((1.9 - Math.abs(dy - curve)) * taper);
  });
  return (x, y) => {
    let c = mix(dark, light, smooth(-0.5, 0.5, tone.at(x, y)));
    c = mix(c, [235, 245, 250], marks(x, y) * 0.85);
    return [c[0], c[1], c[2], 255];
  };
}

/**
 * Toon: cel-shaded rows of waves in four flat blues with light lines along
 * the crests. The swell runs mostly across the screen so bands form wave
 * rows rather than blobs.
 */
function toonPixels(): PixelFn {
  const size = SEA_TILE;
  const swell = field(size, 7, 10, 3, 6, -Math.PI / 2, 0.3);
  const chop = field(size, 11, 10, 6, 10, -Math.PI / 2, 0.5);
  const colors = [
    [18, 62, 96],
    [24, 80, 120],
    [32, 98, 142],
    [46, 122, 168],
  ];
  const h = (x: number, y: number) => swell.sample(x, y) + chop.sample(x, y) * 0.25;
  const level = (v: number) => (v < -0.4 ? 0 : v < 0.05 ? 1 : v < 0.5 ? 2 : 3);
  return (x, y) => {
    const l = level(h(x, y));
    let c = colors[l];
    // a light line where this band meets a higher one just above
    if (level(h(x, y - 2)) > l) c = mix(c, [190, 225, 240], 0.7);
    return [c[0], c[1], c[2], 255];
  };
}

interface BrushOptions {
  dark: number[]; // base water tones, mixed by a slow tone field
  light: number[];
  stroke: number[]; // stroke colour and strength
  strokeAlpha: number;
  cell: number; // scatter grid (must divide SEA_TILE)
  empty: number; // share of cells without a stroke
  length: [number, number]; // half length range
  thickness: number;
  tilt?: number; // radians, strokes slanted along the swell
  bend?: number; // curvature: strokes bow up like little wave crests
  group?: number; // strokes stacked per mark (2-3 reads as a wave set)
  stagger?: number; // sideways shift of each stacked stroke, as a share of its length
  wave?: number; // px amplitude of a gentle ripple along each stroke (~18 px wavelength)
  crests?: boolean; // strokes only where swells crest
  ink?: number[]; // optional second set of dark "ink" strokes
}

/** Storybook family: tinted water with short brush strokes, painted-book style. */
function brushPixels(o: BrushOptions): PixelFn {
  const size = SEA_TILE;
  const tone = field(size, 5, 6, 1, 3, 0, Math.PI);
  // crests run across the screen, so stroke rows read as horizontal
  const swell = o.crests ? field(size, 7, 10, 2, 4, -Math.PI / 2, 0.15) : null;
  const tilt = o.tilt ?? 0;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const mark = (seed: number) =>
    scatter(size, o.cell, (dx0, dy0, h) => {
      if (h(2 + seed) < o.empty) return 0;
      const dx = dx0 * ct + dy0 * st;
      const dy = -dx0 * st + dy0 * ct;
      const half = o.length[0] + (o.length[1] - o.length[0]) * h(3 + seed);
      const t = o.thickness * (0.8 + 0.4 * h(4 + seed));
      let best = 0;
      for (let g = 0; g < (o.group ?? 1); g++) {
        const gl = half * (1 - g * 0.3); // each lower stroke a bit shorter
        // bend > 0 lowers the stroke's ends, bowing it up like a crest
        const gx = dx - g * gl * (o.stagger ?? 0);
        const ripple = (o.wave ?? 0) * Math.sin(gx * 0.35 + h(6 + seed) * 6);
        const gy = dy - g * (t * 2.6 + 1.5) - ((o.bend ?? 0) * (gx * gx)) / (gl * gl) - ripple;
        const along = Math.max(0, Math.abs(gx) - gl);
        best = Math.max(best, clamp01(1.5 - Math.hypot(along, gy) / t));
      }
      return best * (0.5 + 0.5 * h(5 + seed));
    });
  const strokes = mark(0);
  const ink = o.ink ? mark(10) : null;
  return (x, y) => {
    let c = mix(o.dark, o.light, smooth(-0.5, 0.5, tone.at(x, y)));
    let a = strokes(x, y) * o.strokeAlpha;
    if (swell) a *= smooth(-0.05, 0.45, swell.at(x, y));
    if (ink && o.ink) c = mix(c, o.ink, ink(x, y) * 0.55);
    c = mix(c, o.stroke, a);
    return [c[0], c[1], c[2], 255];
  };
}

const TEAL_DARK = [12, 46, 62];
const TEAL_LIGHT = [20, 66, 84];
const STROKE = [140, 196, 210];

const BRUSH: Record<string, BrushOptions> = {
  // the original: deep teal, short light horizontal dashes
  storybook: { dark: TEAL_DARK, light: TEAL_LIGHT, stroke: STROKE, strokeAlpha: 0.7, cell: 32, empty: 0.3, length: [5, 14], thickness: 1.3 },
  // brighter daytime blue with whiter strokes
  day: { dark: [20, 78, 116], light: [32, 102, 144], stroke: [190, 228, 240], strokeAlpha: 0.75, cell: 32, empty: 0.3, length: [5, 14], thickness: 1.3 },
  // longer, gently wavy horizontal strokes gathered on the swell crests
  swell: { dark: TEAL_DARK, light: TEAL_LIGHT, stroke: STROKE, strokeAlpha: 0.85, cell: 32, empty: 0.15, length: [8, 20], thickness: 1.4, crests: true, wave: 0.6 },
  // light strokes plus darker "ink" strokes, like a pen-and-wash drawing
  ink: { dark: [16, 56, 74], light: [26, 78, 98], stroke: STROKE, strokeAlpha: 0.7, cell: 32, empty: 0.35, length: [5, 14], thickness: 1.3, ink: [6, 26, 36] },
  // little sets of 2-3 stacked strokes, each shifted along, like a wave set
  sets: { dark: TEAL_DARK, light: TEAL_LIGHT, stroke: STROKE, strokeAlpha: 0.75, cell: 64, empty: 0.2, length: [9, 16], thickness: 1.3, group: 3, stagger: 0.45 },
  // fewer, longer, softer strokes
  soft: { dark: [14, 50, 68], light: [22, 72, 92], stroke: [150, 200, 214], strokeAlpha: 0.45, cell: 64, empty: 0.2, length: [14, 30], thickness: 2 },
};

// Painted-book strokes on horizontal swell rows.
export const DEFAULT_SEA = "storybook_swell";

export interface SeaStyle {
  sea: () => PixelFn;
  sheen: (() => PixelFn) | null; // drifting sparkle overlay, or none
  froth: boolean; // drifting froth patches on top
}

export const SEA_STYLES: Record<string, SeaStyle> = {
  baltic: { sea: seaPixels, sheen: sheenPixels, froth: true }, // the first, realistic one
  calm: { sea: calmPixels, sheen: sheenPixels, froth: true },
  cartoon: { sea: cartoonPixels, sheen: null, froth: false },
  toon: { sea: toonPixels, sheen: null, froth: true },
  storybook: { sea: () => brushPixels(BRUSH.storybook), sheen: null, froth: false },
  // storybook variations
  storybook_day: { sea: () => brushPixels(BRUSH.day), sheen: null, froth: false },
  storybook_swell: { sea: () => brushPixels(BRUSH.swell), sheen: null, froth: false },
  storybook_ink: { sea: () => brushPixels(BRUSH.ink), sheen: null, froth: false },
  storybook_sets: { sea: () => brushPixels(BRUSH.sets), sheen: null, froth: false },
  storybook_soft: { sea: () => brushPixels(BRUSH.soft), sheen: null, froth: false },
};

export { CLEAR as clearPixels };
