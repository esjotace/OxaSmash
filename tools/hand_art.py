"""The floating hands, from Pixel Crawler's Hands.png (2 hands across x 6 rows, 16 px each), as
they look on a character facing right (the game mirrors them facing left), trimmed:

  public/art/hand.png            people: row 2, the 2nd hand
  public/art/hand-skeleton.png   skeletons: row 4, the 1st hand, turned 90° counter-clockwise
  public/art/hand-orc.png        orcs: row 5, the 2nd hand

    python tools/hand_art.py
"""
from PIL import Image

HANDS = '../Assets/Pixel Crawler - Free Pack 2.11/Pixel Crawler - Free Pack/Weapons/Hands/Hands.png'
# file: (row, hand in the row, degrees counter-clockwise, mirrored), counting from 1.
PICKS = {'hand': (2, 2, 0, False), 'hand-skeleton': (4, 1, 90, False), 'hand-orc': (5, 2, 0, False)}


def main():
    sheet = Image.open(HANDS).convert('RGBA')
    for name, (row, col, turn, mirror) in PICKS.items():
        cell = sheet.crop(((col - 1) * 16, (row - 1) * 16, col * 16, row * 16)).rotate(turn)
        if mirror:
            cell = cell.transpose(Image.FLIP_LEFT_RIGHT)
        hand = cell.crop(cell.getbbox())
        hand.save(f'public/art/{name}.png')
        print(f'public/art/{name}.png', hand.size)


if __name__ == '__main__':
    main()
