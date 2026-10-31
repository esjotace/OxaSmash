"""Dj Cuirox: the orc warrior's frames (public/art/chars/orc-warrior-*), every one of them, as a DJ. The
orc's colours are mapped by what they are (as Bugbicho's): his skin a warm tan, his mohawk black, his armour a black jacket (jeans below the belt), his chest strap a neon cable,
his boots white sneakers, the fur over his back a black record bag. Drawn on, wherever his face
is in the frame: tinted glasses over his eyes, a stubble beard, a smile, a septum ring, and his
ear rounded off (the orc's is pointed) with gold piercings.

    python tools/dj_art.py --preview ../workshop/preview      animated preview
    python tools/dj_art.py                                   the game's files (and his hand)
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from betowing_art import HEX, OUTLINE, frames, join  # noqa: E402
from char_preview import preview  # noqa: E402

ORC = 'public/art/chars/orc-warrior-'
NAME = 'dj-cuirox'

R = lambda *hs: [HEX(h) for h in hs]
# The orc warrior's colours by what they are, dark to light.
O_SKIN = {p: k for k, p in enumerate(R('#233219', '#3f5d27', '#5d8d38', '#77b845'))}
O_HAIR = {p: k for k, p in enumerate(R('#411927', '#a53c2c'))}
O_ARMOUR = {p: k for k, p in enumerate(R('#242a36', '#3b535e', '#5c8ea5', '#8ac6e0'))}
O_LEATHER = {p: k for k, p in enumerate(R('#44280f', '#4b3720', '#70431c', '#9b5a22'))}
O_FUR = {p: k for k, p in enumerate(R('#3d3d30', '#716f61', '#9c998a'))}

SKIN = R('#4a2c18', '#7a4a2a', '#a8703f', '#c99060')  # a warm tan
HAIR = R('#0e0b0a', '#241c18')
JACKET = R('#121216', '#1e2028', '#2e3240', '#444a5c')
JEANS = R('#141a2c', '#222c48', '#33416a', '#4c5e8c')
CABLE = R('#1a8aa8', '#36d4ff', '#ff52d8', '#ff9ae8')  # the neon strap
SNEAKER = R('#6a6e7a', '#c8ccd4', '#f2f2f8', '#ffffff')
BAG = R('#16161c', '#24242e', '#34343f')
STUBBLE = R('#2e2018', '#4a3426')
LENS = R('#7c76b4', '#c4bef0')  # tinted, lavender
TEETH = HEX('#f4ece2')
RING = R('#9aa2b0', '#eef2f8')  # the septum: silver
GOLD = R('#7a5208', '#c4900c', '#f2c41c', '#ffe86a')  # his ear's piercings


def outline_around(o, w, h, cells):
    for (x, y) in cells:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            X, Y = x + dx, y + dy
            if 0 <= X < w and 0 <= Y < h and (X, Y) not in cells and o[X, Y][3] == 0:
                o[X, Y] = OUTLINE


def eyes(src):
    """The orc's eyes: 2 x 2 blocks of outline with his skin around them (left first), or None."""
    w, h = src.size
    px = src.load()
    skin = lambda x, y: 0 <= x < w and 0 <= y < h and px[x, y] in O_SKIN
    found = []
    for y in range(h - 1):
        for x in range(w - 1):
            if all(px[x + a, y + b] == OUTLINE for a in (0, 1) for b in (0, 1)) and (skin(x, y - 1) or skin(x + 1, y - 1)) and (skin(x - 1, y) or skin(x + 2, y) or skin(x, y + 2)):
                found.append((x, y))
    # (Two of them, side by side on one row, a few pixels apart.)
    for (x, y) in found:
        for (x2, y2) in found:
            if y2 == y and 3 <= x2 - x <= 5:
                return (x, y), (x2, y2)
    return None


