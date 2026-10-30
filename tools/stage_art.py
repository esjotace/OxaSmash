"""Art for the painted stages (El Pantano, El Castillo, Pinar Nevado, Ciudad Retro; see
src/game/scenery.js), cut from the packs in ../Assets into public/art/<theme>/. Only the pieces
the game uses are copied (the packs can't be redistributed whole).

  swamp/    CraftPix's free swamp tileset (32 px tiles): ground, ledges, thin ledges, water,
            background layers, willows, trees, bushes, stones, the fallen log (drifting platforms)
  castle/   Anokolisa's Legacy Dungeon (16 px): stone, brick, grass and dirt, wooden braces, the
            gothic window (and its panes), banner, hanging cage, vases; the sky and clouds behind
  pines/    GandalfHardcore's platformer assets (16 px): snowy ground, the winter background
            layers, pines, tents, the campfire, the portal, the blizzard
  retro/    Anokolisa's Action Pack CITY (16 px): rooftop stone, brick and teal walls, windows,
            the water tower, the truss bridge, neon, AC unit, bench, fence, bins

    python tools/stage_art.py
"""
import os
import shutil
from PIL import Image

A = '../Assets'
OUT = 'public/art'


def save(theme, name, im):
    os.makedirs(f'{OUT}/{theme}', exist_ok=True)
    im.save(f'{OUT}/{theme}/{name}.png')


def cells(sheet, size, col, row, w=1, h=1):
    return sheet.crop((col * size, row * size, (col + w) * size, (row + h) * size))


def biggest(im):
    """Just the largest connected shape in the picture (a tree, without a stump beside it)."""
    alpha = im.getchannel('A').load()
    w, h = im.size
    seen, best = set(), set()
    for y0 in range(h):
        for x0 in range(w):
            if (x0, y0) in seen or not alpha[x0, y0]:
                continue
            shape, stack = set(), [(x0, y0)]
            while stack:
                x, y = stack.pop()
                if (x, y) in seen or not (0 <= x < w and 0 <= y < h) or not alpha[x, y]:
                    continue
                seen.add((x, y))
                shape.add((x, y))
                stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
            if len(shape) > len(best):
                best = shape
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    for p in best:
        out.putpixel(p, im.getpixel(p))
    return out.crop(out.getbbox())


