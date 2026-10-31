// Dressing for the painted stages (theme 'swamp', 'castle', 'pines' or 'retro'): layered
// backgrounds that drift with the camera, blocks built from each pack's pieces, props, and the
// stages' gadgets (drifting logs, gas vents, portals, the wind and its blizzard). Looks only; the
// rules use stage.js. Art: public/art/<theme>/ (tools/stage_art.py).
import { TILE, VENT, PORTAL } from '../sim/constants.js';
import { woodRun, register, spikeArt, glueCoat, buildMovers } from './dungeon.js';

export const SCENERY_THEMES = ['swamp', 'castle', 'pines', 'retro'];
export const isScenery = (st) => SCENERY_THEMES.includes(st.theme);
// Block looks drawn here (the shared renderer skips them).
export const SCENERY_LOOKS = new Set(['moss', 'mossledge', 'swampthin', 'ventrock', 'earth', 'stone', 'bridge', 'plank', 'snow', 'snowledge', 'pond', 'rooftop', 'rooftopteal', 'truss', 'tank', 'deck', 'resfloor', 'resplank', 'stuffed', 'furniture']);

// What each theme loads (public/art/<theme>/<name>.png, as `<theme>-<name>`); sheets are animated:
// [frame width, height].
export const SCENERY_ART = {
  swamp: {
    images: ['bg1', 'bg2', 'bg3', 'bg4', 'bg5', 'g-tl', 'g-t', 'g-tr', 'g-l', 'g-m', 'g-r', 'l-one', 'l-l', 'l-m', 'l-r', 'th-l', 'th-m', 'th-r', 'water', 'willow1', 'willow2', 'willow3', 'tree1', 'tree2', 'bush1', 'bush2', 'bush3', 'stone1', 'stone2', 'grass1', 'grass2', 'log', 'stump'],
  },
  castle: { images: ['sky', 'clouds', 'stone-l', 'stone-m', 'stone-r', 'brick', 'backwall', 'grass-l', 'grass-r', 'dirt-l', 'dirt-r', 'braces', 'window', 'pane', 'banner', 'cage', 'vase'] },
  pines: {
    images: ['bg1', 'bg2', 'bg3', 'bg4', 'bg5', 'g-tl', 'g-t', 'g-tr', 'g-l', 'g-m', 'g-r', 'g-bl', 'g-b', 'g-br', 'pine1', 'pine7', 'pine8', 'bigpine', 'tent', 'bigtent'],
    sheets: { portal: [64, 64], campfire: [32, 32], blizzard: [242, 137] },
  },
  retro: { images: ['roof', 'brick', 'teal', 'window', 'deck', 'truss', 'truss-v', 'tower', 'neon', 'ac', 'bench', 'fence', 'bin', 'bush', 'vent', 'stripes', 'awning', 'shelf', 'desk', 'table', 'bed', 'longtable', 'chair', 'cabinet'] },
};

const has = (scene, key) => scene.textures.exists(key);
const img = (scene, key, x, y, ox = 0, oy = 0) => scene.add.image(x, y, key).setOrigin(ox, oy);
const tiles = (scene, key, x, y, w, h) => scene.add.tileSprite(x, y, w, h, key).setOrigin(0, 0);

