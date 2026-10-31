"""The Doctor, a field medic: the orc rogue's frames (public/art/chars/orc-rogue-*), every one of them, as a
human field medic. The orc's colours are mapped by what they are (as Bugbicho's): his skin human,
his leather hood and tunic olive drab, his bare legs olive trousers, the bottom of them black
tactical boots, his belt webbing. Drawn on: his long ear gone under his hood, his tusks gone,
and wherever his face is in the frame a bushy mustache; a red cross on a white patch on the side of his hood,
and a medic's armband on his arm.

    python tools/medic_art.py --preview ../workshop/preview      animated preview
    python tools/medic_art.py                                   the game's files (and his hand)
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from betowing_art import HEX, OUTLINE, frames, join  # noqa: E402
from char_preview import preview  # noqa: E402
from dj_art import eyes, outline_around, O_SKIN  # noqa: E402

ROGUE = 'public/art/chars/orc-rogue-'
NAME = 'the-doctor'

R = lambda *hs: [HEX(h) for h in hs]
# The orc rogue's leather (dark to light), its pale bits (the hood's highlights, his tusks), his
# belt and its buckle.
O_LEATHER = {p: k for k, p in enumerate(R('#44280f', '#70431c', '#9b5a22'))}
O_PALE = {p: k for k, p in enumerate(R('#bd9168', '#eccbac'))}
O_BELT, O_BUCKLE = HEX('#281d12'), HEX('#5c8ea5')

SKIN = R('#5a3420', '#9a5e3a', '#c88a5c', '#e6b088')
OLIVE = R('#262c14', '#3e4822', '#5a6630', '#7a8644')  # the hood and the uniform
TROUSERS = R('#2a2c1a', '#44462a', '#5e6038', '#7a7c4a')
BOOTS = R('#141418', '#24242c', '#3a3a44', '#62626e')
WEBBING, METAL = HEX('#1e2012'), HEX('#a0a6ae')
WHITE, RED = HEX('#f2f2f2'), HEX('#c42a2a')
TACHE = R('#1e140e', '#3a281c')


def paint(src):
    w, h = src.size
    px = src.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    rows = [y for y in range(h) if any(px[x, y][3] for x in range(w))]
    bottom = rows[-1]
    found = eyes(src)
    # The belt: the first row with the belt's dark across it; his legs below it, his boots the
    # last three rows of them.
    belt = next((y for y in rows if sum(px[x, y] == O_BELT for x in range(w)) >= 4), rows[0] + 20)
    for y in rows:
        for x in range(w):
            p = px[x, y]
            if not p[3]:
                continue
            c = p
            if p in O_SKIN:
                k = O_SKIN[p]
                c = (BOOTS[k] if y >= bottom - 2 else TROUSERS[k]) if y > belt + 2 else SKIN[k]
            elif p in O_LEATHER:
                c = OLIVE[O_LEATHER[p] + (y < belt and found is not None and y < found[0][1] + 3)]
            elif p in O_PALE:
                c = OLIVE[3] if (found and y < found[0][1]) else SKIN[2 + O_PALE[p]]  # hood highlights; tusks: skin
            elif p == O_BELT:
                c = WEBBING
            elif p == O_BUCKLE:
                c = METAL
            o[x, y] = c
    # His ears, under his hood: the orc's sweeps out past it to a point. The ear: the skin out past
    # the hood's edge in his head's top rows, and all the skin joined to it (his arm isn't: there's
    # tunic between); it goes, with its outline, and the hood's edge there is outlined.
    box = src.getbbox()
    lying = box[2] - box[0] > 1.3 * (box[3] - box[1])
    edge = {}
    for y in rows:
        hood = [x for x in range(w) if px[x, y] in O_LEATHER]
        if hood:
            edge[y] = min(hood)
    todo = [(x, y) for y in range(rows[0], rows[0] + (3 if lying else 10)) if y in edge for x in range(edge[y]) if px[x, y] in O_SKIN]
    ear = set(todo)
    while todo:
        x, y = todo.pop()
        for c, d in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if (c, d) not in ear and 0 <= c < w and 0 <= d < h and px[c, d] in O_SKIN and c < edge.get(d, -1):
                ear.add((c, d))
                todo.append((c, d))
    for (x, y) in ear:
        o[x, y] = (0, 0, 0, 0)
        for c in (x - 1, x, x + 1):
            for d in (y - 1, y, y + 1):
                if 0 <= c < w and 0 <= d < h and px[c, d] == OUTLINE and c < edge.get(d, -1):
                    o[c, d] = (0, 0, 0, 0)
    if ear:
        # The back of the helmet, round where the ear was: filled out in its darker olive to a
        # curve from the crown down to the shoulder, bulging out to about where the ear's tip was.
        ys = sorted({y for _, y in ear})
        y0, y1 = ys[0] - 2, ys[-1] + 3
        right = max(edge.get(y, 0) for y in range(y0, y1 + 1))
        bulge = max(1, (right - min(x for x, _ in ear)) * 2 // 3)
        mid, half = (y0 + y1) / 2, (y1 - y0) / 2 + 0.5
        shell = set()
        for y in range(y0, y1 + 1):
            if y not in edge:
                continue
            reach = right - round(bulge * max(0.0, 1 - ((y - mid) / half) ** 2) ** 0.5)
            for x in range(reach, edge[y]):
                if o[x, y][3] == 0:
                    o[x, y] = OLIVE[1] if x > reach else OLIVE[0]
                    shell.add((x, y))
        outline_around(o, w, h, shell)
    if not lying:
        # The red cross on a white patch, on the side of his hood.
        hood = [(x, y) for y in range(rows[0], rows[0] + 9) for x in range(w) if px[x, y] in O_LEATHER]
        cx, cy = min(x for x, _ in hood) + 3, min(y for _, y in hood) + 2
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if o[cx + dx, cy + dy][3]:
                    o[cx + dx, cy + dy] = RED if 0 in (dx, dy) else WHITE
    if not found:
        # His face turned (stunned, falling, lying): the orc's tusks mark the corners of his mouth;
        # they're the mustache's drooping ends, the skin between a pair of them its middle.
        tusks = [(x, y) for y in rows for x in range(w) if px[x, y] in O_PALE and any(px[x + a, y + b] in O_SKIN for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + a < w and 0 <= y + b < h)]
        for (x, y) in tusks:
            o[x, y] = TACHE[(x + y) % 2]
        for y in {y for _, y in tusks}:
            xs = sorted(x for x, yy in tusks if yy == y)
            if xs[-1] - xs[0] <= 6:
                for x in range(xs[0], xs[-1]):
                    if px[x, y] in O_SKIN:
                        o[x, y] = TACHE[(x + y) % 2]
        return out
    (ex, ey), (fx, fy) = found
    # The bushy mustache under his nose, across the front of his face.
    for x in range(ex, fx + 2):
        for y in (ey + 3, ey + 4):
            if o[x, y][3] and o[x, y] != OUTLINE:
                o[x, y] = TACHE[(x + y) % 2] if y == ey + 3 or x in (ex, fx + 1) else o[x, y]
    # The medic's armband: round the top of his arm (the skin furthest forward-back under his
    # chin), white with a red cross.
    arm = [(x, y) for y in range(ey + 6, ey + 10) for x in range(w) if o[x, y] in SKIN and x < ex - 2]
    if arm:
        ay = min(y for _, y in arm)
        xs = sorted(x for x, y in arm if y == ay)
        for x in xs:
            o[x, ay] = WHITE
        o[xs[len(xs) // 2], ay] = RED
    return out


def build():
    idle = [paint(f) for f in frames(ROGUE + 'idle.png', 32)]
    run = [paint(f) for f in frames(ROGUE + 'run.png', 64)]
    stun = paint(Image.open(ROGUE + 'stun.png').convert('RGBA'))
    fall = [paint(f) for f in frames(ROGUE + 'fall.png', 64)]
    sleep = paint(Image.open(ROGUE + 'sleep.png').convert('RGBA'))
    return idle, run, stun, fall, sleep


if __name__ == '__main__':
    idle, run, stun, fall, sleep = build()
    if '--preview' in sys.argv:
        preview(sys.argv[sys.argv.index('--preview') + 1], NAME, {NAME: (idle, run, stun, fall, sleep)}, feet=31)
        print('preview ok')
    else:
        join(idle).save(f'public/art/chars/{NAME}-idle.png')
        join(run).save(f'public/art/chars/{NAME}-run.png')
        stun.save(f'public/art/chars/{NAME}-stun.png')
        join(fall).save(f'public/art/chars/{NAME}-fall.png')
        sleep.save(f'public/art/chars/{NAME}-sleep.png')
        # His hand: the human hand in his skin.
        hand = Image.open('public/art/hand.png').convert('RGBA')
        tone = {HEX('#be7134'): SKIN[2], HEX('#f0ae6c'): SKIN[3]}
        hand.putdata([tone.get(p, p) for p in hand.getdata()])
        hand.save(f'public/art/hand-{NAME}.png')
        print('ok')
