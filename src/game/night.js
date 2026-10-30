// Dressing for the night stages (La Bajaita, La Azotea; theme 'night'): a starry sky with the moon,
// and the stage's own ground: a stone slab floating in the sky (slab), or the roof of a tall
// building over the night city (roof); thin platforms are wooden boards on poles (plank). Looks
// only; the rules use stage.js. Art: public/art/night/ (tools/night_art.py) and the dungeon's.
import { TILE } from '../sim/constants.js';
import { woodRun, register } from './dungeon.js';

export const isNight = (st) => st.theme === 'night';
// Block looks the night stages draw themselves (the shared renderer skips them).
export const NIGHT_LOOKS = new Set(['slab', 'roof', 'plank']);

const SKY = [0x05071a, 0x0b0f2c, 0x141a42, 0x221d4d]; // top to bottom
const MOON_DRIFT = 0.35; // how far the moon drifts against the camera (0: stuck to the screen; 1: fixed in the sky)

// The moon's glow: a smooth radial fade, made once.
function glowTexture(scene) {
  if (!scene.textures.exists('night-glow')) {
    const size = 192;
    const tex = scene.textures.createCanvas('night-glow', size, size);
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255, 246, 216, 0.30)');
    g.addColorStop(0.3, 'rgba(255, 246, 216, 0.14)');
    g.addColorStop(0.6, 'rgba(255, 246, 216, 0.05)');
    g.addColorStop(1, 'rgba(255, 246, 216, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }
  return 'night-glow';
}
// The haze under the city: its colour, and how tall the fade into it is.
const FOG = 0x1c1a3e;
const FOG_H = 90;
function fogTexture(scene) {
  if (!scene.textures.exists('night-fog')) {
    const tex = scene.textures.createCanvas('night-fog', 4, FOG_H);
    const ctx = tex.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, FOG_H);
    g.addColorStop(0, 'rgba(28, 26, 62, 0)');
    g.addColorStop(0.5, 'rgba(28, 26, 62, 0.55)');
    g.addColorStop(1, 'rgba(28, 26, 62, 1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, FOG_H);
    tex.refresh();
  }
  return 'night-fog';
}
const STARS = [0xffffff, 0xd6e4ff, 0xfff1cc];

// Everything behind the fighters, in draw order. The list also has update(camera): the moon and
// the far-off city follow the camera (see below).
export function buildNight(scene, st) {
  register(scene);
  const out = [];
  const cam = st.camera;
  // (Wide and tall enough to fill the screen however far the camera pulls out.)
  const left = cam.left - 600;
  const right = cam.right + 600;
  const top = cam.top - 500;
  const bottom = cam.bottom + 600;
  let seed = 97;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  // The sky: bands from deep night overhead to a faint violet low down.
  const sky = scene.add.graphics();
  const bands = 24;
  for (let k = 0; k < bands; k++) {
    const t = k / (bands - 1);
    const i = Math.min(SKY.length - 2, Math.floor(t * (SKY.length - 1)));
    const f = t * (SKY.length - 1) - i;
    const mix = (a, b) => Math.round(a + (b - a) * f);
    const [a, b] = [SKY[i], SKY[i + 1]];
    const color = (mix(a >> 16, b >> 16) << 16) | (mix((a >> 8) & 255, (b >> 8) & 255) << 8) | mix(a & 255, b & 255);
    sky.fillStyle(color, 1).fillRect(left, top + ((bottom - top) * k) / bands, right - left, (bottom - top) / bands + 1);
  }
  out.push(sky);

  // Stars: mostly single pixels, some bigger, a few crosses; a handful twinkle.
  const stars = scene.add.graphics();
  const count = Math.round(((right - left) * (bottom - top)) / 2600);
  for (let k = 0; k < count; k++) {
    const x = Math.round(left + rnd() * (right - left));
    const y = Math.round(top + rnd() * (cam.bottom + 60 - top));
    const color = STARS[Math.floor(rnd() * STARS.length)];
    const r = rnd();
    stars.fillStyle(color, 0.45 + rnd() * 0.55);
    if (r < 0.04) stars.fillRect(x - 1, y, 3, 1).fillRect(x, y - 1, 1, 3);
    else if (r < 0.14) stars.fillRect(x, y, 2, 2);
    else stars.fillRect(x, y, 1, 1);
  }
  out.push(stars);
  for (let k = 0; k < 40; k++) {
    const star = scene.add.rectangle(Math.round(left + rnd() * (right - left)), Math.round(top + rnd() * (cam.bottom - top)), 2, 2, STARS[k % STARS.length]).setOrigin(0, 0);
    scene.tweens.add({ targets: star, alpha: 0.15, duration: 700 + rnd() * 1800, delay: rnd() * 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    out.push(star);
  }

  // The moon, high on the right, drifting the other way as the camera moves (so it hangs in the
  // sky rather than following you about), in a soft glow. Behind the stage, the ruined night city in
  // layers (the Exclusion Zone pack's skyline), drifting less the further off they are. Both are
  // placed from what the camera shows, every frame (update).
  const middle = (cam.left + cam.right) / 2;
  const level = -60; // (the camera's usual height)
  let moon = null;
  if (scene.textures.exists('night-moon')) {
    moon = scene.add.container(0, 0, [scene.add.image(0, 0, glowTexture(scene)), scene.add.image(0, 0, 'night-moon').setScale(2)]);
    out.push(moon);
  }
  // [key, how much it moves with the camera (far: less), tint (far: paler), where its top is].
  const city = [];
  [['night-city1', 0.15, 0x2a3262, -170], ['night-city2', 0.3, 0x1f2550, -120], ['night-city4', 0.45, 0x161a3a, -55], ['night-city3', 0.6, 0x0f1229, -25]].forEach(([key, f, tint, top]) => {
    if (!scene.textures.exists(key)) return;
    const img = scene.textures.get(key).getSourceImage();
    const layer = scene.add.container(0, 0);
    // (One repeating picture across the whole width.)
    layer.add(scene.add.tileSprite(left - 2 * img.width, top, right - left + 4 * img.width, img.height, key).setOrigin(0, 0).setTint(tint));
    city.push({ layer, f });
    out.push(layer);
  });
  // Low haze over the bottom of the city, thickening below it: the city fades into fog in the
  // valley rather than ending in a flat edge. It moves with the nearest layer.
  if (city.length) {
    const fogTop = -40; // (solid by the foot of the nearest layers: nothing shows under the city)
    const haze = scene.add.container(0, 0, [
      scene.add.image(left - 1200, fogTop, fogTexture(scene)).setOrigin(0, 0).setDisplaySize(right - left + 2400, FOG_H),
      scene.add.rectangle(left - 1200, fogTop + FOG_H - 1, right - left + 2400, bottom - fogTop, FOG).setOrigin(0, 0),
    ]);
    city.push({ layer: haze, f: 0.6 });
    out.push(haze);
  }
  out.update = (camera) => {
    const v = camera.worldView;
    const drift = v.centerX - middle;
    // (Never drifting out of sight: kept to the top right of the screen.)
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    moon?.setPosition(clamp(v.x + v.width * 0.75 - drift * MOON_DRIFT, v.x + v.width * 0.55, v.x + v.width * 0.88), clamp(v.y + v.height * 0.17 - (v.centerY - level) * MOON_DRIFT, v.y + v.height * 0.1, v.y + v.height * 0.3));
    // (Up and down too, a little less: looking down into the pit, the city comes along.)
    for (const { layer, f } of city) layer.setPosition(drift * (1 - f), (v.centerY - level) * (1 - f) * 0.8);
  };

  for (const b of st.blocks) {
    if (b.look === 'slab') out.push(...slab(scene, b, rnd));
    else if (b.look === 'roof') out.push(roof(scene, b, bottom, rnd));
    else if (b.look === 'plank') out.push(...planks(scene, b, st));
  }
  return out;
}

const piece = (scene, name, x, y) => scene.add.image(x, y, 'dungeon', name).setOrigin(0, 0);

// A stone slab floating in the sky: the dungeon's stone on top, its rocky underside tapering
// away below in steps.
function slab(scene, b, rnd) {
  const out = [];
  const cols = b.w / TILE;
  for (let c = 0; c < cols; c++) {
    out.push(piece(scene, 'stoneTop', b.x + c * TILE, b.y));
    for (let r = 1; r < b.h / TILE; r++) out.push(piece(scene, 'stoneBlock', b.x + c * TILE, b.y + r * TILE).setTint(0xb8a8c0));
  }
  // The underside: each row narrower, darker, a little ragged.
  let inset = 1;
  for (let r = b.h / TILE; inset * 2 < cols; r++) {
    const tint = Math.max(0x40, 0xa0 - (r - 1) * 0x14);
    for (let c = inset + Math.floor(rnd() * 2); c < cols - inset - Math.floor(rnd() * 2); c++) out.push(piece(scene, 'stoneBlock', b.x + c * TILE, b.y + r * TILE).setTint((tint << 16) | ((tint - 0x10) << 8) | (tint + 0x08)));
    inset += 2 + Math.floor(rnd() * 3);
  }
  return out;
}

// A building's flat roof: concrete on top, the building's dark face running down out of sight,
// some windows lit.
function roof(scene, b, bottom, rnd) {
  const g = scene.add.graphics();
  const { x, y, w } = b;
  g.fillStyle(0x161a30, 1).fillRect(x, y, w, bottom - y);
  // Windows, in rows down the face.
  for (let wy = y + 48; wy < bottom; wy += 40) {
    for (let wx = x + 20; wx < x + w - 24; wx += 36) {
      const lit = rnd() < 0.28;
      g.fillStyle(lit ? 0xffcf6b : 0x232845, lit ? 0.85 : 1).fillRect(wx, wy, 14, 20);
    }
  }
  // The edges of the building, and the roof itself on top.
  g.fillStyle(0x0d1022, 1).fillRect(x, y, 4, bottom - y).fillRect(x + w - 4, y, 4, bottom - y);
  g.fillStyle(0x4b5070, 1).fillRect(x, y, w, b.h);
  g.fillStyle(0x6c7294, 1).fillRect(x, y + b.h - 3, w, 3);
  g.fillStyle(0xb8bfd6, 1).fillRect(x, y, w, 2);
  return g;
}

// Thin platforms: wooden boards on thin metal poles down to the floor below.
function planks(scene, b, st) {
  const below = Math.min(...st.blocks.filter((o) => o !== b && o.y > b.y && b.x < o.x + o.w && b.x + b.w > o.x).map((o) => o.y), b.y + 200);
  const poles = scene.add.graphics();
  for (const px of [b.x + 10, b.x + b.w - 12]) poles.fillStyle(0x2c3150, 1).fillRect(px, b.y + 6, 2, below - b.y - 6);
  return [poles, ...woodRun(scene, 'board', b.x, b.y, b.w)];
}
