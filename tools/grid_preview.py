"""Enlarge a tileset and draw a tile grid with column/row numbers, to find the exact tiles to cut.

    python tools/grid_preview.py Tiles.png out.png --tile 16 --scale 3
"""

import argparse

from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--tile", type=int, default=16)
    ap.add_argument("--scale", type=int, default=3)
    ap.add_argument("--crop", default=None, help="x,y,w,h in tiles, to zoom on part of the sheet")
    a = ap.parse_args()
    im = Image.open(a.src).convert("RGBA")
    t, s = a.tile, a.scale
    ox = oy = 0
    if a.crop:
        cx, cy, cw, ch = (int(v) for v in a.crop.split(","))
        ox, oy = cx, cy
        im = im.crop((cx * t, cy * t, (cx + cw) * t, (cy + ch) * t))
    big = Image.new("RGBA", (im.width * s + 24, im.height * s + 14), (40, 44, 60, 255))
    big.alpha_composite(im.resize((im.width * s, im.height * s), Image.NEAREST), (24, 14))
    d = ImageDraw.Draw(big)
    for c in range(im.width // t + 1):
        x = 24 + c * t * s
        d.line([(x, 14), (x, big.height)], fill=(255, 0, 255, 110))
        if c < im.width // t:
            d.text((x + 2, 1), str(ox + c), fill=(255, 255, 0, 255))
    for r in range(im.height // t + 1):
        y = 14 + r * t * s
        d.line([(24, y), (big.width, y)], fill=(255, 0, 255, 110))
        if r < im.height // t:
            d.text((2, y + 2), str(oy + r), fill=(255, 255, 0, 255))
    big.save(a.out)
    print(big.size)


if __name__ == "__main__":
    main()
