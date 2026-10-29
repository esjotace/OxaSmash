// Dressing for the village stage, from the Legacy Vania Village tileset (by Anokolisa), loaded as
// one texture ('village') with named pieces cut out of it. Looks only; the rules use stage.js.
import { TILE } from '../sim/constants.js';

// Pieces of the tileset: [column, row, width, height] in 16 px tiles.
const PIECES = {
  slabL: [0, 0, 1, 1],
  slab: [1, 0, 1, 1],
  slabR: [2, 0, 1, 1],
  brick: [3, 15, 1, 1],
  brickB: [2, 15, 1, 1],
  house: [0, 1, 6, 9],
  roof: [6, 0, 6, 3],
  plank: [17, 6, 4, 1],
  logs: [3, 13, 2, 1],
  columnTop: [1, 16, 2, 1],
  column: [1, 17, 2, 1],
  lamp: [12, 5, 1, 4],
  pot: [8, 16, 1, 2],
  clouds: [3, 18, 3, 1],
  deadTree: [12, 9, 2, 5],
  bushes: [4, 19, 4, 1],
  window: [6, 9, 3, 2],
};

// The tileset's own sky blue: tiles with sky baked in blend into a sky this color.
export const VILLAGE_SKY = 0x3837bc;

// Block looks the village draws itself (the shared renderer skips them).
export const VILLAGE_LOOKS = new Set(['slab', 'wood', 'logs', 'bridge']);

export function registerVillage(scene) {
  const tex = scene.textures.get('village');
  for (const [name, [c, r, w, h]] of Object.entries(PIECES)) {
    if (!tex.has(name)) tex.add(name, 0, c * TILE, r * TILE, w * TILE, h * TILE);
  }
}

const piece = (scene, name, x, y) => scene.add.image(x, y, 'village', name).setOrigin(0, 0);

// Everything behind the fighters, in draw order.
export function buildVillage(scene, st) {
  registerVillage(scene);
  const out = [];
  const cam = st.camera;
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  // Sky, pinned to the screen; clouds and dead trees drifting slowly behind everything.
  out.push(scene.add.rectangle(0, 0, 4000, 4000, VILLAGE_SKY).setOrigin(0, 0).setScrollFactor(0, 0));
  for (let i = 0; i < 18; i++) {
    out.push(piece(scene, 'clouds', cam.left - 300 + i * 150 + rnd() * 60, -380 + rnd() * 140).setScrollFactor(0.1, 0.1));
  }
  for (let x = cam.left - 400; x < cam.right + 400; x += 70 + rnd() * 90) {
    // No tint: these tiles have the sky baked in, so they only blend with the sky untinted.
    out.push(piece(scene, 'deadTree', x, -90 - rnd() * 30).setScrollFactor(0.3, 0.3));
  }
  // Distant houses: the same house front, dark and small-looking (slow scroll).
  for (let x = cam.left - 300; x < cam.right + 300; x += 110 + rnd() * 60) {
    const y = -150 + rnd() * 30;
    out.push(piece(scene, 'house', x, y).setScrollFactor(0.45, 0.45).setTint(0x2a2a70));
    out.push(piece(scene, 'roof', x, y - 48).setScrollFactor(0.45, 0.45).setTint(0x2a2a70));
  }
  out.push(scene.add.rectangle(cam.left - 400, -6, 4000, 600, 0x1a1a52).setOrigin(0, 0).setScrollFactor(0.45, 0.45));

  // Town wall behind the street: dark brick, two tiles tall, dimmed.
  for (let x = cam.left - 40; x < cam.right + 40; x += TILE) {
    for (let r = 1; r <= 3; r++) out.push(piece(scene, r === 3 ? 'brickB' : 'brick', x, -r * TILE).setTint(0x7a7ab0));
  }
  // House fronts and their roofs.
  for (const h of st.houses ?? []) {
    out.push(piece(scene, 'house', h.x, h.y - 144));
    out.push(piece(scene, 'roof', h.x, h.y - 144 - 48));
  }
  // Stone columns under the walkway.
  for (const c of st.columns ?? []) {
    out.push(piece(scene, 'columnTop', c.x, c.top));
    for (let y = c.top + TILE; y < c.bottom; y += TILE) out.push(piece(scene, 'column', c.x, y));
  }
  // Lamp posts and potted plants along the street.
  for (const x of [120, 420, 760, 1032, 1372, 1672]) out.push(piece(scene, 'lamp', x, -64));
  for (const x of [250, 700, 1080, 1530]) out.push(piece(scene, 'pot', x, -32));

  // Platforms in the village's own tiles.
  for (const b of st.blocks) {
    if (!VILLAGE_LOOKS.has(b.look)) continue;
    const cols = b.w / TILE;
    const rows = b.h / TILE;
    if (b.look === 'logs') {
      for (let c = 0; c < cols; c += 2) out.push(piece(scene, 'logs', b.x + c * TILE, b.y));
      continue;
    }
    if (b.look === 'wood') {
      for (let c = 0; c < cols; c += 4) {
        const img = piece(scene, 'plank', b.x + c * TILE, b.y - 2);
        const w = Math.min(4, cols - c) * TILE;
        if (w < 4 * TILE) img.setCrop(0, 0, w, TILE);
        out.push(img);
      }
      continue;
    }
    // Stone: a slab row on top (bridge too); solid ground gets brick below it.
    for (let c = 0; c < cols; c++) out.push(piece(scene, c === 0 ? 'slabL' : c === cols - 1 ? 'slabR' : 'slab', b.x + c * TILE, b.y));
    for (let r = 1; r < rows; r++) {
      for (let c = 0; c < cols; c++) out.push(piece(scene, r % 2 ? 'brick' : 'brickB', b.x + c * TILE, b.y + r * TILE).setTint(0xb0b0d8));
    }
  }
  return out;
}

// Small helper for the renderer: is this stage dressed by this module?
export const isVillage = (st) => st.theme === 'village';
