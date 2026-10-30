"""Bugbicho: the rogue's frames (public/art/chars/rogue-*) repainted as a brawny beetle knight, in
three looks (rhino, stag, lady): dark cinnamon skin, a dark beard and heavy brows under a beetle
helmet, shoulder pads. Same poses and timing as the rogue. Writes

  public/art/chars/bugbicho-<look>-idle|run|stun|fall|sleep.png
  public/art/hand-bugbicho.png

    python tools/bugbicho_art.py
"""
from PIL import Image

ART = 'public/art/chars/rogue-'

HEX = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
OUTLINE = HEX('#141412')
ROLE = {
    '#252716': ('H', 0), '#373a20': ('H', 1), '#5f5625': ('H', 2), '#928230': ('H', 3),
    '#1c3845': ('F', 0), '#0c98d6': ('E', 0),
    '#331e32': ('M', 0), '#5f2e5c': ('M', 1), '#932d8b': ('M', 2),
    '#47280d': ('B', 0), '#b56c30': ('B', 1), '#f09a53': ('B', 2),
    '#141412': ('O', 0),
}
ROLE = {HEX(k): v for k, v in ROLE.items()}

SKIN = [HEX('#4a2a18'), HEX('#6e3f22'), HEX('#93582f')]  # dark cinnamon: shadow, base, light
HAIR = [HEX('#1a100b'), HEX('#2e1c12'), HEX('#43291a')]  # beard and brows
EYE = HEX('#efe2c8')

LOOKS = {
    # rhinoceros beetle: blue-black chitin, one horn
    'rhino': dict(shell=[HEX('#0e1024'), HEX('#1a1f42'), HEX('#2b3670'), HEX('#5d7ccc')], belt=[HEX('#3a2312'), HEX('#c8902a'), HEX('#f2c45a')], horn=True, antennae=False),
    # stag beetle: metallic green, antennae and side pincers
    'stag': dict(shell=[HEX('#0b1f19'), HEX('#143d30'), HEX('#22684a'), HEX('#6fcf7e')], belt=[HEX('#3a2312'), HEX('#b8862a'), HEX('#ecc060')], horn=False, antennae=True),
    # ladybug: red shell with black spots, antennae
    'lady': dict(shell=[HEX('#3a0c10'), HEX('#7a1620'), HEX('#c42a2a'), HEX('#ff7a5c')], belt=[HEX('#3a2312'), HEX('#c8902a'), HEX('#f2c45a')], horn=False, antennae=True, spots=True),
}


