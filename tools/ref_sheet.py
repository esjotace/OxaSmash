"""Reference sheets for drawing new frames or new characters (with an AI or by hand): a character's
idle, run and sleep frames lined up on one anchor, enlarged and labelled, plus the same at real size
and a brief. Writes ../workshop/ai-sheet/<character>/<character>-sheet.png, -sheet-1x.png, BRIEF.md.

    python tools/ref_sheet.py                 every character below
    python tools/ref_sheet.py skeleton-warrior
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ART = 'public/art/chars/'
OUT = '../workshop/ai-sheet/'
CW, CH = 80, 64  # every frame goes in a cell this size, feet on the bottom, body centred at CW / 2
S = 6  # enlargement of the labelled sheet

# What each one looks like, for the brief (and what to call it in the prompts).
LOOKS = {
    'knight': ('a small armoured knight', 'Steel-blue full plate armour and a closed helmet with a dark visor slit, with a brown belt and boots.'),
    'wizard': ('a small wizard', 'A purple robe and a pointed purple hat with an orange band, a big white beard, orange skin and a brown belt.'),
    'orc': ('a small orc', 'Green skin, long pointed ears and a bald head; bare green arms, brown trousers with a belt, dark boots.'),
    'orc-rogue': ('a small orc rogue', 'A green orc with long pointed ears under a brown leather hood, a brown leather tunic with a belt and green trousers.'),
    'orc-warrior': ('a big orc warrior', 'A bulky green orc with a red mohawk, blue steel armour plates, a grey fur cape over one shoulder and a brown belt.'),
    'skeleton': ('a small skeleton', 'Bare beige bones: a big round skull with dark eye sockets, a ribcage and thin bone limbs. No clothes.'),
    'skeleton-mage': ('a skeleton mage', 'A big skull over a long red robe with a gold hem and a small blue clasp at the chest; the robe hides the legs.'),
    'skeleton-rogue': ('a skeleton rogue', 'A skull inside a pointed red hood and cloak, a blue-grey vest and thin bone legs.'),
    'skeleton-warrior': ('a skeleton knight', 'A big beige skull over blue steel armour: a chest plate and round pauldrons, with red cloth at the waist and thin bone legs.'),
}


def frames(strip, pitch):
    return [strip.crop((k * pitch, 0, k * pitch + pitch, strip.height)) for k in range(strip.width // pitch)]


def fall_pitch(strip, guess):
    # The fall strip's real frame width: one that cuts no body in half and leaves no frame empty.
    for p in sorted({guess, 32, 48, 64, 80, 96, 128}):
        if strip.width % p:
            continue
        fs = frames(strip, p)
        if all(f.getbbox() for f in fs) and not any(f.getbbox()[2] == p and fs[k + 1].getbbox()[0] == 0 for k, f in enumerate(fs[:-1])):
            return p
    return guess


def place(fs, anchor=None, left=None):
    """Frames into cells: bottom on the cell's bottom (the strip's lowest point), the first frame's
    body centred (or `anchor`: its x in the frame), or the frame's left edge at `left` in the cell."""
    boxes = [f.getbbox() for f in fs]
    bottom = max(b[3] for b in boxes)
    ax = anchor if anchor is not None else (boxes[0][0] + boxes[0][2]) / 2
    cells = []
    for f, b in zip(fs, boxes):
        cell = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
        x = round(left - b[0]) if left is not None else round(CW / 2 - ax)
        cell.paste(f, (x, CH - bottom), f)
        if f.crop(b).size != cell.crop(cell.getbbox()).size:
            print('  (cut off in a cell: widen CW/CH)')
        cells.append((cell, x + b[0]))
    return cells


