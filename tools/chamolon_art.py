"""Minion Chamolon: the human rogue's frames (public/art/chars/rogue-*), every one of them, as a red
minion. The rogue's colours are mapped by what they are (as Bugbicho's): his hood a grey helmet-hood
round the dark of his face, his eyes white and slanted in an angry V, his scarf red cloth at his
neck, his tunic red, his trousers maroon, his boots and belt dark. Drawn on: a grey crest sweeping
back over the hood, and pointed grey pauldrons on his shoulders.

    python tools/chamolon_art.py --preview ../workshop/preview      animated preview
    python tools/chamolon_art.py                                   the game's files
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from betowing_art import HEX, OUTLINE, frames, join  # noqa: E402
from bugbicho_art import roles  # noqa: E402
from char_preview import preview  # noqa: E402
from dj_art import outline_around  # noqa: E402

ROGUE = 'public/art/chars/rogue-'
NAME = 'minion-chamolon'
PAD = 8  # room on top, for the crest

R = lambda *hs: [HEX(h) for h in hs]
METAL = R('#33363e', '#5e646e', '#9298a2', '#c8ccd2')  # the hood and the pauldrons, dark to light
CREST = R('#6a6e76', '#a4a8b0', '#d4d6dc', '#f0f0f4')
RED = R('#3e1014', '#6e1c22', '#a02a30', '#c84448')
SCARF = R('#5a141a', '#962228', '#d0383e')
MAROON = R('#1e0c10', '#2e1418', '#421e24', '#5a2a30')
DARK = R('#141418', '#22222a', '#30303a')
EYE = HEX('#f4f4f8')
GLOW = (0x0c, 0x98, 0xd6)  # (the rogue's eyes)


def crest_sprite():
    """The crest on its own, its base along the bottom (at x 9), sweeping back (left) and up, light
    along its top edge, outlined."""
    img = Image.new('RGBA', (14, 7), (0, 0, 0, 0))
    o = img.load()
    cells = {}
    for dy, (a, b) in enumerate([(-1, 3), (-3, 2), (-5, 0), (-7, -3), (-8, -6)]):
        for dx in range(a, b + 1):
            cells[(dx + 9, 5 - dy)] = CREST[3 if dx == a else 2 if dy < 3 else 1]
    for (x, y), c in cells.items():
        o[x, y] = c
    outline_around(o, 14, 7, set(cells))
    return img


# The pauldrons' shapes: rows from the bottom up, as columns off the pad's left; a spike up and out
# at the top (back for the back one, forward for the front).
BACK = [(0, 4), (0, 4), (0, 3), (-1, 1), (-2, -1)]
FRONT = [(0, 4), (0, 4), (1, 4), (3, 5), (5, 6)]


def pad(o, w, h, x0, y0, shape):
    """A pointed grey pauldron, its bottom row at y0, from column x0."""
    cells = {}
    for dy, (a, b) in enumerate(shape):
        for x in range(x0 + a, x0 + b + 1):
            cells[(x, y0 - dy)] = METAL[3 if dy >= 3 else 2 if dy == 2 else 1]
    cells = {k: c for k, c in cells.items() if 0 <= k[0] < w and 0 <= k[1] < h}
    for (x, y), c in cells.items():
        o[x, y] = c
    outline_around(o, w, h, set(cells))


def paint(src, lying, shut=False):
    w, h = src.size
    g = roles(src)
    px = src.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    rows = [y for y in range(h) if any(g[y])]
    bottom = rows[-1]
    scarf = [(x, y) for y in range(h) for x in range(w) if g[y][x] and g[y][x][0] == 'M']
    scarf_bottom = max((y for _, y in scarf), default=rows[0] + 13)
    belt = next((y for y in rows if y > scarf_bottom and any(g[y][x] == ('B', 0) for x in range(w))), scarf_bottom + 7)
    face_x = min((x for x, y in scarf), default=w // 2)
    for y in range(h):
        for x in range(w):
            r = g[y][x]
            if not r:
                continue
            kind, k = r
            c = px[x, y]
            if kind == 'E':
                c = OUTLINE if shut else EYE  # (asleep: shut, just the dark)
            elif kind == 'F':
                c = OUTLINE  # (the rogue's eyes' shadow: the face is all dark)
            elif kind == 'H':
                # Above (lying: past) the scarf the hood; below it the tunic, below the belt the trousers.
                if (x >= face_x - 3) if lying else (y <= scarf_bottom):
                    c = METAL[k]
                elif (x < face_x - 14) if lying else (y > belt):
                    c = MAROON[k]
                else:
                    c = RED[k]
            elif kind == 'M':
                c = SCARF[k]
            elif kind == 'B':
                c = DARK[min(2, k)]
            o[x, y] = c
    if lying:
        # Lying on his side, the crown of his head to the right: the crest comes out of the hood's
        # right side there, sweeping up; the shoulder facing up, behind the hood, its pauldron.
        hood = [(x, y) for y in range(h) for x in range(w) if o[x, y] in METAL]
        if hood:
            right = max(x for x, _ in hood)
            crown = [y for x, y in hood if x >= right - 1]
            crest = crest_sprite().rotate(-90, expand=True)
            out.alpha_composite(crest, (right - 1, max(0, (min(crown) + max(crown)) // 2 - 9)))
            x0 = min(x for x, _ in hood) - 6
            base = min((y for y in range(h) for x in range(x0, x0 + 5) if o[x, y][3]), default=h - 4)
            pad(o, w, h, x0, base + 1, FRONT)
        return out
    # The eyes, angry: each a little wedge, two wide, its inner corner a row lower (the back one
    # out a pixel behind, the front one ahead), a dark gap between them.
    glow = [(x, y) for y in range(h) for x in range(w) if px[x, y][:3] == GLOW]
    if glow and not shut:
        gx = sorted(glow)
        mid = (gx[0][0] + gx[-1][0]) / 2
        for (x, y) in glow:
            outer = x - 1 if x < mid else x + 1
            o[outer, y] = EYE
            if 0 <= y + 1 < h:
                o[x, y + 1] = EYE
    # The crest: on the top of the hood, sweeping back over it.
    top = min(y for y in rows)
    crown = [x for x in range(w) if g[top][x]]
    out.alpha_composite(crest_sprite(), ((crown[0] + crown[-1]) // 2 - 9, max(0, top - 6)))
    # Pointed pauldrons on his shoulders: just under the scarf, at the body's back and front edges,
    # out past them.
    y0 = scarf_bottom + 2
    edge = [x for x in range(w) if o[x, y0][3] and o[x, y0] != OUTLINE]
    if edge:
        pad(o, w, h, min(edge) - 2, y0 + 1, BACK)
        pad(o, w, h, max(edge) - 3, y0 + 1, FRONT)
    return out


def padded(f):
    tall = Image.new('RGBA', (f.width, f.height + PAD), (0, 0, 0, 0))
    tall.paste(f, (0, PAD))
    return tall


def build():
    idle = [paint(padded(f), False) for f in frames(ROGUE + 'idle.png', 32)]
    run = [paint(f, False) for f in frames(ROGUE + 'run.png', 64)]
    stun = paint(padded(Image.open(ROGUE + 'stun.png').convert('RGBA')), False)
    kfall = [padded(f) for f in frames(ROGUE + 'fall.png', 64)]
    # (Falling asleep: standing, the slump, the tip forward with the eyes shut, lying down.)
    fall = [paint(kfall[0], False), paint(kfall[1], False), paint(kfall[2], False, shut=True), paint(kfall[3], True, shut=True)]
    sleep = paint(padded(Image.open(ROGUE + 'sleep.png').convert('RGBA')), True, shut=True)
    return idle, run, stun, fall, sleep


if __name__ == '__main__':
    idle, run, stun, fall, sleep = build()
    if '--preview' in sys.argv:
        preview(sys.argv[sys.argv.index('--preview') + 1], NAME, {NAME: (idle, run, stun, fall, sleep)}, feet=32)
        print('preview ok')
    else:
        join(idle).save(f'public/art/chars/{NAME}-idle.png')
        join(run).save(f'public/art/chars/{NAME}-run.png')
        stun.save(f'public/art/chars/{NAME}-stun.png')
        join(fall).save(f'public/art/chars/{NAME}-fall.png')
        sleep.save(f'public/art/chars/{NAME}-sleep.png')
        print('ok')
