# Flat schematic side view of the Suomenlinna II passenger ferry (double-ended),
# drawn on a 1200 x 450 design grid, downscaled to 600 px wide.
import sys
from PIL import Image
from drawlib import Canvas

c = Canvas(1200, 450)
WHITE = (244, 246, 247); EDGE = (143, 163, 173); HULL = (29, 35, 43); GLASS = (31, 45, 68)
GREY = (205, 211, 215); DARK = (60, 66, 74); BLUE = (59, 120, 194); ORANGE = (224, 88, 42)
RAIL = (170, 180, 188)

# hull: black lower band with fender strake, rounded double ends
c.poly([(28, 392), (1172, 392), (1186, 404), (1170, 432), (1120, 446), (80, 446), (30, 432), (14, 404)], HULL)
c.rect(18, 386, 1182, 398, (45, 52, 62), r=5)
# main deck sides, window rows, end cabin windows
c.rect(22, 298, 1178, 392, WHITE, EDGE, r=18)
for x in (110, 182, 254, 326, 812, 884, 956, 1028):
    c.rect(x, 318, x + 62, 354, GLASS, r=3)
c.rect(40, 318, 86, 350, GLASS, r=8); c.rect(1114, 318, 1160, 350, GLASS, r=8)
# centre vehicle bay: dark opening above grey doors
c.rect(470, 304, 730, 346, (43, 52, 64))
c.rect(470, 346, 598, 392, GREY, EDGE); c.rect(602, 346, 730, 392, GREY, EDGE)
c.line([(470, 304), (470, 392)], EDGE, 2); c.line([(730, 304), (730, 392)], EDGE, 2)
# open upper deck: blue benches, handrails, bulwark with railing panels
c.rect(60, 256, 440, 268, BLUE, r=3); c.rect(760, 256, 1140, 268, BLUE, r=3)
c.line([(30, 250), (440, 250)], RAIL, 2.5); c.line([(760, 250), (1170, 250)], RAIL, 2.5)
for x in (30, 1170):
    c.line([(x, 250), (x, 268)], RAIL, 2.5)
c.rect(24, 266, 1176, 300, WHITE, EDGE, r=10)
for x0, x1 in ((48, 130), (150, 300), (320, 440), (760, 880), (900, 1050), (1070, 1152)):
    c.rect(x0, 274, x1, 292, (214, 220, 224), EDGE, 1)
    for x in range(x0 + 10, x1, 10):
        c.line([(x, 274), (x, 292)], RAIL, 1)
# life-raft canisters beside the deckhouse, big lifebuoy on the right bulwark
for x in (452, 708):
    c.rect(x - 26, 252, x + 26, 272, (232, 236, 238), EDGE, 1.5, r=9)
c.ell(1010, 283, 16, 16, ORANGE, (150, 55, 25), 1.5)
c.ell(1010, 283, 8, 8, WHITE)
for a, b in (((994, 283), (1001, 283)), ((1019, 283), (1026, 283)), ((1010, 267), (1010, 274)), ((1010, 292), (1010, 299))):
    c.line([a, b], WHITE, 3)  # white bands on the ring
# crane and rescue boat in the middle of the foredeck
bx = 230
c.poly([(bx - 80, 262), (bx - 62, 262), (bx - 58, 232), (bx - 84, 232)], WHITE, EDGE)
c.line([(bx - 70, 236), (bx + 25, 182)], WHITE, 7); c.line([(bx - 70, 236), (bx + 25, 182)], EDGE, 1.5)
c.line([(bx + 20, 186), (bx + 20, 226)], DARK, 1.5)
c.poly([(bx - 50, 230), (bx + 88, 230), (bx + 78, 252), (bx - 34, 252)], ORANGE, (150, 55, 25))
c.rect(bx + 50, 218, bx + 72, 232, ORANGE, (150, 55, 25), 1)
# central deckhouse with big windows and a dark sun-deck roof
c.rect(462, 214, 738, 300, WHITE, EDGE, r=6)
for x in (482, 552, 622):
    c.rect(x, 228, x + 60, 264, GLASS, r=3)
c.rect(692, 228, 722, 264, GLASS, r=3)
c.rect(540, 272, 660, 282, (226, 230, 233), EDGE, 1)
c.rect(420, 200, 780, 214, (88, 94, 102), EDGE, 1.5, r=7)
# twin exhaust pipes
for x in (690, 703):
    c.rect(x, 132, x + 10, 202, (176, 182, 187), (120, 126, 132), 1, r=3)
# bridge tower, wraparound windows, white cap with rail
c.poly([(560, 200), (640, 200), (662, 128), (538, 128)], WHITE, EDGE)
c.poly([(546, 144), (654, 144), (648, 174), (552, 174)], GLASS)
for x in (575, 600, 625):
    c.line([(x, 144), (x + (x - 600) * 0.06, 174)], WHITE, 2)
c.rect(530, 116, 670, 130, WHITE, EDGE, r=4)
c.line([(536, 104), (664, 104)], RAIL, 2)
for x in (536, 570, 630, 664):
    c.line([(x, 104), (x, 116)], RAIL, 2)
# mast, radar, light, Finnish flag
c.line([(600, 116), (600, 30)], (150, 158, 165), 4)
c.line([(588, 70), (612, 70)], (150, 158, 165), 3)
c.rect(578, 84, 622, 90, (120, 126, 132))
c.ell(600, 28, 4, 4, (240, 240, 240))
c.rect(604, 40, 632, 58, (250, 250, 250), EDGE, 1)
c.rect(612, 40, 618, 58, (0, 53, 128)); c.rect(604, 47, 632, 51, (0, 53, 128))

out = c.img.resize((600, 225), Image.LANCZOS)
out = out.crop(out.getbbox())
out.save(sys.argv[1], optimize=True)
bg = Image.new("RGBA", out.size, (20, 40, 50, 255)); bg.alpha_composite(out)
bg.resize((out.width * 2, out.height * 2), Image.LANCZOS).save(sys.argv[2])
print(out.size)
