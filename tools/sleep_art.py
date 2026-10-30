"""The sleeping pose for every character (public/art/chars/<char>-sleep.png): the last frame of
its death animation, the body lying flat, cut at the same frame size as its stun pose (the death
animation's early frame) so both line up the same way when drawn. And how they get there
(<char>-fall.png): the death animation up to that pose, frames side by side at that size.

Knight, Rogue and Wizard: from the death sheets already in public/art/chars. The orcs and
skeletons: from the Pixel Crawler pack in ../Assets.

    python tools/sleep_art.py
"""
from PIL import Image

CHARS = 'public/art/chars'
MOBS = '../Assets/Pixel Crawler - Free Pack 2.11/Pixel Crawler - Free Pack/Entities/Mobs'
SHEETS = {
    'knight': f'{CHARS}/knight-death.png',
    'rogue': f'{CHARS}/rogue-death.png',
    'wizard': f'{CHARS}/wizard-death.png',
    'orc': f'{MOBS}/Orc Crew/Orc/Death/Death-Sheet.png',
    'orc-rogue': f'{MOBS}/Orc Crew/Orc - Rogue/Death/Death-Sheet.png',
    'orc-shaman': f'{MOBS}/Orc Crew/Orc - Shaman/Death/Death-Sheet.png',
    'orc-warrior': f'{MOBS}/Orc Crew/Orc - Warrior/Death/Death-Sheet.png',
    'skeleton': f'{MOBS}/Skeleton Crew/Skeleton - Base/Death/Death-Sheet.png',
    'skeleton-mage': f'{MOBS}/Skeleton Crew/Skeleton - Mage/Death/Death-Sheet.png',
    'skeleton-rogue': f'{MOBS}/Skeleton Crew/Skeleton - Rogue/Death/Death-Sheet.png',
    'skeleton-warrior': f'{MOBS}/Skeleton Crew/Skeleton - Warrior/Death/Death-Sheet.png',
}
# Picked by eye where the automatic pick isn't lying down (1 = the first frame).
FRAME = {'orc-warrior': 6, 'skeleton-mage': 4, 'skeleton-rogue': 5, 'skeleton-warrior': 5}


def opaque(im):
    return sum(1 for a in im.getchannel('A').getdata() if a > 0)


def main():
    for char, path in SHEETS.items():
        sheet = Image.open(path).convert('RGBA')
        w = Image.open(f'{CHARS}/{char}-stun.png').width
        frames = [sheet.crop((k * w, 0, (k + 1) * w, sheet.height)) for k in range(sheet.width // w)]
        # The last frame that's still a whole body (some animations fade or crumble away at the end).
        most = max(opaque(f) for f in frames)
        pose = frames[FRAME[char] - 1] if char in FRAME else [f for f in frames if opaque(f) >= most * 0.6][-1]
        pose.save(f'{CHARS}/{char}-sleep.png')
        at = frames.index(pose)
        fall = Image.new('RGBA', (w * (at + 1), sheet.height))
        for k in range(at + 1):
            fall.paste(frames[k], (k * w, 0))
        fall.save(f'{CHARS}/{char}-fall.png')
        print(char, pose.size, frames.index(pose) + 1, 'of', len(frames))


if __name__ == '__main__':
    main()
