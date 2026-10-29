"""Shrink pixel art by any factor (e.g. 0.7) and keep it looking like pixel art.

Plain nearest-neighbour shrinking drops whole rows and columns of pixels, so thin lines break and
the outline goes patchy. This instead:
  1. finds the sprite's outline (the colour most of its edge pixels share) and sets it aside;
  2. shrinks the inside: a new pixel is filled where the old pixels under it are at least
     `--keep` inside (low enough that thin shafts and blades stay unbroken), in the colour that
     covers most of it (only the sprite's own colours: no blends);
  3. draws a fresh, even 1-pixel outline round the result, in the original outline colour (round
     corners or square, whichever the original used). Art without a dark outline is shrunk as it
     is, with none added.

  python tools/pixel_shrink.py in.png out.png 0.7
  python tools/pixel_shrink.py in.png out.png 0.7 --keep 0.3 --preview compare.png
"""
import argparse
from collections import Counter

from PIL import Image


def opaque(px, x, y, w, h):
    return 0 <= x < w and 0 <= y < h and px[x, y][3] > 0


def find_outline(im):
    """The outline colour (the commonest colour on the sprite's edge) and which pixels are it."""
    w, h = im.size
    px = im.load()
    edge = Counter()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] and any(not opaque(px, x + dx, y + dy, w, h) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                edge[px[x, y][:3]] += 1
    if not edge:
        return None, set()
    color, count = edge.most_common(1)[0]
    # (No outline at all: the edge isn't mostly one dark colour, e.g. art drawn without one.)
    dark = (0.3 * color[0] + 0.59 * color[1] + 0.11 * color[2]) / 255 < 0.35
    if not dark or count < 0.4 * sum(edge.values()):
        return None, set()
    near = lambda c: sum(abs(c[i] - color[i]) for i in range(3)) <= 24
    outline = {(x, y) for y in range(h) for x in range(w) if px[x, y][3] and near(px[x, y][:3])}
    # Only the outline that wraps the sprite (outline-coloured pixels touching the outside, and the
    # ones joined to them), not dark details inside it.
    border = set()
    stack = [p for p in outline if any(not opaque(px, p[0] + dx, p[1] + dy, w, h) for dx in (-1, 0, 1) for dy in (-1, 0, 1))]
    while stack:
        p = stack.pop()
        if p in border:
            continue
        border.add(p)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                q = (p[0] + dx, p[1] + dy)
                if q in outline and q not in border and any(not opaque(px, q[0] + ex, q[1] + ey, w, h) for ex in (-1, 0, 1) for ey in (-1, 0, 1)):
                    stack.append(q)
    return color, border


def round_corners(im, border):
    """Does the original outline go round corners (8-connected) rather than squarely (4)?"""
    px = im.load()
    w, h = im.size
    diagonal_only = 0
    for x, y in border:
        inside = lambda a, b: opaque(px, a, b, w, h) and (a, b) not in border
        side = any(inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        corner = any(inside(x + dx, y + dy) for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)))
        diagonal_only += corner and not side
    return diagonal_only > 0.05 * max(1, len(border))


def shrink(im, k, keep=0.3):
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    color, border = find_outline(im)
    eight = color is not None and round_corners(im, border)
    tw, th = max(1, round(w * k)), max(1, round(h * k))
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    opx = out.load()
    sx, sy = w / tw, h / th
    inside = [[False] * th for _ in range(tw)]
    for ty in range(th):
        for tx in range(tw):
            # The old pixels under this new one, each weighted by how much of it is covered.
            x0, x1, y0, y1 = tx * sx, (tx + 1) * sx, ty * sy, (ty + 1) * sy
            votes = Counter()
            for y in range(int(y0), min(h, int(y1 + 0.999))):
                for x in range(int(x0), min(w, int(x1 + 0.999))):
                    a = (min(x + 1, x1) - max(x, x0)) * (min(y + 1, y1) - max(y, y0))
                    if a > 0 and px[x, y][3] and (x, y) not in border:
                        votes[px[x, y]] += a
            if sum(votes.values()) >= keep * sx * sy:
                opx[tx, ty] = votes.most_common(1)[0][0]
                inside[tx][ty] = True
    if color is None:
        return out.crop(out.getbbox())
    # A fresh 1-pixel outline round the shrunk inside.
    steps = [(1, 0), (-1, 0), (0, 1), (0, -1)] + ([(1, 1), (-1, 1), (1, -1), (-1, -1)] if eight else [])
    pad = Image.new("RGBA", (tw + 2, th + 2), (0, 0, 0, 0))
    pad.alpha_composite(out, (1, 1))
    ppx = pad.load()
    for y in range(th + 2):
        for x in range(tw + 2):
            if ppx[x, y][3]:
                continue
            if any(0 <= x - 1 + dx < tw and 0 <= y - 1 + dy < th and inside[x - 1 + dx][y - 1 + dy] for dx, dy in steps):
                ppx[x, y] = color + (255,)
    return pad.crop(pad.getbbox())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("factor", type=float)
    ap.add_argument("--keep", type=float, default=0.3, help="how much of a new pixel must be covered to fill it (0..1)")
    ap.add_argument("--preview", help="also save the original, a plain nearest shrink and this one side by side, 6x")
    args = ap.parse_args()
    src = Image.open(args.src).convert("RGBA")
    src = src.crop(src.getbbox())
    result = shrink(src, args.factor, args.keep)
    result.save(args.out)
    print(f"{args.out}: {src.size} -> {result.size}")
    if args.preview:
        plain = src.resize((round(src.width * args.factor), round(src.height * args.factor)), Image.NEAREST)
        tiles = [src, plain, result]
        s = 6
        sheet = Image.new("RGBA", (sum(t.width * s + 12 for t in tiles), max(t.height for t in tiles) * s), (60, 60, 70, 255))
        x = 0
        for t in tiles:
            sheet.alpha_composite(t.resize((t.width * s, t.height * s), Image.NEAREST), (x, 0))
            x += t.width * s + 12
        sheet.save(args.preview)


if __name__ == "__main__":
    main()
