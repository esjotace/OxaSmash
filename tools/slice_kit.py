"""Cut a game-size building facade into named modular pieces (a "kit"), so buildings can be
assembled in any order: left corner, doorway, wall, doorway, right corner...

The spec is a JSON file: {"source": "full.png", "pieces": {"name": {"x": [x0, x1], "door": cx}}}
where x0..x1 is the column range to cut and "door" (optional) is the doorway's center inside the
piece (used by the game to put a hideable doorway there).

    python tools/slice_kit.py ../workshop/art-source/kits/warehouse/kit.spec.json
"""

import json
import sys
from pathlib import Path

from PIL import Image


def main():
    spec_path = Path(sys.argv[1])
    spec = json.loads(spec_path.read_text())
    folder = spec_path.parent
    src = Image.open(folder / spec["source"]).convert("RGBA")
    index = {"height": src.height, "pieces": {}}
    for name, p in spec["pieces"].items():
        x0, x1 = p["x"]
        piece = src.crop((x0, 0, x1, src.height))
        piece.save(folder / f"{name}.png")
        index["pieces"][name] = {"w": x1 - x0, **({"door": p["door"]} if "door" in p else {})}
        print(f"{name}: {x1 - x0}x{src.height}")
    (folder / "kit.json").write_text(json.dumps(index, indent=2))


if __name__ == "__main__":
    main()
