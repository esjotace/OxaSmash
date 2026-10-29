"""Build public/art/buttons.png: one row per controller style (xbox, ps, switch), and per standard
button number 0..16 three frames of 16x16 (idle, pressed, dim), from Vryell's controller sheets
(the light versions: they read well on the game's dark screens). Buttons without a picture are
left empty (the game shows their name instead; src/game/padicons.js must list the same ones).

  python tools/buttons_atlas.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT.parent / "Assets" / "Controllers and Keyboard"  # (the packs sit next to the game folder)
OUT = ROOT / "public" / "art" / "buttons.png"

# standard button number -> the sheet row of its light version
ROWS = {
    "xbox": {0: 5, 1: 7, 2: 3, 3: 1, 4: 17, 5: 23, 6: 20, 7: 26, 8: 14, 9: 12},
    "ps": {0: 5, 1: 7, 2: 3, 3: 1, 4: 25, 5: 31, 6: 28, 7: 34},
    "switch": {0: 5, 1: 7, 2: 3, 3: 1, 4: 27, 5: 33, 6: 30, 7: 36, 8: 22, 9: 20, 12: 12, 13: 16, 14: 14, 15: 18},
}
SHEETS = {"xbox": "controller_xbox.png", "ps": "controller_ps.png", "switch": "controller_switch.png"}
BUTTONS = 17

atlas = Image.new("RGBA", (BUTTONS * 3 * 16, len(ROWS) * 16), (0, 0, 0, 0))
for r, (style, rows) in enumerate(ROWS.items()):
    sheet = Image.open(SRC / SHEETS[style]).convert("RGBA")
    for button, row in rows.items():
        for state in range(3):
            frame = sheet.crop((state * 16, row * 16, state * 16 + 16, row * 16 + 16))
            atlas.alpha_composite(frame, ((button * 3 + state) * 16, r * 16))
atlas.save(OUT)
print(atlas.size)
