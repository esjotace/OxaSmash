"""Art for the Ring of Cat and the polymorph potion, from the packs in ../Assets:

  public/art/cats/cat<N>-<anim>.png   the Pet Cats Pack's six cats (50x50 frames): idle, walk, run,
                                      sitting, laying, sleeping (its Sleeping2) and meow
  public/art/animals/<key>.png        Tiny Heroes Animals, side views (16x16 frames): 4 standing, 4
                                      walking (drawn standing on the first frame: retro, and funnier)
  public/art/catring.png              the ring (EazyD's emerald ring)
  public/art/polymorph.png            the potion (EazyD's rainbow potion)

The animal keys and their order are ANIMALS in src/sim/constants.js.

    python tools/critter_art.py
"""
import os
import shutil
from PIL import Image

ASSETS = '../Assets'
CATS = f'{ASSETS}/Pet Cats Pack'
SHEET = f'{ASSETS}/TIny Heroes Animals/spritesheet.png'
ICONS = f'{ASSETS}/eazyd-fantasy-rpg-icons_v1.5/eazyd-fantasy-rpg-icons/icons/16x16'
OUT = 'public/art'
CAT_ANIMS = {'idle': 'Idle', 'walk': 'Walk', 'run': 'Run', 'sitting': 'Sitting', 'laying': 'Laying', 'sleeping': 'Sleeping2', 'meow': 'Meow'}
# key: (row, first column standing, walking), in 16 px cells of the sheet's side views.
ANIMALS = {
    'snake': (0, 0, 4),
    'cobra': (0, 8, 12),
    'hamster': (9, 4, 4),
    'rat': (9, 12, 12),
    'pigeon': (15, 0, 0),
    'seagull': (15, 8, 8),
    'bear': (18, 0, 0),
    'blackbear': (18, 8, 8),
    'badger': (21, 0, 0),
    'wolf': (24, 0, 0),
    'fox': (24, 8, 12),
    'shiba': (27, 0, 0),
    'blackdog': (27, 4, 4),
}


def main():
    os.makedirs(f'{OUT}/cats', exist_ok=True)
    for n in range(1, 7):
        for key, name in CAT_ANIMS.items():
            shutil.copy(f'{CATS}/Cat-{n}/Cat-{n}-{name}.png', f'{OUT}/cats/cat{n}-{key}.png')
    print(f'{OUT}/cats: 6 cats x {len(CAT_ANIMS)}')

    os.makedirs(f'{OUT}/animals', exist_ok=True)
    sheet = Image.open(SHEET).convert('RGBA')
    for key, (row, *cols) in ANIMALS.items():
        strip = Image.new('RGBA', (16 * 8, 16))
        for k, col in enumerate(cols):
            for f in range(4):
                cell = sheet.crop(((col + f) * 16, row * 16, (col + f + 1) * 16, (row + 1) * 16))
                strip.paste(cell, ((k * 4 + f) * 16, 0))
        strip.save(f'{OUT}/animals/{key}.png')
    print(f'{OUT}/animals: {len(ANIMALS)}')

    shutil.copy(f'{ICONS}/ring_emerald.png', f'{OUT}/catring.png')
    shutil.copy(f'{ICONS}/potion_rainbow.png', f'{OUT}/polymorph.png')
    print(f'{OUT}/catring.png, {OUT}/polymorph.png')


if __name__ == '__main__':
    main()
