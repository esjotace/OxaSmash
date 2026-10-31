"""JRazor, a terminator: the skeleton rogue's frames (public/art/chars/skeleton-rogue-*), every one of
them, as a metal skeleton. The rogue's colours are mapped by what they are: his bones polished
steel, his hood and cloak a dark charcoal, his vest a black leather jacket. In his skull's eye
sockets, a point of bright red.

    python tools/jrazor_art.py --preview ../workshop/preview      animated preview
    python tools/jrazor_art.py                                   the game's files (and his hand)
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from betowing_art import HEX, OUTLINE, frames, join  # noqa: E402
from char_preview import preview  # noqa: E402

SKEL = 'public/art/chars/skeleton-rogue-'
NAME = 'jrazor'

R = lambda *hs: [HEX(h) for h in hs]
O_RED = {p: k for k, p in enumerate(R('#411927', '#76222c', '#a53c2c'))}  # hood and cloak
O_VEST = {p: k for k, p in enumerate(R('#242a36', '#3b535e', '#5c8ea5', '#8ac6e0'))}
O_BONE = {p: k for k, p in enumerate(R('#4b3720', '#825e3a', '#bd9168'))}

STEEL = R('#3a404c', '#7a8494', '#c4ccd8')  # the bones, dark to light
SHINE = HEX('#eef4fa')
HOOD = R('#1c1a22', '#2e2a36', '#433d4e')  # dark charcoal
LEATHER = R('#0c0c10', '#18181e', '#26262e', '#3c3c48')
GLOW, HALO = HEX('#ff3426'), HEX('#9a0e0e')


def paint(src):
    w, h = src.size
    px = src.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    rows = [y for y in range(h) if any(px[x, y][3] for x in range(w))]
    for y in rows:
        for x in range(w):
            p = px[x, y]
            if not p[3]:
                continue
            c = p
            if p in O_BONE:
                k = O_BONE[p]
                c = SHINE if k == 2 and (x + y) % 5 == 0 else STEEL[k]
            elif p in O_RED:
                c = HOOD[O_RED[p]]
            elif p in O_VEST:
                c = LEATHER[O_VEST[p]]
            o[x, y] = c
    # His skull: the bone with his hood on both sides of it (in its row or its column).
    red = lambda x, y: 0 <= x < w and 0 <= y < h and px[x, y] in O_RED
    skull = {(x, y) for y in rows for x in range(w) if px[x, y] in O_BONE and (
        any(red(x - d, y) for d in range(1, 5)) and any(red(x + d, y) for d in range(1, 5))
        or any(red(x, y - d) for d in range(1, 5)) and any(red(x, y + d) for d in range(1, 5)))}
    if len(skull) < 6:
        return out
    # Its holes: outline between the hood's two sides, in the skull's rows. (On the eyes' rows
    # the only bone is the bridge of the nose; the sockets run out to the hood.)
    holes = set()
    for y in range(min(y for _, y in skull), max(y for _, y in skull) + 1):
        hood = [x for x in range(w) if px[x, y] in O_RED]
        left = [x for x in hood if x < min(x for x, yy in skull if yy <= y + 2)]
        right = [x for x in hood if x > max(x for x, yy in skull if yy <= y + 2)]
        if not left or not right:
            continue
        for x in range(max(left) + 1, min(right)):
            if px[x, y] == OUTLINE:
                holes.add((x, y))
    if not holes:
        return out

    def runs(y):
        found, run = [], []
        for x in range(w + 1):
            if (x, y) in holes:
                run.append(x)
            elif run:
                found.append(run)
                run = []
        return found
    # The sockets: the first row where the holes are two runs with bone (the bridge of his nose)
    # between them. In the dark of each, a point of bright red, a dimmer red under it.
    eye = next((y for y in sorted({y for _, y in holes}) if len(runs(y)) >= 2 and any(px[x, y] in O_BONE for x in range(runs(y)[0][-1], runs(y)[-1][0]))), None)
    if eye is None:
        return out
    for run in runs(eye)[:2]:
        x = run[len(run) // 2]
        o[x, eye] = GLOW
        if (x, eye + 1) in holes:
            o[x, eye + 1] = HALO
    return out


def build():
    idle = [paint(f) for f in frames(SKEL + 'idle.png', 32)]
    run = [paint(f) for f in frames(SKEL + 'run.png', 64)]
    stun = paint(Image.open(SKEL + 'stun.png').convert('RGBA'))
    fall = [paint(f) for f in frames(SKEL + 'fall.png', 64)]
    sleep = paint(Image.open(SKEL + 'sleep.png').convert('RGBA'))
    return idle, run, stun, fall, sleep


if __name__ == '__main__':
    idle, run, stun, fall, sleep = build()
    if '--preview' in sys.argv:
        preview(sys.argv[sys.argv.index('--preview') + 1], NAME, {NAME: (idle, run, stun, fall, sleep)}, feet=30)
        print('preview ok')
    else:
        join(idle).save(f'public/art/chars/{NAME}-idle.png')
        join(run).save(f'public/art/chars/{NAME}-run.png')
        stun.save(f'public/art/chars/{NAME}-stun.png')
        join(fall).save(f'public/art/chars/{NAME}-fall.png')
        sleep.save(f'public/art/chars/{NAME}-sleep.png')
        # His hand: the skeletons' bony one, in steel.
        hand = Image.open('public/art/hand-skeleton.png').convert('RGBA')
        hand.putdata([(STEEL[O_BONE[p]] if p in O_BONE else p) for p in hand.getdata()])
        hand.save(f'public/art/hand-{NAME}.png')
        print('ok')