// Everything behind the fighters, in draw order. The list also has update(camera, view, anim),
// movers (for the renderer's moverArt) and front (drawn over the fighters: Residencia's building
// fronts). hooks.dust(x, y, size): a puff of dust.
export function buildScenery(scene, st, hooks = {}) {
  register(scene);
  const theme = st.theme;
  const k = (name) => `${theme}-${name}`;
  const out = [];
  const cam = st.camera;
  const left = cam.left - 700;
  const right = cam.right + 700;
  const top = cam.top - 500;
  const bottom = cam.bottom + 500;
  // How deep grounds and buildings run (off the bottom of the screen).
  const depth = cam.bottom + 260;

  // ---- The background: a sky, then layers drifting less the further off they are. ----
  const LOOK = {
    swamp: { sky: 0x5a5a7c, layers: [['bg2', 0.1, 90, 1.6], ['bg3', 0.25, 100, 1.5], ['bg4', 0.4, 130, 1.4], ['bg5', 0.55, 140, 1.4]], under: 0x1d2a1c },
    castle: { sky: 0x6cc4ff, layers: [['sky', 0.04, -40, 2], ['clouds', 0.12, 30, 2]], under: 0x9fd8ff },
    pines: { sky: 0xc6ecf4, layers: [['bg5', 0.03, 40], ['bg4', 0.1, 60], ['bg3', 0.2, 70], ['bg2', 0.32, 80], ['bg1', 0.45, 90]], under: 0xe8f2f5 },
    retro: { sky: 0x78bdfc, layers: [], under: 0x5c7fa8 },
  }[theme];
  const sky = scene.add.graphics();
  sky.fillStyle(LOOK.sky, 1).fillRect(left, top, right - left, bottom - top);
  out.push(sky);
  const middle = (cam.left + cam.right) / 2;
  const level = -60;
  const layers = [];
  const layer = (key, f, bottomY, scale = 1) => {
    if (!has(scene, key)) return;
    const src = scene.textures.get(key).getSourceImage();
    const w = src.width * scale;
    const h = src.height * scale;
    // (One repeating picture across the whole width, not a copy per stretch.)
    const c = scene.add.container(0, 0, [scene.add.tileSprite(left - 2 * w, bottomY - h, right - left + 4 * w, h, key).setOrigin(0, 0).setTileScale(scale)]);
    layers.push({ c, f });
    out.push(c);
  };
  // The retro city: the castle's sky and clouds, and two rows of flat daytime buildings.
  if (theme === 'retro') {
    layer('castle-sky', 0.04, -40, 2);
    layer('castle-clouds', 0.1, 0, 2);
    [[0x9fc0e4, 0.2, 150, 7], [0x7f9fc8, 0.35, 90, 13]].forEach(([color, f, tall, seed]) => {
      const g = scene.add.graphics();
      let n = seed;
      for (let x = left - 1400; x < right + 1400; ) {
        n = (n * 16807) % 2147483647;
        const w = 40 + (n % 70);
        const h = tall * (0.5 + ((n >> 7) % 100) / 100);
        g.fillStyle(color, 1).fillRect(x, 80 - h, w - 4, h + 400);
        // (Rows of pale windows.)
        for (let wy = 80 - h + 8; wy < 80; wy += 14) for (let wx = x + 6; wx < x + w - 12; wx += 12) g.fillStyle(0xffffff, 0.18).fillRect(wx, wy, 5, 6);
        x += w;
      }
      const c = scene.add.container(0, 0, [g]);
      layers.push({ c, f });
      out.push(c);
    });
  }
  for (const [key, f, b, scale] of LOOK.layers) layer(k(key), f, b, scale);
  // (Solid under the last layer, down out of sight.)
  const under = scene.add.rectangle(left - 1400, theme === 'retro' ? 60 : 110, right - left + 2800, bottom, LOOK.under).setOrigin(0, 0);
  const underLayer = scene.add.container(0, 0, [under]);
  layers.push({ c: underLayer, f: 0.5 });
  out.push(underLayer);

  // ---- Props behind the stage, the stage's own dressing, blocks, then props in front. ----
  // (room: furniture inside Residencia's rooms, drawn over their back walls.)
  const props = (front, room = false) => {
    for (const p of st.props ?? []) {
      if (!!p.front !== front || !!p.room !== room || !has(scene, p.key)) continue;
      const o = img(scene, p.key, p.x, p.y, 0.5, 1).setFlipX(!!p.flip).setScale(p.scale ?? 1);
      // (The swamp's rocks: greyed, part of the scenery.)
      // (The mossy rock is the vents' own picture: greyed too, so it isn't taken for one.)
      const tint = p.tint ?? (p.key.startsWith('swamp-stone') || p.key === 'swamp-bush1' ? 0x8d909c : null);
      if (tint) o.setTint(tint);
      if (p.alpha) o.setAlpha(p.alpha);
      out.push(o);
    }
  };
  if (theme === 'castle') out.push(...castleWalls(scene, st, k));
  if (theme === 'swamp') out.push(...swampWater(scene, st, k, depth));
  props(false);
  const front = [];
  if (st.houses) out.push(...houseRooms(scene, st, k, depth));
  props(false, true);
  // (The pines' ice spikes behind the snow they stick out of or hang from.)
  if (theme === 'pines') out.push(iceSpikes(scene, st.spikes));
  // (Ground that runs on into more of the same ground, at the same height, has no edge there: a
  // patch of sticky mud in a bank, say.)
  const joins = (b, side) => st.blocks.some((o) => o !== b && o.look === b.look && o.y === b.y && (side < 0 ? o.x + o.w === b.x : b.x + b.w === o.x));
  for (const b of st.blocks) out.push(...drawBlock(scene, theme, k, { ...b, joinL: joins(b, -1), joinR: joins(b, 1) }, depth));
  // Sticky floors: a coat of glue over the top.
  const glue = scene.add.graphics();
  for (const b of st.blocks) if (b.glue) glueCoat(glue, b.x, b.y, b.w);
  out.push(glue);
  // The castle's spikes: the dungeon's. The pines': ice.
  if (theme === 'castle') out.push(...spikeArt(scene, st.spikes));
  if (st.houses) front.push(...houseFronts(scene, st, k));
  // The vents' mossy rocks (drawn here so they can shake: see update).
  const rocks = st.blocks
    .filter((b) => b.look === 'ventrock' && has(scene, 'swamp-bush1'))
    .map((b) => {
      const o = img(scene, 'swamp-bush1', b.x + b.w / 2, b.y + b.h, 0.5, 1).setDisplaySize(b.w + 16, b.h + 12).setTint(0x9fe870);
      out.push(o);
      const vent = (st.vents ?? []).findIndex((v) => Math.abs(v.x - (b.x + b.w / 2)) < b.w);
      return { o, x: b.x + b.w / 2, vent };
    });

  // ---- Gadgets ----
  const anims = scene.anims;
  const sheetAnim = (key, fps) => {
    if (has(scene, key) && !anims.exists(key)) anims.create({ key, frames: anims.generateFrameNumbers(key), frameRate: fps, repeat: -1 });
  };
  sheetAnim('pines-portal', 12);
  sheetAnim('pines-campfire', 10);
  // (Placed every frame where the rules have them: they move when the storm reaches one.)
  const portals = (st.portals ?? []).filter(() => has(scene, 'pines-portal')).map((p) => scene.add.sprite(p.x, p.y + 2, 'pines-portal').setOrigin(0.5, 1).play('pines-portal'));
  out.push(...portals);
  for (const c of st.campfires ?? []) if (has(scene, 'pines-campfire')) out.push(scene.add.sprite(c.x, c.y + 2, 'pines-campfire').setOrigin(0.5, 1).setScale(1.2).play('pines-campfire'));
  // Gas vents bubble out of the top of their mossy rocks (bubbles drawn each frame, and the
  // swamp's mud below).
  const bubbles = scene.add.graphics();
  out.push(bubbles);
  // Movers (the renderer moves them): drifting logs; small stone ledges that crumble (shaking
  // first, gone a while).
  const movers = (st.movers ?? []).map((def) => {
    // (Crushers: the dungeon's, a stone block with spikes under it, on chains.)
    if (def.kind === 'crusher') {
      const [m] = buildMovers(scene, { movers: [def] });
      out.push(m.box);
      return m;
    }
    if (def.kind === 'crumble') {
      const c = scene.add.container(def.x, def.y);
      if (def.look === 'bridge') c.add(woodRun(scene, 'board', 0, 0, def.w));
      else {
        const n = Math.max(2, Math.round(def.w / 32));
        for (let i = 0; i < n; i++) c.add(img(scene, k(i === 0 ? 'th-l' : i === n - 1 ? 'th-r' : 'th-m'), i * 32, -2).setTint(0xd8c8b0));
      }
      out.push(c);
      // Breaking: a puff of dust, then the piece drops out of sight (until it's back).
      const fall = { on: true, vy: 0, t: 0 };
      return {
        box: c,
        update: (m, anim) => {
          const dt = Math.min(0.1, Math.max(0, anim - fall.t));
          fall.t = anim;
          if (fall.on && !m[1]) {
            for (let x = 8; x < def.w; x += 20) hooks.dust?.(def.x + x, def.y + 4, 0.35);
            fall.vy = 40;
          }
          fall.on = !!m[1];
          if (fall.on) return c.setVisible(true).setAlpha(1).setPosition(def.x + (m[2] ? Math.round(Math.sin(anim * 60)) : 0), m[0]);
          fall.vy += 900 * dt;
          c.y += fall.vy * dt;
          c.setVisible(c.y < depth).setAlpha(Math.max(0, 1 - (c.y - def.y) / 200));
        },
      };
    }
    const o = has(scene, k('log')) ? img(scene, k('log'), def.x, def.y, 0, 0.3).setDisplaySize(def.w + 10, 26) : scene.add.rectangle(def.x, def.y, def.w, 10, 0x6b4a2a).setOrigin(0, 0);
    out.push(o);
    return { box: o, update: (m) => o.setPosition(m[3] - 5, m[0]) };
  });
  props(true);
  // The wind: snowflakes on the screen, blown harder in a gust; the blizzard over everything.
  // (Placed from what the camera shows, every frame, like the night sky's moon.)
  const snow = theme === 'pines' ? scene.add.graphics() : null;
  const flakes = snow ? Array.from({ length: 90 }, (_, i) => ({ x: ((i * 97) % 640) / 640, y: ((i * 53) % 360) / 360, s: 1 + (i % 2), v: 0.06 + (i % 7) * 0.015 })) : [];
  const blizzard = theme === 'pines' && has(scene, 'pines-blizzard') ? scene.add.sprite(0, 0, 'pines-blizzard').setOrigin(0, 0).setAlpha(0) : null;
  sheetAnim('pines-blizzard', 14);
  if (blizzard) blizzard.play('pines-blizzard');
  if (snow) out.push(snow);
  if (blizzard) out.push(blizzard);

  let last = 0;
  out.movers = movers;
  out.front = front;
  out.update = (camera, view, anim) => {
    const dt = Math.min(0.1, Math.max(0, anim - last));
    last = anim;
    const v = camera.worldView;
    const drift = v.centerX - middle;
    for (const { c, f } of layers) c.setPosition(drift * (1 - f), (v.centerY - level) * (1 - f) * 0.8);
    portals.forEach((o, i) => {
      const at = view?.portals?.[i];
      o.setVisible(!!at);
      if (at) o.setPosition(at[0], at[1] + 2);
    });
    // The vents' rocks shake harder and harder as they're about to blow.
    for (const r of rocks) {
      const k0 = view?.vents?.[r.vent] ?? 0;
      r.o.x = r.x + (k0 ? Math.round(Math.sin(anim * 55) * (0.5 + k0 * 2.5)) : 0);
    }
    bubbles.clear();
    // The swamp's mud: slow bubbles rising and popping.
    for (const wv of st.water ?? []) {
      for (let b = 0; b < 10; b++) {
        const t = (anim * 0.35 + b * 0.137) % 1;
        const bx = wv.x + ((b * 151) % wv.w);
        bubbles.fillStyle(0x7a5068, 0.9 * (1 - t)).fillCircle(bx + Math.sin(anim + b) * 3, wv.y + 34 - t * 32, 1.5 + (b % 3));
      }
    }
    // Vents about to puff: more and more bubbles off the top of the rock.
    (st.vents ?? []).forEach((vent, i) => {
      const n = 1 + Math.round((view?.vents?.[i] ?? 0) * 6);
      for (let b = 0; b < n; b++) {
        const t = (anim * (0.8 + b * 0.37) + b * 0.21 + i * 0.5) % 1;
        bubbles.fillStyle(0x9bd14a, 0.8 * (1 - t)).fillCircle(vent.x + Math.sin(b * 2.1 + i) * 9, vent.y - t * 22, 1.5 + (b % 2));
      }
    });
    if (!snow) return;
    // Snow, in screen space; the wind blows it sideways (a gust: hard, with the blizzard over all).
    // (Flakes live in screen fractions: 0..1 across and down the view.)
    const w = view?.wind;
    const push = w?.on ? w.dir * 1.1 : w?.warn ? w.dir * 0.25 : 0.04;
    snow.clear();
    for (const fl of flakes) {
      fl.x = (((fl.x + push * dt * (0.6 + fl.s * 0.3)) % 1) + 1) % 1;
      fl.y = (fl.y + fl.v * dt * (w?.on ? 2 : 1)) % 1;
      snow.fillStyle(0xffffff, 0.8).fillRect(v.x + fl.x * v.width, v.y + fl.y * v.height, fl.s, fl.s);
    }
    if (blizzard) {
      const want = w?.on ? 0.55 : w?.warn ? 0.15 : 0;
      blizzard.setAlpha(blizzard.alpha + (want - blizzard.alpha) * Math.min(1, dt * 4));
      blizzard.setPosition(v.x, v.y).setDisplaySize(v.width, v.height).setFlipX((w?.dir ?? 1) < 0);
    }
  };
  return out;
}

