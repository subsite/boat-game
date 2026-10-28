# Left-facing Falkö for use as an obstacle: paints out the "FALKÖ" name on the
# bow (it would read mirrored), cuts the hull off at the waterline just above
# the propeller recess and rudder (so they stay unseen under water), then
# mirrors the image.
import sys
from PIL import Image, ImageDraw, ImageOps

im = Image.open(sys.argv[1]).convert("RGBA")
ImageDraw.Draw(im).rectangle([1158, 263, 1220, 286], fill=(233, 182, 62, 255))
WATERLINE = 376
im = im.crop((0, 0, im.width, WATERLINE))
ImageOps.mirror(im).save(sys.argv[2], optimize=True)
