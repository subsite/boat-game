// Writes the game's default sea tile as raw RGBA to stdout, for draw_icon.py:
//   node --experimental-strip-types tools/art/sea_tile.ts > sea.rgba
import { SEA_TILE, SEA_STYLES, DEFAULT_SEA } from "../../src/sea.ts";

const px = SEA_STYLES[DEFAULT_SEA].sea();
const out = Buffer.alloc(SEA_TILE * SEA_TILE * 4);
for (let y = 0; y < SEA_TILE; y++) {
  for (let x = 0; x < SEA_TILE; x++) {
    const [r, g, b, a] = px(x, y);
    out.set([r, g, b, a], (y * SEA_TILE + x) * 4);
  }
}
process.stdout.write(out);
