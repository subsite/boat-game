"""Loading-screen collage: every boat in the game on the sea, plus the title.

Writes a transparent collage (boats, foam, title) and the game's sea tile,
which both the Android splash (resources/android/res/, a layer list that
tiles the sea and centres the collage) and the in-page loading screen
(public/splash.png, public/splash-sea.png, see index.html) put together, so
the two screens look alike:

    cd tools/art
    python3 draw_splash.py ../.. /tmp/splash_preview.png

The optional second argument is a preview on a 1080 x 2340 phone screen.
The sea comes from src/sea.ts via sea_tile.ts, so node must be on the PATH.
"""

import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = sys.argv[1]
PREVIEW = sys.argv[2] if len(sys.argv) > 2 else None
W, H = 1280, 1400  # collage master: 320 x 350 dp at xxxhdpi
TILE = 512  # SEA_TILE in src/sea.ts
TITLE = "Boat Game"

# Back to front: image, display width, centre x, waterline y (master px).
# The image bottoms are their waterlines. Obstacles face left, the player
# boats right, as in the game.
BOATS = [
    ("ferry", 800, 500, 590),
    ("falko_left", 680, 870, 780),
    ("suomenlinna", 700, 410, 980),
    ("buster", 440, 970, 1130),
    ("vejde_right", 620, 520, 1350),
]


def sea_tile():
    raw = subprocess.run(
        ["node", "--experimental-strip-types", "--no-warnings", "tools/art/sea_tile.ts"],
        cwd=ROOT, check=True, capture_output=True,
    ).stdout
    return Image.frombytes("RGBA", (TILE, TILE), raw).convert("RGB")


def collage():
    out = Image.new("RGBA", (W, H))
    for name, width, cx, wl in BOATS:
        boat = Image.open(os.path.join(ROOT, "public", f"{name}.png")).convert("RGBA")
        boat = boat.resize((width, round(boat.height * width / boat.width)), Image.LANCZOS)
        x = cx - width // 2
        # soft foam where the hull meets the water
        foam = Image.new("L", (W, H))
        ImageDraw.Draw(foam).ellipse([x - 8, wl - 10, x + width + 8, wl + 12], fill=150)
        foam = foam.filter(ImageFilter.GaussianBlur(9))
        white = Image.new("RGBA", (W, H), (235, 244, 248, 255))
        white.putalpha(foam)
        out.alpha_composite(white)
        out.alpha_composite(boat, (x, wl - boat.height))
    # Title: big white letters with a dark outline, like the score.
    font = ImageFont.load_default(170)
    d = ImageDraw.Draw(out)
    d.text((W // 2, 150), TITLE, font=font, anchor="mm", fill=(28, 61, 90, 255),
           stroke_width=20, stroke_fill=(28, 61, 90, 255))
    # the same again, thickened with a white stroke, reads as bold
    d.text((W // 2, 150), TITLE, font=font, anchor="mm", fill=(255, 255, 255, 255),
           stroke_width=5, stroke_fill=(255, 255, 255, 255))
    return out


def save(im, *parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)


def tiled(tile, w, h):
    bg = Image.new("RGB", (w, h))
    for y in range(0, h, tile.height):
        for x in range(0, w, tile.width):
            bg.paste(tile, (x, y))
    return bg


SPLASH_XML = """<?xml version="1.0" encoding="utf-8"?>
<!-- Launch screen (Android < 12): the sea tiled, the collage centred. -->
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <bitmap android:src="@drawable/splash_sea" android:tileMode="repeat"/>
    </item>
    <item>
        <bitmap android:src="@drawable/splash_art" android:gravity="center"/>
    </item>
</layer-list>
"""

sea = sea_tile()
art = collage()
# The sea's average colour, behind the Android 12+ system splash icon.
r, g, b = sea.resize((1, 1), Image.BOX).getpixel((0, 0))
COLORS = f"""<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="splash_background">#{r:02x}{g:02x}{b:02x}</color>
</resources>
"""

res = ("resources", "android", "res")
for name, k in {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}.items():
    w = round(W * k / 4)
    save(art.resize((w, round(H * k / 4)), Image.LANCZOS), *res, f"drawable-{name}", "splash_art.png")
# The tile is 512 px at xxhdpi, about 171 dp; index.html shows it at 171 px too.
save(sea, *res, "drawable-xxhdpi", "splash_sea.png")
for parts, text in (((*res, "drawable", "splash.xml"), SPLASH_XML), ((*res, "values", "splash_colors.xml"), COLORS)):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)

save(art.resize((W * 3 // 4, H * 3 // 4), Image.LANCZOS), "public", "splash.png")
save(sea, "public", "splash-sea.png")
print(f"sea colour #{r:02x}{g:02x}{b:02x}")

if PREVIEW:
    pw, ph = 1080, 2340
    screen = tiled(sea, pw, ph).convert("RGBA")
    a = art.resize((round(W * 0.8), round(H * 0.8)), Image.LANCZOS)  # 320 dp at 2.7x
    screen.alpha_composite(a, ((pw - a.width) // 2, (ph - a.height) // 2))
    screen.convert("RGB").resize((pw // 2, ph // 2), Image.LANCZOS).save(PREVIEW)