// ---- Blocks ----

function drawBlock(scene, theme, k, b, depth) {
  const { x, y, w, h, look } = b;
  const out = [];
  if (!SCENERY_LOOKS.has(look)) return out;
  // A 3x3 slice of square pieces (size px); ground: runs down out of sight with no bottom edge.
  // (The top row and any bottom row are pieces; the body between is three repeating pictures, the
  // left edge, the middle and the right edge, not a piece per square.)
  const slice = (size, ground) => {
    const cols = Math.max(1, Math.round(w / size));
    const rows = ground ? Math.ceil((depth - y) / size) : Math.max(1, Math.round(h / size));
    // (The pines' dark earth, a touch paler under the snow.)
    const earth = theme === 'pines' ? 0x9aa6b8 : 0xffffff;
    const piece = (name, px, py) => has(scene, k(name)) && out.push(img(scene, k(name), px, py).setTint(py > y ? earth : 0xffffff));
    const rowOf = (r, row) => {
      for (let c = 0; c < cols; c++) {
        const side = c === 0 && !b.joinL ? 'l' : c === cols - 1 && !b.joinR ? 'r' : '';
        piece(row && side ? `g-${row}${side}` : row ? `g-${row}` : side ? `g-${side}` : 'g-m', x + c * size, y + r * size);
      }
    };
    rowOf(0, 't');
    const bodyRows = rows - 1 - (ground ? 0 : 1);
    if (bodyRows > 0) {
      const by = y + size;
      const bh = bodyRows * size;
      const strip = (name, sx, sw) => has(scene, k(name)) && sw > 0 && out.push(tiles(scene, k(name), sx, by, sw, bh).setTint(earth));
      if (cols === 1) strip('g-m', x, size);
      else {
        strip(b.joinL ? 'g-m' : 'g-l', x, size);
        strip('g-m', x + size, (cols - 2) * size);
        strip(b.joinR ? 'g-m' : 'g-r', x + (cols - 1) * size, size);
      }
    }
    if (!ground && rows > 1) rowOf(rows - 1, 'b');
  };
  // A row of pieces: left end, middle, right end (one piece wide: `one`).
  const row = (size, l, m, r, one = null) => {
    const cols = Math.max(1, Math.round(w / size));
    if (cols === 1 && one) return out.push(img(scene, k(one), x, y));
    for (let c = 0; c < cols; c++) out.push(img(scene, k(c === 0 ? l : c === cols - 1 ? r : m), x + c * size, y));
  };
  if (look === 'ventrock') return out;
  if (look === 'moss') slice(32, true);
  else if (look === 'mossledge') row(32, 'l-l', 'l-m', 'l-r', 'l-one');
  else if (look === 'swampthin') row(32, 'th-l', 'th-m', 'th-r');
  else if (look === 'snow') slice(16, true);
  else if (look === 'pond') {
    // A frozen pond: a dip with a sheet of ice over the dark earth, no edges of its own (the
    // banks either side are the ground's own sides).
    if (has(scene, k('g-m'))) out.push(tiles(scene, k('g-m'), x, y + 6, w, depth - y - 6).setTint(0x9aa6b8));
    const g = scene.add.graphics();
    g.fillStyle(0x86c3e6, 1).fillRect(x, y - 2, w, 9).fillStyle(0xbfe6ff, 1).fillRect(x, y - 2, w, 4).fillStyle(0xeaf8ff, 1).fillRect(x, y - 2, w, 1);
    for (let gx = x + 14; gx < x + w - 18; gx += 43) g.fillStyle(0xffffff, 0.85).fillRect(gx, y, 12, 1).fillRect(gx + 17, y + 2, 5, 1);
    out.push(g);
  }
  else if (look === 'snowledge') slice(16, false);
  else if (look === 'stone') {
    // Castle stone: a stone top on red brick (the floor runs down out of sight). (Dark mortar
    // behind the stones, so no sky shows between them.)
    out.push(scene.add.rectangle(x, y, w, TILE + 1, 0x2a2230).setOrigin(0, 0));
    row(16, 'stone-l', 'stone-m', 'stone-r');
    const under = h > TILE ? depth - y - TILE : 0;
    if (under > 0) out.push(tiles(scene, k('brick'), x, y + TILE, w, under));
    // (A ledge: wooden braces under it, unless spikes hang there.)
    else if (has(scene, k('braces')) && !b.spiked) out.push(tiles(scene, k('braces'), x, y + TILE, w, 16));
  } else if (look === 'earth') {
    // A floating island: grass on top, dirt under, the underside tapering away.
    const cols = Math.round(w / 16);
    const rows = Math.round(h / 16);
    for (let c = 0; c < cols; c++) out.push(img(scene, k(c % 2 ? 'grass-r' : 'grass-l'), x + c * 16, y));
    let inset = 0;
    for (let r = 1; inset * 2 < cols; r++) {
      for (let c = inset; c < cols - inset; c++) out.push(img(scene, k(c % 2 ? 'dirt-r' : 'dirt-l'), x + c * 16, y + r * 16).setTint(r < rows ? 0xffffff : 0xb8a8a0));
      if (r >= rows - 1) inset += 1 + (r % 2);
    }
  } else if (look === 'bridge' || look === 'plank') {
    // Wood: thin, on every stage. A bridge also has ropes.
    out.push(...woodRun(scene, 'board', x, y, w));
    if (look === 'bridge') {
      const g = scene.add.graphics();
      g.lineStyle(1, 0x8a6a42, 1).lineBetween(x, y - 10, x + w, y - 10);
      for (let rx = x + 4; rx < x + w; rx += 24) g.lineBetween(rx, y - 10, rx, y);
      out.push(g);
    }
  } else if (look === 'rooftop' || look === 'rooftopteal') {
    // A building: its roof's coping on top, the wall running down, rows of windows.
    out.push(tiles(scene, k('roof'), x, y, w, 16));
    out.push(tiles(scene, k(look === 'rooftop' ? 'brick' : 'teal'), x, y + 16, w, depth - y));
    for (let wy = y + 40; wy < depth; wy += 48) for (let wx = x + 24; wx < x + w - 40; wx += 56) out.push(img(scene, k('window'), wx, wy));
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.25).fillRect(x, y + 16, 3, depth - y).fillRect(x + w - 3, y + 16, 3, depth - y);
    out.push(g);
  } else if (look === 'truss' || look === 'deck') {
    // Metal walkways (thin): a deck, and (a truss) the frame under it.
    out.push(tiles(scene, k('deck'), x, y, w, 16));
    if (look === 'truss') for (let tx = x; tx < x + w - 16; tx += 32) out.push(img(scene, k('truss-v'), tx, y + 14).setScale(0.5));
  }
  // Residencia: a ground floor (wooden boards over the building's front, running down), wooden
  // floors above (thin), rooms stuffed full of boxes.
  if (look === 'resfloor') {
    out.push(tiles(scene, k('brick'), x, y + 8, w, depth - y));
    // (The rows of windows: one repeating picture of a window in its 56x48 stretch of wall.)
    const cell = windowCell(scene, k);
    if (cell) out.push(tiles(scene, cell, x + 24, y + 40, w - 48, depth - y - 40).setTint(0x8890a8));
    out.push(...woodRun(scene, 'board', x, y, w));
  }
  if (look === 'resplank') out.push(...woodRun(scene, 'board', x, y, w));
  if (look === 'stuffed') {
    // Boxes and crates stacked to the ceiling, baked into one picture.
    out.push(img(scene, stuffedRoom(scene, w, h, Math.round(x + y)), x, y));
  }
  // A water tower's top: a bright deck to stand on (the tower under it is backdrop).
  if (look === 'tank') out.push(tiles(scene, k('deck'), x, y, w, 16));
  return out;
}

