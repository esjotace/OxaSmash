"""The dungeon's thin wood, cut from its own tileset (public/art/dungeon/tiles.png), some of it turned
on its side, into public/art/dungeon/wood.png (see WOOD in src/game/dungeon.js):

  rotten  96 x 11  the tall board strip down the tileset's left edge, on its side, top 11 rows:
                   patchy boards with gaps and nails (the crumbling floor: about to give)
  board   48 x 8   one board of the plank wall at the top, on its side, bottom 8 rows: a clean
                   board (thin ledges, drawbridges, lifts)
  brace   16 x 16  the diagonal brace under the frame block (a ledge's support; mirrored for the
                   other end)

Each is lightened a little (LIGHTEN) and given a pale top edge (the surface you stand on), so it
stands out against the dark red brick wall behind it.

    python tools/dungeon_wood.py
"""
from PIL import Image, ImageEnhance

SRC = 'public/art/dungeon/tiles.png'
OUT = 'public/art/dungeon/wood.png'
LIGHTEN = 1.35
EDGE = (214, 160, 120, 255)  # the pale top edge


def standout(im, edge=True):
    """Lightened, and (edge) a pale line along the top of each column's first solid pixel."""
    rgb = ImageEnhance.Brightness(im).enhance(LIGHTEN)
    if edge:
        px = rgb.load()
        for x in range(rgb.width):
            for y in range(rgb.height):
                if px[x, y][3]:
                    px[x, y] = EDGE
                    break
    return rgb


def main():
    t = Image.open(SRC).convert('RGBA')
    rotten = t.crop((0, 0, 16, 96)).rotate(90, expand=True).crop((0, 0, 96, 11))
    board = t.crop((144, 0, 160, 48)).rotate(90, expand=True).crop((0, 8, 48, 16))
    brace = t.crop((112, 112, 128, 128))
    out = Image.new('RGBA', (96, 27), (0, 0, 0, 0))
    out.alpha_composite(standout(rotten), (0, 0))
    out.alpha_composite(standout(board), (0, 11))
    out.alpha_composite(standout(brace, edge=False), (48, 11))
    out.save(OUT)
    print(f'{OUT}: rotten (0,0,96,11), board (0,11,48,8), brace (48,11,16,16)')


if __name__ == '__main__':
    main()
