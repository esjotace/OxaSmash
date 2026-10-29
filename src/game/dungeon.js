// Dressing for the dungeon stage, from the Legacy Dungeon tileset (by Anokolisa), loaded as one
// texture ('dungeon') with named pieces, plus two wall tiles loaded on their own so they can fill
// large areas as repeating tiles. Looks only; the rules use stage.js.
import { TILE } from '../sim/constants.js';

// Pieces of the tileset: [column, row, width, height] in 16 px tiles.
const PIECES = {
  stoneTop: [3, 0, 1, 1],
  stoneBlock: [6, 0, 1, 1],
  ledgeL: [4, 12, 1, 1],
  ledge: [5, 12, 1, 1],
  ledgeR: [6, 12, 1, 1],
  spikeRight: [6, 7, 1, 1],
  spikeLeft: [4, 7, 1, 1],
  spikeUp: [5, 6, 1, 1],
  spikeDown: [5, 8, 1, 1],
  beam: [0, 1, 1, 1],
  window: [1, 7, 3, 6],
  banner: [8, 1, 1, 2],
  chain: [7, 2, 1, 1],
  cage: [7, 3, 1, 3],
  purplePatch: [8, 9, 4, 5],
  brickPatch: [11, 6, 5, 4],
  vase: [19, 0, 1, 1],
};

// Block looks the dungeon draws itself (the shared renderer skips them).
export const DUNGEON_LOOKS = new Set(['stone', 'ledge', 'boxes']);

export const isDungeon = (st) => st.theme === 'dungeon';

function register(scene) {
  const tex = scene.textures.get('dungeon');
  for (const [name, [c, r, w, h]] of Object.entries(PIECES)) {
    if (!tex.has(name)) tex.add(name, 0, c * TILE, r * TILE, w * TILE, h * TILE);
  }
}

// A thin (drop-through) platform: a wooden plank, much thinner than the stone, with a bright top
// edge, a dark underside, seams between boards and a bracket under each end.
export function plank(g, x, y, w) {
  g.fillStyle(0x2a1810, 1).fillRect(x, y, w, 7);
  g.fillStyle(0x5c3920, 1).fillRect(x, y + 1, w, 5);
  g.fillStyle(0x7a4c2a, 1).fillRect(x, y + 2, w, 1);
  g.fillStyle(0xd9a05e, 1).fillRect(x, y, w, 1);
  for (let sx = x + 16; sx < x + w - 1; sx += 16) g.fillStyle(0x2a1810, 1).fillRect(sx, y + 1, 1, 5);
  for (const bx of [x + 2, x + w - 5]) g.fillStyle(0x2a1810, 1).fillRect(bx, y + 7, 3, 4);
  return g;
}

// A coat of super glue on top of a floor, w px wide at (x, y): a thick glossy layer, a bright
// sheen, and drips running down the front.
export function glueCoat(g, x, y, w) {
  g.fillStyle(0xd9c96a, 0.9).fillRect(x, y - 1, w, 4);
  g.fillStyle(0xfff6c4, 0.95).fillRect(x, y - 1, w, 1);
  for (let k = 0; k < w; k += 7) {
    const len = 3 + ((k * 13) % 7);
    g.fillStyle(0xd9c96a, 0.85).fillRect(x + k + 2, y + 3, 2, len);
    g.fillStyle(0xfff6c4, 0.8).fillRect(x + k + 2, y + 3 + len - 1, 2, 1);
  }
  for (let k = 5; k < w; k += 11) g.fillStyle(0xffffff, 0.7).fillRect(x + k, y, 2, 1);
  return g;
}

const piece = (scene, name, x, y) => scene.add.image(x, y, 'dungeon', name).setOrigin(0, 0);

