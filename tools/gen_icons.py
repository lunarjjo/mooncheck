#!/usr/bin/env python3
"""mooncheck — generator ikon launcher (bulan sabit + centang) untuk semua density.
Legacy PNG (ic_launcher) + foreground adaptif (ic_launcher_fg)."""
from PIL import Image, ImageDraw
import os

RES = os.path.join(os.path.dirname(__file__), '..', 'android', 'res')

PRIMARY = (91, 87, 214, 255)      # #5B57D6
FG_INK = (255, 255, 255, 255)

def moon_check(size, fg=False, pad_ratio=0.16):
    """Gambar bulan sabit + centang. fg=True → kanvas transparan dgn safe-zone adaptif."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if not fg:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=PRIMARY)
        cx = cy = size / 2
        r = size * 0.34
    else:
        # safe zone adaptif: konten dalam lingkaran tengah 66%
        cx = cy = size / 2
        r = size * 0.33

    # bulan sabit: lingkaran besar − lingkaran offset
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=FG_INK)
    off = r * 0.62
    d.ellipse([cx - r + off, cy - r - off * 0.18, cx + r + off, cy + r - off * 0.18],
              fill=(0, 0, 0, 0) if fg else PRIMARY)
    # gambar ulang sabit bila kanvas transparan (ellipse tidak "menghapus")
    if fg:
        # gunakan mask komposit agar lekukan benar-benar transparan
        mask = Image.new('L', (size, size), 0)
        md = ImageDraw.Draw(mask)
        md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
        md.ellipse([cx - r + off, cy - r - off * 0.18, cx + r + off, cy + r - off * 0.18], fill=0)
        moon = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        moon.paste(FG_INK, (0, 0), mask)
        img = moon
        d = ImageDraw.Draw(img)

    # centang kecil di kanan-bawah bulan
    s = size * 0.16
    x1, y1 = cx + r * 0.18, cy + r * 0.25
    pts = [(x1, y1 + s * 0.5), (x1 + s * 0.35, y1 + s * 0.85), (x1 + s * 0.95, y1)]
    d.line(pts, fill=PRIMARY if not fg else PRIMARY, width=max(2, int(size * 0.045)))
    # tebalkan centang dengan garis kedua
    d.line([(pts[0][0], pts[0][1] + 1), (pts[1][0], pts[1][1] + 1), (pts[2][0], pts[2][1] + 1)],
           fill=PRIMARY if not fg else PRIMARY, width=max(2, int(size * 0.045)))
    return img

DENSITIES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}

for dpi, sz in DENSITIES.items():
    folder = os.path.join(RES, f'mipmap-{dpi}')
    os.makedirs(folder, exist_ok=True)
    moon_check(sz, fg=False).save(os.path.join(folder, 'ic_launcher.png'))
    # foreground adaptif 108dp → px per density = *4/3 dari ikon legacy
    fg_size = int(sz * 4 / 3)
    moon_check(fg_size, fg=True).save(os.path.join(folder, 'ic_launcher_fg.png'))
    print(f'{dpi}: ic_launcher {sz}px + fg {fg_size}px')

print('ikon selesai')
