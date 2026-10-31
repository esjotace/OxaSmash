"""Turn an AI-made "pixel art" sheet into real pixel art. AI images fake the look: they're painted at
high resolution with blurry block edges, blocks of a different size on each object, off-palette
colours and a haze of nearly transparent pixels around everything. Per object, this:
  1. cuts it out by its solid pixels (alpha > 160), which drops the haze;
  2. finds its own block size (one square size, from where colours change along x and y) and offset;
  3. rebuilds it at true size, one colour per block (the median of the block's middle), snapped to
     Resurrect 64 (the palette of the Ranitayas packs) unless --no-snap;
  4. keeps only its main body (the biggest connected piece) and drops pixels with under 2 neighbours.
Optionally: --scale 0.75 samples on a coarser grid (75% size, cleaner than shrinking the result), and
--colors 8 folds each object's rarest colours into its nearest kept one until only 8 are left.
Writes one PNG per object (named in reading order, or by --names), a 1x sheet and a 6x preview.

    python tools/clean_ai_pixels.py in.png out_dir --names pistol,smg,... [--cell 9 13] [--cell-size 48 20]
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

R64 = ('2e222f 3e3546 625565 966c6c ab947a 694f62 7f708a 9babb2 c7dcd0 ffffff 6e2727 b33831 ea4f36 f57d4a '
       'ae2334 e83b3b fb6b1d f79617 f9c22b 7a3045 9e4539 cd683d e6904e fbb954 4c3e24 676633 a2a947 d5e04b '
       'fbff86 165a4c 239063 1ebc73 91db69 cddf6c 313638 374e4a 547e64 92a984 b2ba90 0b5e65 0b8a8f 0eaf9b '
       '30e1b9 8ff8e2 323353 484a77 4d65b4 4d9be6 8fd3ff 45293f 6b3e75 905ea9 a884f3 eaaded 753c54 a24b6f '
       'cf657f ed8099 831c5d c32454 f04f78 f68181 fca790 fdcbb0').split()
PAL = np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)] for h in R64])
SOLID = 160  # alpha above this is part of the object; below is the AI's haze


def snap(rgb):
    d = ((rgb[:, None, :] - PAL[None]) ** 2 * np.array([3, 4, 2])).sum(-1)  # rough perceptual weights
    return PAL[d.argmin(1)]


def blobs(src):
    """Bounding boxes of the objects: solid pixels, closed (grown then shrunk), flood-filled on a 4 px grid."""
    m = Image.fromarray(((src[..., 3] > SOLID) * 255).astype(np.uint8))
    m = m.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
    m = np.asarray(m.resize((src.shape[1] // 4, src.shape[0] // 4), Image.BOX)) > 0
    boxes = [(min(y for y, _ in p) * 4, min(x for _, x in p) * 4, max(y for y, _ in p) * 4 + 4, max(x for _, x in p) * 4 + 4)
             for p in pieces(m, 4) if len(p) > 150]
    rows = sorted(boxes, key=lambda b: b[0])
    # Reading order: a new row starts when a box's top is below the previous row's middle.
    out, row, mid = [], [], -1
    for b in rows:
        if row and b[0] > mid:
            out += sorted(row, key=lambda b: b[1]); row = []
        row.append(b); mid = max(mid, (b[0] + b[2]) / 2) if len(row) > 1 else (b[0] + b[2]) / 2
    return out + sorted(row, key=lambda b: b[1])


def pieces(op, conn):
    """Connected pieces of a boolean mask (4- or 8-connected), as lists of (y, x)."""
    steps = [(1, 0), (-1, 0), (0, 1), (0, -1)] + ([(1, 1), (1, -1), (-1, 1), (-1, -1)] if conn == 8 else [])
    H, W = op.shape; seen = np.zeros_like(op)
    for sy, sx in zip(*np.nonzero(op)):
        if seen[sy, sx]: continue
        stack, pts = [(sy, sx)], []; seen[sy, sx] = True
        while stack:
            y, x = stack.pop(); pts.append((y, x))
            for dy, dx in steps:
                v, u = y + dy, x + dx
                if 0 <= v < H and 0 <= u < W and op[v, u] and not seen[v, u]:
                    seen[v, u] = True; stack.append((v, u))
        yield pts


def grid(op, rgb, lo, hi):
    """One square block size for the object (from x and y colour edges together), and its offset on each axis."""
    cs = []
    for ax in (1, 0):
        diff = np.abs(np.diff(rgb, axis=ax)).sum(-1) > 50
        both = op[:, 1:] & op[:, :-1] if ax == 1 else op[1:] & op[:-1]
        cs.append((diff & both).sum(axis=0 if ax == 1 else 1).astype(float))
    f = lambda c, P: (c * np.exp(2j * np.pi * (np.arange(len(c)) + 1) / P)).sum()
    P = max(np.arange(lo, hi, 0.02), key=lambda P: abs(f(cs[0], P)) / cs[0].sum() + abs(f(cs[1], P)) / cs[1].sum())
    return P, [(np.angle(f(c, P)) / (2 * np.pi) * P) % P for c in cs]


def tidy(g):
    """Keep the main body (the biggest 8-connected piece) and drop pixels with under 2 neighbours."""
    op = g[..., 3] > 0
    keep = np.zeros_like(op)
    for y, x in max(pieces(op, 8), key=len): keep[y, x] = True
    pad = np.pad(keep, 1)
    nb = sum(np.roll(np.roll(pad, dy, 0), dx, 1) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)))[1:-1, 1:-1]
    keep &= nb >= 2
    g = g.copy(); g[~keep] = 0
    return g


def fewer_colors(g, k):
    """Merge the two most alike colours (into the more common one) until only k are left. Alike, not
    rare: a small accent (a gem's highlight, a gold band) is rare but distinct, and should survive."""
    op = g[..., 3] > 0
    px = [tuple(int(v) for v in c) for c in g[op][:, :3]]
    count = {c: px.count(c) for c in set(px)}
    to = {c: c for c in count}
    dist = lambda c, d: sum((x - y) ** 2 * w for x, y, w in zip(c, d, (3, 4, 2)))
    while len(count) > k:
        cs = list(count)
        a, b = min(((c, d) for i, c in enumerate(cs) for d in cs[i + 1:]), key=lambda p: dist(*p))
        keep, gone = (a, b) if count[a] >= count[b] else (b, a)
        count[keep] += count.pop(gone)
        for c in to:
            if to[c] == gone: to[c] = keep
    g = g.copy()
    for y, x in zip(*np.nonzero(op)): g[y, x, :3] = to[tuple(int(v) for v in g[y, x, :3])]
    return g


def clean(crop, lo, hi, palette=True, scale=1, colors=0):
    a = crop.astype(float); op = a[..., 3] > SOLID
    P, (ox, oy) = grid(op, a[..., :3], lo, hi)
    P /= scale
    xs, ys = np.arange(ox - P, crop.shape[1], P), np.arange(oy - P, crop.shape[0], P)
    out = np.zeros((len(ys) - 1, len(xs) - 1, 4), np.uint8)
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            # The block's middle half: its edges are where the AI blurred neighbouring blocks together.
            x0, x1 = max(int(round(xs[i] + P / 4)), 0), int(round(xs[i + 1] - P / 4))
            y0, y1 = max(int(round(ys[j] + P / 4)), 0), int(round(ys[j + 1] - P / 4))
            cell = a[y0:y1, x0:x1].reshape(-1, 4)
            if len(cell) == 0 or (cell[:, 3] > SOLID).mean() < 0.5: continue
            c = np.median(cell[cell[:, 3] > SOLID][:, :3], 0)[None]
            out[j, i, :3] = snap(c)[0] if palette else c[0]; out[j, i, 3] = 255
    out = tidy(out)
    if colors: out = fewer_colors(out, colors)
    ys_, xs_ = np.nonzero(out[..., 3])
    return out[ys_.min():ys_.max() + 1, xs_.min():xs_.max() + 1], P


def sheet(images, cw, ch, cols, Z=1, bg=(0, 0, 0, 0)):
    rows = (len(images) + cols - 1) // cols
    s = Image.new('RGBA', (cols * cw * Z, rows * ch * Z), bg)
    for k, im in enumerate(images):
        im = im.resize((im.width * Z, im.height * Z), Image.NEAREST)
        x, y = (k % cols) * cw * Z, (k // cols) * ch * Z
        s.alpha_composite(im, (x + (cw * Z - im.width) // 2 // Z * Z, y + (ch * Z - im.height) // 2 // Z * Z))
    return s


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--names', help='comma-separated, in reading order (default: 01, 02, ...)')
    ap.add_argument('--cell', type=float, nargs=2, default=(9, 13), help='range of the AI block size to search, in px')
    ap.add_argument('--cell-size', type=int, nargs=2, default=(48, 20), help='sheet cell (w h) at 1x')
    ap.add_argument('--cols', type=int, default=4)
    ap.add_argument('--scale', type=float, default=1, help='final size relative to the AI drawing (e.g. 0.75)')
    ap.add_argument('--colors', type=int, default=0, help='at most this many colours per object (0: no limit)')
    ap.add_argument('--no-snap', action='store_true', help="keep the AI's colours instead of Resurrect 64")
    a = ap.parse_args()
    src = np.asarray(Image.open(a.src).convert('RGBA'))
    boxes = blobs(src)
    names = a.names.split(',') if a.names else [f'{k + 1:02}' for k in range(len(boxes))]
    if len(names) != len(boxes):
        raise SystemExit(f'found {len(boxes)} objects but got {len(names)} names')
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    ims = []
    for name, (y0, x0, y1, x1) in zip(names, boxes):
        g, P = clean(src[max(y0 - 4, 0):y1 + 4, max(x0 - 4, 0):x1 + 4], *a.cell, palette=not a.no_snap, scale=a.scale, colors=a.colors)
        im = Image.fromarray(g); im.save(out / f'{name}.png'); ims.append(im)
        print(f'{name}: block {P:.2f} px -> {im.width}x{im.height}')
    cw, ch = a.cell_size
    sheet(ims, cw, ch, a.cols).save(out / 'sheet-1x.png')
    sheet(ims, cw, ch, a.cols, 6, (150, 160, 175, 255)).save(out / 'sheet-6x.png')
