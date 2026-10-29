"""App icon: the Vejde (public/vejde_right.png) on the game's own sea.

Writes the Android launcher icons into resources/android/res/ (copied over
the generated android/ project by the release workflow and `npm run
cap:icons`) and the web favicon public/icon.png:

    cd tools/art
    python3 draw_icon.py ../.. /tmp/icon_preview.png

The first argument is the repo root; the optional second one is a preview
of the launcher crops (circle, rounded square, small) on a grey background.
The sea comes from src/sea.ts (DEFAULT_SEA) via sea_tile.ts, so node must
be on the PATH.
"""

import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = sys.argv[1]
PREVIEW = sys.argv[2] if len(sys.argv) > 2 else None
N = 1024  # master size: the full 108 dp adaptive-icon layer
TILE = 512  # SEA_TILE in src/sea.ts

# Launchers show only the middle 72 of the 108 dp layers, masked to a shape.
VISIBLE = 72 / 108
# Adaptive layer sizes (108 dp) and legacy icon sizes (48 dp) per density.
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

BOAT_WIDTH = 0.54  # of the layer: keeps bow and stern inside the circle mask
WATERLINE = 232  # boat source px where the hull meets the water


def sea_layer():
    raw = subprocess.run(
        ["node", "--experimental-strip-types", "--no-warnings", "tools/art/sea_tile.ts"],
        cwd=ROOT, check=True, capture_output=True,
    ).stdout
    tile = Image.frombytes("RGBA", (TILE, TILE), raw)
    bg = Image.new("RGBA", (N, N))
    for y in range(0, N, TILE):
        for x in range(0, N, TILE):
            bg.paste(tile, (x, y))
    return bg


def boat_layer():
    boat = Image.open(os.path.join(ROOT, "public/vejde_right.png")).convert("RGBA")
    w = int(N * BOAT_WIDTH)
    s = w / boat.width
    boat = boat.resize((w, round(boat.height * s)), Image.LANCZOS)
    x = (N - w) // 2
    y = (N - boat.height) // 2 + N // 50
    layer = Image.new("RGBA", (N, N))
    # A soft band of foam where the hull meets the water.
    foam = Image.new("L", (N, N))
    wl = y + round(WATERLINE * s)
    ImageDraw.Draw(foam).ellipse([x - 10, wl - 8, x + w, wl + 10], fill=120)
    foam = foam.filter(ImageFilter.GaussianBlur(10))
    layer.paste(Image.new("RGBA", (N, N), (235, 244, 248, 255)), (0, 0), foam)
    layer.alpha_composite(boat, (x, y))
    return layer


def mask(size, circle):
    big = size * 4
    m = Image.new("L", (big, big), 0)
    d = ImageDraw.Draw(m)
    if circle:
        d.ellipse([0, 0, big - 1, big - 1], fill=255)
    else:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=big // 6, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def visible(full, size, circle=None):
    """The part a launcher shows, at size px; masked unless circle is None."""
    c = round(N * (1 - VISIBLE) / 2)
    v = full.crop((c, c, N - c, N - c)).resize((size, size), Image.LANCZOS)
    if circle is None:
        return v
    out = Image.new("RGBA", (size, size))
    out.paste(v, (0, 0), mask(size, circle))
    return out


def save(im, *parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)


ADAPTIVE = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
"""

sea = sea_layer()
boat = boat_layer()
full = sea.copy()
full.alpha_composite(boat)

res = ("resources", "android", "res")
for name, k in DENSITIES.items():
    layer = round(108 * k)
    legacy = round(48 * k)
    d = f"mipmap-{name}"
    save(sea.resize((layer, layer), Image.LANCZOS).convert("RGB"), *res, d, "ic_launcher_background.png")
    save(boat.resize((layer, layer), Image.LANCZOS), *res, d, "ic_launcher_foreground.png")
    save(visible(full, legacy, circle=False), *res, d, "ic_launcher.png")
    save(visible(full, legacy, circle=True), *res, d, "ic_launcher_round.png")
for xml in ("ic_launcher.xml", "ic_launcher_round.xml"):
    path = os.path.join(ROOT, *res, "mipmap-anydpi-v26", xml)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(ADAPTIVE)

save(visible(full, 192, circle=False), "public", "icon.png")

if PREVIEW:
    sheet = Image.new("RGB", (620, 232), (230, 230, 230))
    xx = 20
    for size, circle in ((192, True), (192, False), (96, False), (48, True)):
        sheet.paste(visible(full, size, circle), (xx, 20), mask(size, circle))
        xx += size + 20 if size > 96 else size + 10
    sheet.save(PREVIEW)
