"""Hands for characters whose hands are neither bare skin nor the orcs' or skeletons': the human hand
(public/art/hand.png) in the colours their hands are on their sprite. Writes
public/art/hand-<name>.png for each (see OWN_HANDS in src/game/cast.js).

    python tools/hand_tints.py
"""
from PIL import Image

HEX = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
# The human hand's two colours (dark, light), and each character's instead.
HAND = (HEX('#be7134'), HEX('#f0ae6c'))
TINTS = {
    'knight': ('#5c8ea5', '#8ac6e0'),  # steel-blue gauntlets
    'turtle': ('#4a6e3a', '#74965a'),  # olive gauntlets
    'saopato': ('#c4900c', '#f2c41c'),  # yellow
    'caballero-pato-real': ('#7a828c', '#b0b8c0'),  # grey
    'caballero-pato-falso': ('#a6acb6', '#dde1e6'),  # white-grey
    'frampersand': ('#20202e', '#3a3a52'),  # dark gloves (Frampersand.dev borrows them)
}

if __name__ == '__main__':
    for name, (dark, light) in TINTS.items():
        hand = Image.open('public/art/hand.png').convert('RGBA')
        swap = {HAND[0]: HEX(dark), HAND[1]: HEX(light)}
        hand.putdata([swap.get(p, p) for p in hand.getdata()])
        hand.save(f'public/art/hand-{name}.png')
    print('ok')
