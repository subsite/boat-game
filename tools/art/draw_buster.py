# Buster XL player boat (bow right) from inbox/buster-xl.png, with a happy
# granny at the helm and a slight bow-up tilt for speed. The granny is drawn
# *under* the boat image, so the semi-transparent windscreen tints her and
# only her head sticks out above the frame.
import sys
from PIL import Image, ImageDraw

SRC, OUT, PREVIEW = sys.argv[1], sys.argv[2], sys.argv[3]
TILT = 4  # degrees, bow (right) up
PAD = 40  # room above the boat for her hair bun
SS = 4

boat = Image.open(SRC).convert("RGBA")
W, H = boat.width, boat.height + PAD
layer = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
d = ImageDraw.Draw(layer)
def E(cx, cy, rx, ry, fill, outline=None, w=0):
    cy += PAD
    d.ellipse([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], fill=fill, outline=outline, width=round(w * SS))
def A(cx, cy, rx, ry, start, end, fill, w):
    cy += PAD
    d.arc([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], start, end, fill=fill, width=round(w * SS))
def L(pts, fill, w):
    d.line([(x * SS, (y + PAD) * SS) for x, y in pts], fill=fill, width=round(w * SS), joint="curve")

SKIN = (248, 214, 190); SKIN_EDGE = (196, 146, 120); HAIR = (232, 232, 238); HAIR_EDGE = (160, 160, 172)
CARDIGAN = (214, 90, 154); FRAME = (70, 52, 70); CHEEK = (240, 150, 160); MOUTH = (150, 50, 60)
hx, hy, r = 480, 52, 27  # head centre and radius (source px)

# body: pink cardigan, arm reaching forward to the throttle
E(hx - 2, hy + 52, 34, 30, CARDIGAN, (160, 60, 110), 1.5)
L([(hx + 18, hy + 40), (hx + 34, hy + 34), (hx + 26, hy + 26)], CARDIGAN, 11)
E(hx + 26, hy + 25, 7, 7, SKIN, SKIN_EDGE, 1.2)
# curly grey hair behind the face, puffs around it and a bun on top
E(hx, hy - 3, r + 7, r + 5, HAIR, HAIR_EDGE, 1.5)
for ox, oy in ((-26, -8), (-20, -24), (-6, -32), (10, -31), (23, -22), (28, -6), (-29, 8), (29, 8)):
    E(hx + ox, hy + oy, 11, 11, HAIR, HAIR_EDGE, 1.2)
E(hx, hy - r - 14, 13, 12, HAIR, HAIR_EDGE, 1.5)
# face
E(hx, hy + 3, r - 3, r, SKIN, SKIN_EDGE, 1.5)
E(hx - 13, hy + 13, 6, 4.5, CHEEK); E(hx + 13, hy + 13, 6, 4.5, CHEEK)
# round glasses with happy closed eyes
for ex in (hx - 10, hx + 10):
    E(ex, hy + 1, 8, 8, (235, 244, 250), FRAME, 2.2)
    A(ex, hy + 3, 4.5, 3.5, 200, 340, FRAME, 1.8)
L([(hx - 2, hy + 1), (hx + 2, hy + 1)], FRAME, 2)
# nose and a big smile
A(hx, hy + 9, 3, 2.5, 20, 160, SKIN_EDGE, 1.5)
d.chord([(hx - 11) * SS, (hy + 10 + PAD) * SS, (hx + 11) * SS, (hy + 25 + PAD) * SS], 0, 180, fill=MOUTH)
d.chord([(hx - 8) * SS, (hy + 11 + PAD) * SS, (hx + 8) * SS, (hy + 16 + PAD) * SS], 0, 180, fill=(255, 255, 255))

granny = layer.resize((W, H), Image.LANCZOS)
canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
canvas.alpha_composite(granny)
canvas.alpha_composite(boat, (0, PAD))
out = canvas.rotate(TILT, resample=Image.BICUBIC, expand=True)  # counter-clockwise: bow up
out = out.crop(out.getbbox())
out.save(OUT, optimize=True)
print("size", out.size)
bg = Image.new("RGBA", out.size, (20, 40, 50, 255)); bg.alpha_composite(out)
bg.save(PREVIEW)
bg.crop((370, 0, 680, 160)).resize((930, 480), Image.LANCZOS).save(PREVIEW.replace(".png", "_zoom.png"))
