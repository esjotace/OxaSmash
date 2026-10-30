"""A look at a character's animations before it goes in the game: an animated GIF (idle, run, the
stun pose, falling asleep, at game speed) and every frame side by side, for one or more looks.

    preview(dest, 'name', {'look': (idle, run, stun, fall, sleep)}, feet=14)

feet: where the feet are (x) in the stun and fall frames (the idle and run frames are centred).
"""
import os
import time
from PIL import Image

Z, W, H = 5, 64, 48


def cell(img, cx):
    c = Image.new('RGB', (W, H), (205, 208, 218))
    c.paste(img, (W // 2 - cx, H - img.height - 4), img)  # (a little floor under the feet)
    return c.resize((W * Z, H * Z), Image.NEAREST)


def save(img, path, **opts):
    """Saved beside the file, then swapped in: an image viewer holding the old one open (Windows
    won't overwrite it then) only delays it a moment."""
    tmp = path + '.tmp' + os.path.splitext(path)[1]
    img.save(tmp, **opts)
    for _ in range(20):
        try:
            os.replace(tmp, path)
            return
        except OSError:
            time.sleep(0.25)
    os.replace(tmp, path)


def preview(dest, name, looks, feet=14):
    os.makedirs(dest, exist_ok=True)
    mid = lambda f: f.width // 2

    def beat(pick):
        f = Image.new('RGB', (W * Z * len(looks), H * Z))
        for i, (idle, run, stun, fall, sleep) in enumerate(looks.values()):
            f.paste(cell(*pick(idle, run, stun, fall)), (i * W * Z, 0))
        return f
    shots, times = [], []
    for k in range(8):
        shots.append(beat(lambda i, r, s, f: (i[k % 4], mid(i[0]) - 2))); times.append(167)
    for k in range(12):
        shots.append(beat(lambda i, r, s, f: (r[k % 6], mid(r[0])))); times.append(83)
    shots.append(beat(lambda i, r, s, f: (s, feet))); times.append(700)
    for k in range(len(next(iter(looks.values()))[3])):
        shots.append(beat(lambda i, r, s, f: (f[min(k, len(f) - 1)], feet))); times.append(200)
    times[-1] = 1200
    save(shots[0], f'{dest}/{name}.gif', save_all=True, append_images=shots[1:], duration=times, loop=0)
    sheet = Image.new('RGB', (W * Z * 7, H * Z * 3 * len(looks)), (236, 236, 240))
    for j, (idle, run, stun, fall, sleep) in enumerate(looks.values()):
        rows = [[(f, mid(f) - 2) for f in idle], [(f, mid(f)) for f in run], [(stun, feet)] + [(f, feet) for f in fall]]
        for r, row in enumerate(rows):
            for k, (f, cx) in enumerate(row):
                sheet.paste(cell(f, cx), (k * W * Z, (j * 3 + r) * H * Z))
    save(sheet, f'{dest}/{name}-frames.png')