// Everything behind the fighters, in draw order.
export function buildDungeon(scene, st) {
  register(scene);
  const out = [];
  const cam = st.camera;
  const left = cam.left - 64;
  const top = cam.top - 64;
  const width = cam.right - cam.left + 128;
  // (Tall enough to fill the screen even zoomed all the way out, for several players at once.)
  const height = cam.bottom - cam.top + 128 + 400;
  let seed = 41;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  // The back wall: brick everywhere, darkened so the action stands out, with a few purple patches.
  out.push(scene.add.tileSprite(left, top, width, height, 'dungeon-wall').setOrigin(0, 0).setTint(0x9a8a9a));
  for (let i = 0; i < 9; i++) out.push(piece(scene, 'purplePatch', left + rnd() * width, top + 60 + rnd() * (height - 200)).setTint(0x9a8a9a));
  for (let i = 0; i < 7; i++) out.push(piece(scene, 'brickPatch', left + rnd() * width, top + 60 + rnd() * (height - 200)).setTint(0xb0a0b0));
  // Wooden beams running down the wall.
  for (let x = cam.left + 40; x < cam.right; x += 180 + rnd() * 60) {
    for (let y = top; y < 0; y += TILE) out.push(piece(scene, 'beam', x, y).setTint(0x8a7a8a));
  }
  // Gothic windows and banners up high; chains with hanging cages from the ceiling.
  for (let x = cam.left + 100; x < cam.right - 60; x += 260 + rnd() * 80) {
    out.push(piece(scene, 'window', x, -360).setTint(0xb0a0c0));
    out.push(piece(scene, 'banner', x - 24, -350), piece(scene, 'banner', x + 56, -350));
  }
  for (let x = cam.left + 220; x < cam.right; x += 300 + rnd() * 120) {
    const drop = 2 + Math.floor(rnd() * 4);
    for (let k = 0; k < drop; k++) out.push(piece(scene, 'chain', x, top + k * TILE));
    out.push(piece(scene, 'cage', x, top + drop * TILE));
  }
  // Wooden pillars under the walkway.
  for (const c of st.columns ?? []) {
    for (let y = c.top; y < c.bottom; y += TILE) out.push(piece(scene, 'beam', c.x + 8, y));
  }
  // A few vases along the floors (a stage can say where).
  for (const v of st.vases ?? [130, 470, 1322, 1662].map((x) => ({ x, y: 0 }))) out.push(piece(scene, 'vase', v.x - 8, v.y - TILE));

  // Platforms in the dungeon's own tiles (thin ones as wooden planks, all on one layer).
  let planks = null;
  for (const b of st.blocks) {
    if (!DUNGEON_LOOKS.has(b.look)) continue;
    const cols = b.w / TILE;
    const rows = b.h / TILE;
    if (b.look === 'boxes') {
      // Crates for cover (a crate is 2 tiles wide).
      for (let c = 0; c < b.w; c += 2 * TILE) out.push(scene.add.image(b.x + c, b.y, 'crate').setOrigin(0, 0).setDisplaySize(Math.min(2 * TILE, b.w - c), b.h));
      continue;
    }
    if (b.look === 'ledge') {
      planks ??= scene.add.graphics();
      plank(planks, b.x, b.y, b.w);
      continue;
    }
    // Solid stone. One tile thick, it's all chunky block, so it doesn't look like a thin ledge.
    for (let c = 0; c < cols; c++) {
      out.push(piece(scene, rows === 1 ? 'stoneBlock' : 'stoneTop', b.x + c * TILE, b.y));
      for (let r = 1; r < rows; r++) out.push(piece(scene, 'stoneBlock', b.x + c * TILE, b.y + r * TILE).setTint(0xc0b0c0));
    }
  }
  if (planks) out.push(planks);
  // Ice: a thin pale-blue sheet over the top of icy floors and ledges.
  const ice = scene.add.graphics();
  for (const b of st.blocks) {
    if (!b.ice) continue;
    ice.fillStyle(0x8fd3ff, 0.4).fillRect(b.x, b.y, b.w, b.oneWay ? 7 : TILE);
    ice.fillStyle(0xe6f7ff, 0.9).fillRect(b.x, b.y, b.w, 2);
  }
  out.push(ice);
  // Glue: a glossy, pale-yellow coat of super glue over the top, dripping down the front.
  const glue = scene.add.graphics();
  for (const b of st.blocks) if (b.glue) glueCoat(glue, b.x, b.y, b.w);
  out.push(glue);
  // Weapon shrines: banners either side of the altar.
  for (const sp of st.pickupSpots.filter((q) => q.shrine)) out.push(piece(scene, 'banner', sp.x - 40, sp.y - 64), piece(scene, 'banner', sp.x + 24, sp.y - 64));
  // Spike walls: a stone column with spike tiles on the dangerous side. Spike floors: a stone row
  // with spike tiles standing on it.
  for (const s of st.spikes) {
    if (s.up) {
      for (let c = 0; c < s.width; c++) {
        out.push(piece(scene, 'spikeUp', s.x + c * TILE, s.y), piece(scene, 'stoneBlock', s.x + c * TILE, s.y + TILE));
      }
      continue;
    }
    for (let r = 0; r < s.height; r++) {
      const y = s.y + r * TILE;
      out.push(piece(scene, 'stoneBlock', s.x, y));
      out.push(piece(scene, s.face > 0 ? 'spikeRight' : 'spikeLeft', s.face > 0 ? s.x + TILE : s.x - TILE, y));
    }
  }
  return out;
}

// Stage pieces that move or change (see MOVERS in sim/constants.js), one container each. update()
// takes the view's [y, there, about to change] for it.
export function buildMovers(scene, st) {
  register(scene);
  return (st.movers ?? []).map((def) => {
    const box = scene.add.container(def.x, 0);
    const cols = def.w / TILE;
    for (let c = 0; c < cols; c++) {
      const x = c * TILE;
      if (def.kind === 'bridge' || def.kind === 'lift') {
        if (c === 0) box.add(plank(scene.add.graphics(), 0, 0, def.w));
      }
      else if (def.kind === 'crumble') {
        box.add(piece(scene, 'stoneTop', x, 0));
        if (def.glue && c === cols - 1) box.add(glueCoat(scene.add.graphics(), 0, 0, def.w));
      }
      // The crusher: a stone block with spikes underneath.
      else box.add([piece(scene, 'stoneBlock', x, 0), piece(scene, 'spikeDown', x, TILE)]);
    }
    // Lifts and crushers hang on chains that run up out of sight.
    if (def.kind === 'lift' || def.kind === 'crusher') {
      for (const x of [0, def.w - TILE]) for (let k = 1; k <= 30; k++) box.add(piece(scene, 'chain', x, -k * TILE));
    }
    return {
      box,
      update([y, on, warn], anim) {
        box.setVisible(on === 1).setY(y);
        const tick = Math.floor(anim * 30) % 2;
        // About to change: a bridge flickers, a crusher or crumbling tile shakes.
        box.setAlpha(warn && def.kind === 'bridge' && tick ? 0.35 : 1);
        box.setX(def.x + (warn && def.kind !== 'bridge' ? (tick ? 1 : -1) : 0));
      },
    };
  });
}
