# Flat schematic of the Vejde pilothouse motor boat (bow left), from
# inbox/vejde.jpg. Design grid 1200 x 560 (photo coords * 0.822); the result is
# tilted bow-up to read as planing at speed. The white topsides end at y 481
# (the waterline at rest); below it is the rounded dark blue underbody.
import sys
from PIL import Image, ImageOps
from drawlib import Canvas

TILT = 6  # degrees, bow up
c = Canvas(1200, 560)
WHITE = (246, 247, 248); EDGE = (143, 163, 173); SHADE = (214, 220, 224); BLACK = (28, 30, 34)
GLASS = (40, 56, 74); CHROME = (190, 198, 204); YELLOW = (240, 196, 60)
BOTTOM = (18, 36, 110)  # dark blue antifouling

# underbody: a quarter-ellipse rounding down and aft from the forefoot, then a
# flat run aft to the transom
import math
DEPTH = 66
ROUND = 190  # length of the rounded forefoot
under = []
for i in range(0, 25):
    a = math.radians(90 * i / 24)
    under.append((144 + ROUND - ROUND * math.cos(a), 481 + DEPTH * math.sin(a)))
under += [(1077, 481 + DEPTH), (1077, 481)]
c.poly(under, BOTTOM, (10, 22, 70), 1.5)

# hull: raked stem, flat sheer falling slightly aft, plumb transom
hull = [(12, 341), (1077, 366), (1077, 481), (144, 481)]
c.poly(hull, WHITE, EDGE, 2)
# strake lines converging towards the stem
for y_aft, y_bow in ((392, 372), (420, 405), (450, 440)):
    t = (y_bow - 341) / (481 - 341)  # where the line meets the stem
    c.line([(12 + 132 * t, y_bow), (1077, y_aft)], SHADE, 2)
# black rubbing strake along the sheer
c.poly([(12, 341), (1077, 366), (1077, 375), (16, 350)], BLACK)
# swim platform and boarding ladder at the stern
c.rect(1073, 462, 1188, 473, (232, 236, 238), EDGE, 1.5, r=3)
c.line([(1160, 420), (1166, 486)], CHROME, 3); c.line([(1190, 420), (1194, 486)], CHROME, 3)
for y in (434, 448, 462):
    c.line([(1162, y), (1192, y)], CHROME, 2)

# bow pulpit and foredeck guard rail
c.line([(25, 340), (6, 268), (49, 263), (123, 316), (600, 334)], CHROME, 4)
for x in (180, 300, 420, 540):
    y = 316 + (x - 123) * 0.036
    c.line([(x, y), (x, 341 + x * 0.0235)], CHROME, 2.5)

# aft deckhouse and cockpit side behind the cabin
c.poly([(880, 300), (1060, 300), (1077, 366), (880, 362)], WHITE, EDGE)
c.rect(886, 318, 1040, 336, GLASS, r=4)
# pilothouse: windscreen and back wall both raked forward (top ahead of the
# bottom, same slope), roof overhang, big side windows
RAKE = 48 / 148  # windscreen: 48 forward over 148 up
c.poly([(608, 362), (560, 214), (877, 214), (905, 300), (880, 300), (880, 362)], WHITE, EDGE, 2)
c.poly([(578, 232), (633, 232), (633, 304), (601, 304)], GLASS)
c.poly([(645, 230), (743, 230), (743, 298), (645, 298)], GLASS)

# smiling bearded captain in a blue Vega cap at the helm, seen through the
# middle window: drawn on its own layer, clipped to the window, then tinted
# by the glass. Slightly oversized so he reads at game size.
from PIL import ImageDraw
cap = Canvas(1200, 560)
SKIN = (246, 210, 184); SKIN_EDGE = (190, 140, 115); BEARD = (184, 142, 84); BEARD_EDGE = (128, 92, 50)  # brown-blond
NAVY = (26, 38, 78); PEAK = (18, 20, 28); SWEATER = (30, 52, 104); FRAME_INK = (60, 45, 45)
hx, hy = 694, 268
cap.ell(hx, hy + 40, 40, 20, SWEATER)                       # shoulders
cap.ell(hx - 20, hy, 5, 7, SKIN, SKIN_EDGE, 1.2); cap.ell(hx + 20, hy, 5, 7, SKIN, SKIN_EDGE, 1.2)  # ears
cap.ell(hx, hy, 20, 22, SKIN, SKIN_EDGE, 1.5)               # face
cap.poly([(hx - 20, hy + 4), (hx - 12, hy + 9), (hx + 12, hy + 9), (hx + 20, hy + 4), (hx + 17, hy + 20),
          (hx + 6, hy + 30), (hx - 6, hy + 30), (hx - 17, hy + 20)], BEARD, BEARD_EDGE, 1.2)  # full beard