// ---- Each theme's own dressing ----

// The pines' spikes: ice. Floors stick up out of the snow, undersides hang down as icicles, walls
// point sideways; two shards to a tile, pale with a bright edge.
function iceSpikes(scene, spikes) {
  const g = scene.add.graphics();
  const shard = (bx, by, tx, ty, wide) => {
    g.fillStyle(0x9fd6f2, 1).fillTriangle(bx - wide, by, bx + wide, by, tx, ty);
    g.fillStyle(0xeaf8ff, 1).fillTriangle(bx - wide, by, bx - wide + 2, by, tx, ty);
    g.lineStyle(1, 0x5a8fb8, 1).lineBetween(bx + wide, by, tx, ty);
  };
  for (const s of spikes) {
    if (s.up || s.down) {
      for (let c = 0; c < s.width; c++) {
        const x0 = s.x + c * TILE;
        if (s.up) [[4, 11], [11, 15]].forEach(([dx, h]) => shard(x0 + dx, s.y + TILE, x0 + dx, s.y + TILE - h, 3));
        else [[5, 14], [12, 9]].forEach(([dx, h]) => shard(x0 + dx, s.y - 6, x0 + dx, s.y + h, 3));
      }
      continue;
    }
    for (let y = s.y; y < s.y + s.height * TILE; y += 8) {
      const base = s.face > 0 ? s.x + TILE : s.x;
      g.fillStyle(0x9fd6f2, 1).fillTriangle(base, y, base, y + 8, base + s.face * 10, y + 4);
    }
  }
  return g;
}

