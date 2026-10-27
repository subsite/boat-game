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
