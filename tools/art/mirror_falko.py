# Left-facing Falkö for use as an obstacle, from the hand-cut
# inbox/falko-cut.png (hull already cut at the waterline, keeping a band of
# the blue bottom): paints out the "FALKÖ" name on the bow (it would read
# mirrored), then mirrors the image.
import sys
from PIL import Image, ImageDraw, ImageOps

im = Image.open(sys.argv[1]).convert("RGBA")
ImageDraw.Draw(im).rectangle([1158, 263, 1220, 286], fill=(233, 182, 62, 255))
ImageOps.mirror(im).save(sys.argv[2], optimize=True)
