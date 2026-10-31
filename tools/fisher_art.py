"""The Legendary Fisherman: the orc warrior's frames (public/art/chars/orc-warrior-*), every one of them, as a
shirtless Italian fisherman. The orc's colours are mapped by what they are (as Bugbicho's): his skin
a sun-tanned olive, his mohawk black hair, his armour above the belt bare chest (a little chest
hair), below it rolled-up blue work trousers, his boots green rubber ones, his chest strap a rope,
the fur over his back a bundle of fish hanging there. Drawn on, wherever his face is in the frame:
a big black mustache and his ear rounded; his ear's piercings a gold earring. The Legendary
Fisherman (Oxa Mode): the same, in a straw fedora and clubmaster sunglasses.

    python tools/fisher_art.py --preview ../workshop/preview      animated preview
    python tools/fisher_art.py                                   the game's files (and his hand)
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from betowing_art import HEX, OUTLINE, frames, join  # noqa: E402
from char_preview import preview  # noqa: E402
import dj_art  # noqa: E402
from dj_art import eyes, outline_around, O_SKIN, O_HAIR, O_ARMOUR, O_LEATHER, O_FUR  # noqa: E402

ORC = 'public/art/chars/orc-warrior-'
NAME = 'legendary-fisherman'
OXA = 'legendary-fisherman-oxa'  # (Oxa Mode: the hat and the sunglasses)

R = lambda *hs: [HEX(h) for h in hs]
SKIN = R('#5a3418', '#8e5a30', '#bc8450', '#dca878')  # sun-tanned
HAIR = R('#0e0b0a', '#241a14')
TROUSERS = R('#1a2236', '#2a3a5a', '#3e5682', '#5c78a8')
BOOTS = R('#142014', '#1f3420', '#2e4c2e', '#46704a')
ROPE = R('#5a4426', '#8a6a3c', '#b8945a', '#dcc08a')
FISH = R('#24344a', '#4a6a8a', '#8eb0c8', '#d4e4ee')  # silver-blue, dark to light
FISH_EYE = HEX('#0c0c10')
TACHE = R('#0e0b0a', '#2a1e16')
STRAW = R('#6e5a3a', '#a08a5e', '#c8b488', '#e2d4ae')  # the fedora, dark to light
BAND = HEX('#3a2418')
LENS = R('#2e1810', '#5a3424', '#b08060')  # dark brown tint, and its glint
BROW, GOLD = HEX('#1e120c'), HEX('#d8b048')


def hat_sprite():
    """The straw fedora on its own: a wide brim, the crown over it (to the back of the brim), its
    band, outlined."""
    img = Image.new('RGBA', (16, 7), (0, 0, 0, 0))
    o = img.load()
    cells = {}
    for x in range(1, 15):
        cells[(x, 5)] = STRAW[2 if x % 3 else 1]
    for dy, (a, b) in enumerate([(3, 10), (2, 11), (2, 11)]):
        for x in range(a, b + 1):
            cells[(x, 2 + dy)] = BAND if dy == 2 else STRAW[3 if dy == 0 else 2 if (x + dy) % 3 else 1]
    for (x, y), c in cells.items():
        o[x, y] = c
    outline_around(o, 16, 7, set(cells))
    return img


def paint(src, upright, hat=False):
    w, h = src.size
    px = src.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    rows = [y for y in range(h) if any(px[x, y][3] for x in range(w))]
    bottom = rows[-1]
    belt = next((y for y in rows if sum(px[x, y] in O_LEATHER for x in range(w)) >= 5 and y > rows[0] + 18), rows[0] + 24)
    fur = [(x, y) for y in rows for x in range(w) if px[x, y] in O_FUR]
    fur_top = min((y for _, y in fur), default=0)
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
                k = O_ARMOUR[p]
                if y < belt:
                    # Shirtless: the armour on his chest is his bare chest, a little hair on it.
                    c = SKIN[min(3, k + 1)] if (x * 3 + y * 5) % 11 else HAIR[1]
                else:
                    c = TROUSERS[k]
            elif p in O_LEATHER:
                k = O_LEATHER[p]
                if upright and y >= bottom - 2:
                    c = BOOTS[k]
                elif y < belt and k >= 2:
                    c = ROPE[k]  # the strap across his chest: a rope
                else:
                    c = ROPE[0]  # the belt: rope too
            elif p in O_FUR:
                # The fish hanging on his back: bands of them, dark backs to light bellies.
                band = (y - fur_top) % 4
                c = FISH[[1, 3, 2, 0][band]] if O_FUR[p] else FISH[0]
            o[x, y] = c
    # Each fish its eye: at the back edge of the bundle, one per band.
    for y in range(fur_top + 1, bottom, 4):
        xs = [x for x in range(w) if px[x, y] in O_FUR]
        if xs:
            o[min(xs) + 1, y] = FISH_EYE
    box = src.getbbox()
    lying = box[2] - box[0] > 1.3 * (rows[-1] - rows[0])
    dj_art.earrings(src, o, rows[0], lying)
    found = eyes(src)
    if not found:
        if lying:
            dj_art.round_ear_lying(src, o)
        if hat:
            # His face turned: the fedora goes on by his mohawk (the top of his head): over it,
            # brim down, standing; turned with his head, crown out the way it points, lying.
            hair = [(x, y) for y in rows for x in range(w) if px[x, y] in O_HAIR]
            if hair:
                xs, ys = [x for x, _ in hair], [y for _, y in hair]
                fedora = hat_sprite()
                if lying:
                    fedora = fedora.rotate(-90, expand=True)
                    at = (min(xs) - 2, (min(ys) + max(ys)) // 2 - fedora.height // 2)
                else:
                    at = ((min(xs) + max(xs)) // 2 + 2 - fedora.width // 2, min(ys) + 4 - fedora.height + 1)
                out.alpha_composite(fedora, at)
        return out
    (ex, ey), (fx, fy) = found
    # His ear, rounded (as Dj Cuirox's): the rows round his eyes where his skin reaches furthest
    # back are the orc's point.
    reach = {y: min((x for x in range(ex - 14, ex) if px[x, y] in O_SKIN), default=w) for y in range(ey - 4, ey + 1)}
    tip = [y for y, x in sorted(reach.items()) if x <= ex - 10]
    for n, y in enumerate(tip[:2]):
        for x in range(reach[y], reach[y] + 2 - n):
            o[x, y] = (0, 0, 0, 0)
        o[reach[y] + 2 - n, y] = SKIN[0]
    # His eyes: dark, under heavy brows.
    for (x, y) in ((ex, ey), (fx, fy)):
        o[x, y] = o[x + 1, y] = HAIR[0]
        o[x, y + 1] = o[x + 1, y + 1] = SKIN[1]
    # The big black mustache under his nose, its ends turned down past his mouth.
    for x in range(ex - 1, fx + 3):
        if o[x, ey + 3][3] and o[x, ey + 3] != OUTLINE:
            o[x, ey + 3] = TACHE[(x + ey) % 2]
    for x in (ex - 1, fx + 2):
        if o[x, ey + 4][3] and o[x, ey + 4] != OUTLINE:
            o[x, ey + 4] = TACHE[0]
    if hat:
        # Clubmaster sunglasses: a dark browline over two tinted lenses (a glint in each), a gold
        # bridge between them, the arm back to his ear.
        for x in range(ex - 1, fx + 3):
            o[x, ey - 1] = BROW
        for x0, x1 in ((ex - 1, ex + 1), (fx, fx + 2)):
            for x in range(x0, x1 + 1):
                o[x, ey] = LENS[1]
                o[x, ey + 1] = LENS[0]
            o[x0 + 1, ey] = LENS[2]
        for x in range(ex + 2, fx):
            o[x, ey] = GOLD
        for x in range(ex - 6, ex - 1):
            if o[x, ey][3] and o[x, ey] in SKIN:
                o[x, ey] = BROW
        # The straw fedora: the mohawk gone under it; a wide brim three rows over his eyes, from
        # the back of his head to past his face; the crown over it, its band where they meet.
        for y in range(rows[0], ey - 2):
            for x in range(w):
                if px[x, y] in O_HAIR or (px[x, y] == OUTLINE and y < ey - 4):
                    o[x, y] = (0, 0, 0, 0)
        back = min(x for x in range(w) if o[x, ey - 3][3])
        hat_cells = {}
        for x in range(back - 1, fx + 4):
            hat_cells[(x, ey - 3)] = STRAW[2 if x % 3 else 1]
        for dy, (a, b) in enumerate([(ex - 4, fx - 1), (ex - 5, fx), (ex - 6, fx + 1)]):
            for x in range(a, b + 1):
                hat_cells[(x, ey - 6 + dy)] = STRAW[3 if dy == 0 else 2 if (x + dy) % 3 else 1]
        for x in range(ex - 6, fx + 2):
            hat_cells[(x, ey - 4)] = BAND
        for (x, y), c in hat_cells.items():
            if 0 <= x < w and 0 <= y < h:
                o[x, y] = c
        outline_around(o, w, h, set(hat_cells))
    return out


def build(hat=False):
    idle = [paint(f, True, hat) for f in frames(ORC + 'idle.png', 32)]
    run = [paint(f, True, hat) for f in frames(ORC + 'run.png', 64)]
    stun = paint(Image.open(ORC + 'stun.png').convert('RGBA'), True, hat)
    fall = [paint(f, k == 0, hat) for k, f in enumerate(frames(ORC + 'fall.png', 96))]
    sleep = paint(Image.open(ORC + 'sleep.png').convert('RGBA'), False, hat)
    return idle, run, stun, fall, sleep


if __name__ == '__main__':
    idle, run, stun, fall, sleep = build()
    if '--preview' in sys.argv:
        # (Beside him, the variation: the hat and the sunglasses.)
        preview(sys.argv[sys.argv.index('--preview') + 1], NAME, {NAME: (idle, run, stun, fall, sleep), 'hat': build(hat=True)}, feet=46)
        print('preview ok')
    else:
        for name, (idle, run, stun, fall, sleep) in ((NAME, (idle, run, stun, fall, sleep)), (OXA, build(hat=True))):
            join(idle).save(f'public/art/chars/{name}-idle.png')
            join(run).save(f'public/art/chars/{name}-run.png')
            stun.save(f'public/art/chars/{name}-stun.png')
            join(fall).save(f'public/art/chars/{name}-fall.png')
            sleep.save(f'public/art/chars/{name}-sleep.png')
        # His hand (both of them): the human hand in his tan.
        hand = Image.open('public/art/hand.png').convert('RGBA')
        tone = {HEX('#be7134'): SKIN[2], HEX('#f0ae6c'): SKIN[3]}
        hand.putdata([tone.get(p, p) for p in hand.getdata()])
        hand.save(f'public/art/hand-{NAME}.png')
        print('ok')