def earrings(src, o, top, lying):
    """The orc's ear piercings, gold: little clusters of armour colour (4 px or fewer) on his skin,
    where his ear is (the back half of his head; lying, near the end of it); the jacket's armour
    is all one big piece."""
    w, h = src.size
    px = src.load()
    box = src.getbbox()
    head = [x for y in range(top, min(h, top + 12)) for x in range(w) if px[x, y] in O_SKIN]
    near = (lambda x: box[2] - 18 <= x <= box[2] - 8) if lying else (lambda x: x <= (min(head) + max(head)) / 2)
    seen = set()
    for y in range(top, min(h, top + 15)):
        for x in range(w):
            if (x, y) in seen or px[x, y] not in O_ARMOUR:
                continue
            group, todo = [], [(x, y)]
            seen.add((x, y))
            while todo and len(group) <= 4:
                a, b = todo.pop()
                group.append((a, b))
                for c, d in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                    if 0 <= c < w and 0 <= d < h and (c, d) not in seen and px[c, d] in O_ARMOUR:
                        seen.add((c, d))
                        todo.append((c, d))
            touches = any(0 <= a + c < w and 0 <= b + d < h and px[a + c, b + d] in O_SKIN for a, b in group for c, d in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if len(group) <= 4 and not todo and touches and all(near(a) for a, _ in group):
                for a, b in group:
                    o[a, b] = GOLD[O_ARMOUR[px[a, b]]]


def round_ear_lying(src, o):
    """Lying on his side (no face to find), his ear points up out of the top of his head, near its
    end: its tip's top row goes, the row under it is the ear's rim."""
    w, h = src.size
    px = src.load()
    b = src.getbbox()
    cols = range(b[2] - 16, b[2] - 10)
    tops = {x: min((y for y in range(h) if px[x, y] in O_SKIN), default=h) for x in cols}
    tip = min(tops.values())
    if tip > b[1] + 1:
        return
    for x in cols:
        if px[x, tip] in O_SKIN or (px[x, tip] == OUTLINE and tops[x] == tip):
            o[x, tip] = (0, 0, 0, 0)
        if px[x, tip + 1] in O_SKIN:
            o[x, tip + 1] = SKIN[0]


def paint(src, upright):
    w, h = src.size
    px = src.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    rows = [y for y in range(h) if any(px[x, y][3] for x in range(w))]
    bottom = rows[-1]
    # The belt: the first row with leather across most of the body (the jacket above, jeans below).
    belt = next((y for y in rows if sum(px[x, y] in O_LEATHER for x in range(w)) >= 5 and y > rows[0] + 18), rows[0] + 24)
    for y in rows:
        for x in range(w):
            p = px[x, y]
            if not p[3]:
                continue
            c = p
            if p in O_SKIN:
                c = SKIN[O_SKIN[p]]
            elif p in O_HAIR:
                c = HAIR[O_HAIR[p]]
            elif p in O_ARMOUR:
                c = (JACKET if y < belt else JEANS)[O_ARMOUR[p]]
            elif p in O_LEATHER:
                k = O_LEATHER[p]
                if upright and y >= bottom - 2:
                    c = SNEAKER[k]
                elif y < belt and k >= 2:
                    c = CABLE[k - 1 + (k == 3)]  # the strap across his chest: cyan, its light side pink
                else:
                    c = JACKET[0]  # the belt, the edges of the pauldrons
            elif p in O_FUR:
                c = BAG[O_FUR[p]]
            o[x, y] = c
    lying = src.getbbox()[2] - src.getbbox()[0] > 1.3 * (rows[-1] - rows[0])
    earrings(src, o, rows[0], lying)
    found = eyes(src)
    if not found:
        if lying:
            round_ear_lying(src, o)
        return out
    (ex, ey), (fx, fy) = found
    # His ear, rounded: the orc's runs out to a point behind him, on the rows round his eyes where
    # his skin reaches furthest back.
    reach = {y: min((x for x in range(ex - 14, ex) if px[x, y] in O_SKIN), default=w) for y in range(ey - 4, ey + 1)}
    tip = [y for y, x in sorted(reach.items()) if x <= ex - 10]
    for n, y in enumerate(tip[:2]):
        for x in range(reach[y], reach[y] + 2 - n):
            o[x, y] = (0, 0, 0, 0)
        o[reach[y] + 2 - n, y] = SKIN[0]
    # Glasses: lenses in the eyes (light over dark), a frame around them, the bridge between and
    # the arm back to the ear.
    for (x, y) in ((ex, ey), (fx, fy)):
        o[x, y] = o[x + 1, y] = LENS[1]
        o[x, y + 1] = o[x + 1, y + 1] = LENS[0]
        for a in (-1, 2):
            o[x + a, y] = OUTLINE
            o[x + a, y + 1] = OUTLINE
        o[x, y - 1] = o[x + 1, y - 1] = OUTLINE
    for x in range(ex + 2, fx):
        o[x, ey] = OUTLINE
    for x in range(ex - 5, ex - 1):
        if o[x, ey][3] and o[x, ey] in SKIN:
            o[x, ey] = OUTLINE
    # The stubble beard: his jaw and chin under the eyes, speckled; a smile in it.
    for y in range(ey + 3, ey + 7):
        for x in range(ex - 1, fx + 3):
            if o[x, y] in SKIN:
                o[x, y] = STUBBLE[(x + y) % 2]
    # (The smile a pixel back from the front, clear of the ring.)
    for x in range(ex + 1, fx):
        if o[x, ey + 4][3] and o[x, ey + 4] != OUTLINE:
            o[x, ey + 4] = TEETH
    # A septum ring under his nose, on the mustache's line.
    o[fx, ey + 3] = RING[0]
    o[fx + 1, ey + 3] = RING[1]
    return out


def build():
    idle = [paint(f, True) for f in frames(ORC + 'idle.png', 32)]
    run = [paint(f, True) for f in frames(ORC + 'run.png', 64)]
    stun = paint(Image.open(ORC + 'stun.png').convert('RGBA'), True)
    fall = [paint(f, k == 0) for k, f in enumerate(frames(ORC + 'fall.png', 96))]
    sleep = paint(Image.open(ORC + 'sleep.png').convert('RGBA'), False)
    return idle, run, stun, fall, sleep


if __name__ == '__main__':
    idle, run, stun, fall, sleep = build()
    if '--preview' in sys.argv:
        preview(sys.argv[sys.argv.index('--preview') + 1], NAME, {NAME: (idle, run, stun, fall, sleep)}, feet=46)
        print('preview ok')
    else:
        join(idle).save(f'public/art/chars/{NAME}-idle.png')
        join(run).save(f'public/art/chars/{NAME}-run.png')
        stun.save(f'public/art/chars/{NAME}-stun.png')
        join(fall).save(f'public/art/chars/{NAME}-fall.png')
        sleep.save(f'public/art/chars/{NAME}-sleep.png')
        # His hand: the human hand in his tan.
        hand = Image.open('public/art/hand.png').convert('RGBA')
        tan = {HEX('#be7134'): SKIN[2], HEX('#f0ae6c'): SKIN[3]}
        hand.putdata([tan.get(p, p) for p in hand.getdata()])
        hand.save(f'public/art/hand-{NAME}.png')
        print('ok')
