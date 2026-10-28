from PIL import Image, ImageDraw

class Canvas:
    """Flat schematic drawing on a design grid, supersampled for smooth edges."""
    def __init__(self, w, h, ss=4):
        self.w, self.h, self.ss = w, h, ss
        self.img = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)
    def P(self, pts): return [(x * self.ss, y * self.ss) for x, y in pts]
    def W(self, w): return max(1, round(w * self.ss))
    def poly(self, pts, fill, outline=None, w=1.5): self.d.polygon(self.P(pts), fill=fill, outline=outline, width=self.W(w))
    def rect(self, x0, y0, x1, y1, fill, outline=None, w=1.5, r=0):
        box = [x0 * self.ss, y0 * self.ss, x1 * self.ss, y1 * self.ss]
        if r: self.d.rounded_rectangle(box, r * self.ss, fill=fill, outline=outline, width=self.W(w))
        else: self.d.rectangle(box, fill=fill, outline=outline, width=self.W(w))
    def line(self, pts, fill, w=2): self.d.line(self.P(pts), fill=fill, width=self.W(w), joint="curve")
    def ell(self, cx, cy, rx, ry, fill, outline=None, w=1.5):
        s = self.ss; self.d.ellipse([(cx - rx) * s, (cy - ry) * s, (cx + rx) * s, (cy + ry) * s], fill=fill, outline=outline, width=self.W(w))
