"""Assemble a building from kit pieces, left to right, for previewing a layout.

A piece name can carry a decal: "wall+graffiti0" puts graffiti0.png centered on that piece.
--tint multiplies the colors (night lighting), e.g. 5f6488.

    python tools/compose_kit.py ../workshop/art-source/kits/warehouse out.png left_corner bay wall+graffiti0 door right_corner --tint 5f6488
"""

import argparse
from pathlib import Path

from PIL import Image, ImageChops


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kit")
    ap.add_argument("out")
    ap.add_argument("pieces", nargs="+")
    ap.add_argument("--tint", default=None)
    ap.add_argument("--scale", type=int, default=1)
    a = ap.parse_args()
    kit = Path(a.kit)
    parts = []
    for spec in a.pieces:
        name, _, decal = spec.partition("+")
        parts.append((Image.open(kit / f"{name}.png").convert("RGBA"), decal))
    w = sum(p.width for p, _ in parts)
    h = max(p.height for p, _ in parts)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    x = 0
    decals = []
    for piece, decal in parts:
        out.alpha_composite(piece, (x, h - piece.height))
        if decal:
            decals.append((Image.open(kit / f"{decal}.png").convert("RGBA"), x + piece.width // 2))
        x += piece.width
    for d, cx in decals:  # decals go on top, and may overlap the neighbouring pieces
        out.alpha_composite(d, (max(0, cx - d.width // 2), h // 2 - d.height // 2))
    if a.tint:
        color = tuple(int(a.tint[i : i + 2], 16) for i in (0, 2, 4)) + (255,)
        out = ImageChops.multiply(out, Image.new("RGBA", out.size, color))
    if a.scale > 1:
        out = out.resize((out.width * a.scale, out.height * a.scale), Image.NEAREST)
    out.save(a.out)
    print(f"{a.out}: {w}x{h}")


if __name__ == "__main__":
    main()
