// Low cover, drawn on its own (not baked into the stage) so each piece can break: boxes, crates
// and barrels (CraftPix's Exclusion Zone and Swamp packs, shrunk to a tile's height) for crates,
// the village's log piles, the warehouse's metal; each box swaps to a beaten-up look below half
// health. Hits kick up dust; an HP bar, green to red, shows for a moment after each hit.
import { TILE } from '../sim/constants.js';
import { registerVillage } from './village.js';

const C = (hex) => parseInt(hex.slice(1), 16);
// The box looks (each has a beaten-up `-hit` twin), and how wide each is.
const BOXES = [
  ['cover-box', 21],
  ['cover-crate', 20],
  ['cover-barrel', 17],
  ['cover-bigbox', 20],
];
export const COVER_ART = BOXES.flatMap(([k]) => [k, `${k}-hit`]);
const BAR_TIME = 1.6; // seconds the HP bar stays up after a hit (fading out at the end)

// One cover's pieces: { parts (images or graphics, hidden when it breaks), boxes (the box images,
// which turn beaten-up) }. i: which cover this is, to vary the looks (the same on every screen).
function buildOne(scene, b, i) {
  const parts = [];
  const boxes = [];
  if (b.look === 'logs' && scene.textures.exists('village')) {
    registerVillage(scene);
    for (let c = 0; c < b.w; c += 2 * TILE) parts.push(scene.add.image(b.x + c, b.y, 'village', 'logs').setOrigin(0, 0));
  } else if (b.look === 'metal' || !scene.textures.exists('cover-box')) {
    const g = scene.add.graphics();
    const { x, y, w, h } = b;
    g.fillStyle(C('#39405e'), 1).fillRect(x, y, w, h);
    g.fillStyle(C('#6c769e'), 1).fillRect(x, y, w, 3);
    g.fillStyle(C('#2a3048'), 1);
    for (let yy = y + 8; yy < y + h; yy += 8) g.fillRect(x, yy, w, 1);
    // Hazard stripes along the top.
    g.fillStyle(C('#c9a227'), 1);
    for (let sx = x; sx < x + w; sx += 12) g.fillRect(sx, y + 3, Math.min(6, x + w - sx), 3);
    parts.push(g);
  } else {
    // Boxes side by side, as many as fit (overlapping a little), standing on its floor, in a mix
    // of looks.
    const n = Math.max(1, Math.round(b.w / 17));
    for (let k = 0; k < n; k++) {
      const [key] = BOXES[(i * 3 + k * 2) % BOXES.length];
      const cx = b.x + (b.w * (k + 0.5)) / n;
      const img = scene.add.image(Math.round(cx), b.y + b.h, scene.textures.exists(key) ? key : 'cover-box').setOrigin(0.5, 1).setFlipX((i + k) % 2 === 1);
      img.look = img.texture.key;
      parts.push(img);
      boxes.push(img);
    }
  }
  return { parts, boxes, hp: null, barT: 0 };
}

// All the stage's cover (in the same order as the rules' world.covers).
export function buildCovers(scene, st) {
  return st.blocks.filter((b) => b.cover).map((b, i) => ({ b, ...buildOne(scene, b, i) }));
}

// Each frame: hide broken cover, flash it when hit, kick up dust as it's hit (more as it gets
// beaten up), beat up boxes below half health, and draw the HP bars (on g) of cover hit lately.
// view.covers[i]: { hp, max, flash } or 0 once broken. dust(x, y, size): a puff of dust.
export function updateCovers(covers, view, g, dt, dust) {
  covers.forEach((c, i) => {
    const v = view.covers?.[i];
    for (const p of c.parts) p.setVisible(!!v);
    if (!v) return;
    const { x, y, w } = c.b;
    if (c.hp !== null && v.hp < c.hp) {
      c.barT = BAR_TIME;
      dust(x + Math.random() * w, y + 2, 0.18);
      // (Crossing half health: it gives, in a cloud of dust.)
      if (c.hp >= v.max / 2 && v.hp < v.max / 2) for (let k = 0; k < 4; k++) dust(x + ((k + 0.5) * w) / 4, y + 6, 0.32);
    }
    c.hp = v.hp;
    c.barT = Math.max(0, c.barT - dt);
    for (const p of c.parts) {
      if (!p.setTintFill) continue;
      if (v.flash) p.setTintFill(0xffffff);
      else p.clearTint();
    }
    const beaten = v.hp < v.max / 2;
    for (const img of c.boxes) {
      const key = beaten ? `${img.look}-hit` : img.look;
      if (img.texture.key !== key && img.scene.textures.exists(key)) img.setTexture(key);
    }
    if (c.barT <= 0) return;
    const k = Math.max(0, v.hp / v.max);
    const alpha = Math.min(1, c.barT / 0.4);
    // Green when whole, through yellow, to red.
    const r = Math.round(255 * Math.min(1, 2 * (1 - k)));
    const gr = Math.round(255 * Math.min(1, 2 * k));
    g.fillStyle(0x000000, 0.6 * alpha).fillRect(x, y - 5, w, 3);
    g.fillStyle((r << 16) | (gr << 8) | 40, alpha).fillRect(x, y - 5, Math.max(1, Math.round(w * k)), 3);
  });
}
