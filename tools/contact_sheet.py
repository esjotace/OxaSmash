"""Put several images side by side (scaled to the same height) for a quick visual comparison.

    python tools/contact_sheet.py out.png a.png b.png c.png --height 400
"""

import argparse

from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("images", nargs="+")
    ap.add_argument("--height", type=int, default=400)
    ap.add_argument("--nearest", action="store_true", help="pixel-art scaling (no smoothing)")
    a = ap.parse_args()
    tiles = []
    for p in a.images:
        im = Image.open(p).convert("RGBA")
        w = round(im.width * a.height / im.height)
        tiles.append(im.resize((w, a.height), Image.NEAREST if a.nearest else Image.LANCZOS))
    gap = 8
    sheet = Image.new("RGBA", (sum(t.width for t in tiles) + gap * (len(tiles) + 1), a.height + 24), (40, 44, 60, 255))
    x = gap
    draw = ImageDraw.Draw(sheet)
    for i, t in enumerate(tiles):
        sheet.alpha_composite(t, (x, 20))
        draw.text((x, 4), str(i), fill=(255, 255, 255, 255))
        x += t.width + gap
    sheet.save(a.out)


if __name__ == "__main__":
    main()
