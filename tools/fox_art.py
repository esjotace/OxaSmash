"""Frampersand, the rogue fox: the human rogue's frames (public/art/chars/rogue-*), every one of
them (idle, run, stun, falling asleep, asleep), still the rogue (his scarf, the dark of his face
under the hood) with a fox's face in that dark: bright eyes, a dark snout poking out of the hood
with a slight shine on its nose. A light burgundy hood, a dark hoodie with a gamer's neon stripe,
and a bushy light purple tail behind his hips. The rogue's colours are mapped by what they are (as
Bugbicho's). Frampersand.dev is the same with a glowing teal hood and an orange tail.

    python tools/fox_art.py --preview ../workshop/preview      animated preview of both
    python tools/fox_art.py                                   the game's files
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from betowing_art import HEX, OUTLINE, frames, join  # noqa: E402
from bugbicho_art import roles  # noqa: E402
from char_preview import preview  # noqa: E402

ROGUE = 'public/art/chars/rogue-'
PAD = 8  # room on each side of the idle frames, for the tail (see IDLE_W in src/game/cast.js)

R = lambda *hs: [HEX(h) for h in hs]
TIP = HEX('#f6f2fc')
SHADOW = HEX('#1c3845')  # the rogue's face, in the dark under the hood
FACE = R('#0e0b14', '#17121f', '#211a2c', '#2c2338')  # the snout, as dark as the face
GLOW = HEX('#ffd84a')  # his eyes
NOSE, SHINE = HEX('#08060c'), HEX('#6a5c80')
BODY = R('#14141e', '#20202e', '#2e2e42', '#40405a')  # the hoodie
DARK = R('#14141e', '#20202e', '#2a2a3c', '#3a3a52')  # trousers, gloves, the belt
TEAL = R('#0c2f3a', '#14607a', '#1fa0be', '#4fe0f4')
# Each of them, dark to light: the hood, the tail; the scarf (None: the rogue's own), the hoodie,
# the trousers; and whether the hoodie has the gamer's neon stripe.
LOOKS = {
    'frampersand': dict(hood=R('#3e1424', '#6a2840', '#8e3c58', '#b0586e'), tail=R('#4e3a74', '#7a62a8', '#a58ad0', '#c8b4ec'),
                        scarf=None, body=BODY, legs=DARK, stripe=True),
    # (The suit in the hood's teal, the trousers a shade darker so the legs stand apart; the
    # rogue's violet scarf.)
    'frampersand.dev': dict(hood=TEAL, tail=R('#7a3010', '#c05a1a', '#f08a30', '#ffb060'),
                            scarf=None, body=TEAL, legs=[TEAL[0], TEAL[0], TEAL[1], TEAL[2]], stripe=False),
}
CYAN, MAGENTA = HEX('#36d4ff'), HEX('#ff52d8')
SNEAKER = R('#8a8ea0', '#f2f2f8', '#ffffff')


def outline_around(o, w, h, cells):
    for (x, y) in cells:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            X, Y = x + dx, y + dy
            if 0 <= X < w and 0 <= Y < h and (X, Y) not in cells and o[X, Y][3] == 0:
                o[X, Y] = OUTLINE


def tail_behind(img, x, y, fur):
    """The bushy tail, behind the body: from the hips at (x, y) sweeping out back and up, a white tip."""
    w, h = img.size
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = layer.load()
    cells = {}
    for (cx, cy, rx, ry, tip) in ((x - 2, y, 3.4, 2.6, False), (x - 6, y - 2.5, 3.2, 3, False), (x - 9, y - 6, 2.4, 2.4, True)):
        for yy in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for xx in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1 and 0 <= xx < w and 0 <= yy < h:
                    cells[(xx, yy)] = TIP if tip else fur[3] if yy < cy - ry / 3 else fur[2] if yy < cy + ry / 3 else fur[1]
    for (xx, yy), c in cells.items():
        o[xx, yy] = c
    outline_around(o, w, h, set(cells))
    layer.alpha_composite(img)
    return layer


def paint(src, L, lying, shut):
    w, h = src.size
    g = roles(src)
    px = src.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    rows = [y for y in range(h) if any(g[y])]
    bottom = rows[-1]
    # The face: the dark inside the hood, between hood or scarf on both sides of the row.
    face = set()
    for y in range(h):
        solid = [x for x in range(w) if g[y][x] and g[y][x][0] in 'HM']
        for x in range(min(solid, default=0) + 1, max(solid, default=0)):
            r = g[y][x]
            if r and r[0] in 'OFE' and any(g[y][k] and g[y][k][0] in 'HM' for k in range(x)) and any(g[y][k] and g[y][k][0] in 'HM' for k in range(x + 1, w)):
                face.add((x, y))
    scarf = [(x, y) for y in range(h) for x in range(w) if g[y][x] and g[y][x][0] == 'M']
    scarf_bottom = max((y for _, y in scarf), default=rows[0] + 13)
    belt = next((y for y in rows if y > scarf_bottom and any(g[y][x] == ('B', 0) for x in range(w))), scarf_bottom + 7)
    fx0 = min((x for x, _ in face), default=0)
    for y in range(h):
        for x in range(w):
            r = g[y][x]
            if not r:
                continue
            kind, k = r
            c = px[x, y]
            if kind == 'E':
                c = SHADOW if shut else GLOW  # (bright eyes; asleep, shut)
            elif kind == 'H':
                # Above (lying: past) the scarf the hood; below it the hoodie, and below the belt
                # the trousers.
                if (x >= fx0 - 3) if lying else (y <= scarf_bottom):
                    c = L['hood'][k]
                elif (x < fx0 - 14) if lying else (y > belt):
                    c = L['legs'][k]
                else:
                    c = L['body'][k]
            elif kind == 'M' and L['scarf']:
                c = L['scarf'][k]
            elif kind == 'B':
                c = SNEAKER[k] if (not lying and y >= bottom - 2) else DARK[k]  # sneakers; the belt, gloves
            o[x, y] = c
    if face and not lying:
        # The gamer's front: a neon stripe across the chest, under the scarf.
        y = scarf_bottom + 2
        for x in range(w) if L['stripe'] else ():
            if o[x, y][3] and o[x, y] != OUTLINE and x > fx0 - 2:
                o[x, y] = CYAN if x % 2 else MAGENTA
        if scarf:
            # The fox's snout, dark, out of the dark of the hood over the scarf, the nose at its tip
            # catching a little light.
            sx = max(x for x, _ in scarf)
            sy = min(y for x, y in scarf if x == sx)
            top = [(sx - 1, sy - 2), (sx, sy - 2), (sx + 1, sy - 2), (sx + 2, sy - 2)]
            under = [(sx - 1, sy - 1), (sx, sy - 1), (sx + 1, sy - 1)]
            for (x, y) in top:
                o[x, y] = FACE[3] if x < sx + 2 else SHINE
            for (x, y) in under:
                o[x, y] = FACE[1]
            o[sx + 3, sy - 2] = NOSE
            outline_around(o, w, h, set(top + under + [(sx + 3, sy - 2)]))
    # The tail, from his hips at the back.
    if lying:
        hx = fx0 - 12
        return tail_behind(out, hx, min(y for y in range(h) if o[hx, y][3]) + 1, L['tail'])
    back = min(x for x in range(w) if o[x, belt - 1][3])
    return tail_behind(out, back + 2, belt - 1, L['tail'])


def widened(f):
    """An idle frame with PAD px of room on each side."""
    big = Image.new('RGBA', (f.width + 2 * PAD, f.height), (0, 0, 0, 0))
    big.paste(f, (PAD, 0))
    return big


def build(name):
    L = LOOKS[name]
    one = lambda f, lying=False, shut=False: paint(f, L, lying, shut)
    idle = [one(widened(f)) for f in frames(ROGUE + 'idle.png', 32)]
    run = [one(f) for f in frames(ROGUE + 'run.png', 64)]
    stun = one(Image.open(ROGUE + 'stun.png').convert('RGBA'))
    kfall = frames(ROGUE + 'fall.png', 64)
    # (Falling asleep: standing, the slump, the tip forward with the eyes shut, lying down.)
    fall = [one(kfall[0]), one(kfall[1]), one(kfall[2], shut=True), one(kfall[3], lying=True, shut=True)]
    sleep = one(Image.open(ROGUE + 'sleep.png').convert('RGBA'), lying=True, shut=True)
    return idle, run, stun, fall, sleep


if __name__ == '__main__':
    if '--preview' in sys.argv:
        preview(sys.argv[sys.argv.index('--preview') + 1], 'frampersand', {name: build(name) for name in LOOKS}, feet=32)
        print('preview ok')
    else:
        for name in LOOKS:
            idle, run, stun, fall, sleep = build(name)
            join(idle).save(f'public/art/chars/{name}-idle.png')
            join(run).save(f'public/art/chars/{name}-run.png')
            stun.save(f'public/art/chars/{name}-stun.png')
            join(fall).save(f'public/art/chars/{name}-fall.png')
            sleep.save(f'public/art/chars/{name}-sleep.png')
        print('ok')
