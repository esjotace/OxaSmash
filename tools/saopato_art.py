"""Saopato: the knight's own frames (public/art/chars/knight-*) as a duck knight, in three looks
(duckling, mallard, white). Every shade of the knight's steel is mapped onto the look's own (so the
pack's shading stays), and duck parts are drawn on: the visor (the moving part) becomes the upper
bill out in front, rounded, with a nostril and the nail at its tip; the eye slit the mouth's line;
the visor's lower part (the breathing holes, the chin) the lower bill. A duck's eye on the helmet,
a feathered wing on the back shoulder, an upturned tail; the boots are orange feet.

    python tools/saopato_art.py --preview ../workshop/preview      animated preview of the looks
    python tools/saopato_art.py                                   the game's files (all three)
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from betowing_art import HEX, OUTLINE, frames, join, TRACE  # noqa: E402
from char_preview import preview  # noqa: E402

KNIGHT = 'public/art/chars/knight-'
NAME = 'saopato'
# Each look's character in the game (its name in the menus comes from this).
IDS = {'duckling': 'saopato', 'mallard': 'caballero-pato-real', 'white': 'caballero-pato-falso'}
# Headroom over the knight's 32 px tall frames (idle, stun, fall, sleep), for the duckling's tuft
# (see IDLE_H in src/game/cast.js).
PAD = 8

KSTEEL = {HEX(h): k for k, h in enumerate(['#242a36', '#3b535e', '#5c8ea5', '#8ac6e0'])}
KORANGE = {HEX(h): k for k, h in enumerate(['#47280d', '#b56c30'])}
R = lambda *hs: [HEX(h) for h in hs]
# Each look: its colours (dark to light) for the helmet, the neck (the gorget), the chest's front,
# the rest of the body, the wing; the bill, the feet, the belt; and its extras.
LOOKS = {
    'duckling': dict(
        helmet=R('#7a5208', '#c4900c', '#f2c41c', '#ffe86a'), neck=R('#7a5208', '#c4900c', '#f2c41c', '#ffe86a'),
        chest=R('#7a5208', '#c4900c', '#ffe9a0', '#fff6d0'), body=R('#7a5208', '#c4900c', '#f2c41c', '#ffe86a'),
        wing=R('#a87408', '#e0aa14', '#ffd640', '#fff09a'), bill=R('#7a3a0a', '#c8601a', '#f08a2a', '#ffb050'),
        feet=R('#b8541a', '#f08a2a'), belt=HEX('#8a4a14'), tail=R('#e0aa14', '#ffd640'), tuft=True),
    'mallard': dict(
        helmet=R('#0c241a', '#165038', '#23784e', '#48b070'), neck=R('#5a6068', '#a8adb4', '#e8eaec', '#ffffff'),
        chest=R('#3a1e12', '#5e3220', '#8a4a2a', '#b06a3c'), body=R('#24282e', '#4a5058', '#7a828c', '#b0b8c0'),
        wing=R('#3a3e46', '#6a707a', '#9aa2ac', '#d4d8dc'), bill=R('#5a5410', '#8a8418', '#c8c030', '#e8e070'),
        feet=R('#b8601a', '#f0962c'), belt=HEX('#3a2412'), tail=R('#141412', '#2a2e36'), curl=True),
    'white': dict(
        helmet=R('#6a6e78', '#a6acb6', '#dde1e6', '#ffffff'), neck=R('#6a6e78', '#a6acb6', '#dde1e6', '#ffffff'),
        chest=R('#6a6e78', '#a6acb6', '#eef0f2', '#ffffff'), body=R('#6a6e78', '#a6acb6', '#dde1e6', '#ffffff'),
        wing=R('#7a7e88', '#b6bcc6', '#e6e9ee', '#ffffff'), bill=R('#7a3a0a', '#c8601a', '#f08a2a', '#ffb050'),
        feet=R('#b8541a', '#f08a2a'), belt=HEX('#5a4a3a'), tail=R('#b6bcc6', '#ffffff')),
}
WHITE, BLACK = HEX('#ffffff'), HEX('#141412')
# The bill's rows, from the visor's top: how far each sticks out past the helmet, and its shade.
UPPER = [(3, 3), (4, 2), (4, 1)]
LOWER = [(3, 1), (2, 0)]


def outline_around(o, w, h, cells, sides=((1, 0), (-1, 0), (0, 1), (0, -1))):
    for (x, y) in cells:
        for dx, dy in sides:
            X, Y = x + dx, y + dy
            if 0 <= X < w and 0 <= Y < h and (X, Y) not in cells and o[X, Y][3] == 0:
                o[X, Y] = OUTLINE


def colour(L, p, part):
    if p in KSTEEL:
        return L[part][KSTEEL[p]]
    if p in KORANGE:
        return L['feet'][KORANGE[p]] if part == 'feet' else L['belt']
    return p


def upright(kframe, L):
    w, h = kframe.size
    px = kframe.load()
    rows = [y for y in range(h) if any(px[x, y][3] for x in range(w))]
    top, bottom = rows[0], rows[-1]
    neck = next(y for y in rows if y >= top + 11 and sum(px[x, y] == OUTLINE for x in range(w)) >= 7)
    belt = next((y for y in rows if y > neck and any(px[x, y] in KORANGE for x in range(w))), neck + 7)
    breath = top + 9  # (the breathing holes: always 9 rows under the helmet's top)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    for y in range(h):
        xs = [x for x in range(w) if px[x, y][3]]
        for x in xs:
            if y < breath + 2:
                part = 'helmet'
            elif y < neck:
                part = 'neck'
            elif y >= bottom - 3 and px[x, y] in KORANGE:
                part = 'feet'
            elif neck < y < belt and x >= (min(xs) + max(xs)) / 2:
                part = 'chest'
            else:
                part = 'body'
            o[x, y] = colour(L, px[x, y], part)
    # The bill: the visor's front, drawn out forward, rounded at both ends (its rows start further
    # in toward the top and the bottom), the slit between its halves. The visor's top edge (the
    # brim's row) is the bill's top outline, so it moves with the bill.
    right = max(x for x in range(w) if px[x, breath - 2][3] and px[x, breath - 2] != OUTLINE)
    left = right - 9
    bill = set()
    for x in range(left + 1, right + UPPER[0][0] + 1):
        o[x, breath - 5] = OUTLINE
    for i, (ext, shade) in enumerate(UPPER):
        start = left + 2 - i
        o[start - 1, breath - 4 + i] = OUTLINE
        for x in range(start, right + ext + 1):
            o[x, breath - 4 + i] = L['bill'][shade]
            bill.add((x, breath - 4 + i))
    o[right + 4, breath - 2] = L['bill'][0]  # the nail at the tip
    o[right + 2, breath - 4] = L['bill'][1]  # a nostril
    for x in range(left - 1, right + 6):
        o[x, breath - 1] = OUTLINE  # the mouth
    for i, (ext, shade) in enumerate(LOWER):
        start = left + i
        o[start - 1, breath + i] = OUTLINE
        for x in range(start, right + ext + 1):
            o[x, breath + i] = L['bill'][shade]
            bill.add((x, breath + i))
    outline_around(o, w, h, bill, ((1, 0), (0, -1), (0, 1)))
    # A duck's eye on the helmet's side, over the bill: black, with a glint.
    o[right - 5, breath - 6] = BLACK
    o[right - 5, breath - 7] = WHITE
    if L.get('tuft'):
        # The duckling's tuft: two little feathers sprouting from the top of the helmet.
        tx = min(x for x in range(w) if px[x, top][3]) + 3
        tuft = {(tx, top - 1), (tx + 1, top - 2), (tx - 1, top - 2), (tx - 1, top - 3)}
        for (x, y) in tuft:
            o[x, y] = L['helmet'][3]
        outline_around(o, w, h, tuft)
    # The wing: folded on the back shoulder, feathers layered down to staggered tips.
    back = sorted(min(x for x in range(w) if o[x, y][3]) for y in range(neck, belt) if any(o[x, y][3] for x in range(w)))[0]
    wing = {}
    shape = [(-1, 2), (-2, 2), (-3, 2), (-3, 2), (-3, 1), (-2, 0)]
    for dy, (a, b) in enumerate(shape):
        y = neck + dy
        for dx in range(a, b + 1):
            # (Light along the top, feather lines down the middle, the tips staggered at the bottom.)
            if dy == len(shape) - 1 and dx % 2:
                continue
            shade = 3 if dy == 0 else 1 if (dx % 2 and dy >= 2) else 2
            wing[(back + dx + 1, y)] = L['wing'][shade]
    for (x, y), c in wing.items():
        if 0 <= x < w:
            o[x, y] = c
    outline_around(o, w, h, set(wing))
    # The tail, turned up at the back over the belt; the mallard's curls over at its tip.
    bx = min(x for x in range(w) if o[x, belt][3])
    tail = [(bx - 1, belt), (bx - 2, belt - 1), (bx - 3, belt - 2)]
    if L.get('curl'):
        tail.append((bx - 2, belt - 3))
    for k, (x, y) in enumerate(tail):
        o[x, y] = L['tail'][k % 2]
    outline_around(o, w, h, set(tail))
    return out


def duck_head(L):
    """His head as it is standing (helmet, bill, eye, tuft): the first idle frame above the neck."""
    k = idle_frames()[0]
    px = k.load()
    rows = [y for y in range(k.height) if any(px[x, y][3] for x in range(k.width))]
    neck = next(y for y in rows if y >= rows[0] + 11 and sum(px[x, y] == OUTLINE for x in range(k.width)) >= 7)
    head = upright(k, L).crop((0, 0, k.width, neck - 2))
    return head.crop(head.getbbox())


def lying(kframe, L):
    """Lying down asleep: the knight's body, and in place of his helmet Saopato's own head, resting
    upright at its front like a duck asleep on its belly, the bill forward, the eye shut."""
    hx = TRACE['lying']['clear'][0][1]
    w, h = kframe.size
    px = kframe.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    for y in range(h):
        for x in range(hx):
            if px[x, y][3]:
                o[x, y] = colour(L, px[x, y], 'feet' if x < 11 and px[x, y] in KORANGE else 'body')
    head = duck_head(L)
    hp = head.load()
    for y in range(head.height):
        for x in range(head.width):
            if hp[x, y] == WHITE:
                hp[x, y] = L['helmet'][2]  # (no glint: the eye shut, a dark line)
                hp[x, y + 1] = L['helmet'][2]
                hp[x - 1, y + 1] = BLACK
                hp[x + 1, y + 1] = BLACK
    out.paste(head, (hx - 3, h - head.height), head)
    return out


def padded(f):
    """A knight frame with PAD px of room on top."""
    tall = Image.new('RGBA', (f.width, f.height + PAD), (0, 0, 0, 0))
    tall.paste(f, (0, PAD))
    return tall


def idle_frames():
    return [padded(f) for f in frames(KNIGHT + 'idle.png', 32)]


def build(look):
    L = LOOKS[look]
    idle = [upright(f, L) for f in idle_frames()]
    run = [upright(f, L) for f in frames(KNIGHT + 'run.png', 64)]
    kfall = [padded(f) for f in frames(KNIGHT + 'fall.png', 48)]
    stun = upright(padded(Image.open(KNIGHT + 'stun.png').convert('RGBA')), L)
    fall = [upright(kfall[0], L), stun, upright(kfall[2], L), lying(kfall[3], L), lying(kfall[4], L)]
    sleep = lying(padded(Image.open(KNIGHT + 'sleep.png').convert('RGBA')), L)
    return idle, run, stun, fall, sleep


if __name__ == '__main__':
    if '--preview' in sys.argv:
        preview(sys.argv[sys.argv.index('--preview') + 1], NAME, {look: build(look) for look in LOOKS})
        print('preview ok')
    else:
        for look, name in IDS.items():
            idle, run, stun, fall, sleep = build(look)
            join(idle).save(f'public/art/chars/{name}-idle.png')
            join(run).save(f'public/art/chars/{name}-run.png')
            stun.save(f'public/art/chars/{name}-stun.png')
            join(fall).save(f'public/art/chars/{name}-fall.png')
            sleep.save(f'public/art/chars/{name}-sleep.png')
        print('ok')
