"""Make "lit windows" overlays for building kit pieces.

Finds window panes (connected areas of dark, grey, low-saturation pixels), lights a random share
of them in warm yellow or teal, and saves the result as a transparent overlay per variant:
<piece>_lights<N>.png. The game draws these on top of the night-tinted piece, untinted, so they glow.

    python tools/window_lights.py ../workshop/art-source/kits/apartment col_a col_b --variants 2 --share 0.3
"""

import argparse
import random
from collections import deque
from pathlib import Path

from PIL import Image

# (body, top highlight) for each light color.
WARM = ((201, 146, 58, 255), (240, 196, 102, 255))
TEAL = ((62, 150, 170, 255), (120, 210, 222, 255))


def is_glass(c):
    r, g, b, a = c
    # Mid-dark neutral grey. The darkest pixels are mortar and outlines, which would join panes up.
    return a > 0 and 50 <= min(r, g, b) and max(r, g, b) < 120 and max(r, g, b) - min(r, g, b) < 16


def panes(im):
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    out = []
    for y in range(h):
        for x in range(w):
            if seen[y * w + x] or not is_glass(px[x, y]):
                continue
            q = deque([(x, y)])
            seen[y * w + x] = 1
            area = []
            while q:
                cx, cy = q.popleft()
                area.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_glass(px[nx, ny]):
                        seen[ny * w + nx] = 1
                        q.append((nx, ny))
            if 12 <= len(area) <= 900:  # window-pane sized, not specks or whole walls
                out.append(area)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kit")
    ap.add_argument("pieces", nargs="+")
    ap.add_argument("--variants", type=int, default=2)
    ap.add_argument("--share", type=float, default=0.3)
    a = ap.parse_args()
    for name in a.pieces:
        im = Image.open(Path(a.kit) / f"{name}.png").convert("RGBA")
        found = panes(im)
        for v in range(a.variants):
            rng = random.Random(f"{name}-{v}")
            lights = Image.new("RGBA", im.size, (0, 0, 0, 0))
            px = lights.load()
            lit = 0
            for area in found:
                if rng.random() < a.share:
                    body, top = WARM if rng.random() < 0.75 else TEAL
                    # Fill the pane's whole rectangle (panes are rectangular; reflections leave holes).
                    xs = [p[0] for p in area]
                    ys = [p[1] for p in area]
                    for y in range(min(ys), max(ys) + 1):
                        for x in range(min(xs), max(xs) + 1):
                            px[x, y] = top if y == min(ys) else body
                    lit += 1
            lights.save(Path(a.kit) / f"{name}_lights{v}.png")
        print(f"{name}: {len(found)} panes, variant lights saved")


if __name__ == "__main__":
    main()
