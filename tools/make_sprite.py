"""Turn a generated illustration into a game-size sprite: cut out the plain background, crop,
shrink to the target height, limit the palette and add a dark outline.

    python tools/make_sprite.py in.png out.png --height 48 --colors 16
"""

import argparse
from collections import deque

from PIL import Image


def cut_background(im, tolerance):
    """Make the background transparent by flood-filling from the image edges (plain backgrounds only)."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = px[0, 0][:3]
    close = lambda c: sum(abs(c[i] - bg[i]) for i in range(3)) <= tolerance
    seen = bytearray(w * h)
    q = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]:
            continue
        seen[y * w + x] = 1
        if not close(px[x, y][:3]):
            continue
        px[x, y] = (0, 0, 0, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return im


def cut_background_local(im, step, drift):
    """Grow the background inward from every edge pixel, stepping only between similar neighbors
    (<= step apart) that stay near the edge color they started from (<= drift). Handles two-tone
    and dark backgrounds, stopping at the sprite's outline."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    diff = lambda a, b: abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y, px[x, y][:3]))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y, px[x, y][:3]))
    for x, y, _ in q:
        seen[y * w + x] = 1
    while q:
        x, y, seed = q.popleft()
        here = px[x, y][:3]
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                c = px[nx, ny][:3]
                if diff(c, here) <= step and diff(c, seed) <= drift:
                    seen[ny * w + nx] = 1
                    q.append((nx, ny, seed))
    return im


def outline(im, color=(16, 14, 24, 255)):
    """1-pixel dark outline around the sprite, the classic 16-bit edge."""
    w, h = im.size
    out = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    out.paste(im, (1, 1))
    src = out.copy().load()
    px = out.load()
    for y in range(h + 2):
        for x in range(w + 2):
            if src[x, y][3] > 0:
                continue
            if any(0 <= x + dx < w + 2 and 0 <= y + dy < h + 2 and src[x + dx, y + dy][3] > 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = color
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--height", type=int, default=48, help="0 = follow --width and the proportions")
    ap.add_argument("--colors", type=int, default=16)
    ap.add_argument("--tolerance", type=int, default=60)
    ap.add_argument("--width", type=int, default=0, help="exact width (default: keep proportions)")
    ap.add_argument("--flip", action="store_true", help="mirror so the character faces right")
    ap.add_argument("--keep-background", action="store_true", help="backgrounds: no cutout, no outline")
    ap.add_argument("--local", action="store_true", help="smarter cutout for two-tone or dark backgrounds")
    ap.add_argument("--step", type=int, default=24, help="with --local: max color jump between neighbors")
    ap.add_argument("--drift", type=int, default=90, help="with --local: max distance from the edge color")
    a = ap.parse_args()

    if a.keep_background:
        im = Image.open(a.src).convert("RGB")
        w = a.width or round(im.width * a.height / im.height)
        out = im.resize((w, a.height), Image.BOX).quantize(colors=a.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        out.convert("RGB").save(a.out)
        print(f"{a.out}: {w}x{a.height}, {a.colors} colors max")
        return

    src = Image.open(a.src)
    im = cut_background_local(src, a.step, a.drift) if a.local else cut_background(src, a.tolerance)
    im = im.crop(im.getbbox())
    if a.flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if a.height == 0:  # size by width (e.g. weapon length), height follows the proportions
        target_w = a.width - 2
        target_h = max(1, round(im.height * target_w / im.width))
    else:
        target_h = a.height - 2  # room for the outline
        target_w = a.width - 2 if a.width else max(1, round(im.width * target_h / im.height))
    alpha = im.getchannel("A").resize((target_w, target_h), Image.BOX).point(lambda v: 255 if v > 140 else 0)
    rgb = im.convert("RGB").resize((target_w, target_h), Image.BOX)
    pal = rgb.quantize(colors=a.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGBA")
    pal.putalpha(alpha)
    sprite = outline(pal)
    sprite.save(a.out)
    colors = len({c for c in sprite.getdata() if c[3]})
    print(f"{a.out}: {sprite.width}x{sprite.height}, {colors} colors")


if __name__ == "__main__":
    main()