def swamp():
    base = f'{A}/free-swamp-game-tileset-pixel-art'
    t = Image.open(f'{base}/1 Tiles/Tileset.png').convert('RGBA')
    tile = lambda n: cells(t, 32, (n - 1) % 10, (n - 1) // 10)
    # Ground (a 3x3 slice), one-tile ledges, thin ledges, the water's surface.
    for name, n in {'g-tl': 1, 'g-t': 2, 'g-tr': 3, 'g-l': 11, 'g-m': 12, 'g-r': 14, 'g-bl': 21, 'g-b': 22, 'g-br': 23,
                    'l-one': 31, 'l-l': 32, 'l-m': 33, 'l-r': 34, 'th-l': 7, 'th-m': 8, 'th-r': 9, 'water': 10}.items():
        save('swamp', name, tile(n))
    for k in range(1, 6):
        save('swamp', f'bg{k}', Image.open(f'{base}/2 Background/Layers/{k}.png').convert('RGBA'))
    o = f'{base}/3 Objects'
    for name, path in {'willow1': 'Willows/1', 'willow2': 'Willows/2', 'willow3': 'Willows/3', 'tree1': 'Trees/1', 'tree2': 'Trees/2',
                       'bush1': 'Bushes/5', 'bush2': 'Bushes/7', 'bush3': 'Bushes/9', 'stone1': 'Stones/4', 'stone2': 'Stones/5',
                       'grass1': 'Grass/1', 'grass2': 'Grass/2', 'log': 'Ridges/1', 'stump': 'Ridges/2'}.items():
        save('swamp', name, Image.open(f'{o}/{path}.png').convert('RGBA'))


def castle():
    base = f'{A}/Legacy-Dungeon_V0.2_vacaroxa/Final/Assets'
    s = Image.open(f'{base}/Assets.png').convert('RGBA')
    c = lambda *a: cells(s, 16, *a)
    pieces = {
        # Stone floor tops (left, middle, right), the red brick under them, the purple back wall.
        'stone-l': c(4, 12), 'stone-m': c(5, 12), 'stone-r': c(6, 12), 'brick': c(13, 7), 'backwall': c(10, 11),
        # Grass and dirt (the floating islands).
        'grass-l': c(9, 3), 'grass-r': c(10, 3), 'dirt-l': c(9, 4), 'dirt-r': c(10, 4),
        # Looks only.
        'window': c(0, 6, 4, 7), 'banner': c(8, 1, 1, 2), 'cage': c(7, 2, 2, 4), 'vase': c(19, 0),
        # The wooden braces under a stone ledge.
        'braces': c(7, 7, 4, 1),
    }
    # The window's panes (see-through in the art, enclosed by its frame), as their own shape: sky
    # shows through them. (See-through pixels that reach the picture's edge are outside it.)
    win = pieces['window']
    a = win.getchannel('A').load()
    w, h = win.size
    outside, stack = set(), [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        if (x, y) in outside or not (0 <= x < w and 0 <= y < h) or a[x, y]:
            continue
        outside.add((x, y))
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    pane = Image.new('RGBA', win.size, (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            if not a[x, y] and (x, y) not in outside:
                pane.putpixel((x, y), (168, 216, 255, 255))
    print('panes:', sum(1 for p in pane.getdata() if p[3]), 'px')
    pieces['pane'] = pane
    # (And the window's dark backdrop, the square around the arch, cut out: the castle's own wall
    # shows there.)
    px = win.load()
    back = px[0, h - 1]
    near = lambda c: c[3] and sum(abs(c[i] - back[i]) for i in range(3)) < 24
    stack, seen = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)], set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h) or not near(px[x, y]):
            continue
        seen.add((x, y))
        px[x, y] = (0, 0, 0, 0)
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    print('window backdrop cut:', len(seen), 'px')
    for name, im in pieces.items():
        save('castle', name, im)
    save('castle', 'sky', Image.open(f'{base}/Background_2.png').convert('RGBA'))
    save('castle', 'clouds', Image.open(f'{base}/Background_1.png').convert('RGBA'))


def pines():
    base = f'{A}/GandalfHardcore FREE Platformer Assets'
    s = Image.open(f'{base}/Floor Tiles1.png').convert('RGBA')
    c = lambda *a: cells(s, 16, *a)
    # Snowy ground (a 3x3 slice from the snowy block, rows 24-29).
    for name, (col, row) in {'g-tl': (0, 24), 'g-t': (1, 24), 'g-tr': (5, 24), 'g-l': (0, 25), 'g-m': (1, 25), 'g-r': (5, 25),
                             'g-bl': (0, 29), 'g-b': (1, 29), 'g-br': (5, 29)}.items():
        save('pines', name, c(col, row))
    for k in range(1, 6):
        save('pines', f'bg{k}', Image.open(f'{base}/GandalfHardcore Background layers/Winter BG/GandalfHardcore Background layers_layer {k}.png').convert('RGBA'))
    trees = Image.open(f'{base}/Pine Trees.png').convert('RGBA')
    # (The sheet's pines, each cut to itself: split where a column is empty all the way down.)
    alpha = trees.getchannel('A')
    empty = [not any(alpha.getpixel((x, y)) for y in range(trees.height)) for x in range(trees.width)]
    k, x = 0, 0
    while x < trees.width:
        if empty[x]:
            x += 1
            continue
        end = x
        while end < trees.width and not empty[end]:
            end += 1
        part = trees.crop((x, 0, end, trees.height))
        if end - x >= 24:
            k += 1
            save('pines', f'pine{k}', biggest(part))
        x = end
    for name, path in {'bigpine': 'Large Pine Tree', 'tent': 'Small Tent', 'bigtent': 'Large Tent'}.items():
        im = Image.open(f'{base}/{path}.png').convert('RGBA')
        save('pines', name, im.crop(im.getbbox()))
    shutil.copy(f'{base}/Animated Sprites/GandalfHardcore Portal sheet.png', f'{OUT}/pines/portal.png')
    shutil.copy(f'{base}/Animated Sprites/Campfire sheet.png', f'{OUT}/pines/campfire.png')
    # The blizzard (484x274 frames), at half size: it's drawn over the whole screen anyway.
    bl = Image.open(f'{base}/Snow blizzard sheet frame size 484x274.png').convert('RGBA')
    save('pines', 'blizzard', bl.resize((bl.width // 2, bl.height // 2), Image.NEAREST))


def retro():
    base = f'{A}/Action Pack - CITY/Action Pack - CITY/Assets'
    s = Image.open(f'{base}/Assets_City.png').convert('RGBA')
    c = lambda *a: cells(s, 16, *a)
    pieces = {
        # The roof's white coping (over brick), the walls under it (red brick, teal), a window.
        'roof': c(1, 0), 'brick': c(3, 0), 'teal': c(7, 3), 'window': c(0, 4, 2, 2),
        # The truss bridge's deck and its frame.
        'deck': c(6, 11), 'truss': c(6, 12, 1, 2), 'truss-v': c(7, 12, 2, 1),
        # Looks only.
        'tower': c(4, 9, 2, 3), 'neon': c(5, 5, 1, 2), 'ac': c(4, 7, 2, 2), 'bench': c(7, 8, 3, 2), 'fence': c(5, 1, 4, 1),
        'bin': c(8, 1), 'bush': c(11, 8, 2, 1), 'vent': c(14, 4, 2, 3), 'stripes': c(13, 8, 3, 1), 'awning': c(1, 7, 2, 1),
    }
    # (The water tower is drawn on the sheet's sky: keyed out.)
    sky = (105, 158, 252, 255)
    pieces['tower'] = Image.eval(pieces['tower'], lambda v: v)
    pieces['tower'].putdata([(0, 0, 0, 0) if p == sky else p for p in pieces['tower'].getdata()])
    for name, im in pieces.items():
        save('retro', name, im)


def main():
    swamp()
    castle()
    pines()
    retro()
    for theme in ['swamp', 'castle', 'pines', 'retro']:
        print(theme, sorted(os.listdir(f'{OUT}/{theme}')))


if __name__ == '__main__':
    main()
