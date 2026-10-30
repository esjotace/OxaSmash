"""Art for the sleep weapons, recoloured from existing sprites (shading kept, colour swapped):

  public/art/snoozer.png   The Snoozer: the sniper in purple
  public/art/drowsy.png    the drowsy gas grenade: the smoke grenade in pink

    python tools/snooze_art.py
"""
from PIL import Image

ART = 'public/art'


def recolour(src, dst, dark, light, keep_outline=True):
    im = Image.open(f'{ART}/{src}.png').convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255
            if keep_outline and lum < 0.12:
                continue  # (the dark outline stays as it is)
            t = min(1.0, lum * 1.25)
            px[x, y] = tuple(round(d + (l - d) * t) for d, l in zip(dark, light)) + (a,)
    im.save(f'{ART}/{dst}.png')
    print(f'{ART}/{dst}.png', im.size)


def main():
    recolour('sniper', 'snoozer', (46, 18, 84), (214, 168, 255))
    recolour('smoke', 'drowsy', (110, 40, 80), (255, 196, 228))


if __name__ == '__main__':
    main()