// The swamp's water, filling the gap between the banks.
function swampWater(scene, st, k, depth) {
  const out = [];
  for (const wv of st.water ?? []) {
    // Thick mud (the banks' own purple-brown, dotted), with a slick, lighter top.
    out.push(scene.add.rectangle(wv.x, wv.y, wv.w, depth - wv.y, 0x3a2234).setOrigin(0, 0));
    const dots = scene.add.graphics();
    for (let i = 0; i < (wv.w * (depth - wv.y)) / 500; i++) dots.fillStyle(0x4d2e44, 1).fillCircle(wv.x + ((i * 97) % wv.w), wv.y + 10 + ((i * 53) % (depth - wv.y - 10)), 2 + (i % 3));
    dots.fillStyle(0x5e3a52, 1).fillRect(wv.x, wv.y, wv.w, 3).fillStyle(0x7a5068, 1).fillRect(wv.x, wv.y, wv.w, 1);
    out.push(dots);
  }
  return out;
}

// The castle: its purple back wall (with battlements on top), windows, banners, the hanging cage.
function castleWalls(scene, st, k) {
  const out = [];
  const c = st.castle;
  if (!c) return out;
  // The wall: dark red brick, stone pillars every so often, battlements on top. (Dark mortar
  // behind the stone, so no sky shows between the pieces.)
  const mortar = scene.add.graphics().fillStyle(0x2a2230, 1);
  out.push(mortar);
  out.push(tiles(scene, k('brick'), c.x, c.top, c.w, -c.top + 2).setTint(0x8a6a72));
  mortar.fillRect(c.x, c.top - 16, c.w, 18);
  for (let bx = c.x; bx < c.x + c.w; bx += 32) mortar.fillRect(bx, c.top - 32, 16, 17);
  for (let px = c.x; px < c.x + c.w; px += 248) {
    mortar.fillRect(px, c.top, 16, -c.top);
    out.push(tiles(scene, k('stone-m'), px, c.top, 16, -c.top).setTint(0xa0a0b0));
  }
  out.push(tiles(scene, k('stone-m'), c.x, c.top - 16, c.w, 16));
  for (let bx = c.x; bx < c.x + c.w; bx += 32) out.push(img(scene, k('stone-m'), bx, c.top - 32));
  // Its pits: dark, all the way down.
  for (const pit of c.pits ?? (c.pit ? [c.pit] : [])) out.push(scene.add.rectangle(pit.x, 0, pit.w, 900, 0x140c12).setOrigin(0, 0));
  // Tall windows with the sky showing through.
  for (const wx of c.windows ?? []) {
    for (const wy of c.windowYs ?? [0]) {
      out.push(img(scene, k('pane'), wx, wy, 0.5, 1).setScale(0.75), img(scene, k('window'), wx, wy, 0.5, 1).setScale(0.75));
    }
  }
  for (const [bx, by] of c.banners ?? []) out.push(img(scene, k('banner'), bx, by, 0.5, 0).setScale(1.5));
  // The sea far below the islands.
  if (st.sea) out.push(scene.add.rectangle(st.sea.x, st.sea.y, st.sea.w, 400, 0x3d8fd6).setOrigin(0, 0), scene.add.rectangle(st.sea.x, st.sea.y, st.sea.w, 3, 0xbfe8ff).setOrigin(0, 0));
  return out;
}