def build(c):
    idle = frames(Image.open(f'{ART}{c}-idle.png').convert('RGBA'), 32)
    run = frames(Image.open(f'{ART}{c}-run.png').convert('RGBA'), 64)
    stun_w = Image.open(f'{ART}{c}-stun.png').width
    fall_img = Image.open(f'{ART}{c}-fall.png').convert('RGBA')
    fall = frames(fall_img, fall_pitch(fall_img, stun_w))
    sleep = Image.open(f'{ART}{c}-sleep.png').convert('RGBA')
    fall_cells = place(fall)
    # (The lying pose last, lined up with the end of the fall.)
    sleep_cell = place([sleep], left=fall_cells[-1][1])[0]
    rows = [
        ('IDLE', [x for x, _ in place(idle)], '6 fps, loops'),
        ('RUN', [x for x, _ in place(run)], '12 fps, loops. The last frame is also the jump / air pose'),
        ('SLEEP', [x for x, _ in fall_cells] + [sleep_cell[0]], 'about 8 fps, plays once: dozes off and ends lying down asleep (the last frame is held)'),
    ]
    dest = f'{OUT}{c}/'
    os.makedirs(dest, exist_ok=True)
    n = max(len(r[1]) for r in rows)
    font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 34)
    small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 22)
    label = 300
    rowh = CH * S + 60
    big = Image.new('RGBA', (label + n * CW * S + 20, 90 + rowh * len(rows) + 20), (236, 236, 240, 255))
    one = Image.new('RGBA', (n * CW, CH * len(rows)), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    title = c.replace('-', ' ').title()
    d.text((20, 22), f'{title} (player character). Cells {CW}x{CH} px, shown {S}x. Feet on the red line, facing right, same anchor in every cell.', font=font, fill=(30, 30, 40))
    for r, (name, cells, note) in enumerate(rows):
        y0 = 90 + r * rowh
        d.text((20, y0 + 50), name, font=font, fill=(30, 30, 40))
        d.text((20, y0 + 100), f'{len(cells)} frames', font=small, fill=(70, 70, 90))
        y, line = y0 + 135, ''
        for word in note.split():
            if len(line + ' ' + word) > 22:
                d.text((20, y), line.strip(), font=small, fill=(70, 70, 90))
                y += 28
                line = ''
            line += ' ' + word
        d.text((20, y), line.strip(), font=small, fill=(70, 70, 90))
        for k, cell in enumerate(cells):
            one.paste(cell, (k * CW, r * CH), cell)
            x = label + k * CW * S
            bg = Image.new('RGBA', (CW * S, CH * S), (200, 204, 214, 255) if k % 2 else (214, 218, 228, 255))
            up = cell.resize((CW * S, CH * S), Image.NEAREST)
            bg.paste(up, (0, 0), up)
            big.paste(bg, (x, y0 + 50))
            d.text((x + 8, y0 + 20), str(k + 1), font=small, fill=(70, 70, 90))
        d.line((label, y0 + 50 + CH * S - 1, label + len(cells) * CW * S, y0 + 50 + CH * S - 1), fill=(220, 60, 60), width=2)
    big.convert('RGB').save(f'{dest}{c}-sheet.png')
    one.save(f'{dest}{c}-sheet-1x.png')
    # The palette: every colour in its frames, dark to light.
    cols = {}
    for f in idle + run + fall + [sleep]:
        for _, p in f.getcolors(99999):
            if p[3]:
                cols[p[:3]] = 1
    palette = ' '.join('#%02x%02x%02x' % p for p in sorted(cols, key=sum))
    bb = idle[0].getbbox()
    who, look = LOOKS[c]
    counts = [len(r[1]) for r in rows]
    # (Skeletons don't lie down: they fall apart into a pile of bones, the skull on top.)
    sleep_note = 'Gets drowsy and falls apart into a pile of bones, the skull on top. The last frame is held while asleep.' if c.startswith('skeleton') else 'Gets drowsy, slumps down and ends lying on the ground, asleep. The last frame is held while asleep.'
    sleep_prompt = 'falls apart into a pile of bones, skull on top' if c.startswith('skeleton') else 'slumps down and ends lying on the ground asleep'
    open(f'{dest}BRIEF.md', 'w', encoding='utf-8').write(BRIEF.format(c=c, title=title, who=who, look=look, w=bb[2] - bb[0], h=bb[3] - bb[1], palette=palette, ncol=len(cols), sleep_note=sleep_note, sleep_prompt=sleep_prompt, idle=counts[0], run=counts[1], sleep=counts[2], CW=CW, CH=CH, mid=CW // 2))
    print(c, 'ok', counts, len(cols), 'colours')


BRIEF = """# Pixel-art character brief: OxaSmash ({title})

Attached: `{c}-sheet.png` (labelled, enlarged 6x) and `{c}-sheet-1x.png` (the same frames at real size, transparent background). Use them as the style and size reference.

## The reference character

{who} from a 2D side-view platform fighter. {look}

The art is chunky pixel art:
- about {w} px wide and {h} px tall standing;
- a 1 px near-black outline;
- flat colours with 2 to 3 shades per material;
- no anti-aliasing and no gradients.

## Frame rules (please keep these exactly)

- **Cell size:** {CW}×{CH} px per frame, one animation per row, frames left to right.
- **Facing:** right. The game mirrors the art for facing left.
- **Feet:** on the bottom edge of the cell. The body's centre is about {mid} px from the cell's left edge (the same anchor in every frame), so the character doesn't slide when frames change.
- **Size:** keep the reference's size and proportions; the rest of the cell is room for taller poses and things on the head.
- **Background:** transparent. Hard pixel edges only, with no soft or semi-transparent pixels.
- **Palette:** {ncol} colours, dark to light:
  `{palette}`
  For a new character, swap the hues, but keep a near-black outline and the same number of shades.
- **Arms:** keep them as the reference has them: short and tucked against the body. Don't add long or free-moving arms. The game draws a small floating hand that holds the weapon.
- **No weapon in the hands.** The game draws weapons and the floating hand on top of the sprite.

## The animations it uses

| Row | Frames | Speed | Notes |
|---|---|---|---|
| Idle | {idle} | 6 fps, loops | Gentle breathing bob, 1 to 2 px. |
| Run | {run} | 12 fps, loops | The last frame doubles as the jump / in-the-air pose. |
| Sleep | {sleep} | about 8 fps, once | {sleep_note} |

## Prompts to paste

**A new animation for this character:**
> Using the attached sprite sheet as the exact style, size, palette and anchor reference, draw a new row for this same character ({who}): **[e.g. "Hurt: 3 frames, recoiling backward from a hit" / "Dash: 4 frames, leaning forward"]**. Same {CW}×{CH} cells, facing right, feet on the bottom edge, body centred about {mid} px from the left of each cell, 1 px dark outline, only the listed palette colours, transparent background. Arms short and tucked against the body like the reference, no weapon in hand. Return a sprite sheet with that one row.

**A new character:**
> Using the attached sprite sheet as the exact style, size, proportions, frame counts and anchor reference, design a new character: **[your idea]**. Draw the same three rows: idle ({idle} frames), run ({run} frames) and sleep ({sleep} frames: {sleep_prompt}). Match the reference's poses and timing frame by frame. Use the same {CW}×{CH} cells, facing right, feet on the bottom edge, body centred about {mid} px from the left of each cell. Keep a 1 px near-black outline, about {ncol} colours with flat shading and a transparent background. Arms stay short and tucked against the body like the reference (no long arms), and no weapon in hand.

## Getting it into the game

Send the sheet back. It gets cut into the game's strip format (idle 32 px wide frames, run 64×64, plus the stun, fall and sleep poses) and added as a character.
"""

if __name__ == '__main__':
    for c in sys.argv[1:] or LOOKS:
        build(c)