cap.ell(hx, hy + 9, 9, 3.5, BEARD, BEARD_EDGE, 1)          # moustache
cap.d.chord(cap.P([(hx - 7, hy + 9), (hx + 7, hy + 19)])[0] + cap.P([(hx + 7, hy + 19)])[0], 0, 180, fill=(150, 50, 60))  # smile
cap.ell(hx - 11, hy + 3, 4, 3, (240, 150, 150)); cap.ell(hx + 11, hy + 3, 4, 3, (240, 150, 150))  # cheeks
cap.ell(hx, hy + 2, 3.2, 3.6, (235, 175, 150), SKIN_EDGE, 1)  # nose
for ex in (hx - 8, hx + 8):                                # happy closed eyes
    cap.d.arc(cap.P([(ex - 4, hy - 6), (ex + 4, hy)])[0] + cap.P([(ex + 4, hy)])[0], 200, 340, fill=FRAME_INK, width=cap.W(2))
cap.ell(hx - 8, hy - 8, 4, 1.3, BEARD_EDGE); cap.ell(hx + 8, hy - 8, 4, 1.3, BEARD_EDGE)  # eyebrows
# Vega cap: high round navy crown, short black peak above the eyebrows
cap.poly([(hx - 22, hy - 15), (hx - 24, hy - 30), (hx - 16, hy - 38), (hx + 16, hy - 38),
          (hx + 24, hy - 30), (hx + 22, hy - 15)], NAVY, (12, 18, 40), 1.5)
cap.rect(hx - 22, hy - 19, hx + 22, hy - 14, (40, 54, 100))  # band
cap.ell(hx, hy - 13, 22, 3.5, PEAK)                          # peak
mask = Image.new("L", cap.img.size, 0)
ImageDraw.Draw(mask).polygon(cap.P([(645, 230), (743, 230), (743, 298), (645, 298)]), fill=255)
clipped = Image.new("RGBA", cap.img.size, (0, 0, 0, 0))
clipped.paste(cap.img, (0, 0), Image.composite(cap.img.getchannel("A"), mask, mask))
c.img.alpha_composite(clipped)
# glass: a light tint and a diagonal reflection over him
tint = Canvas(1200, 560)
tint.poly([(645, 230), (743, 230), (743, 298), (645, 298)], (40, 56, 74, 60))
tint.poly([(700, 230), (722, 230), (690, 298), (668, 298)], (255, 255, 255, 40))
c.img.alpha_composite(tint.img)
c.poly([(753, 230), (866, 230), (866 + 68 * RAKE, 298), (753, 298)], GLASS)
c.rect(548, 204, 888, 218, WHITE, EDGE, 1.5, r=6)  # roof with overhang
# aft rail with a yellow lifebuoy seen edge-on
c.line([(884, 234), (1058, 230)], CHROME, 3)
for x in (900, 980, 1056):
    c.line([(x, 233), (x, 302)], CHROME, 2.5)
c.ell(1030, 262, 14, 28, YELLOW, (170, 130, 30), 1.5)
c.ell(1030, 262, 6, 18, (200, 160, 50))
# radar dome on its pedestal, whip antenna, small aerial at the front
c.poly([(797, 204), (871, 204), (860, 168), (808, 168)], WHITE, EDGE)
c.rect(785, 140, 857, 170, WHITE, EDGE, 1.5, r=12)
c.line([(848, 168), (848, 20)], (200, 206, 210), 3)
c.line([(621, 204), (621, 178)], BLACK, 3)

img = c.img.rotate(-TILT, resample=Image.BICUBIC, expand=True)
scale = 600 / img.width
out = img.resize((600, round(img.height * scale)), Image.LANCZOS)
box = out.getbbox()
out = out.crop(box)

# Map design points through the same rotate/scale/crop, for hitbox and stern.
import math
def map_pt(x, y):
    s = c.ss; W, H = 1200 * s, 560 * s
    cx, cy = W / 2, H / 2
    a = math.radians(TILT)  # clockwise on screen
    dx, dy = x * s - cx, y * s - cy
    rx, ry = dx * math.cos(a) - dy * math.sin(a), dx * math.sin(a) + dy * math.cos(a)
    return ((rx + img.width / 2) * scale - box[0], (ry + img.height / 2) * scale - box[1])

# Cut off what is under water: a level waterline (the boat is tilted) just
# below the lowest corner of the swim platform, which stays whole.
cut = math.ceil(map_pt(1188, 474)[1]) + 1
out = out.crop((0, 0, out.width, cut))
out = out.crop(out.getbbox())
# Drawn bow-left like the photo; the game uses it as a right-facing player
# boat, so save it mirrored (still bow-up).
ImageOps.mirror(out).save(sys.argv[1], optimize=True)

for name, p in (("bow top", (12, 341)), ("forefoot", (144, 481)), ("stern top", (1077, 366)),
                ("stern waterline", (1077, 481)), ("platform low corner", (1188, 474))):
    print(name, [round(v) for v in map_pt(*p)])
print("size", out.size, "cut at", cut)
bg = Image.new("RGBA", out.size, (20, 40, 50, 255)); bg.alpha_composite(out)
bg.resize((out.width * 2, out.height * 2), Image.LANCZOS).save(sys.argv[2])