// One window in its stretch of wall (56x48, see-through around it), made once: Residencia's rows of
// windows repeat it.
function windowCell(scene, k) {
  const key = 'retro-windowcell';
  if (scene.textures.exists(key)) return key;
  if (!scene.textures.exists(k('window'))) return null;
  const tex = scene.textures.createCanvas(key, 56, 48);
  tex.getContext().drawImage(scene.textures.get(k('window')).getSourceImage(), 0, 0);
  tex.refresh();
  return key;
}

// A room stuffed with boxes and crates (w x h px): packed tight, each row shifted half a box,
// slightly shaded; made once per room as a single picture. seed: varies the boxes.
function stuffedRoom(scene, w, h, seed) {
  const key = `retro-stuffed-${w}x${h}-${seed}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  ctx.fillStyle = '#3a2a22';
  ctx.fillRect(0, 0, w, h);
  const boxes = ['cover-box', 'cover-crate', 'cover-bigbox'].filter((b) => scene.textures.exists(b)).map((b) => scene.textures.get(b).getSourceImage());
  let n = seed;
  for (let by = h, row = 0; by > 6; by -= 13, row++) {
    for (let bx = row % 2 ? -6 : 2; bx < w - 8; bx += 15) {
      n = (n * 31 + 7) % 97;
      const im = boxes[n % boxes.length];
      if (!im) continue;
      ctx.save();
      if (n % 2 === 0) {
        ctx.translate(bx + im.width, by - im.height);
        ctx.scale(-1, 1);
        ctx.drawImage(im, 0, 0);
      } else ctx.drawImage(im, bx, by - im.height);
      ctx.restore();
    }
  }
  // (A little shade over it all.)
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(40, 30, 28, 0.25)';
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
  return key;
}

// Residencia's rooms, behind everyone: each building's back wall (its own colour), a lamp and a
// few dark things in each room.
function houseRooms(scene, st, k, depth) {
  const out = [];
  const WALLS = [0x3d3348, 0x2f3a46, 0x3d3348];
  st.houses.forEach((h, i) => {
    const g = scene.add.graphics();
    g.fillStyle(WALLS[i % WALLS.length], 1).fillRect(h.x, h.roof, h.w, h.y - h.roof);
    // (Wallpaper stripes.)
    for (let x = h.x + 6; x < h.x + h.w; x += 14) g.fillStyle(0xffffff, 0.035).fillRect(x, h.roof, 5, h.y - h.roof);
    const rooms = Math.round(h.w / 160);
    for (let f = 0; f < h.floors; f++) {
      const top = h.y - (f + 1) * h.storey;
      for (let r = 0; r < rooms; r++) {
        const cx = h.x + ((r + 0.5) * h.w) / rooms;
        g.fillStyle(0xffd27a, 1).fillRect(cx - 4, top + 4, 8, 3);
        g.fillStyle(0xffe2a0, 0.05).fillTriangle(cx - 4, top + 7, cx + 4, top + 7, cx + 30, top + 60).fillTriangle(cx - 4, top + 7, cx - 30, top + 60, cx + 30, top + 60);
      }
    }
    out.push(g);
    // A few things in the rooms (dark: looks only).
    const things = ['retro-bench', 'retro-ac', 'retro-bin', 'retro-vent'];
    for (let f = 0; f < h.floors; f++) {
      const floor = h.y - f * h.storey;
      for (let r = 0; r < rooms; r++) {
        const key = things[(i * 3 + f * 2 + r) % things.length];
        if (scene.textures.exists(key)) out.push(img(scene, key, h.x + ((r + 0.3) * h.w) / rooms, floor, 0.5, 1).setTint(0x4a4f66));
      }
    }
  });
  return out;
}

// Residencia's building fronts, over everyone: brick frames around big windows (one per room),
// faint glass, a coping on the roof (the roofs are only looks).
function houseFronts(scene, st, k) {
  const out = [];
  for (const h of st.houses) {
    const rooms = Math.round(h.w / 160);
    const g = scene.add.graphics();
    // (Glass: a faint sheen and a glint in each window.)
    g.fillStyle(0xbfe0ff, 0.05).fillRect(h.x, h.roof, h.w, h.y - h.roof);
    for (let f = 0; f < h.floors; f++) {
      const top = h.y - (f + 1) * h.storey;
      for (let r = 0; r < rooms; r++) {
        const x0 = h.x + (r * h.w) / rooms + 14;
        g.lineStyle(2, 0xffffff, 0.12).lineBetween(x0 + 6, top + 30, x0 + 26, top + 14);
      }
    }
    out.push(g);
    const brick = (x, y, w, hh) => out.push(tiles(scene, k('brick'), x, y, w, hh).setTint(0x9a8a8a));
    // The sides and the walls between rooms.
    brick(h.x - 6, h.roof, 10, h.y - h.roof);
    brick(h.x + h.w - 4, h.roof, 10, h.y - h.roof);
    for (let r = 1; r < rooms; r++) brick(h.x + (r * h.w) / rooms - 4, h.roof, 8, h.y - h.roof);
    // Under each floor (the floor's edge), and the roof's coping.
    for (let f = 1; f < h.floors; f++) brick(h.x - 6, h.y - f * h.storey + 8, h.w + 12, 8);
    brick(h.x - 6, h.roof - 6, h.w + 12, 14);
    out.push(tiles(scene, k('roof'), h.x - 10, h.roof - 20, h.w + 20, 16));
  }
  return out;
}

// The retro city's water towers (their tank tops are thin platforms).
function retroTowers(scene, st, k) {
  // (The tank's top is a thin platform: bright; the rest is backdrop: dark.)
  return (st.towers ?? []).filter(() => scene.textures.exists(k('tower'))).flatMap((t) => [
    img(scene, k('tower'), t.x, t.y, 0.5, 1).setScale(2).setTint(0x545a78),
    img(scene, k('tower'), t.x, t.y, 0.5, 1).setScale(2).setCrop(0, 0, 32, 7),
  ]);
}
