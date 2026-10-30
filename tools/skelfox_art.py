"""The skeleton fox: the skeleton rogue's frames (public/art/chars/skeleton-rogue-*), every one of
them (idle, run, stun, falling asleep, asleep: he comes apart and ends lying down), still the
skeleton's body, but a fox's face: dark under the hood (his skull's bone gone to shadow), bright
eyes, a dark snout out of the hood with a slight shine on its nose. A light burgundy hood and
cloak, a gamer's front (dark, with neon), and a fox's bushy tail at the bottom of his cloak. Two looks: 'skull', and 'ears' (two
cloth fox ears on the hood).

    python tools/skelfox_art.py --preview ../workshop/preview      animated preview of both looks
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from betowing_art import HEX, OUTLINE, frames  # noqa: E402
from char_preview import preview  # noqa: E402

SKEL = 'public/art/chars/skeleton-rogue-'
PAD = 8  # room on each side of the idle frames for the tail, and on top for the ears

R = lambda *hs: [HEX(h) for h in hs]
RED = {p: k for k, p in enumerate(R('#411927', '#76222c', '#a53c2c'))}  # his hood and cloak
VEST = {p: k for k, p in enumerate(R('#242a36', '#3b535e', '#5c8ea5', '#8ac6e0'))}
BONE = {p: k for k, p in enumerate(R('#4b3720', '#825e3a', '#bd9168'))}
FUR = R('#4e3a74', '#7a62a8', '#a58ad0', '#c8b4ec')  # the tail's light purple
TIP = HEX('#f6f2fc')
FRONT = R('#14141e', '#26263a', '#36d4ff', '#ff52d8')  # the gamer's front: dark, dark, cyan, magenta
HOOD = R('#4e1a2c', '#7e3048', '#b0526e')
LOOKS = {'skull': dict(ears=False), 'ears': dict(ears=True)}
FACE = R('#0e0b14', '#17121f', '#211a2c', '#2c2338')  # the dark of his face, dark to light
GLOW = HEX('#ffd84a')  # his eyes
NOSE, SHINE = HEX('#08060c'), HEX('#6a5c80')


def outline_around(o, w, h, cells):
    for (x, y) in cells:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            X, Y = x + dx, y + dy
            if 0 <= X < w and 0 <= Y < h and (X, Y) not in cells and o[X, Y][3] == 0:
                o[X, Y] = OUTLINE


def tail_behind(img, x, y, way=-1):
    """The bushy tail, behind the body: from (x, y) sweeping out (way: -1 left, 1 right) and up, a
    white tip."""
    w, h = img.size
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = layer.load()
    cells = {}
    for (dx, dy, rx, ry, tip) in ((2, 0, 3.4, 2.6, False), (6, -2.5, 3.2, 3, False), (9, -6, 2.4, 2.4, True)):
        cx, cy = x + way * dx, y + dy
        for yy in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for xx in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1 and 0 <= xx < w and 0 <= yy < h:
                    cells[(xx, yy)] = TIP if tip else FUR[3] if yy < cy - ry / 3 else FUR[2] if yy < cy + ry / 3 else FUR[1]
    for (xx, yy), c in cells.items():
        o[xx, yy] = c
    outline_around(o, w, h, set(cells))
    layer.alpha_composite(img)
    return layer


def paint(src, L, shut=False):
    w, h = src.size
    px = src.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    rows = [y for y in range(h) if any(px[x, y][3] for x in range(w))]
    cols = [x for x in range(w) if any(px[x, y][3] for y in rows)]
    lying = cols[-1] - cols[0] > 1.3 * (rows[-1] - rows[0])  # (lying down: wider than tall)
    vest = next((y for y in rows if any(px[x, y] in VEST for x in range(w))), rows[-1])
    # The skull: the bones above the vest (not the legs).
    skull = [(x, y) for y in range(rows[0], vest) for x in range(w) if px[x, y] in BONE]
    # (Coming apart, the skull is the bone with his hood on both sides of it, in its row or its
    # column; lying down head first to the left, it's the bone in the hood's first 16 columns. The
    # legs' bones are neither.)
    red = lambda x, y: 0 <= x < w and 0 <= y < h and px[x, y] in RED
    hood_x = min(x for y in rows for x in range(w) if px[x, y] in RED)
    face = set(skull) if not lying else {(x, y) for y in rows for x in range(hood_x, hood_x + 16) if px[x, y] in BONE}
    for y in rows:
        for x in range(w):
            if px[x, y] in BONE and (any(red(x - d, y) for d in range(1, 4)) and any(red(x + d, y) for d in range(1, 4)) or any(red(x, y - d) for d in range(1, 4)) and any(red(x, y + d) for d in range(1, 4))):
                face.add((x, y))
    for y in rows:
        for x in range(w):
            p = px[x, y]
            if not p[3]:
                continue
            c = p
            if (x, y) in face:
                c = FACE[BONE[p]]
            elif p in RED:
                c = HOOD[RED[p]]
            elif p in VEST:
                c = FRONT[VEST[p]]
            o[x, y] = c
    if skull and not lying:
        fx0, fx1 = min(x for x, _ in skull), max(x for x, _ in skull)
        fy0 = min(y for _, y in skull)
        # The eyes: bright, in the middle of each socket (asleep: shut, just the dark).
        run, runs = [], []
        for x in range(fx0, fx1 + 2):
            if px[x, fy0 + 3] == OUTLINE and fx0 <= x <= fx1:
                run.append(x)
            elif run:
                runs.append(run)
                run = []
        for r in runs:
            if not shut:
                o[r[len(r) // 2], fy0 + 3] = GLOW
        # The fox's snout, dark, out past the hood: its top sloping down from the brow to the nose
        # at the front, the shorter jaw under it. The nose catches a little light.
        snout = set()
        for dy, (ext, shade) in enumerate([(1, 3), (3, 3), (5, 2), (3, 1)]):
            y = fy0 + 3 + dy
            for x in range(fx1 + 1, fx1 + ext + 1):
                o[x, y] = FACE[shade]
                snout.add((x, y))
        o[fx1 + 5, fy0 + 5] = NOSE
        o[fx1 + 4, fy0 + 5] = SHINE
        outline_around(o, w, h, snout)
        if L['ears']:
            # Cloth ears on the hood: standing up from its top.
            top = min(y for y in range(h) for x in range(w) if o[x, y][3])
            crown = [x for x in range(w) if o[x, top][3]]
            ear = set()
            for ex in (crown[0], crown[0] + 4):
                base = min(y for y in range(h) for x in range(ex, ex + 3) if o[x, y][3])
                for a, b, c in ((0, 0, 2), (1, 0, 0), (2, 0, 2), (0, 1, 2), (1, 1, 1), (1, 2, 2)):
                    o[ex + a, base - 1 - b] = HOOD[c]
                    ear.add((ex + a, base - 1 - b))
            outline_around(o, w, h, ear)
    # The tail, from the bottom of his cloak at the back (lying, head to the left: its far end).
    cloak = [(x, y) for y in rows for x in range(w) if px[x, y] in RED]
    hy = max(y for _, y in cloak)
    if lying:
        hx = max(x for x, y in cloak)
        return tail_behind(out, hx - 1, hy - 2, way=1)
    hx = min(x for x, y in cloak if y >= hy - 3)
    return tail_behind(out, hx + 2, hy - 2)


def widened(f):
    big = Image.new('RGBA', (f.width + 2 * PAD, f.height + PAD), (0, 0, 0, 0))
    big.paste(f, (PAD, PAD))
    return big


def build(look):
    L = LOOKS[look]
    idle = [paint(widened(f), L) for f in frames(SKEL + 'idle.png', 32)]
    run = [paint(f, L) for f in frames(SKEL + 'run.png', 64)]
    stun = paint(Image.open(SKEL + 'stun.png').convert('RGBA'), L)
    # (His eyes shut from the third frame of falling asleep on.)
    fall = [paint(f, L, shut=k >= 2) for k, f in enumerate(frames(SKEL + 'fall.png', 64))]
    sleep = paint(Image.open(SKEL + 'sleep.png').convert('RGBA'), L, shut=True)
    return idle, run, stun, fall, sleep


if __name__ == '__main__':
    if '--preview' in sys.argv:
        preview(sys.argv[sys.argv.index('--preview') + 1], 'skelfox', {look: build(look) for look in LOOKS}, feet=30)
        print('preview ok')
