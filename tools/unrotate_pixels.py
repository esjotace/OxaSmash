"""Recover small pixel art from an image where it was scaled up and rotated (each art pixel is a
tilted block of screen pixels, possibly several objects in one image).

For each object (a connected blob of opaque pixels) it finds the tilt that best lines the block
edges up with the axes, straightens it, finds the block size and offset, and samples one colour
per block. Output: one PNG per object, named <prefix><n>.png, numbered left-to-right, top-to-bottom.

  python tools/unrotate_pixels.py "Random Weapons.png" out/dir/ --prefix rw --block 11
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image


def components(alpha, min_size=400, reach=2):
    h, w = alpha.shape
    seen = np.zeros_like(alpha, dtype=bool)
    out = []
    for y0 in range(h):
        for x0 in range(w):
            if not alpha[y0, x0] or seen[y0, x0]:
                continue
            stack = [(y0, x0)]
            seen[y0, x0] = True
            pts = []
            while stack:
                y, x = stack.pop()
                pts.append((y, x))
                for dy in range(-reach, reach + 1):
                    for dx in range(-reach, reach + 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and alpha[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            if len(pts) >= min_size:
                ys, xs = zip(*pts)
                out.append((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
    return out


def edge_score(img):
    """How crisply colour edges line up with the axes: peaky projections of the gradients."""
    a = np.asarray(img.convert("RGBA"), dtype=float)
    gx = np.abs(np.diff(a, axis=1)).sum(axis=2)
    gy = np.abs(np.diff(a, axis=0)).sum(axis=2)
    px = gx.sum(axis=0)
    py = gy.sum(axis=1)
    return (px ** 2).sum() / (px.sum() ** 2 + 1) * len(px) + (py ** 2).sum() / (py.sum() ** 2 + 1) * len(py)


def best_angle(crop):
    a = np.asarray(crop)[:, :, 3] > 128
    ys, xs = np.nonzero(a)
    cov = np.cov(np.vstack([xs, ys]))
    vals, vecs = np.linalg.eigh(cov)
    v = vecs[:, np.argmax(vals)]
    base = np.degrees(np.arctan2(v[1], v[0]))
    base = (base + 90) % 180 - 90
    best = None
    for step in (1.0, 0.2, 0.05):
        lo = base - (6 if step == 1.0 else step * 5)
        cands = np.arange(lo, lo + (12 if step == 1.0 else step * 10) + 1e-9, step)
        scored = [(edge_score(crop.rotate(c, resample=Image.BICUBIC, expand=True)), c) for c in cands]
        best = max(scored)
        base = best[1]
    return base


def grid(proj, sizes=None):
    """Block size and offset from a 1-D edge-strength projection."""
    # Edges should fall on block boundaries and not halfway between them.
    best = None
    for size in sizes if sizes is not None else np.arange(5.0, 16.0, 0.05):
        for off in np.arange(0, size, 0.5):
            idx = np.arange(off, len(proj) - 1, size).astype(int)
            mid = np.clip((idx + size / 2).astype(int), 0, len(proj) - 1)
            score = proj[idx].mean() - proj[mid].mean() if len(idx) > 2 else -1e9
            if best is None or score > best[0]:
                best = (score, size, off)
    return best[1], best[2]


def sample(img, size_x, off_x, size_y, off_y):
    a = np.asarray(img.convert("RGBA"))
    h, w = a.shape[:2]
    cols = int((w - off_x) / size_x)
    rows = int((h - off_y) / size_y)
    out = np.zeros((rows, cols, 4), dtype=np.uint8)
    for r in range(rows):
        for c in range(cols):
            x0 = int(off_x + c * size_x + size_x * 0.3)
            x1 = int(off_x + (c + 1) * size_x - size_x * 0.3)
            y0 = int(off_y + r * size_y + size_y * 0.3)
            y1 = int(off_y + (r + 1) * size_y - size_y * 0.3)
            block = a[y0:max(y1, y0 + 1), x0:max(x1, x0 + 1)].reshape(-1, 4)
            if block[:, 3].mean() < 128:
                continue
            opaque = block[block[:, 3] > 128]
            # The most common colour in the block's middle.
            vals, counts = np.unique(opaque[:, :3] // 8, axis=0, return_counts=True)
            pick = vals[np.argmax(counts)]
            match = opaque[(opaque[:, :3] // 8 == pick).all(axis=1)]
            out[r, c, :3] = match[:, :3].mean(axis=0)
            out[r, c, 3] = 255
    # Keep only the object itself (the biggest blob), dropping specks of noise or of a neighbour.
    blobs = components(out[:, :, 3] > 0, min_size=0, reach=1)
    size = lambda b: (out[b[1]:b[3], b[0]:b[2], 3] > 0).sum()
    keep = max(blobs, key=size)
    for (x0, y0, x1, y1) in blobs:
        if (x0, y0, x1, y1) != keep and size((x0, y0, x1, y1)) < size(keep) * 0.1:
            out[y0:y1, x0:x1] = 0
    im = Image.fromarray(out)
    return im.crop(im.getbbox())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--prefix", default="obj")
    ap.add_argument("--block", type=float, help="the block size, if known (searched around it)")
    args = ap.parse_args()
    im = Image.open(args.src).convert("RGBA")
    alpha = np.asarray(im)[:, :, 3] > 128
    boxes = components(alpha)
    boxes.sort(key=lambda b: (round(b[1] / 120), b[0]))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for n, (x0, y0, x1, y1) in enumerate(boxes):
        crop = im.crop((x0 - 4, y0 - 4, x1 + 4, y1 + 4))
        ang = best_angle(crop)
        straight = crop.rotate(ang, resample=Image.BICUBIC, expand=True)
        straight = straight.crop(straight.getbbox())
        a = np.asarray(straight, dtype=float)
        gx = np.abs(np.diff(a, axis=1)).sum(axis=2).sum(axis=0)
        gy = np.abs(np.diff(a, axis=0)).sum(axis=2).sum(axis=1)
        sizes = np.arange(args.block - 0.6, args.block + 0.61, 0.05) if args.block else None
        sx, ox = grid(gx, sizes)
        sy, oy = grid(gy, sizes)
        s = (sx + sy) / 2
        art = sample(straight, s, ox + 1, s, oy + 1)
        path = out / f"{args.prefix}{n}.png"
        art.save(path)
        print(f"{path.name}: at ({x0},{y0}) tilt {ang:.2f} deg, block {sx:.2f}x{sy:.2f}, -> {art.size}")


if __name__ == "__main__":
    main()
