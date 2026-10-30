"""Betowing: the skeleton knight's frames (public/art/chars/skeleton-warrior-*) repainted as a bald
man with cinnamon skin, a short dark beard and glasses, in a flight suit: green jumpsuit, white
jacket with silver shoulders, red scarf, white boots. Same idle and run as the skeleton knight; his
stun, fall and sleep are made from his own idle (the skeleton's fall has the skull come off).

  public/art/chars/betowing-idle|run|stun|fall|sleep.png
  public/art/hand-betowing.png   (white flight gloves)

    python tools/betowing_art.py
"""
from PIL import Image

ART = 'public/art/chars/skeleton-warrior-'
OUT = 'public/art/chars/betowing-'

HEX = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
OUTLINE = HEX('#141412')
# The skeleton knight's colours by what they are: bone (dark to light), armour, red cloth.
BONE = {HEX(h): k for k, h in enumerate(['#4b3720', '#825e3a', '#bd9168', '#eccbac'])}
ARMOUR = {HEX(h): k for k, h in enumerate(['#242a36', '#3b535e', '#5c8ea5', '#8ac6e0'])}
RED = {HEX(h): k for k, h in enumerate(['#551a1c', '#ae3838'])}

SKIN = [HEX('#5a3119'), HEX('#83492a'), HEX('#a8663c'), HEX('#c8875a')]  # cinnamon, dark to light
BEARD = [HEX('#1c120c'), HEX('#2f1e14')]
LENS = HEX('#d6eef7')
FRAME = HEX('#141412')
JACKET = [HEX('#4a5260'), HEX('#8a929c'), HEX('#c9cdd2'), HEX('#f2f2ee')]
SUIT = [HEX('#24331b'), HEX('#3d5a2a'), HEX('#5f8238'), HEX('#8fb556')]
SCARF = [HEX('#6e1a1e'), HEX('#cc3a3a')]
BELT = [HEX('#3a3f48'), HEX('#a8b0b8')]
BOOT = [HEX('#6c7480'), HEX('#c9cdd2'), HEX('#f2f2ee'), HEX('#ffffff')]