def roles(im):
    w, h = im.size
    g = [[None] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            p = im.getpixel((x, y))
            if p[3]:
                g[y][x] = ROLE.get(p, ('?', 0))
    return g


def paint(src, look, upright=True):
    L = LOOKS[look]
    w, h = src.size
    g = roles(src)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = out.load()
    rows = [y for y in range(h) if any(g[y])]
    if not rows:
        return out
    top, bottom = rows[0], rows[-1]
    # The face: dark pixels (outline, face shadow, eyes) inside the hood, between hood/scarf on both sides.
    face = set()
    eye_row = None
    for y in range(h):
        solid = [x for x in range(w) if g[y][x] and g[y][x][0] in 'HM']
        if len(solid) < 2:
            continue
        for x in range(min(solid) + 1, max(solid)):
            r = g[y][x]
            if r and r[0] in 'OFE' and any(g[y][k] and g[y][k][0] in 'HM' for k in range(x)) and any(g[y][k] and g[y][k][0] in 'HM' for k in range(x + 1, w)):
                face.add((x, y))
                if r[0] == 'E':
                    eye_row = y
    scarf_rows = [y for y in range(h) if any(g[y][x] and g[y][x][0] == 'M' for x in range(w))]
    face_bottom = max(scarf_rows) if scarf_rows else (eye_row or top) + 3
    belt_rows = [y for y in range(face_bottom + 1, h) if any(g[y][x] and g[y][x] == ('B', 0) for x in range(w))]
    belt_top = belt_rows[0] if belt_rows else None
    feet = bottom - 4
    for y in range(h):
        for x in range(w):
            r = g[y][x]
            if not r:
                continue
            kind, k = r
            c = OUTLINE
            if (x, y) in face and (not upright or eye_row is None):
                c = HAIR[0] if kind == 'O' else HAIR[1]  # lying down: hair and beard, no face
            elif (x, y) in face:
                if eye_row is not None and y == eye_row - 1:
                    c = HAIR[0]  # brows
                elif kind == 'E':
                    c = EYE
                elif eye_row is not None and y > eye_row:
                    c = HAIR[1] if (x + y) % 3 else HAIR[2]  # beard
                else:
                    c = SKIN[1] if kind != 'O' or (x, y - 1) in face else SKIN[0]
            elif kind == 'H':
                c = L['shell'][[0, 1, 1, 2][k]]
                # (A glossy glint: the lightest olive's top pixels get the highlight.)
                if k == 3 and y > 0 and g[y - 1][x] and g[y - 1][x][0] == 'O':
                    c = L['shell'][3]
                if L.get('spots') and k >= 2 and (x * 5 + y * 3) % 7 == 0:
                    c = OUTLINE
            elif kind == 'M':
                c = HAIR[min(2, k)]  # the scarf becomes the beard
            elif kind == 'B':
                if upright and y >= feet:
                    c = L['shell'][[0, 2, 3][k]]  # chitin boots
                elif belt_top is not None and abs(y - belt_top) <= 2 and k < 2:
                    c = L['belt'][k]
                else:
                    c = SKIN[min(2, k)]  # the hand
            elif kind == 'F':
                c = SKIN[0]
            px[x, y] = c
    if upright and eye_row is not None:
        # Bushy brows: one pixel wider than the face on the front side.
        fx = [x for (x, y) in face if y == eye_row - 1]
        if fx:
            px[max(fx), eye_row - 1] = HAIR[0]
        # Brawny: the chest and shoulders a pixel wider on each side.
        lo, hi = face_bottom + 1, (belt_top or face_bottom + 6) - 1
        for y in range(lo, hi + 1):
            xs = [x for x in range(w) if px[x, y][3]]
            if not xs:
                continue
            a, b = min(xs), max(xs)
            if a > 0:
                px[a - 1, y] = OUTLINE
                px[a, y] = L['shell'][1]
            if b < w - 1:
                px[b + 1, y] = OUTLINE
                px[b, y] = L['shell'][2]
        sh = L['shell']
        # The head: the hood is cut away above the brows and a rounded beetle helmet goes on instead,
        # brim right over the brows, so the face shows as brows, eyes and beard.
        fx = sorted(x for (x, y) in face if y == eye_row)
        cx = (fx[0] + fx[-1]) // 2
        brim = eye_row - 2
        for y in range(0, brim + 1):
            for x in range(w):
                px[x, y] = (0, 0, 0, 0)
        # (Half-widths from the top of the dome down to the brim; the brim juts one pixel forward.)
        profile = [3, 5, 6, 7, 7, 7]
        helmet = []
        for i, hw in enumerate(profile):
            y = brim - len(profile) + 1 + i
            x0, x1 = cx - hw, cx + hw + (1 if i == len(profile) - 1 else 0)
            for x in range(x0, x1 + 1):
                if not (0 <= x < w and y >= 0):
                    continue
                u = (x - x0) / max(1, x1 - x0)
                c = sh[1] if u < 0.3 else sh[2]
                if i <= 1 and 0.45 < u < 0.8:
                    c = sh[3]  # the shine on top
                if i == len(profile) - 1:
                    c = sh[1] if u < 0.85 else sh[2]  # the brim
                if L.get('spots') and i in (2, 3) and (x - x0) % 4 == 1:
                    c = OUTLINE
                px[x, y] = c
                helmet.append((x, y))
        # A ridge down the middle of the dome (where a beetle's wing cases meet).
        for i in range(1, len(profile) - 1):
            y = brim - len(profile) + 1 + i
            if 0 <= cx - 1 < w and not L.get('spots'):
                px[cx - 1, y] = sh[0]
        add_outline(px, w, h, helmet)
        # Fill any gap between the brim and the brows on the sides with shell (cheek guards).
        for x in range(cx - 7, cx + 8):
            if 0 <= x < w and px[x, brim + 1][3] == 0 and px[x, brim + 2][3]:
                px[x, brim + 1] = OUTLINE
        hy = brim - len(profile) + 1
        front, back = cx + profile[0], cx - profile[0]
        # Shoulder pads: rounded shell plates, the back one bigger, sticking out past the body.
        y0 = face_bottom + 1
        xs = [x for x in range(w) if px[x, y0][3]]
        if xs:
            a, b = min(xs), max(xs)
            pads = []
            for (left, rows) in ((a - 2, [(1, 5), (0, 6), (0, 6), (1, 5)]), (b - 3, [(1, 4), (0, 5), (0, 5), (1, 4)])):
                for dy, (s0, e0) in enumerate(rows):
                    for x in range(left + s0, left + e0):
                        y = y0 - 1 + dy
                        if 0 <= x < w and 0 <= y < h:
                            px[x, y] = sh[3] if dy == 0 and s0 + 1 < x - left < e0 - 1 else sh[2] if dy <= 1 else sh[1]
                            if L.get('spots') and dy == 2 and (x - left) % 3 == 1:
                                px[x, y] = OUTLINE
                            pads.append((x, y))
            add_outline(px, w, h, pads)
        if L['horn']:
            # A rhino horn: from the front of the dome, curving up and forward.
            pts = [(cx + 3, hy + 1), (cx + 4, hy), (cx + 5, hy - 1), (cx + 6, hy - 2), (cx + 6, hy - 3), (cx + 6, hy - 4), (cx + 5, hy - 5)]
            for (x, y) in pts:
                for xx in (x, x - 1):
                    if 0 <= xx < w and y >= 0:
                        px[xx, y] = sh[2]
                if 0 <= x < w and y >= 0:
                    px[x, y] = sh[3]
            add_outline(px, w, h, [(xx, y) for (x, y) in pts for xx in (x, x - 1)])
        if L['antennae']:
            # Two antennae from the dome, swept back, with a light tip.
            for base in (cx - 2, cx + 2):
                pts = [(base, hy - 1), (base - 1, hy - 2), (base - 2, hy - 3), (base - 3, hy - 4), (base - 4, hy - 4)]
                for (x, y) in pts:
                    if 0 <= x < w and y >= 0:
                        px[x, y] = OUTLINE
                x, y = pts[-1]
                if 0 <= x < w and y >= 0:
                    px[x, y] = sh[3]
        if look == 'stag':
            # Pincers: two hooks out of the brim's front, curving in.
            pts = [(cx + 8, brim - 1), (cx + 9, brim - 1), (cx + 10, brim), (cx + 10, brim + 1), (cx + 9, brim + 2), (cx + 8, brim + 1), (cx + 9, brim + 1)]
            pts = [(x, y) for (x, y) in pts if 0 <= x < w]
            for (x, y) in pts:
                px[x, y] = sh[2]
            add_outline(px, w, h, pts)
    return out


def add_outline(px, w, h, pts):
    s = set(pts)
    for (x, y) in pts:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            X, Y = x + dx, y + dy
            if 0 <= X < w and 0 <= Y < h and (X, Y) not in s and px[X, Y][3] == 0:
                px[X, Y] = OUTLINE


# Headroom added above the 32 px tall frames, so the horn and antennae aren't cut off (the game
# draws characters from their feet up: see IDLE_H in src/game/cast.js).
PAD = 8


def strip(name, fw, fh, look, upright=True, pad=0):
    src = Image.open(ART + name + '.png').convert('RGBA')
    out = Image.new('RGBA', (src.width, src.height + pad), (0, 0, 0, 0))
    for k in range(src.width // fw):
        fr = Image.new('RGBA', (fw, fh + pad), (0, 0, 0, 0))
        fr.paste(src.crop((k * fw, 0, k * fw + fw, fh)), (0, pad))
        # (The sleep strip starts standing: its first two frames get the face and the bug parts.)
        fr = paint(fr, look, upright or k < 2)
        out.paste(fr, (k * fw, 0), fr)
    return out


def game_files(dest):
    # Every file the game loads per character (see MatchScene.js), named bugbicho-<look>-*.
    for look in LOOKS:
        for name, fw, fh, up in (('idle', 32, 32, True), ('run', 64, 64, True), ('stun', 64, 32, True), ('fall', 64, 32, False), ('sleep', 64, 32, False)):
            strip(name, fw, fh, look, up, 0 if name == 'run' else PAD).save(f'{dest}/bugbicho-{look}-{name}.png')
    # Their hand: the human hand in dark cinnamon.
    hand = Image.open(dest + '/../hand.png').convert('RGBA')
    swap = {HEX('#be7134'): SKIN[1], HEX('#f0ae6c'): SKIN[2]}
    hand.putdata([swap.get(p, p) for p in hand.getdata()])
    hand.save(dest + '/../hand-bugbicho.png')


if __name__ == '__main__':
    game_files('public/art/chars')
    print('ok')
