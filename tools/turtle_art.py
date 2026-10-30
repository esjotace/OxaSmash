"""The turtle knight: the knight's own frames (public/art/chars/knight-*), repainted: his helmet
(the pack's art, visor shut) in a turtle shell's olive, his armour olive with a tan plastron, and
a shell on his back (on top, lying face-down).

    python tools/turtle_art.py --preview ../workshop/preview      animated preview
    python tools/turtle_art.py                                   the game's files
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from betowing_art import HEX, OUTLINE, frames, join, TRACE  # noqa: E402
from char_preview import preview  # noqa: E402

KNIGHT = 'public/art/chars/knight-'
NAME = 'turtle'

KSTEEL = {HEX(h): k for k, h in enumerate(['#242a36', '#3b535e', '#5c8ea5', '#8ac6e0'])}
KORANGE = {HEX(h): k for k, h in enumerate(['#47280d', '#b56c30'])}
HELMET = [HEX('#1f2a16'), HEX('#3a4a22'), HEX('#5d7032'), HEX('#8ea050')]  # a turtle shell's olive
ARMOUR = [HEX('#1c2a1a'), HEX('#2f4a2a'), HEX('#4a6e3a'), HEX('#74965a')]
PLASTRON = [HEX('#8a7444'), HEX('#c2a868')]
LEATHER = [HEX('#3a2412'), HEX('#7a4a22')]
SHELL = [HEX('#262c14'), HEX('#4c5a26'), HEX('#68783a'), HEX('#7e6a34')]  # seams, base, lit, rim


def colour(p, part, front_chest):
    """The knight's colour p, repainted: on the helmet, the armour, or the plastron."""
    if p in KSTEEL:
        k = KSTEEL[p]
        if part == 'helmet':
            return HELMET[k]
        if front_chest and k >= 2:
            return PLASTRON[k - 2]
        return ARMOUR[k]
    if p in KORANGE:
        return LEATHER[KORANGE[p]]
    return p


def shell_behind(img, cx, cy, rx, ry, side):
    """The shell drawn behind the body: half an oval centred at (cx, cy), toward his back ('left')
    or, lying face-down, the top half ('up'). A darker rim, the plates lit inside it, seams."""
    w, h = img.size
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = layer.load()
    r2 = lambda x, y: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
    cells = {(x, y) for y in range(h) for x in range(w) if r2(x, y) <= 1 and (x <= cx if side == 'left' else y <= cy)}
    for (x, y) in cells:
        r = r2(x, y)
        along = (y - cy) / ry if side == 'left' else (x - cx) / rx
        if r > 0.72:
            c = SHELL[3]
        elif 0.36 < r < 0.48 or min(abs(along - 0.33), abs(along + 0.33)) * (ry if side == 'left' else rx) < 0.6:
            c = SHELL[0]
        elif r >= 0.48:
            c = SHELL[2]
        else:
            c = SHELL[1]
        o[x, y] = c
    for (x, y) in cells:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            X, Y = x + dx, y + dy
            if 0 <= X < w and 0 <= Y < h and (X, Y) not in cells:
                o[X, Y] = OUTLINE
    layer.alpha_composite(img)
    return layer


def upright(kframe):
    """A standing, running or crouching frame: the helmet (top to the neck's outline) in shell
    olive, the armour olive and tan, the shell behind."""
    w, h = kframe.size
    px = kframe.load()
    rows = [y for y in range(h) if any(px[x, y][3] for x in range(w))]
    top = rows[0]
    neck = next(y for y in rows if y >= top + 11 and sum(px[x, y] == OUTLINE for x in range(w)) >= 7)
    belt = next((y for y in rows if y > neck and any(px[x, y] in KORANGE for x in range(w))), neck + 7)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    for y in range(h):
        xs = [x for x in range(w) if px[x, y][3]]
        for x in xs:
            # (The plastron: the light plates on the front half of the chest.)
            front = neck < y < belt and x >= (min(xs) + max(xs)) / 2
            o[x, y] = colour(px[x, y], 'helmet' if y < neck else 'body', front)
    backs = sorted(min(x for x in range(w) if o[x, y][3]) for y in range(neck, belt + 1) if any(o[x, y][3] for x in range(w)))
    back = backs[len(backs) // 2]
    return shell_behind(out, back + 3, (neck - 1 + belt + 1) / 2, 6.5, (belt + 1 - (neck - 1)) / 2 + 0.5, 'left')


def lying(kframe):
    """Lying face-down (the face hidden): the helmet (TRACE's cleared part) in shell olive, the
    shell on top of his back."""
    t = TRACE['lying']
    hx = t['clear'][0][1]
    w, h = kframe.size
    px = kframe.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    for y in range(h):
        for x in range(w):
            if px[x, y][3]:
                o[x, y] = colour(px[x, y], 'helmet' if x >= hx else 'body', False)
    tops = sorted(min(y for y in range(h) if o[x, y][3]) for x in range(t['belt'], hx) if any(o[x, y][3] for y in range(h)))
    return shell_behind(out, (t['belt'] + hx) / 2, tops[len(tops) // 2] + 3, (hx - t['belt']) / 2 + 1, 6, 'up')


def build():
    idle = [upright(f) for f in frames(KNIGHT + 'idle.png', 32)]
    run = [upright(f) for f in frames(KNIGHT + 'run.png', 64)]
    kfall = frames(KNIGHT + 'fall.png', 48)
    stun = upright(Image.open(KNIGHT + 'stun.png').convert('RGBA'))
    # (Falling asleep: the knight's own frames.)
    fall = [upright(kfall[0]), stun, upright(kfall[2]), lying(kfall[3]), lying(kfall[4])]
    sleep = lying(Image.open(KNIGHT + 'sleep.png').convert('RGBA'))
    return idle, run, stun, fall, sleep


if __name__ == '__main__':
    idle, run, stun, fall, sleep = build()
    if '--preview' in sys.argv:
        preview(sys.argv[sys.argv.index('--preview') + 1], NAME, {NAME: (idle, run, stun, fall, sleep)})
        print('preview ok')
    else:
        join(idle).save(f'public/art/chars/{NAME}-idle.png')
        join(run).save(f'public/art/chars/{NAME}-run.png')
        stun.save(f'public/art/chars/{NAME}-stun.png')
        join(fall).save(f'public/art/chars/{NAME}-fall.png')
        sleep.save(f'public/art/chars/{NAME}-sleep.png')
        print('ok')