def paint(src):
    w, h = src.size
    px = src.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    rows = [y for y in range(h) if any(px[x, y][3] for x in range(w))]
    if not rows:
        return out
    top, bottom = rows[0], rows[-1]
    # The head: everything above the first row with armour or cloth in it.
    neck = next(y for y in rows if any(px[x, y][:4] in ARMOUR or px[x, y][:4] in RED for x in range(w)))
    # The waist: the first all-outline run under the chest (the armour's bottom edge), else 70% down.
    body = [y for y in rows if y > neck and sum(px[x, y] == OUTLINE for x in range(w)) >= 8]
    waist = body[0] if body else neck + (bottom - neck) * 7 // 10
    # The skull's holes (eyes, nose, teeth): outline pixels inside the head, bone on both sides.
    holes = set()
    for y in range(top, neck):
        bone = [x for x in range(w) if px[x, y] in BONE]
        for x in range(w):
            if px[x, y] == OUTLINE and bone and min(bone) < x < max(bone):
                holes.add((x, y))
    eye = min((y for _, y in holes), default=None)
    head_x = [x for y in range(top, neck) for x in range(w) if px[x, y][3]]
    mid = (min(head_x) + max(head_x)) / 2 if head_x else w / 2
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if not p[3]:
                continue
            c = OUTLINE
            if y < neck:
                if (x, y) in holes:
                    if eye is not None and y == eye + 1:
                        c = LENS  # the glasses' lenses, in the eye sockets' middle row
                    elif eye is not None and y <= eye + 2:
                        c = FRAME
                    else:
                        c = BEARD[0]
                elif p in BONE:
                    k = BONE[p]
                    c = SKIN[k]
                    # The short beard: the jaw and chin only (two rows under the nose), toward the front.
                    if eye is not None and y >= eye + 4 and x >= mid - 2:
                        c = BEARD[1] if k >= 2 else BEARD[0]
            elif p in RED:
                c = SCARF[RED[p]] if y <= neck + 2 else BELT[RED[p]]
            elif p in ARMOUR:
                c = JACKET[ARMOUR[p]] if y < waist else SUIT[ARMOUR[p]]
            elif p in BONE:
                k = BONE[p]
                c = BOOT[k] if y >= bottom - 3 else SUIT[k]
            o[x, y] = c
    if eye is not None:
        # The glasses' bridge and the arm back to the ear, along the lenses' row.
        lens = sorted(x for (x, y) in holes if y == eye + 1)
        if lens:
            for x in range(lens[0], lens[-1] + 1):
                if o[x, eye][3] and (x, eye + 1) not in holes:
                    o[x, eye] = FRAME
            for x in range(int(mid) - 4, lens[0]):
                if o[x, eye + 1][3] and o[x, eye + 1] != OUTLINE:
                    o[x, eye + 1] = FRAME
        # A shine on the bald head.
        hx = [x for x in range(w) if o[x, top + 1][3] and o[x, top + 1] != OUTLINE]
        for x in hx[len(hx) // 2: len(hx) // 2 + 3]:
            o[x, top + 1] = SKIN[3]
    return out


def frames(path, fw):
    s = Image.open(path).convert('RGBA')
    return [s.crop((k * fw, 0, k * fw + fw, s.height)) for k in range(s.width // fw)]


def join(fs):
    out = Image.new('RGBA', (sum(f.width for f in fs), max(f.height for f in fs)), (0, 0, 0, 0))
    x = 0
    for f in fs:
        out.paste(f, (x, out.height - f.height), f)
        x += f.width
    return out


def in_cell(img, w, h, dx=0, dy=0):
    """img on a w x h cell: feet on the bottom, centred (moved by dx, dy)."""
    cell = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    b = img.getbbox()
    piece = img.crop(b)
    cell.paste(piece, (w // 2 - (b[2] - b[0]) // 2 + dx, h - piece.height + dy), piece)
    return cell


# The knight's stun, fall and sleep, traced: same poses and timing, his helmet swapped for
# Betowing's head and his armour repainted as the flight suit. Each knight frame: where the helmet
# is (cleared: for each (y, x) in `clear`, every pixel at or above row y and right of column x),
# how the head goes on (upright, or turned face-down when lying) and where the body splits (above
# `belt` the jacket, below it the suit; when lying, right of `belt` the jacket).
KNIGHT = 'public/art/chars/knight-'
KARMOUR = {HEX(h): k for k, h in enumerate(['#242a36', '#3b535e', '#5c8ea5', '#8ac6e0'])}
KORANGE = {HEX(h): k for k, h in enumerate(['#47280d', '#b56c30'])}
TRACE = {
    'crouch': dict(clear=[(20, 0)], head=('up', 23, 20), belt=28, lying=False),
    'deep': dict(clear=[(21, 14), (23, 18)], head=('up', 30, 23), belt=29, lying=False),
    'lying': dict(clear=[(31, 24)], head=('down', 24, 31), belt=16, lying=True),
}


def head_of(idle0):
    # Betowing's head: his first idle frame above the scarf; and the scarf's red straps under it,
    # as offsets from the head's bottom-left (they run down to the shoulders).
    px = idle0.load()
    neck = next(y for y in range(idle0.height) if any(px[x, y] in (SCARF[1], SCARF[0]) for x in range(idle0.width)))
    h = idle0.crop((0, 0, idle0.width, neck))
    b = h.getbbox()
    straps = [(x - b[0], y - b[3], px[x, y]) for y in range(neck, neck + 4) for x in range(idle0.width) if px[x, y] in (SCARF[1], SCARF[0])]
    return h.crop(b), straps


def trace(kframe, kind, head_straps):
    head, straps = head_straps
    t = TRACE[kind]
    w, h = kframe.size
    src = kframe.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    for y in range(h):
        for x in range(w):
            p = src[x, y]
            if not p[3] or any(y <= cy and x >= cx for cy, cx in t['clear']):
                continue
            along = x if t['lying'] else y
            upper = along >= t['belt'] if t['lying'] else along < t['belt']
            if p in KARMOUR:
                # (The jacket a shade brighter than the knight's steel: it's white.)
                c = JACKET[min(3, KARMOUR[p] + 1)] if upper else SUIT[KARMOUR[p]]
            elif p in KORANGE:
                # Orange: the belt next to the split, the boots at the far end.
                near = abs(along - t['belt']) <= 2
                c = BELT[KORANGE[p]] if near else BOOT[KORANGE[p] + 1]
            else:
                c = p
            o[x, y] = c
    way, hx, hy = t['head']
    # (Lying: turned so the neck meets the body, face down like the knight's.)
    hd = head if way == 'up' else head.rotate(-90, expand=True)
    if way == 'up':
        left = hx - hd.width + 1
        out.paste(hd, (left, hy - hd.height + 1), hd)
        # The red straps from the neck down to the shoulders, where they are standing.
        for dx, dy, c in straps:
            x, y = left + dx, hy + 1 + dy
            if 0 <= x < w and 0 <= y < h and o[x, y][3]:
                o[x, y] = c
    else:
        out.paste(hd, (hx, hy - hd.height + 1), hd)
        for y in range(hy - 6, hy):
            if o[hx - 1, y][3]:
                o[hx - 1, y] = SCARF[1] if y % 3 else SCARF[0]
    return out


def preview(dest, idle, run, stun, fall):
    """An animated look at every animation (idle, run, stun, falling asleep), 6x, for approval."""
    import os
    os.makedirs(dest, exist_ok=True)
    Z, W, H = 6, 64, 48
    def cell(img, cx):
        c = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        c.paste(img, (W // 2 - cx, H - img.height - 4), img)  # (a little floor under the feet)
        bg = Image.new('RGB', (W, H), (205, 208, 218))
        bg.paste(c, (0, 0), c)
        return bg.resize((W * Z, H * Z), Image.NEAREST)
    shots, times = [], []
    for k in range(8):
        shots.append(cell(idle[k % 4], 14)); times.append(167)
    for k in range(12):
        shots.append(cell(run[k % 6], 32)); times.append(83)
    shots.append(cell(stun, 14)); times.append(700)
    for f in fall:
        shots.append(cell(f, 14)); times.append(200)
    times[-1] = 1200
    shots[0].save(dest + '/betowing.gif', save_all=True, append_images=shots[1:], duration=times, loop=0)
    # And every frame side by side.
    strip = Image.new('RGB', (W * Z * 6, H * Z * 3), (236, 236, 240))
    for r, row in enumerate([[cell(f, 14) for f in idle], [cell(f, 32) for f in run], [cell(stun, 14)] + [cell(f, 14) for f in fall]]):
        for k, c in enumerate(row):
            strip.paste(c, (k * W * Z, r * H * Z))
    strip.save(dest + '/betowing-frames.png')


if __name__ == '__main__':
    import sys
    idle = [paint(f) for f in frames(ART + 'idle.png', 32)]
    run = [paint(f) for f in frames(ART + 'run.png', 64)]
    head = head_of(idle[0])
    kfall = frames(KNIGHT + 'fall.png', 48)
    stun = trace(Image.open(KNIGHT + 'stun.png').convert('RGBA'), 'crouch', head)
    # (Standing first: his own idle frame, on the knight's feet.)
    stand = Image.new('RGBA', (48, 32), (0, 0, 0, 0))
    stand.paste(idle[0], (0, 0), idle[0])
    fall = [stand, stun, trace(kfall[2], 'deep', head), trace(kfall[3], 'lying', head), trace(kfall[4], 'lying', head)]
    sleep = trace(Image.open(KNIGHT + 'sleep.png').convert('RGBA'), 'lying', head)
    if '--preview' in sys.argv:
        preview(sys.argv[sys.argv.index('--preview') + 1], idle, run, stun, fall)
        print('preview ok')
        raise SystemExit
    join(idle).save(OUT + 'idle.png')
    join(run).save(OUT + 'run.png')
    stun.save(OUT + 'stun.png')
    join(fall).save(OUT + 'fall.png')
    sleep.save(OUT + 'sleep.png')
    # His hands: the human hand as a white glove.
    hand = Image.open('public/art/hand.png').convert('RGBA')
    glove = {HEX('#be7134'): JACKET[2], HEX('#f0ae6c'): JACKET[3]}
    hand.putdata([glove.get(p, p) for p in hand.getdata()])
    hand.save('public/art/hand-betowing.png')
    print('ok')
