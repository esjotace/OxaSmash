"""Art for the night stages (La Bajaita, La Azotea; see src/game/night.js), from the packs in
../Assets, into public/art/night/:

  moon.png        the crescent moon from the Legacy Vania village promo art (Social/Village-03),
                  cut out at its real pixel size (the promo is drawn 4x) and turned moonlight-pale
  city1..4.png    the night-city skyline layers of CraftPix's Exclusion Zone pack (2 Background/
                  Night/2..5, plain silhouettes, trimmed to the skyline; tinted in the game)

    python tools/night_art.py
"""
import os
from PIL import Image

ASSETS = '../Assets'
OUT = 'public/art/night'
VILLAGE = f'{ASSETS}/Legacy Vania Pack - Village - Update 0.4/Legacy Vania Pack - Village - Update 0.4/Social/Village-03.png'
NIGHT = f'{ASSETS}/free-exclusion-zone-tileset-pixel-art/2 Background/Night'
SCALE = 4  # the promo art's pixel size
MOON_BOX = (1150, 0, 1400, 170)  # an area around the moon in the promo art (the moon: its largest shape)
MOONLIGHT = (242, 236, 214)


def moon():
    im = Image.open(VILLAGE).convert('RGB').crop(MOON_BOX)
    sky = im.getpixel((2, 2))
    near = lambda c: sum(abs(c[i] - sky[i]) for i in range(3)) < 60
    w, h = im.size
    # The moon: the largest shape that isn't sky (not the cloud, branches or towers beside it).
    sw, sh = w // SCALE, h // SCALE
    at = lambda x, y: im.getpixel((x * SCALE + SCALE // 2, y * SCALE + SCALE // 2))
    seen, best = set(), set()
    for y0 in range(sh):
        for x0 in range(sw):
            if (x0, y0) in seen or near(at(x0, y0)):
                continue
            shape, stack = set(), [(x0, y0)]
            while stack:
                x, y = stack.pop()
                if (x, y) in seen or not (0 <= x < sw and 0 <= y < sh) or near(at(x, y)):
                    continue
                seen.add((x, y))
                shape.add((x, y))
                stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
            if len(shape) > len(best):
                best = shape
    out = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    for y in range(sh):
        for x in range(sw):
            c = at(x, y)
            if (x, y) in best:
                # Moonlight: its own shading kept (darker parts a little dimmer).
                k = (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 160
                out.putpixel((x, y), tuple(min(255, int(v * min(1.0, 0.75 + 0.25 * k))) for v in MOONLIGHT) + (255,))
    return out.crop(out.getbbox())


def main():
    os.makedirs(OUT, exist_ok=True)
    m = moon()
    m.save(f'{OUT}/moon.png')
    print(f'{OUT}/moon.png {m.size}')
    for k in range(2, 6):
        im = Image.open(f'{NIGHT}/{k}.png').convert('RGBA')
        # (Trimmed to the skyline itself: its tallest point is the top of the picture.)
        box = im.getbbox()
        im.crop((0, box[1], im.width, box[3])).save(f'{OUT}/city{k - 1}.png')
    print(f'{OUT}/city1..4.png')


if __name__ == '__main__':
    main()
