// Draws a view (sim/view.js) with plain shapes: greybox art until real sprites exist, matching
// the Godot build. Effects (sparks, shake, banners) come from sim events and never affect the rules.
// Two cameras: the main one follows the action; the HUD camera stays put.
import Phaser from 'phaser';
import { GUN_POINTS } from '../sim/gunPoints.js';
import { STRIKE, MELEE, PISTOL, GUNS, GRENADES, DASH, DOOR, VIEW_W, VIEW_H, TILE, SPIKES, BARREL, TILTED_GUNS, FOOTHOLD, HEADSHOT, FIGHTER, CAT, ANIMALS } from '../sim/constants.js';
import { swingAngle, gunOrigin, aimOrigin, spreadOf, throwOf, thrustReach, weaponOf, spinBall, swingPoints, bodyHeight } from '../sim/world.js';
import { MELEE_POINTS } from '../sim/meleePoints.js';
import { drawDosText, wrap, LINE, lineWidth } from './dosfont.js';
import { iconFrame } from './padicons.js';
import { buildVillage, isVillage, VILLAGE_LOOKS } from './village.js';
import { buildCovers, updateCovers } from './cover.js';
import { buildNight, isNight, NIGHT_LOOKS } from './night.js';
import { koLine } from './kolines.js';
import { buildDungeon, buildMovers, isDungeon, DUNGEON_LOOKS } from './dungeon.js';
import { getStage } from '../sim/stage.js';
import { PLAYER_COLORS, FONT } from './palette.js';
import { CHARACTERS } from './cast.js';
import { Sfx } from './audio.js';

const PANEL_W = 120;
// Weapon art that isn't drawn lying flat with the tip to the right: the direction it points (radians,
// y down) and where the hand holds it. Everything else is held at (0.12, 0.5).
// mirror: the art's top side is the one that should face down (so it's flipped the other way).
// Weapons drawn tilted 45° (tip up and right), held where it says (shares of the sprite's size);
// the same list as tools/melee_points.py.
const diag = (ox, oy) => ({ angle: -Math.PI / 4, ox, oy, mirror: true });
// Shots drawn as animated sprites: their strip and frames per second.
const SPRITE_SHOTS = { coin: ['cash-coin', 10], goldcoin: ['cash-goldcoin', 16], bill: ['cash-bill', 10], diamond: ['cash-diamond', 10], cards: ['card-fly', 20], jackpot: ['chest', 0] };
// How long the hand takes to whip a card overhead (s).
const CARD_TOSS = 0.16;
const TILTED = { knife: diag(0.2, 0.8), halberd: diag(0.3, 0.7), morningstar: diag(0.25, 0.75), carrot: diag(0.25, 0.75), fish: diag(0.15, 0.85), shovel: diag(0.15, 0.85), nodachi: diag(0.12, 0.88) };

export { CHARACTERS };

// Character animations (made once per game): idle and run loops.
export function makeCharacterAnims(scene) {
  for (const c of CHARACTERS) {
    if (!scene.textures.exists(`${c}-idle`) || scene.anims.exists(`${c}-idle`)) continue;
    scene.anims.create({ key: `${c}-idle`, frames: scene.anims.generateFrameNumbers(`${c}-idle`, { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    scene.anims.create({ key: `${c}-run`, frames: scene.anims.generateFrameNumbers(`${c}-run`, { start: 0, end: 5 }), frameRate: 12, repeat: -1 });
  }
  // Falling asleep: the fall strip cut into frames the size of the stun pose.
  for (const c of CHARACTERS) {
    const key = `${c}-fall`;
    if (!scene.textures.exists(key) || !scene.textures.exists(`${c}-stun`) || scene.textures.get(key).frameTotal > 2) continue;
    const w = scene.textures.get(`${c}-stun`).getSourceImage().width;
    const tex = scene.textures.get(key);
    const src = tex.getSourceImage();
    for (let k = 0; k < Math.floor(src.width / w); k++) tex.add(k, 0, k * w, 0, w, src.height);
  }
  // The Ring of Cat's cats: idle, walk and run loops; lying down and a meow, once each.
  for (let n = 1; n <= CAT.kinds; n++) {
    const k = `cat${n}`;
    if (!scene.textures.exists(`${k}-idle`) || scene.anims.exists(`${k}-idle`)) continue;
    const anim = (name, fps, repeat = -1) => scene.anims.create({ key: `${k}-${name}`, frames: scene.anims.generateFrameNumbers(`${k}-${name}`), frameRate: fps, repeat });
    anim('idle', 8);
    anim('walk', 10);
    anim('run', 16);
    anim('laying', 10, 0);
    anim('meow', 8, 0);
  }
  // The polymorph potion's animals: a walk (standing still is just the first frame).
  for (const a of ANIMALS) {
    if (!scene.textures.exists(`animal-${a}`) || scene.anims.exists(`${a}-walk`)) continue;
    scene.anims.create({ key: `${a}-walk`, frames: scene.anims.generateFrameNumbers(`animal-${a}`, { start: 4, end: 7 }), frameRate: 10, repeat: -1 });
  }
}

// How long falling asleep takes to play (s), out of the sleep's SLEEP.time.
const FALL_TIME = 1;

// Where a cat's feet are in its 50 px frames (drawn standing on the fighter's feet).
const CAT_FEET = 32 / 50;

// Background art (public/art/<name>.png): distant towers and nearer buildings, mixed at random.
export const CITY = {
  far: ['far0', 'far1', 'far2', 'far3'],
  near: ['near0', 'near1', 'nearB1', 'nearB2', 'nearB3'],
};
const C = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;

export class Renderer {
  // locals: indexes of players on this screen (the camera follows them); mouseLook: lean toward the pointer.
  constructor(scene, roster, you, locals, mouseLook, stageKey = 'warehouse') {
    this.scene = scene;
    this.roster = roster;
    this.you = you;
    this.locals = locals.length ? locals : roster.map((_, i) => i);
    // Watching (nobody on this screen in the match, or all of them out): the spectator camera.
    // spectator: its input (see spectate.js), set by the match.
    this.ownLocals = locals;
    this.spectator = null;
    this.spec = { target: -1, last: -1, free: false, zoom: 1, x: 0, y: 0, on: false };
    this.mouseLook = mouseLook;
    // The canvas is drawn at a multiple of the 640×360 view (see RENDER_SCALE in game.js); both
    // cameras zoom by it, and text is drawn at it.
    this.res = Math.max(1, Math.round(scene.scale.width / VIEW_W));
    this.st = getStage(stageKey);
    this.particles = [];
    this.rings = [];
    this.puffs = []; // cloud puffs playing: { img, age, frames, fps }
    this.cloudSpawn = new Map(); // cloud id -> seconds until its next puff
    this.holeImgs = new Map(); // black hole id -> its swirling sprite
    this.moneyImgs = new Map(); // money flying or lying around, and flying cards: id -> sprite
    this.cardThrow = roster.map(() => 0); // seconds left in each fighter's card-throwing swing
    this.throwWasReady = roster.map(() => true); // (to blink a kept weapon when its throw is ready again)
    this.throwReadyAt = roster.map(() => -1);
    this.chestImg = null;
    this.havenG = scene.add.graphics(); // the banner's zone, painted behind everyone
    this.havenFlag = null;
    this.trauma = 0;
    this.bannerText = '';
    this.bannerTime = 0;
    this.pulse = roster.map(() => 0);
    this.sfx = new Sfx(scene, this.locals);
    this.lastCount = null; // the countdown number last beeped
    this.lastStorm = null; // the storm stage last announced
    this.anim = 0;

    this.world = scene.add.layer();
    this.hud = scene.add.layer();
    const art = (key) => scene.textures.exists(key) && key;
    const layers = [];
    // (Cover is drawn on its own, so it can break: see cover.js.)
    const fixed = { ...this.st, blocks: this.st.blocks.filter((b) => !b.cover) };
    const kitFacades = new Set();
    if (isDungeon(this.st) && art('dungeon')) {
      // The dungeon dresses itself from its tileset (src/game/dungeon.js).
      layers.push(...buildDungeon(scene, fixed));
      this.moverArt = buildMovers(scene, this.st);
      layers.push(...this.moverArt.map((m) => m.box));
    } else if (isVillage(this.st) && art('village')) {
      // The village dresses itself from its tileset (src/game/village.js).
      layers.push(...buildVillage(scene, fixed));
    } else if (isNight(this.st) && art('dungeon')) {
      // The night stages: a starry sky, a floating slab or a rooftop (src/game/night.js).
      this.nightArt = buildNight(scene, fixed);
      layers.push(...this.nightArt);
    } else {
      const sky = scene.add.graphics();
      const back = scene.add.graphics();
      const cityArt = art('sky') && CITY.far.some(art) && CITY.near.some(art);
      drawBackdrop(sky, back, this.st, !cityArt);
      layers.push(sky);
      if (cityArt) layers.push(...this.buildCity(scene));
      layers.push(back);
      // Kit-built walls. The dark doorway marks are drawn on top (in drawBlocks) so hideable doors read clearly.
      for (const run of this.st.kitRuns ?? []) {
        const kit = scene.cache.json.get(`kit-${run.kit}`);
        if (kit) layers.push(...buildKitRun(scene, kit, run, this.st.doors));
      }
      // Building fronts from kit columns; drawBlocks adds the trim (cornice, edges, neon) on top.
      for (const fa of this.st.facades ?? []) {
        const kit = fa.kit && scene.cache.json.get(`kit-${fa.kit}`);
        if (!kit) continue;
        layers.push(...buildFacadeColumns(scene, kit, fa));
        kitFacades.add(fa);
      }
    }
    const blocks = scene.add.graphics();
    drawBlocks(blocks, fixed, kitFacades);
    layers.push(blocks);
    this.covers = buildCovers(scene, this.st);
    for (const c of this.covers) layers.push(...c.parts);
    this.barrelImages = art('barrel') ? this.st.barrels.map((b) => scene.add.image(b.x, b.y + 1, 'barrel').setOrigin(0.5, 1)) : null;
    if (this.barrelImages) layers.push(...this.barrelImages);
    // Character sprites (Pixel Crawler by Anokolisa): one per player slot, cycling the cast.
    // Each player's character: picked for the match (roster[i].char), or the cast in order.
    this.chars = roster.map((p, i) => (CHARACTERS.includes(p.char) ? p.char : CHARACTERS[i % CHARACTERS.length]));
    this.bodies = art(`${this.chars[0]}-idle`) ? roster.map((_, i) => scene.add.sprite(0, 0, `${this.chars[i]}-idle`, 0).setOrigin(0.5, 1).setVisible(false)) : null;
    // The weapon not in hand, resting on the back (behind the body), greyed out.
    this.backs = roster.map(() => scene.add.image(0, 0, '__WHITE').setVisible(false));
    layers.push(...this.backs);
    if (this.bodies) layers.push(...this.bodies);
    // The crown: on the head of whoever wears it (view.crown: last round's winner, or whoever
    // knocked them out under the bounty rule).
    this.crowns = roster.map(() => (art('crown') ? scene.add.image(0, 0, 'crown').setOrigin(0.5, 1).setVisible(false) : null));
    // Held-up items (the key over the head, the banner on the back) and the lamp being rubbed.
    this.carried = roster.map(() => scene.add.sprite(0, 0, '__WHITE').setVisible(false));
    layers.push(...this.carried);
    // The pick-up prompt's controller button picture.
    this.promptIcon = scene.textures.exists('buttons') ? scene.add.sprite(0, 0, 'buttons', 0).setVisible(false) : null;
    if (this.promptIcon) layers.push(this.promptIcon);
    layers.push(...this.crowns.filter(Boolean));
    this.g = scene.add.graphics();
    // Floating guns: their own sprites, pointed at the aim, with a hand drawn over the grip.
    this.guns = art('pistol') ? roster.map(() => scene.add.image(0, 0, 'pistol').setOrigin(0.3, 0.6).setVisible(false)) : null;
    // The grenade in hand while it cooks; grenades in flight; smoke and poison clouds (over the fighters).
    this.heldNades = roster.map(() => scene.add.image(0, 0, '__WHITE').setVisible(false));
    this.nadeImgs = new Map();
    this.cloudG = scene.add.graphics();
    this.ghosts = []; // dash afterimages: { img, life }
    // Floating melee weapons, held at the handle (texture swapped to whatever the fighter carries).
    this.blades = roster.map(() => scene.add.image(0, 0, '__WHITE').setOrigin(0.12, 0.5).setVisible(false));
    this.katanas = roster.map(() => scene.add.image(0, 0, '__WHITE').setOrigin(0.12, 0.5).setVisible(false)); // gun slot
    this.trails = roster.map(() => []); // recent hitbox-edge points of a swing, for the speed lines
    this.pickupImgs = new Map();
    this.thrown = new Map(); // thrown melee weapons (bullets with a kind), tumbling
    this.words = []; // Keyboard words floating where they landed
    this.hands = scene.add.graphics();
    // Floating hands from the character pack: [0] holds the gun-slot weapon or waits as a fist,
    // [1] holds the swinging melee weapon or throws the punch.
    this.handImgs = art('hand') ? roster.map((_, i) => [0, 1].map(() => scene.add.image(0, 0, this.handKey(i)).setVisible(false))) : null;
    this.speed = scene.add.graphics();
    this.fx = scene.add.graphics();
    this.stormG = scene.add.graphics();
    this.crossG = scene.add.graphics(); // the mouse player's crosshair, over everything
    this.tags = roster.map((p, i) =>
      scene.add
        .text(0, 0, p.name, { fontFamily: FONT, fontSize: '8px', color: PLAYER_COLORS[i].css, resolution: this.res })
        .setOrigin(0.5, 1),
    );
    // Asleep: "z.. zz.. zzz" over the sleeper, in light blue.
    this.zzz = roster.map(() => scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '8px', fontStyle: 'bold', color: '#9fd8ff', stroke: '#0b0d18', strokeThickness: 2, resolution: this.res }).setOrigin(0, 1).setVisible(false));
    this.world.add([...layers, this.g, ...this.blades, ...this.katanas, ...(this.guns ?? []), this.hands, ...(this.handImgs ?? []).flat(), ...this.heldNades, this.speed, ...this.tags, ...this.zzz, this.cloudG, this.fx, this.stormG, this.crossG]);
    // Training: hitboxes drawn over everything (see drawHitboxes; off unless switched on).
    this.showHitboxes = false;
    this.hitboxG = scene.add.graphics();
    this.world.add(this.hitboxG);
    // (The banner's zone is painted over the stage, behind the fighters.)
    this.world.addAt(this.havenG, this.world.getIndex(this.g));

    this.hudG = scene.add.graphics();
    // (Up to 4 player cards at full width; more share the screen's width.)
    this.panelW = Math.min(PANEL_W, Math.floor(VIEW_W / roster.length));
    this.panels = roster.map((p, i) => {
      const x = VIEW_W / 2 - (roster.length * this.panelW) / 2 + i * this.panelW;
      const text = (size, color) => scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, resolution: this.res });
      const nades = [0, 1].map(() => scene.add.image(0, 0, '__WHITE').setVisible(false));
      // The weapons carried, drawn lying flat: the gun slot above, the melee slot below.
      const gunIcon = scene.add.image(0, 0, '__WHITE').setOrigin(0, 0.5).setVisible(false);
      const meleeIcon = scene.add.image(0, 0, '__WHITE').setOrigin(0, 0.5).setVisible(false);
      return { x, nades, gunIcon, meleeIcon, name: text(10, PLAYER_COLORS[i].css).setText(p.name), damage: text(20, '#ffffff'), ammo: text(9, '#ffd966'), melee: text(8, '#d9dcf2'), ms: text(7, '#9aa1c7').setOrigin(1, 1) };
    });
    this.stormText = scene.add.text(VIEW_W / 2, 10, '', { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#ff7399', resolution: this.res }).setOrigin(0.5, 0);
    this.banner = scene.add
      .text(VIEW_W / 2, VIEW_H * 0.36, '', { fontFamily: FONT, fontSize: '48px', fontStyle: 'bold', color: '#ffffff', stroke: '#0b0d18', strokeThickness: 8, resolution: this.res })
      .setOrigin(0.5);
    // Knockout lines, top left (see kolines.js): the newest at the bottom, each fading out.
    this.feed = [];
    this.specText = scene.add.text(VIEW_W / 2, 26, '', { fontFamily: FONT, fontSize: '9px', fontStyle: 'bold', color: '#d9dcf2', align: 'center', stroke: '#0b0d18', strokeThickness: 3, resolution: this.res }).setOrigin(0.5, 0);
    this.hud.add([this.hudG, ...this.panels.flatMap((p) => [p.name, p.damage, p.ammo, p.melee, p.ms, p.gunIcon, p.meleeIcon, ...p.nades]), this.stormText, this.banner, this.specText]);

    const cam = scene.cameras.main;
    const b = this.st.camera;
    cam.setBounds(b.left, b.top, b.right - b.left, b.bottom - b.top);
    cam.ignore(this.hud);
    cam.setZoom(this.res);
    this.hudCam = scene.cameras.add(0, 0, VIEW_W * this.res, VIEW_H * this.res).setZoom(this.res).centerOn(VIEW_W / 2, VIEW_H / 2);
    this.hudCam.ignore(this.world);
    const sp = this.st.spawns[this.locals[0] % this.st.spawns.length];
    cam.centerOn(sp.x, sp.y - 30);
  }

  // The city behind the warehouse, in depth layers that scroll slower the further away they are:
  // a starry sky, dark distant towers, then nearer buildings with gaps. Each building row sits on a
  // dark base that fills down to the back wall, so no empty sky shows below the buildings.
  buildCity(scene) {
    const c = this.st.camera;
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const out = [];
    // Sky: pinned to the screen, drifting slightly as the camera moves (see updateCamera).
    this.sky = scene.add.tileSprite(0, 0, VIEW_W, 200, 'sky').setOrigin(0, 0).setTileScale(2).setScrollFactor(0, 0);
    out.push(this.sky);
    // sink: how far each building may randomly sit lower, so rooftops don't line up.
    const row = (keys, factor, baseY, gapMin, gapMax, sink, tint, baseColor) => {
      const from = c.left - 600;
      const to = c.right * factor + VIEW_W + 600;
      for (let x = from; x < to; ) {
        const key = keys[Math.floor(rnd() * keys.length)];
        const img = scene.add.image(x, baseY + Math.round(rnd() * sink), key).setOrigin(0, 1).setScrollFactor(factor, factor).setTint(tint);
        if (rnd() < 0.5) img.setFlipX(true);
        out.push(img);
        x += img.width + gapMin + rnd() * (gapMax - gapMin);
      }
      // Dark base, overlapping the building bottoms (hides their ground shadows).
      out.push(scene.add.rectangle(from, baseY - 12, to - from, 500, baseColor).setOrigin(0, 0).setScrollFactor(factor, factor));
    };
    const have = (keys) => keys.filter((k) => scene.textures.exists(k));
    // Towers sit highest, so they rise above the buildings; buildings overlap (negative gaps) in two rows.
    row(have(CITY.far), 0.25, 62, 4, 36, 25, 0x48557a, C('#171c36'));
    row(have(CITY.near), 0.38, 70, -40, 30, 40, 0x46445f, C('#14182f'));
    row(have(CITY.near), 0.5, 56, -30, 60, 35, 0x6c6888, C('#12152b'));
    return out;
  }

  effects(events) {
    for (const e of events) {
      this.sfx.event(e);
      switch (e.type) {
        case 'hit':
          this.burst(e.x, e.y, 0, 0, 8, 160, 0xffffff, 100);
          if (this.pulse[e.id] !== undefined) this.pulse[e.id] = 0.2;
          if (e.power > 250) this.shake(Math.min(0.5, Math.max(0.1, e.power / 1500)));
          break;
        case 'spark':
          this.burst(e.x, e.y, e.dx, e.dy, 6, 120, C('#ffe699'), 200, 0.6);
          break;
        case 'dust':
          this.burst(e.x, e.y, 0, -1, 5, 50, C('#bfc7e6'), 0, 1.4);
          break;
        case 'airjump':
          this.burst(e.x, e.y, 0, 1, 6, 70, C('#8ce6ff'), 0, 0.8);
          break;
        case 'shoot':
          if (e.gun === 'cards' && this.cardThrow[e.id] !== undefined) this.cardThrow[e.id] = CARD_TOSS;
          if (e.gun === 'cards') break; // (no shell)
          this.particles.push({ x: e.x, y: e.y, vx: e.dir * (40 + Math.random() * 30), vy: -70 - Math.random() * 40, life: 0.8, color: C('#d9a441'), g: 600, s: 2 });
          break;
        case 'explosion':
          this.burst(e.x, e.y, 0, 0, 26, 220, C('#ff9933'), 120);
          this.burst(e.x, e.y, 0, 0, 14, 120, C('#595466'), -40);
          this.rings.push({ x: e.x, y: e.y, r: 6, life: 0.25 });
          this.shake(0.6);
          break;
        case 'fireball':
          this.burst(e.x, e.y, 0, 0, 34, 200, C('#ff5a1f'), -60);
          this.burst(e.x, e.y, 0, 0, 20, 140, C('#ffd23f'), -90);
          this.rings.push({ x: e.x, y: e.y, r: 6, life: 0.3 });
          this.shake(0.5);
          break;
        case 'cloud':
          this.burst(e.x, e.y, 0, 0, 18, 120, e.kind === 'poison' ? C('#8fdc4a') : C('#c8c8d0'), -20);
          break;
        case 'warp':
          this.burst(e.x, e.y, 0, 0, 18, 160, C('#b78cff'), 0);
          this.rings.push({ x: e.x, y: e.y, r: 4, life: 0.25 });
          break;
        case 'combo':
          this.addWord({ x: e.x, y: e.y, text: 'COMBO', scale: 0 });
          this.shake(0.3);
          break;
        case 'dash':
          this.burst(e.x, e.y - 4, 0, -1, 8, 90, C('#bff4ff'), 0, 1.4);
          break;
        case 'evade':
          // A dash slipping past a hit.
          this.burst(e.x, e.y, 0, 0, 10, 130, PLAYER_COLORS[e.id]?.hex ?? 0xffffff, 0);
          this.rings.push({ x: e.x, y: e.y, r: 4, life: 0.18 });
          break;
        case 'hooked':
          this.burst(e.x, e.y, 0, 0, 12, 140, C('#c9c3d8'), 0);
          this.rings.push({ x: e.x, y: e.y, r: 3, life: 0.2 });
          this.shake(0.2);
          break;
        case 'swap':
          this.burst(e.x, e.y, 0, -1, 6, 60, C('#ffd966'), 0, 1.2);
          break;
        case 'beam': {
          // The railgun's beam: a line of light along its whole length, fading.
          const n = Math.ceil(Math.hypot(e.x2 - e.x1, e.y2 - e.y1) / 4);
          for (let k = 0; k <= n; k++) {
            const t = k / n;
            this.particles.push({ x: e.x1 + (e.x2 - e.x1) * t, y: e.y1 + (e.y2 - e.y1) * t, vx: 0, vy: 0, life: 0.25 + Math.random() * 0.1, color: k % 3 ? C('#6fe3f0') : 0xffffff, g: 0, s: 2 });
          }
          this.shake(0.4);
          break;
        }
        case 'heal':
          this.burst(e.x, e.y, 0, -1, 10, 70, C('#7dff9a'), -40, 0.9);
          break;
        case 'morph':
          // Turned into a cat (meow!) or an animal: a puff.
          this.dust(e.x, e.y, 0.8);
          this.burst(e.x, e.y, 0, -1, 10, 80, e.cat ? C('#5be38a') : 0xffffff, 0, 1);
          if (e.cat) (this.meowAt ??= [])[e.id] = this.anim;
          break;
        case 'unmorph':
          this.dust(e.x, e.y, 0.8);
          break;
        case 'poof':
          // The polymorph potion breaking: a ring of rainbow sparks.
          for (const color of ['#ff5d73', '#ffcf6b', '#7dffb0', '#8ef0ff', '#b78cff']) this.burst(e.x, e.y, 0, 0, 6, 160, C(color), 0, 0.9);
          break;
        case 'item':
          this.burst(e.x, e.y, 0, -1, 8, 70, C('#fff4c2'), 0, 1.2);
          break;
        case 'drop':
          this.burst(e.x, e.y, 0, 1, 6, 60, 0xffffff, 200, 1.2);
          break;
        case 'wish':
          this.burst(e.x, e.y, 0, -1, 20, 140, e.wish === 'jinx' ? C('#b78cff') : C('#ffe14d'), -20, 1.4);
          this.addWord({ x: e.x, y: e.y - 6, text: { legendary: 'LEGENDARY!', heal: 'FULL HEAL', jinx: 'JINXED', doom: 'YOUR WISH: DOOM' }[e.wish], scale: 0 });
          break;
        case 'banner':
          this.burst(e.x, e.y, 0, 0, 40, 260, PLAYER_COLORS[e.id]?.hex ?? 0xffffff, 60);
          this.addWord({ x: e.x, y: e.y - 6, text: 'EXTRA LIFE', scale: 0 });
          this.shake(0.7);
          break;
        case 'chest':
          this.playOnce('chest-open', e.x, e.y + 1, 10);
          this.burst(e.x, e.y - 12, 0, -1, 24, 160, C('#ffd23f'), 120, 1.2);
          this.addWord({ x: e.x, y: e.y - 34, text: 'LEGENDARY!', scale: 0 });
          break;
        case 'crown':
          this.rings.push({ x: e.x, y: e.y, r: 4, life: 0.3 });
          this.addWord({ x: e.x, y: e.y - 6, text: 'NEW CHAMPION', scale: 0 });
          break;
        case 'moneyblast':
          this.burst(e.x, e.y, 0, 0, 26, 220, C('#ff9933'), 120);
          this.burst(e.x, e.y, 0, 0, 16, 180, C('#ffd23f'), 160);
          this.rings.push({ x: e.x, y: e.y, r: 6, life: 0.25 });
          this.shake(0.6);
          break;
        case 'radiation':
          // THE WARNING's charged hit: a burst of sickly green, and a ring as big as its reach.
          this.burst(e.x, e.y, 0, 0, 30, 200, C('#b6ff3a'), 0);
          this.burst(e.x, e.y, 0, 0, 14, 120, C('#ffd23f'), -40);
          this.rings.push({ x: e.x, y: e.y, r: 6, life: 0.35 });
          this.shake(0.5);
          break;
        case 'irradiated':
          this.addWord({ x: e.x, y: e.y, text: { haste: 'FAST', iron: 'IRON', feather: 'FLOATY', jinx: 'JINXED', slip: 'SLIPPERY', burn: 'ON FIRE', homing: 'HOMING' }[e.effect] ?? '???', scale: 0 });
          break;
        case 'break':
          this.burst(e.x, e.y, 0, 0, 22, 200, 0xffffff, 0);
          this.rings.push({ x: e.x, y: e.y, r: 6, life: 0.3 });
          this.addWord({ x: e.x, y: e.y - 18, text: 'BREAK!', scale: 0 });
          this.shake(0.3);
          break;
        case 'plant':
          this.burst(e.x, e.y + 16, 0, -1, 20, 140, PLAYER_COLORS[e.id]?.hex ?? 0xffffff, 120, 1.3);
          this.addWord({ x: e.x, y: e.y - 20, text: 'MELEE ONLY', scale: 0 });
          this.shake(0.3);
          break;
        case 'unplant':
          this.burst(e.x, e.y, 0, -1, 14, 90, PLAYER_COLORS[e.id]?.hex ?? 0xffffff, 60, 1.4);
          break;
        case 'fizzle':
          // A shot or a grenade vanishing into the banner's zone.
          this.burst(e.x, e.y, 0, 0, 6, 50, C('#c8c8d0'), -20);
          break;
        case 'jam':
          this.burst(e.x, e.y, 0, -1, 3, 40, C('#c8c8d0'), 0, 1);
          break;
        case 'stylefull':
          this.burst(e.x, e.y, 0, -1, 10, 90, C('#ff6ad5'), 0, 1.2);
          break;
        case 'stylereload':
          this.burst(e.x, e.y, 0, -1, 16, 120, C('#ff6ad5'), 0, 1.4);
          this.addWord({ x: e.x, y: e.y - 6, text: 'STYLISH RELOAD', scale: 0 });
          break;
        case 'catch':
          this.burst(e.x, e.y, 0, 0, 8, 80, 0xffffff, 0);
          this.addWord({ x: e.x, y: e.y - 14, text: 'NICE CATCH', scale: 0 });
          break;
        case 'ammo':
          this.playOnce('chest-open', e.x, e.y + 1, 12);
          this.burst(e.x, e.y - 14, 0, -1, 14, 110, C('#ffd966'), 160, 1.2);
          this.addWord({ x: e.x, y: e.y - 34, text: 'RELOADED', scale: 0 });
          break;
        case 'hole':
          this.rings.push({ x: e.x, y: e.y, r: 4, life: 0.3 });
          this.shake(0.3);
          break;
        case 'jackpot':
          // The chest bursting open.
          this.playOnce('chest-open', e.x, e.y + 16, 14);
          this.burst(e.x, e.y, 0, 0, 24, 220, C('#ffd23f'), 200);
          this.burst(e.x, e.y, 0, 0, 12, 160, C('#5fbf4a'), 120);
          this.rings.push({ x: e.x, y: e.y, r: 6, life: 0.25 });
          this.shake(0.4);
          break;
        case 'cash':
          // Money picked up: a little green heal.
          this.burst(e.x, e.y, 0, -1, 6, 60, C('#7dff9a'), -40, 0.9);
          break;
        case 'splat':
          this.burst(e.x, e.y - 2, 0, -1, 10, 90, C('#8fdc4a'), 400, 1.3);
          break;
        case 'stick':
          this.burst(e.x, e.y, 0, -1, 4, 50, C('#d9cfa0'), 0, 1.4);
          break;
        case 'critical':
          // A full-power club hit: the big crack.
          this.shake(1);
          this.burst(e.x, e.y, 0, 0, 36, 300, C('#ffe14d'), 40);
          this.burst(e.x, e.y, 0, 0, 16, 200, 0xffffff, 0);
          this.rings.push({ x: e.x, y: e.y, r: 6, life: 0.35 });
          break;
        case 'ting':
          // A shot ringing off the frying pan.
          this.burst(e.x, e.y, 0, 0, 8, 150, C('#fff4c2'), 0);
          this.rings.push({ x: e.x, y: e.y, r: 2, life: 0.15 });
          break;
        case 'bite':
          // A bite of ham or carrot: crumbs, and (the ham) a little heal.
          this.burst(e.x, e.y, 0, -1, 6, 70, e.weapon === 'carrot' ? C('#ff9a3c') : C('#e8806a'), 300, 1.2);
          if (e.heal) this.burst(e.x, e.y - 6, 0, -1, 6, 50, C('#7dff9a'), -30, 0.8);
          break;
        case 'yoink':
          this.addWord({ x: e.x, y: e.y - 8, text: 'YOINK', scale: 0 });
          break;
        case 'headshot':
          this.addWord({ x: e.x, y: e.y, text: 'HEADSHOT', scale: 0 });
          break;
        case 'backstab':
          this.addWord({ x: e.x, y: e.y, text: 'BACKSTAB', scale: 0 });
          break;
        case 'ko':
          this.addFeed(koLine(e, this.roster.map((p) => p.name)), e.id);
          this.burst(e.x, e.y, 0, 0, 40, 320, PLAYER_COLORS[e.id]?.hex ?? 0xffffff, 80);
          this.rings.push({ x: e.x, y: e.y, r: 10, life: 0.35 });
          this.shake(0.8);
          break;
        case 'block':
          this.burst(e.x, e.y, 0, -1, 5, 80, C('#9ec9ff'), 0, 1.2);
          break;
        case 'parry':
          this.burst(e.x, e.y, 0, 0, 16, 180, C('#ffe14d'), 0);
          this.rings.push({ x: e.x, y: e.y, r: 4, life: 0.2 });
          this.shake(0.3);
          break;
        case 'word':
          this.addWord(e);
          break;
        case 'launch':
          // The 100% keyboard word's launch: shake, a golden burst and rings.
          this.shake(0.9);
          this.burst(e.x, e.y, 0, 0, 30, 280, C('#ffe14d'), 60);
          this.rings.push({ x: e.x, y: e.y, r: 6, life: 0.3 });
          break;
        case 'deflect':
          this.burst(e.x, e.y, 0, 0, 10, 160, C('#bff4ff'), 0);
          this.rings.push({ x: e.x, y: e.y, r: 3, life: 0.15 });
          break;
        case 'coverbreak':
          // Cover shot to pieces: splinters, and a cloud of dust where it stood.
          this.burst(e.x, e.y, 0, -1, 26, 170, C('#8a5a34'), 260, 1.6);
          this.burst(e.x, e.y, 0, -1, 10, 120, C('#c9c2b0'), 0, 2);
          for (let k = 0; k < 6; k++) this.dust(e.x + ((k + 0.5) / 6 - 0.5) * e.w * 1.2, e.y + 4 - Math.random() * 8, 0.45 + Math.random() * 0.2);
          this.shake(0.25);
          break;
        case 'toobig':
          this.addWord({ x: e.x, y: e.y - 8, text: 'TOO BIG FOR COVER', scale: 0 });
          break;
        case 'destroyed':
          this.burst(e.x, e.y - 6, 0, -1, 12, 90, C('#ff4d80'), -20, 1.4);
          break;
        case 'pickup':
        case 'spawn':
          this.burst(e.x, e.y - 6, 0, -1, 8, 70, 0xffffff, 0, 1.2);
          break;
        case 'go':
          this.showBanner('GO!', 0.8);
          break;
        case 'game':
          this.showBanner('GAME!', 2);
          break;
      }
    }
  }

  burst(x, y, dx, dy, count, speed, color, gravity, spread = 0) {
    for (let i = 0; i < count; i++) {
      let a;
      if (dx === 0 && dy === 0) a = Math.random() * Math.PI * 2;
      else a = Math.atan2(dy, dx) + (Math.random() * 2 - 1) * spread;
      const s = speed * (dx === 0 && dy === 0 ? 0.3 + Math.random() * 0.7 : 0.4 + Math.random() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + Math.random() * 0.35, color, g: gravity, s: 1 + Math.random() * 2 });
    }
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  showBanner(text, seconds) {
    this.bannerText = text;
    this.bannerTime = seconds;
  }

  // Keyboard hit: the word gets typed out fast above where it landed (DOS font, blinking block
  // cursor), lingers, drifts up and fades. The 100% word is typed big, in yellow, on two lines.
  addWord(e) {
    const big = e.scale >= 1;
    const scale = big ? 2 : 1;
    const lines = big ? wrap(e.text, 14) : [e.text];
    const chars = lines.reduce((n, l) => n + l.length + 1, -1);
    // Same typing speeds the rules use, so the 100% launch lands as the last letter does.
    const cps = big ? MELEE.keyboard.bigTypeSpeed : MELEE.keyboard.typeSpeed;
    const typing = chars / cps;
    const g = this.scene.add.graphics();
    this.world.add(g);
    const top = e.y - 16 - lines.length * LINE * scale;
    this.words.push({ g, lines, x: e.x, y: top, scale, big, chars, cps, age: 0, total: typing + (big ? 1.4 : 0.8) });
    if (big) {
      // The wow moment starts with a flash and a ring; the launch itself adds the rest.
      this.scene.cameras.main.flash(140, 255, 240, 170);
      this.rings.push({ x: e.x, y: e.y, r: 2, life: 0.4 });
    }
  }

  drawWords(dt) {
    this.words = this.words.filter((w) => {
      w.age += dt;
      if (w.age >= w.total) {
        w.g.destroy();
        return false;
      }
      w.y -= dt * (w.big ? 6 : 10);
      const shown = Math.floor(w.age * w.cps);
      const typing = shown < w.chars;
      w.g.clear();
      drawDosText(w.g, w.lines, w.x, Math.round(w.y), {
        scale: w.scale,
        color: w.big ? C('#ffe14d') : 0xffffff,
        outline: w.big ? C('#5a1e00') : C('#0b0d18'),
        alpha: Math.min(1, (w.total - w.age) * 3),
        shown,
        cursor: typing && Math.floor(w.age * 16) % 2 === 0,
      });
      return true;
    });
  }

  // Weapons lying around: bobbing, with a pulsing glow and their name; "E" when you're close.
  drawPickups(view) {
    const seen = new Set();
    let iconShown = false;
    for (const p of view.pickups ?? []) {
      seen.add(p.id);
      let img = this.pickupImgs.get(p.id);
      if (!img) {
        img = this.scene.add.image(p.x, p.y, this.scene.textures.exists(p.weapon) ? p.weapon : '__WHITE').setOrigin(0.5, 1);
        this.world.addAt(img, this.world.getIndex(this.g)); // just behind the fighters
        this.pickupImgs.set(p.id, img);
      }
      const bob = Math.round(Math.sin(this.anim * 4 + p.id) * 2);
      img.setPosition(p.x, p.y - 6 + bob).setVisible(!(p.blink && Math.floor(this.anim * 8) % 2 === 0));
      const pulse = 0.35 + 0.25 * Math.sin(this.anim * 6 + p.id);
      this.g.lineStyle(1, 0xffffff, pulse).strokeEllipse(p.x, p.y - 2, 24, 6);
      const near = this.locals.find((i) => {
        const f = view.fighters[i];
        return f && f.state === 'ok' && Math.abs(f.x - p.x) <= 16 && Math.abs(f.y - p.y) <= 24;
      });
      if (near !== undefined) {
        // The pick-up button of whoever is standing there: their key, or their controller's button.
        const c = this.scene.controls?.[near];
        const icon = c?.buttonIcon('pickup');
        if (icon && this.promptIcon) {
          // A controller: its button's picture, pressing itself now and then.
          this.promptIcon.setFrame(iconFrame(icon.style, icon.button, Math.floor(this.anim * 2) % 2)).setPosition(Math.round(p.x), p.y - 24 + bob).setVisible(true);
          iconShown = true;
        } else {
          const label = c?.buttonName('pickup') ?? 'E';
          const w = Math.max(10, lineWidth(label) + 5);
          this.g.fillStyle(0x0b0d18, 0.85).fillRect(p.x - w / 2, p.y - 30 + bob, w, 10);
          this.g.lineStyle(1, 0xffffff, 1).strokeRect(p.x - w / 2, p.y - 30 + bob, w, 10);
          drawDosText(this.g, [label], p.x, p.y - 28 + bob);
        }
      }
    }
    if (!iconShown) this.promptIcon?.setVisible(false);
    for (const [id, img] of this.pickupImgs) {
      if (!seen.has(id)) {
        img.destroy();
        this.pickupImgs.delete(id);
      }
    }
  }

  // Grenades in flight: their own sprite, spinning while they move, flashing as the fuse runs out.
  drawGrenades(view) {
    const seen = new Set();
    for (const n of view.grenades ?? []) {
      seen.add(n.id);
      let img = this.nadeImgs.get(n.id);
      if (!img) {
        img = this.scene.add.image(n.x, n.y, this.scene.textures.exists(n.kind) ? n.kind : '__WHITE');
        this.world.add(img);
        img.spin = 0;
        img.last = [n.x, n.y];
      }
      this.nadeImgs.set(n.id, img);
      const moved = Math.hypot(n.x - img.last[0], n.y - img.last[1]);
      img.spin += moved * 0.15;
      img.last = [n.x, n.y];
      // (The banner is big: drawn at half size in flight.)
      img.setPosition(n.x, n.y).setRotation(n.stuck ? 0 : img.spin).setScale(n.kind === 'banner' ? 0.5 : 1);
      if (n.stuck && Math.floor(this.anim * 3) % 2 === 0) this.speed.fillStyle(C('#ff3030'), 1).fillRect(n.x + 1, n.y - 3, 2, 2);
      if (n.fuse < 0.6 && Math.floor(this.anim * 12) % 2 === 0) img.setTint(0xff4040).setTintMode(Phaser.TintModes.FILL);
      else img.clearTint();
    }
    for (const [id, img] of this.nadeImgs) {
      if (!seen.has(id)) {
        img.destroy();
        this.nadeImgs.delete(id);
      }
    }
  }

  // Each player on this screen gets a crosshair: at the mouse cursor (the mouse player; it
  // replaces the pointer), or along a controller's aim. With a gun it stops at the gun's range, and
  // its gap opens up with the gun's spread right now (steady crouched, shaky in the air). With the
  // trident it stops at the chain's reach. Otherwise it follows the aim freely. Controller
  // crosshairs are in the player's color.
  drawCrosshair(view) {
    const g = this.crossG.clear();
    for (const i of this.locals) {
      const f = view.fighters[i];
      const at = f && f.state === 'ok' ? this.scene.controls?.[i]?.aimPoint(f) : null;
      if (at) this.crosshair(g, f, at, at.pad ? PLAYER_COLORS[i].hex : 0xffffff);
    }
  }

  crosshair(g, f, at, color) {
    let { x, y } = at;
    let gap = 3;
    const gun = f.hasGun && GUNS[f.gun];
    const range = gun ? gun.bulletRange : f.blade && MELEE[f.blade].chain && !f.chain ? MELEE[f.blade].chain.length : 0;
    if (range) {
      const o = gun ? gunOrigin(f) : aimOrigin(f);
      const dx = at.x - o.x;
      const dy = at.y - o.y;
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(d, range);
      x = o.x + (dx / d) * reach;
      y = o.y + (dy / d) * reach;
      if (gun) gap = Math.max(3, reach * Math.tan((spreadOf(f, gun) * Math.PI) / 180));
      // Past the range: a faint dot where the mouse really is.
      if (d > range) g.fillStyle(0xffffff, 0.35).fillRect(Math.round(at.x) - 1, Math.round(at.y) - 1, 2, 2);
    }
    x = Math.round(x);
    y = Math.round(y);
    const arm = 4;
    for (const [c, w] of [[0x0b0d18, 3], [color, 1]]) {
      g.lineStyle(w, c, 1);
      g.lineBetween(x - gap - arm, y, x - gap, y).lineBetween(x + gap, y, x + gap + arm, y);
      g.lineBetween(x, y - gap - arm, x, y - gap).lineBetween(x, y + gap, x, y + gap + arm);
    }
    g.fillStyle(color, 1).fillRect(x, y, 1, 1);
  }

  // Someone picked another character (anything not in the cast is ignored).
  setChar(i, char) {
    if (i in this.chars && CHARACTERS.includes(char) && this.scene.textures.exists(`${char}-idle`)) this.chars[i] = char;
  }

  // Dash afterimages: copies of the body in the dasher's color, fading where they were left.
  drawGhosts(dt) {
    this.ghosts = this.ghosts.filter((gh) => {
      gh.life -= dt;
      if (gh.life <= 0) {
        gh.img.destroy();
        return false;
      }
      gh.img.setAlpha(0.55 * (gh.life / 0.25));
      return true;
    });
  }

  // Clouds are made of animated puffs (see updatePuffs). Smoke: thick grey, hiding whoever is
  // inside. Poison: thinner, green, with the odd skull. Spore patches: small green puffs.
  // Also drawn here, on the floors: paint, slime, arrows stuck in walls, money lying around.
  drawClouds(view, dt = 1 / 60) {
    const g = this.cloudG.clear();
    for (const [x1, x2, y, t] of view.puddles ?? []) {
      const fade = Math.min(1, t / 1.5);
      g.fillStyle(C('#5fae2e'), 0.9 * fade).fillRect(x1, y - 2, x2 - x1, 3);
      g.fillStyle(C('#b6ff6a'), 0.8 * fade).fillRect(x1 + 2, y - 2, x2 - x1 - 4, 1);
      if (Math.random() < 0.05) this.particles.push({ x: x1 + Math.random() * (x2 - x1), y: y - 3, vx: 0, vy: -12, life: 0.4, color: C('#b6ff6a'), g: 0, s: 1 });
    }
    for (const [x, y, dir, t] of view.footholds ?? []) {
      // An arrow stuck in a wall: the shaft sticks out, fletching at the end (it blinks before it
      // drops out).
      if (t < 1 && Math.floor(this.anim * 10) % 2 === 0) continue;
      const tail = x - dir * (FOOTHOLD.width + 2);
      g.fillStyle(C('#2a1a10'), 1).fillRect(Math.min(x, tail), y - 1, FOOTHOLD.width + 3, 3);
      g.fillStyle(C('#b07a45'), 1).fillRect(Math.min(x, tail), y, FOOTHOLD.width + 2, 1);
      g.fillStyle(C('#e8e2d0'), 1).fillRect(tail - (dir > 0 ? 0 : 2), y - 2, 3, 1).fillRect(tail - (dir > 0 ? 0 : 2), y + 1, 3, 1);
    }
    this.drawMoney(view);
    this.updatePuffs(view, dt);
    // Paint rolled on floors (the paint roller), in its owner's colour, flaking off at the end.
    for (const [x1, x2, y, owner, t] of view.paints ?? []) {
      const fade = Math.min(1, t / 1.5);
      g.fillStyle(PLAYER_COLORS[owner]?.hex ?? 0xffffff, 0.85 * fade).fillRect(x1, y - 1, x2 - x1, 2);
      g.fillStyle(0xffffff, 0.35 * fade).fillRect(x1, y - 1, x2 - x1, 1);
    }
    this.drawHoles(view);
  }

  // The locked chest the key opens: sitting on its floor, a lock glinting.
  // Training: everyone's hitboxes. Bodies in green (the head, where shots count as headshots, in
  // yellow); melee hit areas in red while they can hit, faint before and after.
  drawHitboxes(view) {
    const g = this.hitboxG.clear();
    if (!this.showHitboxes) return;
    for (const f of view.fighters) {
      if (f.state !== 'ok') continue;
      const h = bodyHeight(f);
      const top = f.y - h;
      g.lineStyle(1, 0x3dff7a, 0.9).strokeRect(f.x - FIGHTER.w / 2, top, FIGHTER.w, h);
      g.fillStyle(0xffe14d, 0.35).fillRect(f.x - FIGHTER.w / 2, top, FIGHTER.w, (HEADSHOT.height * h) / FIGHTER.h);
      const s = f.swing;
      if (s) {
        // (The rules' own swing, rebuilt from the snapshot.)
        const m = weaponOf(s.w, s.jab ? 'jab' : 'heavy');
        const live = { ...f, swingX: s.x, swingY: s.y, swing: s.t };
        const hitting = s.t >= m.startup && s.t < m.startup + m.active;
        const area = swingPoints(live, m);
        for (const c of area) {
          g.lineStyle(1, 0xff3b3b, hitting ? 1 : 0.35).strokeCircle(c.x, c.y, m.radius);
          if (hitting) g.fillStyle(0xff3b3b, 0.25).fillCircle(c.x, c.y, m.radius);
        }
      }
      // The morning star's spinning ball.
      const held = f.melee && MELEE[f.melee];
      if (held?.spin && f.holding !== null && f.holding >= held.spin.after) {
        const b = spinBall(f, held, f.holding);
        g.lineStyle(1, 0xff3b3b, 1).strokeCircle(b.x, b.y, held.spin.ball);
      }
    }
  }

  // A style meter at (x, y), w × h: the fill, and the outline that's the headshot cooldown (cd: the
  // share of it left; the white outline is redrawn clockwise from the top-left as it runs out).
  styleBar(g, x, y, w, h, fill, cd) {
    g.fillStyle(C('#0b0d18'), 0.85).fillRect(x, y, w, h);
    g.fillStyle(fill >= 1 ? 0xffffff : C('#ff6ad5'), 1).fillRect(x, y, Math.round(w * fill), h);
    const [x0, y0, x1, y1] = [x - 1, y - 1, x + w, y + h];
    g.lineStyle(1, cd > 0 ? C('#6b7088') : 0xffffff, 1).strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
    if (cd <= 0) return;
    // The ready part of the outline, clockwise: top, right, bottom, left.
    let len = (1 - cd) * 2 * (x1 - x0 + y1 - y0);
    const sides = [[x0, y0, 1, 0, x1 - x0], [x1, y0, 0, 1, y1 - y0], [x1, y1, -1, 0, x1 - x0], [x0, y1, 0, -1, y1 - y0]];
    g.fillStyle(0xffffff, 1);
    for (const [sx, sy, dx, dy, n] of sides) {
      const k = Math.min(n, len);
      if (k <= 0) break;
      const ex = sx + dx * k;
      const ey = sy + dy * k;
      g.fillRect(Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx) || 1, Math.abs(ey - sy) || 1);
      len -= k;
    }
  }

  // Ammo chests: shut and glinting when ready; open, dim, and filling up a little bar while they
  // can't be used again yet.
  drawAmmoChests(view) {
    this.ammoChestImgs ??= [];
    (view.ammoChests ?? []).forEach(([x, y, shut], k) => {
      let img = this.ammoChestImgs[k];
      if (!img && this.scene.textures.exists('chest-open')) {
        img = this.scene.add.sprite(x, y + 1, 'chest-open', 0).setOrigin(0.5, 1);
        this.world.addAt(img, this.world.getIndex(this.g));
        this.ammoChestImgs[k] = img;
      }
      img?.setFrame(shut > 0 ? 2 : 0).setAlpha(shut > 0 ? 0.6 : 1);
      if (shut > 0) {
        this.g.fillStyle(C('#0b0d18'), 0.8).fillRect(x - 10, y - 26, 20, 3);
        this.g.fillStyle(C('#ffd966'), 1).fillRect(x - 10, y - 26, Math.round(20 * (1 - shut)), 3);
      } else if (Math.random() < 0.06) {
        this.particles.push({ x: x + (Math.random() * 2 - 1) * 10, y: y - 10 - Math.random() * 8, vx: 0, vy: -10, life: 0.5, color: C('#ffd966'), g: 0, s: 1 });
      }
    });
  }

  drawChest(view) {
    const c = view.chest;
    if (!c || !this.scene.textures.exists('chest')) {
      this.chestImg?.setVisible(false);
      return;
    }
    if (!this.chestImg) {
      this.chestImg = this.scene.add.image(0, 0, 'chest').setOrigin(0.5, 1);
      this.world.addAt(this.chestImg, this.world.getIndex(this.g));
    }
    this.chestImg.setVisible(true).setPosition(c[0], c[1]);
    if (Math.random() < 0.08) this.particles.push({ x: c[0] + (Math.random() * 2 - 1) * 10, y: c[1] - 10 - Math.random() * 8, vx: 0, vy: -10, life: 0.5, color: C('#ffe14d'), g: 0, s: 1 });
  }

  // What a fighter has going from items: the key held over the head, the banner on the back (and
  // how full it is), the lamp being rubbed, a rune's glow and how long it has left.
  drawItems(f, i, x, a, low) {
    const top = Math.round(f.y) - (low ? 22 : 30);
    const img = this.carried[i];
    const g = this.speed;
    // The Ring of Cat: a green dot under the feet for each use left.
    for (let k = 0; k < (f.ring ?? 0); k++) g.fillStyle(C('#5be38a'), 0.9).fillRect(x - f.ring + k * 2, Math.round(f.y) + 9, 1, 1);
    if (f.hidden) return img.setVisible(false);
    // The crystal ball: a purple magic fire burning above the head.
    if (f.homing) {
      for (let k = 0; k < 2; k++) {
        this.particles.push({ x: x + (Math.random() * 2 - 1) * 5, y: top - 2 - Math.random() * 3, vx: (Math.random() * 2 - 1) * 8, vy: -30 - Math.random() * 30, life: 0.3 + Math.random() * 0.2, color: Math.random() < 0.3 ? C('#f2d9ff') : Math.random() < 0.5 ? C('#b04dff') : C('#7a2bd9'), g: -20, s: 1 + Math.round(Math.random()) });
      }
    }
    if (f.carry === 'key' && this.scene.textures.exists('key')) {
      img.setTexture('key').setOrigin(0.5, 1).setScale(1).setFlipX(false).setVisible(true).setPosition(x, top - 2 + Math.round(Math.sin(this.anim * 5) * 1.5)).setAlpha(a);
    } else if (f.wishing && this.scene.textures.exists('lamp')) {
      img.setTexture('lamp').setOrigin(0.5, 1).setScale(1).setFlipX(f.facing < 0).setVisible(true).setPosition(x + Math.round(Math.sin(this.anim * 30)), top - 2).setAlpha(a);
      if (Math.random() < 0.5) this.particles.push({ x: x + (Math.random() * 2 - 1) * 8, y: top - 6, vx: (Math.random() * 2 - 1) * 20, vy: -40, life: 0.4, color: C('#ffe14d'), g: 0, s: 1 });
    } else {
      img.setVisible(false);
    }
    if (f.rune) {
      // A rune: sparks in its colour, and a little bar of what's left.
      const color = { haste: C('#ffd23f'), iron: C('#6fe3f0'), feather: C('#d8f7b0'), mirror: C('#b78cff') }[f.rune] ?? 0xffffff;
      if (Math.random() < 0.35) this.particles.push({ x: x + (Math.random() * 2 - 1) * 7, y: Math.round(f.y) - Math.random() * 28, vx: 0, vy: -25, life: 0.4, color, g: 0, s: 1 });
      g.fillStyle(color, 0.9).fillRect(x - 6, Math.round(f.y) + 6, Math.round(12 * f.runeK), 1);
    }
  }

  // Money (flying or lying around) and flying cards: animated sprites, playing their strips.
  drawMoney(view) {
    const seen = new Set();
    const show = (id, look, x, y, blink, angle = 0) => {
      const [key, fps] = SPRITE_SHOTS[look] ?? [];
      if (!key || !this.scene.textures.exists(key)) return;
      seen.add(id);
      let img = this.moneyImgs.get(id);
      if (!img) {
        img = this.scene.add.sprite(x, y, key, 0);
        this.world.addAt(img, this.world.getIndex(this.cloudG));
        this.moneyImgs.set(id, img);
      }
      const frames = this.scene.textures.get(key).frameTotal - 1;
      if (fps) img.setFrame(Math.floor(this.anim * fps + id.length) % frames);
      img.setPosition(Math.round(x), Math.round(y)).setRotation(angle).setVisible(!(blink && Math.floor(this.anim * 8) % 2 === 0));
    };
    for (const b of view.bullets) {
      if (!SPRITE_SHOTS[b.look]) continue;
      // (The jackpot's chest tips over as it flies.)
      show(`b${b.id}`, b.look, b.x, b.y, false, b.look === 'jackpot' ? Math.atan2(b.vy, b.vx) * 0.3 : 0);
    }
    for (const [id, x, y, look, blink] of view.loot ?? []) show(`l${id}`, look, x, y - 4, blink);
    for (const [id, img] of this.moneyImgs) {
      if (seen.has(id)) continue;
      img.destroy();
      this.moneyImgs.delete(id);
    }
  }

  // An animation that plays once where something happened (the chest opening), then goes.
  playOnce(key, x, y, fps) {
    if (!this.scene.textures.exists(key)) return;
    const img = this.scene.add.sprite(x, y, key, 0).setOrigin(0.5, 1);
    this.world.addAt(img, this.world.getIndex(this.cloudG));
    this.puffs.push({ img, age: 0, frames: this.scene.textures.get(key).frameTotal - 1, fps, hold: 0.6 });
  }

  // The banner's melee-only zone: its stretch of the stage washed in its thrower's colour, edged at
  // both sides, the planted banner waving, and a meter over it that fills while its thrower stays
  // inside (full: an extra life). With its thrower away, it all fades out.
  drawHaven(view) {
    const g = this.havenG.clear();
    const h = view.haven;
    if (!h) {
      this.havenFlag?.setVisible(false);
      return;
    }
    const [left, right, x, y, owner, k, away] = h;
    const color = PLAYER_COLORS[owner]?.hex ?? 0xffffff;
    // Its thrower away: the colour fades out, gone when the zone is.
    const fade = 1 - away;
    const cam = this.st.camera;
    g.fillStyle(color, (0.16 + 0.04 * Math.sin(this.anim * 3)) * fade).fillRect(left, cam.top, right - left, cam.bottom - cam.top);
    g.fillStyle(color, 0.6 * fade).fillRect(left, cam.top, 2, cam.bottom - cam.top).fillRect(right - 2, cam.top, 2, cam.bottom - cam.top);
    if (this.scene.textures.exists('flag-wave')) {
      if (!this.havenFlag) {
        this.havenFlag = this.scene.add.sprite(0, 0, 'flag-wave', 0).setOrigin(0.5, 1);
        this.world.addAt(this.havenFlag, this.world.getIndex(this.g));
      }
      this.havenFlag.setVisible(true).setPosition(x, y + 2).setFrame(Math.floor(this.anim * 6) % 4).setTint(color).setTintMode(Phaser.TintModes.MULTIPLY).setAlpha(fade);
    }
    g.fillStyle(C('#0b0d18'), 0.85 * fade).fillRect(x - 12, y - 54, 24, 4);
    g.fillStyle(color, fade).fillRect(x - 11, y - 53, Math.round(22 * k), 2);
  }

  // Black holes: a swirl round a dark core, a faint ring where the pull reaches, and specks of
  // light spiralling in.
  drawHoles(view) {
    const g = this.cloudG;
    const live = new Set();
    for (const [id, x, y, r, t] of view.holes ?? []) {
      live.add(id);
      const fade = Math.min(1, t / 0.6);
      let img = this.holeImgs.get(id);
      if (!img && this.scene.textures.exists('fx-vortex')) {
        img = this.scene.add.sprite(x, y, 'fx-vortex', 3).setScale(1.6);
        this.world.addAt(img, this.world.getIndex(this.cloudG) + 1);
        this.holeImgs.set(id, img);
      }
      img?.setFrame(3 + (Math.floor(this.anim * 12) % 6)).setRotation(-this.anim * 4).setAlpha(fade);
      g.lineStyle(1, C('#9d6bff'), 0.25 * fade).strokeCircle(x, y, r);
      g.fillStyle(C('#0b0614'), fade).fillCircle(x, y, 9);
      g.lineStyle(2, C('#c9a8ff'), 0.8 * fade).strokeCircle(x, y, 10);
      if (Math.random() < 0.7) {
        const a = Math.random() * Math.PI * 2;
        const d = r * (0.6 + Math.random() * 0.4);
        // Inward, with a twist.
        this.particles.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d * 1.6 - Math.sin(a) * 60, vy: -Math.sin(a) * d * 1.6 + Math.cos(a) * 60, life: 0.5, color: Math.random() < 0.5 ? C('#c9a8ff') : 0xffffff, g: 0, s: 1 });
      }
    }
    for (const [id, img] of this.holeImgs) {
      if (live.has(id)) continue;
      img.destroy();
      this.holeImgs.delete(id);
    }
  }

  // A knockout line at the top left, in the knocked-out player's colour; at most 4 at once.
  addFeed(text, id) {
    const t = this.scene.add.text(6, 0, text, { fontFamily: FONT, fontSize: '9px', fontStyle: 'bold', color: PLAYER_COLORS[id]?.css ?? '#ffffff', stroke: '#0b0d18', strokeThickness: 3, resolution: this.res });
    this.hud.add(t);
    this.feed.push({ t, age: 0 });
    while (this.feed.length > 4) this.feed.shift().t.destroy();
  }

  updateFeed(dt) {
    const LIFE = 6;
    this.feed = this.feed.filter((f) => {
      f.age += dt;
      if (f.age < LIFE) return true;
      f.t.destroy();
      return false;
    });
    this.feed.forEach((f, k) => f.t.setPosition(6, 6 + k * 12).setAlpha(Math.min(1, (LIFE - f.age) / 0.6, f.age * 8)));
  }

  // A puff of dust (the smoke strip, tinted dusty), size: its scale.
  dust(x, y, size) {
    if (!this.scene.textures.exists('fx-smoke')) return this.burst(x, y, 0, -1, 4, 40, C('#b8a58a'), 0, 1.4);
    const img = this.scene.add.sprite(x, y, 'fx-smoke', 0).setScale(size).setTint(0xb8a58a).setAlpha(0.85).setFlipX(Math.random() < 0.5);
    this.world.add(img);
    this.puffs.push({ img, age: 0, frames: this.scene.textures.get('fx-smoke').frameTotal - 1, fps: 14 });
  }

  // Each cloud keeps spawning puffs (animated strips that swell and dissolve) at random spots in it,
  // so it churns; when a cloud is gone its last puffs play out.
  updatePuffs(view, dt) {
    const LOOKS = { smoke: { every: 0.035, size: 1.6, alpha: 0.95 }, poison: { every: 0.07, size: 1.4, alpha: 0.6 }, spore: { every: 0.18, size: 0.9, alpha: 0.75 }, drowsy: { every: 0.06, size: 1.4, alpha: 0.6 } };
    const live = new Set();
    for (const c of view.clouds ?? []) {
      live.add(c.id);
      const look = LOOKS[c.kind] ?? LOOKS.smoke;
      let next = (this.cloudSpawn.get(c.id) ?? 0) - dt;
      for (; next <= 0 && c.t > 0.6; next += look.every) {
        // (Poison: now and then a skull.)
        const key = c.kind === 'smoke' || c.kind === 'drowsy' ? 'fx-smoke' : c.kind === 'spore' ? 'fx-spore' : Math.random() < 0.12 ? 'fx-skull' : 'fx-poison';
        if (!this.scene.textures.exists(key)) break;
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * c.r * 0.6;
        const scale = ((c.r * look.size) / 64) * (0.7 + Math.random() * 0.5);
        const img = this.scene.add.sprite(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d * 0.7, key, 0).setScale(scale).setAlpha(look.alpha * Math.min(1, c.t / 1.5)).setFlipX(Math.random() < 0.5);
        if (c.kind === 'smoke') img.setTint(0xc4c6d0);
        else if (c.kind === 'drowsy') img.setTint(0xffb8dc);
        this.world.addAt(img, this.world.getIndex(this.cloudG) + 1);
        this.puffs.push({ img, age: 0, frames: this.scene.textures.get(key).frameTotal - 1, fps: c.kind === 'spore' ? 10 : 9 });
      }
      this.cloudSpawn.set(c.id, next);
    }
    for (const id of this.cloudSpawn.keys()) if (!live.has(id)) this.cloudSpawn.delete(id);
    this.puffs = this.puffs.filter((p) => {
      p.age += dt;
      const frame = Math.floor(p.age * p.fps);
      if (frame >= p.frames) {
        // (A one-off animation can stay on its last frame a moment, fading.)
        if (p.hold && (p.hold -= dt) > 0) {
          p.img.setAlpha(Math.min(1, p.hold * 3));
          return true;
        }
        p.img.destroy();
        return false;
      }
      p.img.setFrame(frame);
      return true;
    });
  }

  // Thrown melee weapons (La Chola) tumble through the air as their own sprite.
  drawThrown(view) {
    const seen = new Set();
    for (const b of view.bullets) {
      if (!b.kind || !this.scene.textures.exists(b.kind)) continue;
      seen.add(b.id);
      let img = this.thrown.get(b.id);
      if (!img) {
        img = this.scene.add.image(b.x, b.y, b.kind);
        this.world.add(img);
        this.thrown.set(b.id, img);
      }
      // (The anvil doesn't tumble: it drops like a cartoon anvil, wobbling.)
      img.setPosition(b.x, b.y).setRotation(b.kind === 'anvil' ? Math.sin(this.anim * 7) * 0.15 : this.anim * 14);
    }
    for (const [id, img] of this.thrown) {
      if (!seen.has(id)) {
        img.destroy();
        this.thrown.delete(id);
      }
    }
  }

  render(view, deltaMs) {
    const dt = deltaMs / 1000;
    this.anim += dt;
    this.g.clear();
    this.hands.clear();
    for (const h of (this.handImgs ?? []).flat()) h.setVisible(false).clearTint();
    this.speed.clear();
    this.fx.clear();
    this.stormG.clear();
    this.hudG.clear();
    if (!view) return;
    this.updateCamera(view, dt);
    if (this.barrelImages) {
      // 0 gone, 1 standing, 2 flashing (hit or about to blow).
      view.barrels.forEach((state, i) => {
        const img = this.barrelImages[i].setVisible(state > 0);
        if (state === 2) img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        else img.clearTint();
      });
    } else {
      view.barrels.forEach((state, i) => state && drawBarrel(this.g, this.st.barrels[i], state === 2));
    }
    updateCovers(this.covers, view, this.g, dt, (x, y, size) => this.dust(x, y, size));
    this.nightArt?.update(this.scene.cameras.main);
    if (this.moverArt && view.movers) {
      view.movers.forEach((m, i) => this.moverArt[i]?.update(m, this.anim));
    }
    this.crownId = view.crown ?? -1;
    this.drawPickups(view);
    this.drawChest(view);
    this.drawAmmoChests(view);
    view.fighters.forEach((f, i) => this.drawFighter(f, i, dt));
    this.drawThrown(view);
    for (const [k, t] of this.cardThrow.entries()) this.cardThrow[k] = Math.max(0, t - dt);
    for (const b of view.bullets) if (!(b.kind && this.thrown.has(b.id))) drawBullet(this.g, b, this.anim);
    this.drawGrenades(view);
    this.drawGhosts(dt);
    this.drawClouds(view, dt);
    this.drawHaven(view);
    this.drawHitboxes(view);
    this.drawCrosshair(view);
    this.drawWords(dt);
    this.drawParticles(dt);
    this.drawStorm(view.storm);
    this.drawHud(view, dt);
    this.updateFeed(dt);
  }

  // The spectator camera: following someone (←/→ to switch), or free (Space: from the whole
  // stage, moved with the mouse or the right stick); ↑/↓ zoom, out as far as the whole stage.
  // Returns where to look and how close: { x, y, zoom }.
  spectate(view, dt, input) {
    const s = this.spec;
    const b = this.st.camera;
    const fitStage = Math.min(VIEW_W / (b.right - b.left), VIEW_H / (b.bottom - b.top));
    const inGame = view.fighters.map((f, i) => (f && f.state !== 'out' ? i : -1)).filter((i) => i >= 0);
    if (!s.on) {
      // (Just started watching: follow whoever's still in, starting with the next one along.)
      Object.assign(s, { on: true, free: false, zoom: 1 });
      s.target = inGame.find((i) => i > (this.ownLocals[0] ?? -1)) ?? inGame[0] ?? -1;
    }
    if (input.toggle) {
      if (s.free) s.free = false;
      else Object.assign(s, { free: true, x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2, zoom: fitStage, last: s.target });
    } else if (input.cycle && s.free) {
      s.free = false; // (back to whoever was followed)
    } else if (input.cycle && inGame.length) {
      const k = inGame.indexOf(s.target);
      s.target = inGame[(((k < 0 ? 0 : k + input.cycle) % inGame.length) + inGame.length) % inGame.length];
    }
    if (!s.free && !inGame.includes(s.target)) s.target = inGame[0] ?? -1;
    if (!s.free) s.last = s.target;
    s.zoom = Math.max(fitStage, Math.min(2, s.zoom * Math.exp(input.zoom * 1.6 * dt)));
    const f = view.fighters[s.target];
    if (s.free) {
      // (Screens' worth per second: the stick, or the mouse; captured, the mouse moves it directly.)
      const speed = input.pan.raw ? VIEW_W / s.zoom : (VIEW_W / s.zoom) * 1.2 * dt;
      s.x = Math.max(b.left, Math.min(b.right, s.x + input.pan.x * speed));
      s.y = Math.max(b.top, Math.min(b.bottom, s.y + input.pan.y * speed));
    } else if (f) Object.assign(s, { x: f.x, y: f.y - 30 });
    const who = !s.free && s.target >= 0 ? this.roster[s.target]?.name ?? '' : '';
    const hint = `←/→ ${s.free ? 'follow' : 'switch'} · SPACE ${s.free ? 'follow' : 'free camera'} · ↑/↓ zoom`;
    this.specText.setText(`${s.free ? 'FREE CAMERA' : `WATCHING ${who.toUpperCase()}`}\n${hint}`).setVisible(true);
    return { x: s.x, y: s.y, zoom: s.zoom };
  }

  updateCamera(view, dt) {
    const cam = this.scene.cameras.main;
    const alive = this.locals.map((i) => view.fighters[i]).filter((f) => f && f.state === 'ok');
    let gx = cam.midPoint.x;
    let gy = cam.midPoint.y;
    let zoom = cam.zoom / this.res;
    // Watching: nobody on this screen is in the match (any more).
    const input = this.spectator?.poll();
    const watching = !!input && (!this.ownLocals.length || this.ownLocals.every((i) => view.fighters[i]?.state === 'out'));
    if (this.spectator) this.spectator.active = watching;
    if (watching) {
      ({ x: gx, y: gy, zoom } = this.spectate(view, dt, input));
    } else {
      this.spec.on = false;
      this.specText.setVisible(false);
    }
    if (!watching && alive.length === 1) {
      gx = alive[0].x;
      gy = alive[0].y - 30;
      // The camera leans toward where you aim: the mouse cursor, or a controller's aim.
      const c = this.scene.controls?.[this.locals[0]];
      if (c?.usingPad()) {
        gx += alive[0].aimX * 60;
        gy += alive[0].aimY * 40;
      } else if (this.mouseLook && c) {
        const p = c.pointer();
        gx += (p.x / this.res - VIEW_W / 2) * 0.3;
        gy += (p.y / this.res - VIEW_H / 2) * 0.3;
      }
      zoom = 1;
    } else if (!watching && alive.length > 1) {
      // Several players on one screen: frame them all, zooming out as they spread apart.
      const xs = alive.map((f) => f.x);
      const ys = alive.map((f) => f.y - 30);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      gx = (minX + maxX) / 2;
      gy = (minY + maxY) / 2;
      // As far out as it takes to fit everyone, down to the whole stage (never further).
      const b = this.st.camera;
      const fitStage = Math.min(VIEW_W / (b.right - b.left), VIEW_H / (b.bottom - b.top));
      zoom = Math.max(fitStage, Math.min(1, VIEW_W / (maxX - minX + 160), VIEW_H / (maxY - minY + 120)));
    }
    const t = 1 - Math.exp(-8 * dt);
    zoom *= this.res;
    cam.setZoom(cam.zoom + (zoom - cam.zoom) * t);
    cam.centerOn(cam.midPoint.x + (gx - cam.midPoint.x) * t, cam.midPoint.y + (gy - cam.midPoint.y) * t);
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma * 6;
    cam.setScroll(cam.scrollX + (Math.random() * 2 - 1) * s, cam.scrollY + (Math.random() * 2 - 1) * s);
    if (this.sky) this.sky.tilePositionX = cam.scrollX * 0.05;
  }

  // A character's floating hands: bony for the skeletons, green for the orcs, else the usual.
  handKey(i) {
    const c = this.chars[i] ?? '';
    const key = c.startsWith('skeleton') ? 'hand-skeleton' : c.startsWith('orc') ? 'hand-orc' : 'hand';
    return this.scene.textures.exists(key) ? key : 'hand';
  }

  // A cat (the Ring of Cat): asleep, lying down while drowsy, running, a meow when it turns, and
  // sitting down after standing still a while.
  catPose(s, f, i) {
    const k = `cat${f.cat}`;
    s.setOrigin(0.5, CAT_FEET);
    const still = (this.catStill ??= []);
    if (f.walk > 0 || !f.grounded || f.state !== 'ok') still[i] = this.anim;
    if (f.asleep) {
      s.anims.stop();
      s.setTexture(`${k}-sleeping`);
    } else if (f.drowsy !== null && f.drowsy !== undefined) s.play(`${k}-laying`, true);
    else if (f.dashing || !f.grounded) {
      s.anims.stop();
      s.setTexture(`${k}-run`, 2);
    } else if (f.walk > 0) s.play(`${k}-run`, true);
    else if (this.anim - (this.meowAt?.[i] ?? -9) < 0.5) s.play(`${k}-meow`, true);
    else if (this.anim - (still[i] ?? this.anim) > 2.5) {
      s.anims.stop();
      s.setTexture(`${k}-sitting`);
    } else s.play(`${k}-idle`, true);
  }

  // A character sprite: idle or run on the ground, the jump frame in the air,
  // squashed when crouched (more when tucked behind cover), white flash when hit.
  // x: where to draw it (the fighter's x, plus any jiggle).
  drawBody(s, f, i, a, low, x = Math.round(f.x)) {
    const c = this.chars[i];
    s.setOrigin(0.5, 1);
    if (!f.asleep && this.sleptAt) this.sleptAt[i] = undefined;
    if (f.cat && this.scene.textures.exists(`cat${f.cat}-idle`)) {
      this.catPose(s, f, i);
    } else if (f.animal && this.scene.textures.exists(`animal-${f.animal}`)) {
      // Turned into an animal: stock still (in the air too), walking only when it walks.
      if (f.walk > 0) s.play(`${f.animal}-walk`, true);
      else {
        s.anims.stop();
        s.setTexture(`animal-${f.animal}`, 0);
      }
    } else if (f.asleep && this.scene.textures.exists(`${c}-sleep`)) {
      // Asleep: falling down slowly (the death animation, over FALL_TIME), then lying there. The
      // fall is part of the sleep, not added to it.
      const since = (this.sleptAt ??= []);
      since[i] ??= this.anim;
      const fall = this.scene.textures.exists(`${c}-fall`) ? this.scene.textures.get(`${c}-fall`) : null;
      const n = fall ? fall.frameTotal - 1 : 0;
      s.anims.stop();
      if (n > 1) s.setTexture(`${c}-fall`, Math.min(n - 1, Math.floor(((this.anim - since[i]) / FALL_TIME) * n)));
      else s.setTexture(`${c}-sleep`);
    } else if ((f.stunned || f.hitstun) && this.scene.textures.exists(`${c}-stun`)) {
      // Stunned or reeling from a hit: the weak pose (the death animation's second frame).
      s.anims.stop();
      s.setTexture(`${c}-stun`);
    } else if (f.dashing || !f.grounded) {
      // Dashing, or in the air: the run sheet's last frame (mid-stride) doubles as the pose.
      s.anims.stop();
      s.setTexture(`${c}-run`, 5);
    } else {
      s.play(f.walk > 0 && !low ? `${c}-run` : `${c}-idle`, true);
    }
    // (A cat or an animal faces the way it moves; a person faces where they aim.)
    const ways = (this.moveWay ??= []);
    if (Math.abs(f.vx ?? 0) > 10) ways[i] = Math.sign(f.vx);
    const way = f.cat || f.animal ? (ways[i] ?? f.facing) : f.facing;
    s.setVisible(true)
      .setPosition(x, Math.round(f.y))
      .setFlipX(way < 0)
      .setAlpha(a)
      .setScale(1, low ? (f.tucked ? 0.55 : 0.7) : 1);
    if (f.flash) s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (f.dodging && Math.floor(this.anim * 24) % 2 === 0) s.setTint(PLAYER_COLORS[i].hex).setTintMode(Phaser.TintModes.FILL);
    else if (f.drowsy !== null && f.drowsy !== undefined && Math.sin(this.anim * 5) > 0) s.setTint(0xffc2e2).setTintMode(Phaser.TintModes.MULTIPLY);
    else s.clearTint();
    // Dashing: leave afterimages in the player's color behind.
    if (f.dashing && this.anim - (this.lastGhost?.[i] ?? -1) > 0.03) {
      (this.lastGhost ??= [])[i] = this.anim;
      const img = this.scene.add.image(s.x, s.y, s.texture.key, s.frame.name).setOrigin(s.originX, s.originY).setFlipX(s.flipX).setScale(s.scaleX, s.scaleY);
      img.setTint(PLAYER_COLORS[i].hex).setTintMode(Phaser.TintModes.FILL).setAlpha(0.55);
      this.world.addAt(img, this.world.getIndex(s));
      this.ghosts.push({ img, life: 0.25 });
    }
  }

  // Speed lines: white streaks following the outer edge of the hit area through the swing.
  // Heavy weapons get thick lines, light weapons (and fists) thin ones.
  // One of fighter i's two floating hands (0: grip or ready fist, 1: swinging or punching hand).
  hand(i, slot, x, y, a) {
    x = Math.round(x);
    y = Math.round(y);
    // (The hand art faces right: mirrored facing left.)
    if (this.handImgs) {
      // (The character can change mid-match: the hands follow it.)
      const img = this.handImgs[i][slot];
      const key = this.handKey(i);
      if (img.texture.key !== key) img.setTexture(key);
      return img.setVisible(true).setPosition(x, y).setAlpha(a).setFlipX((this.handFace?.[i] ?? 1) < 0);
    }
    this.hands.fillStyle(C('#1a1620'), a).fillRect(x - 2, y - 2, 4, 4);
    this.hands.fillStyle(C('#e0a580'), a).fillRect(x - 1, y - 1, 3, 3);
  }

  drawSpeedLines(f, i, m, ox, oy, dt) {
    const trail = this.trails[i];
    const s = f.swing;
    if (s && s.t < (trail.lastT ?? Infinity)) trail.length = 0; // a new swing
    trail.lastT = s ? s.t : Infinity;
    if (s && s.t >= m.startup - 0.02 && s.t <= m.startup + m.active + 0.02) {
      const a = swingAngle(s.x, s.y, s.t, m);
      const outer = m.reach + m.radius;
      const inner = m.reach;
      trail.push({ x: ox + Math.cos(a) * outer, y: oy + Math.sin(a) * outer, ix: ox + Math.cos(a) * inner, iy: oy + Math.sin(a) * inner, life: 0.14 });
    }
    for (const p of trail) p.life -= dt;
    while (trail.length && trail[0].life <= 0) trail.shift();
    const heavy = m.weight === 'heavy';
    for (let k = 1; k < trail.length; k++) {
      const p = trail[k - 1];
      const q = trail[k];
      const alpha = Math.min(1, (q.life / 0.14) * 1.2);
      this.speed.lineStyle(heavy ? 3 : 1, 0xffffff, alpha).lineBetween(p.x, p.y, q.x, q.y);
      this.speed.lineStyle(heavy ? 2 : 1, 0xffffff, alpha * 0.5).lineBetween(p.ix, p.iy, q.ix, q.iy);
    }
  }

  drawFighter(f, i, dt = 1 / 60) {
    (this.handFace ??= [])[i] = f.facing;
    const tag = this.tags[i];
    if (!tag) return;
    this.zzz[i].setVisible(!!f.asleep && f.state === 'ok');
    if (f.state !== 'ok') {
      tag.setVisible(false);
      this.guns?.[i].setVisible(false);
      this.blades[i].setVisible(false);
      this.katanas[i].setVisible(false);
      this.heldNades[i].setVisible(false);
      this.backs[i].setVisible(false);
      this.crowns[i]?.setVisible(false);
      this.carried[i].setVisible(false);
      this.bodies?.[i].setVisible(false);
      return;
    }
    const g = this.g;
    const blink = f.invincible > 0 && Math.floor(f.invincible * 12) % 2 === 0;
    // Hidden in a doorway: drawn faint, in the shadows.
    const a = f.hidden ? 0.4 : blink ? 0.35 : 1;
    // (Asleep: lying there, hands and weapons put away, like someone hidden.)
    if (f.asleep || f.cat || f.animal) f = { ...f, hidden: true };
    const color = PLAYER_COLORS[i].hex;
    const coat = f.flash ? 0xffffff : color;
    const body = f.flash ? 0xffffff : Phaser.Display.Color.ValueToColor(color).darken(15).color;
    const dark = C('#292e3b');
    // (Frozen by the keyboard's big phrase: jiggling in place.)
    // (Asleep and pushing a way: wiggling that way.)
    const wiggle = f.held && f.held[0] ? f.held[0] * (Math.sin(this.anim * 45) > 0 ? 2 : 1) : f.held && f.held[1] ? Math.round(Math.sin(this.anim * 45)) : 0;
    const x = Math.round(f.x) + (f.frozen ? Math.round(Math.sin(this.anim * 70) * 2) : 0) + wiggle;
    const fc = f.facing;
    const low = f.crouching || f.blocking === 'crouch';
    // Crouched: legs fold and everything above drops 8 px (matching the shorter hitbox).
    // Tucked behind cover: lower still (matching the tuck hitbox).
    const y = Math.round(f.y) + (low ? (f.tucked ? 14 : 8) : 0);
    const sprite = this.bodies?.[i];
    if (sprite) {
      this.drawBody(sprite, f, i, a, low, x);
      // Jinxed by the lamp: shrunk.
      if (f.jinxed) sprite.setScale(sprite.scaleX * 0.75, sprite.scaleY * 0.75);
      // The previous round's winner wears the crown, bobbing as they run, tipped the way they face.
      const crown = this.crowns[i];
      crown?.setVisible(false);
      if (crown && this.crownId === i) {
        const bob = f.walk > 0 ? Math.round(Math.abs(Math.sin(f.walk * 1.6)) * 1.5) : 0;
        const head = low ? (f.tucked ? 17 : 22) : 30;
        crown.setVisible(!f.hidden).setPosition(x, Math.round(f.y) - head - bob + 1).setRotation(fc * 0.12).setAlpha(a);
      }
      this.drawItems(f, i, x, a, low);
      // Team color: a short bar under the feet.
      g.fillStyle(color, 0.9).fillRect(x - 6, Math.round(f.y) + 1, 12, 2);
      // Stamina: a thin line under the color bar, white and bright while a dash is affordable,
      // with a notch at the cost of one dash (half the bar).
      g.fillStyle(C('#0b0d18'), 0.7).fillRect(x - 6, Math.round(f.y) + 4, 12, 1);
      g.fillStyle(f.stamina >= DASH.cost ? 0xffffff : C('#8a90a8'), 1).fillRect(x - 6, Math.round(f.y) + 4, Math.round(12 * f.stamina), 1);
      g.fillStyle(C('#0b0d18'), 0.9).fillRect(x - 6 + Math.round(12 * DASH.cost), Math.round(f.y) + 4, 1, 1);
    } else if (low) {
      g.fillStyle(dark, a).fillRect(x - 7, f.y - 6, 6, 6).fillRect(x + 1, f.y - 6, 6, 6);
    } else {
      // Legs, swinging while running.
      const step = Math.sin(f.walk) * 3;
      g.fillStyle(dark, a).fillRect(x - 5 + step * 0.5, y - 12, 4, 12);
      g.fillRect(x + 1 - step * 0.5, y - 12, 4, 12);
    }
    if (!sprite) {
      // Greybox coat and body; when crouched they squash down onto the folded legs instead of sinking.
      const torsoBottom = low ? Math.round(f.y) - 6 : y - 11;
      g.fillStyle(coat, a).fillRect(x - 6, y - 27, 12, torsoBottom - (y - 27));
      g.fillStyle(body, a).fillRect(fc > 0 ? x - 6 : x + 2, y - 27, 4, low ? torsoBottom - (y - 27) : 20);
      // Head, hair, visor.
      g.fillStyle(C('#e0a580'), a).fillRect(x - 4, y - 35, 8, 8);
      g.fillStyle(C('#3a2a1e'), a).fillRect(x - 5, y - 37, 10, 4);
      g.fillStyle(C('#0f1219'), a).fillRect(fc > 0 ? x + 1 : x - 5, y - 32, 4, 2);
    }
    // Block (greybox): forearms raised in front. With art, see the guard below.
    if (!this.handImgs && (f.blocking || f.dropping)) {
      g.fillStyle(f.blocking ? C('#cfe3ff') : 0xffffff, f.blocking ? 0.95 : 0.5).fillRect(x + fc * 6 - (fc > 0 ? 0 : 3), y - 30, 3, 16);
    }
    if (f.stunned) {
      for (let k = 0; k < 3; k++) {
        const t = this.anim * 6 + (k * Math.PI * 2) / 3;
        g.fillStyle(C('#ffe14d'), 1).fillRect(x + Math.cos(t) * 7 - 1, y - 42 + Math.sin(t) * 2, 2, 2);
      }
    }
    const ang = Math.atan2(f.aimY, f.aimX);
    const flip = f.aimX < 0 ? -1 : 1;
    const ox = x;
    const oy = y - 22;
    const gunStats = GUNS[f.gun] ?? PISTOL;
    // Guns are held at their own height: chest, waist or shoulder (the same point the rules use).
    const gy = Math.round(gunOrigin(f).y);
    const muzzle = () => {
      const drop = gunStats.muzzleDrop * flip;
      if (f.muzzle) this.hands.fillStyle(C('#ffd966'), 1).fillCircle(ox + Math.cos(ang) * gunStats.muzzle - Math.sin(ang) * drop, gy + Math.sin(ang) * gunStats.muzzle + Math.cos(ang) * drop, 3.5);
    };
    const gun = this.guns?.[i];
    if (gun) {
      // Floating gun: held out toward the aim, upright whichever way it points, a hand over the grip.
      let hx = ox + Math.cos(ang) * gunStats.holdDistance;
      let hy = gy + Math.sin(ang) * gunStats.holdDistance;
      // Throwing a card: a jab, like the trident's: pulled back, then thrust out along the aim.
      const toss = f.gun === 'cards' ? this.cardThrow[i] : 0;
      if (toss > 0) {
        const k = 1 - toss / CARD_TOSS;
        const reach = k < 0.35 ? -6 * (k / 0.35) : -6 + 22 * ((k - 0.35) / 0.65);
        hx = ox + Math.cos(ang) * reach;
        hy = gy + Math.sin(ang) * reach;
      }
      // Only the weapon in hand is drawn.
      const showGun = f.hasGun && !f.hidden && !!f.gun && f.active === 'gun';
      if (showGun && gun.texture.key !== f.gun && this.scene.textures.exists(f.gun)) gun.setTexture(f.gun);
      // Held by the grip (found in the sprite by tools/gun_points.py); mirrored when aiming left.
      const pts = GUN_POINTS[f.gun];
      const tilt = TILTED_GUNS[f.gun];
      if (tilt) gun.setOrigin(tilt.ox, flip < 0 ? 1 - tilt.oy : tilt.oy);
      else if (pts) gun.setOrigin(pts.grip[0] / pts.size[0], flip < 0 ? 1 - pts.grip[1] / pts.size[1] : pts.grip[1] / pts.size[1]);
      // (A tilted gun, the staff, turns its diagonal onto the aim.)
      gun.setVisible(showGun).setPosition(Math.round(hx), Math.round(hy)).setRotation(ang + (tilt ? (flip * Math.PI) / 4 : 0)).setFlipY(flip < 0).setAlpha(a);
      // Drawing the bow / charging the railgun: a ring fills in at the hand; full, the gun blinks.
      if (showGun && f.gunHold !== null) {
        if (f.gunHold < 1) {
          this.speed.lineStyle(3, C('#0b0d18'), 0.6).strokeCircle(hx, hy - 10, 6);
          this.speed.lineStyle(1, 0xffffff, 0.95).beginPath().arc(hx, hy - 10, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f.gunHold).strokePath();
          gun.clearTint();
        } else if (Math.floor(this.anim * 16) % 2 === 0) gun.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        else gun.clearTint();
      } else gun.clearTint();
      if (showGun) {
        this.hand(i, 0, hx, hy, a);
        muzzle();
      }
    } else {
      // Greybox: arm and gun pointing along the aim.
      rotRect(g, ox, oy, ang, flip, 0, -1.5, 9, 3, Phaser.Display.Color.ValueToColor(coat).darken(25).color, a);
      if (f.hasGun) {
        rotRect(g, ox, oy, ang, flip, 8, -2.5, 8, 3, C('#1f2129'), a);
        rotRect(g, ox, oy, ang, flip, 9, 0.5, 2, 3, C('#1f2129'), a);
        muzzle();
      }
    }
    // Melee weapons float toward the aim like the gun. The gun-slot one (the katana) sits in the
    // gun's place; the melee-slot one sits just behind whatever is in the gun slot, or in front
    // when the gun slot is empty. Whichever one is attacking swings through its arc.
    const swinging = f.swing ? f.swing.w : undefined;
    let windup = null; // set while the melee weapon is being wound up: { k: 0..1, ready }
    const holdWeapon = (img, key, front, slot) => {
      if (!key || f.hidden || !this.scene.textures.exists(key)) return img.setVisible(false);
      // (A bitten carrot is drawn rotten.)
      const look = key === 'carrot' && key === f.melee && f.uses > 0 && this.scene.textures.exists('carrot-rotten') ? 'carrot-rotten' : key;
      if (img.texture.key !== look) img.setTexture(look);
      let angle = ang;
      let dist = PISTOL.holdDistance;
      let lift = 0;
      const m = swinging === key ? weaponOf(key, f.swing.jab ? 'jab' : 'heavy') : MELEE[key].heavyStats;
      const spinning = key === f.melee && m.spin && f.holding !== null && f.holding >= m.spin.after;
      if (swinging === key && m.thrust) {
        // A thrust: drawn back in the wind-up, then shot straight out along the aim, the tip right on
        // the hit area as it travels out (see thrustReach), then brought home.
        const s = f.swing;
        const tip = MELEE_POINTS[key]?.length ?? img.frame.width * (1 - 0.12); // from the hand to the tip of the sprite
        const rest = 2 + tip - m.radius * 0.5; // the tip with the trident held normally
        const k = (v) => Math.max(0, Math.min(1, v));
        const back = m.reach - (m.travel ?? m.reach * 0.6);
        const tipReach =
          s.t < m.startup ? rest + (back - rest) * k(s.t / m.startup) : s.t < m.startup + m.active ? thrustReach(m, s.t) : m.reach + (rest - m.reach) * k((s.t - m.startup - m.active) / m.recovery);
        angle = Math.atan2(s.y, s.x);
        dist = tipReach + m.radius * 0.5 - tip;
      } else if (swinging === key) {
        angle = swingAngle(f.swing.x, f.swing.y, f.swing.t, m);
        dist = 4;
      } else if (spinning) {
        // The morning star spinning round you (the ball where the rules have it).
        angle = spinBall(f, m, f.holding).a;
        dist = 0;
      } else if (key === f.melee && f.holding !== null && f.holding > 0.08 && !m.throwOnly) {
        // Winding up (a throw, the nodachi's charge, a spin, a bite): slowly raised up over the
        // head, tipped back, while a ring fills in around it; when the ring closes it's ready.
        const full = m.power?.time ?? throwOf(m)?.holdToThrow ?? m.charge?.time ?? m.spin?.after ?? m.eat?.hold ?? 1;
        const k = Math.min(1, (f.holding - 0.08) / Math.max(0.05, full - 0.08));
        const up = k * k * (3 - 2 * k);
        const target = -Math.PI / 2 - flip * 0.5;
        const turn = Math.atan2(Math.sin(target - ang), Math.cos(target - ang));
        angle = ang + turn * up;
        dist = 2;
        lift = -14 * up;
        windup = { k, ready: f.holding >= full };
      } else if (!front) {
        angle = ang - 0.45 * flip; // tilted up, behind the gun slot
        dist = 3;
        lift = -4;
      }
      const hx = Math.round(ox + Math.cos(angle) * dist);
      const hy = Math.round(oy + Math.sin(angle) * dist + lift);
      const tilt = TILTED[key];
      // (Mirrored by where it points; while winding up overhead, by the side you aim to.)
      const left = (windup && key === f.melee ? flip < 0 : Math.cos(angle) < 0) !== !!tilt?.mirror;
      if (tilt) img.setOrigin(tilt.ox, left ? 1 - tilt.oy : tilt.oy);
      else img.setOrigin(0.12, 0.5);
      const rot = tilt ? angle - (left ? -tilt.angle : tilt.angle) : angle;
      img.setVisible(true).setPosition(hx, hy).setRotation(rot).setFlipY(left).setAlpha(a).clearTint();
      // (The paint roller with no paint left: dry and grey.)
      if (m.paint && key === f.melee && f.uses >= m.paint.ammo) img.setTint(0x8a8a96).setTintMode(Phaser.TintModes.MULTIPLY);
      // A throw you keep the weapon for (the cleaver) ready again: a quick blink.
      if (key === f.melee && throwOf(m)?.keep) {
        if (f.throwReady && !this.throwWasReady[i]) this.throwReadyAt[i] = this.anim;
        this.throwWasReady[i] = f.throwReady;
        const since = this.anim - this.throwReadyAt[i];
        if (this.throwReadyAt[i] >= 0 && since < 0.45 && Math.floor(since * 13) % 2 === 0) img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      }
      // Wound up and ready (to throw, or the nodachi's dash): the weapon blinks.
      if (windup?.ready && key === f.melee && Math.floor(this.anim * 16) % 2 === 0) img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      if (front || swinging === key || (windup && key === f.melee)) this.hand(i, slot, hx, hy, a);
      if (windup && key === f.melee) {
        // The ring around the raised weapon fills in as it winds up; once it's ready the ring goes
        // and the weapon blinks instead (above).
        if (!windup.ready) {
          this.speed.lineStyle(3, C('#0b0d18'), 0.6).strokeCircle(hx, hy, 10);
          this.speed.lineStyle(1, 0xffffff, 0.95).beginPath().arc(hx, hy, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * windup.k).strokePath();
        }
      }
    };
    // Only the weapon in hand is drawn (a weapon mid-swing finishes its swing).
    holdWeapon(this.katanas[i], f.chain || f.active !== 'gun' ? null : f.blade, true, 0);
    holdWeapon(this.blades[i], f.active === 'melee' || swinging === f.melee ? f.melee : null, true, 1);
    if (f.chain && !f.hidden) {
      // The trident out on its chain: links from the hand to its head, which points away from you.
      const hx = ox + Math.cos(ang) * 6;
      const hy = oy + Math.sin(ang) * 6;
      const dx = f.chain.x - hx;
      const dy = f.chain.y - hy;
      const d = Math.hypot(dx, dy) || 1;
      for (let k = 0; k < d; k += 4) {
        this.hands.fillStyle(C('#2a2630'), a).fillRect(Math.round(hx + (dx / d) * k) - 1, Math.round(hy + (dy / d) * k) - 1, 3, 3);
        this.hands.fillStyle(C('#a9a3b8'), a).fillRect(Math.round(hx + (dx / d) * k), Math.round(hy + (dy / d) * k), 1, 1);
      }
      const img = this.katanas[i];
      if (this.scene.textures.exists('trident')) {
        if (img.texture.key !== 'trident') img.setTexture('trident');
        // Held by the shaft's end, so the prongs lead.
        img.setVisible(true).setOrigin(0.1, 0.5).setPosition(Math.round(f.chain.x - (dx / d) * 30), Math.round(f.chain.y - (dy / d) * 30)).setRotation(Math.atan2(dy, dx)).setFlipY(dx < 0).setAlpha(a).clearTint();
      }
      this.hand(i, 0, hx, hy, a);
    }
    if (!f.hidden) {
      // Empty-handed: a fist waits toward the aim.
      if (f.active === 'melee' && !f.melee) this.hand(i, 0, ox + Math.cos(ang) * PISTOL.holdDistance, oy + Math.sin(ang) * PISTOL.holdDistance, a);
      // A punch (a swing with no weapon): the fist shoots out along the aim and comes back.
      if (swinging === null) {
        const s = f.swing;
        const out = s.t < STRIKE.startup ? 0.2 : s.t < STRIKE.startup + STRIKE.active ? 1 : Math.max(0, 1 - (s.t - STRIKE.startup - STRIKE.active) / STRIKE.recovery);
        const reach = 4 + out * STRIKE.reach;
        this.hand(i, 1, ox + s.x * reach, oy + s.y * reach, a);
      }
    }
    // Cooking a grenade: held up in the free hand toward the aim, flashing as its fuse runs out.
    const nade = this.heldNades[i];
    if (f.cooking && !f.hidden && this.scene.textures.exists(f.cooking.kind)) {
      const nx = ox + Math.cos(ang) * 6 - fc * 3;
      const ny = oy + Math.sin(ang) * 6 - 6;
      nade.setTexture(f.cooking.kind).setVisible(true).setPosition(Math.round(nx), Math.round(ny)).setAlpha(a);
      if (f.cooking.left < 0.3 && Math.floor(this.anim * 14) % 2 === 0) nade.setTint(0xff4040).setTintMode(Phaser.TintModes.FILL);
      else nade.clearTint();
      if (this.handImgs) this.hand(i, 1, nx, ny + 3, a);
      // The fuse: a shrinking ring around the grenade, drawn over the weapons.
      this.speed.lineStyle(2, C('#0b0d18'), 0.8).strokeCircle(nx, ny, 9);
      this.speed.lineStyle(2, f.cooking.left < 0.3 ? C('#ff4040') : C('#ffd966'), 1).beginPath().arc(nx, ny, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f.cooking.left).strokePath();
    } else {
      nade.setVisible(false);
    }
    // The weapon not in hand, slung across the back: greyed, slanted, wobbling as you move.
    const back = this.backs[i];
    const backKey = f.active === 'gun' ? f.melee : f.hasGun ? f.gun : f.blade;
    if (backKey && !f.hidden && this.scene.textures.exists(backKey) && !f.chain) {
      if (back.texture.key !== backKey) back.setTexture(backKey);
      const wobble = f.walk > 0 ? Math.sin(f.walk * 1.6) * 0.14 : Math.sin(this.anim * 2 + i) * 0.03;
      const bob = f.walk > 0 ? Math.abs(Math.sin(f.walk * 1.6)) * 1.5 : 0;
      back.setVisible(true).setPosition(x - fc * 3, y - 19 + bob).setOrigin(0.5, 0.5).setRotation((fc > 0 ? -2.3 : -0.84) + wobble).setFlipY(fc > 0).setAlpha(a * 0.95);
      back.setTint(0x8a8a96).setTintMode(Phaser.TintModes.MULTIPLY);
    } else {
      back.setVisible(false);
    }
    // Stuck on glue: strings of it stretching from the feet.
    if (f.glued) {
      const gx = Math.round(f.x);
      const gy = Math.round(f.y);
      g.fillStyle(C('#f2e7a6'), 0.85).fillRect(gx - 5, gy - 3, 1, 3).fillRect(gx + 4, gy - 4, 1, 4).fillRect(gx - 1, gy - 2, 1, 2);
    }
    // Bleeding (the cleaver): drops of blood falling off.
    if (f.bleeding && Math.random() < 0.25) {
      this.particles.push({ x: x + (Math.random() * 2 - 1) * 5, y: y - 12 - Math.random() * 14, vx: 0, vy: 10, life: 0.5, color: C('#b3122e'), g: 300, s: 2 });
    }
    // On fire: flames lick up off the body.
    if (f.burning && Math.random() < 0.6) {
      this.particles.push({ x: x + (Math.random() * 2 - 1) * 6, y: y - Math.random() * 30, vx: (Math.random() * 2 - 1) * 10, vy: -40 - Math.random() * 30, life: 0.35, color: Math.random() < 0.5 ? C('#ff7a1f') : C('#ffd23f'), g: -40, s: 2 });
    }
    // Block: the melee weapon (the katana first) held upright in front as a guard, flashing pale
    // blue while blocking and fading white while the block drops (the parry window is the start).
    // With no melee weapon, both fists come up.
    if ((f.blocking || f.dropping) && !f.hidden && this.handImgs) {
      const gx = x + fc * 8;
      const gy = y - 20;
      const img = f.blade ? this.katanas[i] : this.blades[i];
      if (img.visible) {
        img.setPosition(gx, gy + 6).setRotation(-Math.PI / 2).setFlipY(fc < 0).setAlpha(f.blocking ? 1 : 0.6);
        img.setTint(f.blocking ? 0xcfe3ff : 0xffffff).setTintMode(Phaser.TintModes.FILL);
        this.handImgs[i][1].setVisible(false);
        this.hand(i, 0, gx, gy + 6, a);
      } else {
        this.hand(i, 0, gx, gy - 4, a);
        this.hand(i, 1, gx, gy + 4, a);
        for (const h of this.handImgs[i]) h.setTint(f.blocking ? 0xcfe3ff : 0xffffff).setTintMode(Phaser.TintModes.FILL).setAlpha(f.blocking ? 1 : 0.6);
      }
    }
    this.drawSpeedLines(f, i, swinging !== undefined ? weaponOf(swinging, f.swing.jab ? 'jab' : 'heavy') : STRIKE, ox, oy, dt);
    // Slapped with the fish: dripping wet. Ate a carrot: little orange speed streaks.
    if (f.slipping && Math.random() < 0.3) this.particles.push({ x: x + (Math.random() * 2 - 1) * 6, y: y - 6 - Math.random() * 22, vx: 0, vy: 20, life: 0.4, color: C('#7fc8ff'), g: 300, s: 1 });
    if (f.hasted && Math.abs(f.walk) > 0 && Math.random() < 0.5) this.particles.push({ x: x - fc * 6, y: y - 4 - Math.random() * 22, vx: -fc * 60, vy: 0, life: 0.2, color: C('#ff9a3c'), g: 0, s: 1 });
    // Reload bar.
    if (f.reload > 0) {
      g.fillStyle(0x000000, 0.6).fillRect(x - 8, y - 44, 16, 3);
      g.fillStyle(C('#ffd966'), 1).fillRect(x - 8, y - 44, 16 * f.reload, 3);
    }
    // Marker over local players, in their color.
    // (Over a cat or an animal: lower, over its head.)
    const up = f.cat || f.animal ? 24 : 0;
    if (this.locals.includes(i) && this.roster[i].kind !== 'bot') g.fillStyle(color, 1).fillTriangle(x - 3, y - 48 + up, x + 3, y - 48 + up, x, y - 44 + up);
    tag.setVisible(true).setPosition(x, y - (f.reload > 0 ? 46 : 49) + up);
    if (f.asleep) {
      // (Lying down: the z's start low, and grow one at a time.)
      const n = Math.floor(this.anim * 2.5) % 3;
      this.zzz[i].setText(['z..', 'z.. zz..', 'z.. zz.. zzz'][n]).setPosition(x + 2, Math.round(f.y) - 14 - ((this.anim * 6) % 3));
    }
    // Asleep: how close mashing has them to waking, a light blue bar.
    if (f.waking !== null && f.waking !== undefined) {
      g.fillStyle(0x000000, 0.6).fillRect(x - 8, Math.round(f.y) - 24, 16, 3);
      g.fillStyle(C('#9fd8ff'), 1).fillRect(x - 8, Math.round(f.y) - 24, 16 * f.waking, 3);
    }
    // Drowsy: how far it's been shaken off, a pink bar over the head; now and then a pink z.
    if (f.drowsy !== null && f.drowsy !== undefined) {
      g.fillStyle(0x000000, 0.6).fillRect(x - 8, y - 41, 16, 3);
      g.fillStyle(C('#ff9ccf'), 1).fillRect(x - 8, y - 41, 16 * f.drowsy, 3);
      if (Math.random() < 0.03) this.particles.push({ x: x + 4, y: y - 34, vx: 8, vy: -14, life: 0.8, color: C('#ffc2e2'), g: 0, s: 2 });
    }
  }

  drawParticles(dt) {
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.vy += p.g * dt;
      p.vx *= 1 - 2.5 * dt;
      p.vy *= 1 - 2.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.fx.fillStyle(p.color, Math.min(1, p.life * 3)).fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      return true;
    });
    this.rings = this.rings.filter((r) => {
      r.life -= dt;
      if (r.life <= 0) return false;
      r.r += 400 * dt;
      this.fx.lineStyle(3, C('#ffe6b3'), r.life * 3).strokeCircle(r.x, r.y, r.r);
      this.fx.fillStyle(C('#ffbf4d'), r.life * 2).fillCircle(r.x, r.y, r.r * 0.6);
      return true;
    });
  }

  drawStorm(s) {
    const { top, bottom } = this.st.storm;
    const g = this.stormG;
    const h = bottom - top;
    // Pale band next to the safe zone (hurts), then the deep-red wall (the new edge of the stage).
    g.fillStyle(C('#a3184d'), 0.3).fillRect(s.wallLeft, top, s.left - s.wallLeft, h).fillRect(s.right, top, s.wallRight - s.right, h);
    g.fillStyle(C('#4a0620'), 0.82).fillRect(s.wallLeft - 4000, top, 4000, h).fillRect(s.wallRight, top, 4000, h);
    // Moving diagonal streaks inside the wall.
    const off = (this.anim * 40) % 32;
    g.lineStyle(2, C('#ff4d80'), 0.25);
    for (let y = top; y < bottom; y += 32) {
      g.lineBetween(s.wallLeft - 60 + off, y, s.wallLeft - 20 + off, y + 40);
      g.lineBetween(s.wallRight + 20 - off, y, s.wallRight + 60 - off, y + 40);
    }
    g.lineStyle(1, C('#ff598c'), 0.6).lineBetween(s.left, top, s.left, bottom).lineBetween(s.right, top, s.right, bottom);
    g.lineStyle(3, C('#ff2e63'), 1).lineBetween(s.wallLeft, top, s.wallLeft, bottom).lineBetween(s.wallRight, top, s.wallRight, bottom);
    // Dashed lines where the storm is heading next.
    if (s.next && (s.next[0] > s.left + 1 || s.next[1] < s.right - 1)) {
      g.lineStyle(1, 0xffffff, 0.5);
      for (let y = top; y < bottom; y += 12) {
        g.lineBetween(s.next[0], y, s.next[0], y + 6);
        g.lineBetween(s.next[1], y, s.next[1], y + 6);
      }
    }
  }

  drawHud(view, dt) {
    const g = this.hudG;
    view.fighters.forEach((f, i) => {
      const p = this.panels[i];
      if (!p) return;
      const bx = p.x + 4;
      const by = VIEW_H - 50;
      const color = PLAYER_COLORS[i].hex;
      g.fillStyle(C('#0a0d1a'), 0.78).fillRect(bx, by, this.panelW - 8, 46);
      g.fillStyle(color, 1).fillRect(bx, by, this.panelW - 8, 2);
      for (let s = 0; s < f.stocks; s++) g.fillRect(bx + this.panelW - 8 - 8 - s * 7, by + 6, 5, 5);
      p.name.setPosition(bx + 6, by + 3);
      // Online: each player's ping, in the card's lower right corner.
      const ms = view.pings?.[i];
      p.ms.setText(ms === undefined || ms === null ? '' : `${ms}ms`).setColor(ms === null || ms === undefined || ms < 80 ? '#7dff9a' : ms < 150 ? '#ffd966' : '#ff7399').setPosition(bx + this.panelW - 11, by + 45);
      this.pulse[i] = Math.max(0, this.pulse[i] - dt);
      if (f.state === 'out') {
        p.damage.setText('OUT').setColor('#737891').setScale(1).setPosition(bx + 6, by + 18);
        p.ammo.setText('');
        p.melee.setText('');
        for (const img of [...p.nades, p.gunIcon, p.meleeIcon]) img.setVisible(false);
        return;
      }
      // Damage %: white, turning red as it climbs; bumps when hit.
      const heat = Math.min(1, f.damage / 150);
      const gb = Math.round(255 * (1 - heat * 0.75));
      p.damage.setText(`${f.damage}%`).setColor(`rgb(255,${gb},${gb})`).setScale(1 + this.pulse[i] * 1.5).setPosition(bx + 6, by + 18);
      // The weapons: the gun slot (a gun, the katana or trident, or a fist) with its ammo to the
      // right, and the melee slot (a weapon or a fist) below. While reloading the ammo is a
      // blinking R; with no bullets left at all, a red blinking E (go find another weapon).
      const wx = bx + 50;
      const blink = Math.floor(this.anim * 4) % 2 === 0;
      const icon = (img, key, y, maxW, maxH, alpha = 1) => {
        if (!this.scene.textures.exists(key)) return img.setVisible(false);
        if (img.texture.key !== key) img.setTexture(key);
        const fr = img.frame;
        const s = Math.min(1, maxW / fr.width, maxH / fr.height);
        img.setVisible(true).setScale(s).setPosition(wx, y).setAlpha(alpha);
      };
      const fist = this.handKey(f.id);
      const gunKey = f.hasGun ? f.gun : f.blade ?? fist;
      // The weapon in hand is bright, with a marker; the other one is dimmed.
      const gunHeld = f.active === 'gun';
      icon(p.gunIcon, gunKey, by + 19, 32, 13, gunKey === fist ? 0.3 : gunHeld ? 1 : 0.35);
      // The style meter, under the damage: it fills pink. Its outline is the headshot cooldown:
      // white when a headshot will count, grey after one, and the white traced back round it
      // clockwise as the cooldown runs out.
      this.styleBar(g, bx + 6, by + 40, 38, 4, f.style ?? 0, f.styleCd ?? 0);
      // A special gun: outlined in red (the style meter doesn't reload it; ammo chests do).
      if (f.hasGun && GUNS[f.gun]?.weight === 'special') g.lineStyle(1, C('#ff4d5e'), 0.95).strokeRect(bx + 47, by + 11, 37, 16);
      icon(p.meleeIcon, f.melee ?? fist, by + 36, 32, 11, gunHeld ? 0.3 : f.melee ? 1 : 0.7);
      g.fillStyle(0xffffff, 1).fillTriangle(wx - 5, (gunHeld ? by + 19 : by + 36) - 3, wx - 5, (gunHeld ? by + 19 : by + 36) + 3, wx - 2, gunHeld ? by + 19 : by + 36);
      p.ammo.setAlpha(gunHeld ? 1 : 0.45);
      const ax = wx + 35;
      p.melee.setText('');
      if (!f.hasGun) p.ammo.setText('');
      else if (f.reload > 0) p.ammo.setText(blink ? 'R' : '').setColor('#ffd966');
      else if (view.infiniteAmmo) p.ammo.setText('∞').setColor('#ffd966');
      else if (f.ammo === 0 && f.spareMags === 0) p.ammo.setText(blink ? 'E' : '').setColor('#ff4d4d');
      else p.ammo.setText(String(f.ammo)).setColor('#ffd966');
      p.ammo.setPosition(ax, by + 13);
      // Spare magazines: small bars under the count.
      if (f.hasGun && !view.infiniteAmmo) for (let m = 0; m < f.spareMags; m++) g.fillStyle(C('#d9dcf2'), 1).fillRect(ax + m * 4, by + 25, 3, 4);
      // Grenades carried, beside the melee weapon: the next one to throw first.
      p.nades.forEach((img, k) => {
        // (The Ring of Cat takes both slots: the ring, and a greyed-out copy beside it.)
        const ring = f.ring > 0 && !f.grenades?.length;
        const kind = ring ? 'catring' : f.grenades?.[k];
        img.setVisible(!!kind && this.scene.textures.exists(kind));
        if (kind && img.visible) img.setTexture(kind).setScale(Math.min(1, 10 / img.frame.height)).setPosition(ax + 4 + k * 11, by + 37);
        if (ring && k === 1) img.setTint(0x555a70).setAlpha(0.6);
        else img.clearTint().setAlpha(1);
      });
    });
    this.stormText.setText(view.waiting ? 'WAITING FOR PLAYERS…' : view.phase === 'play' && !view.training ? view.storm.text : '').setColor(view.waiting ? '#d9dcf2' : view.storm.text === 'FINAL ZONE' ? '#ffccd9' : '#ff7399');
    // Announcements: a beep per countdown number; a siren each time the storm starts closing in.
    const count = view.phase === 'countdown' ? Math.ceil(view.timer) : null;
    if (count !== null && count !== this.lastCount) this.sfx.ui('ui-beep', 0.7);
    this.lastCount = count;
    const storm = view.phase === 'play' && !view.training ? view.storm.text : null;
    if (storm === 'STORM CLOSING' && this.lastStorm !== 'STORM CLOSING') this.sfx.ui('ui-storm', 0.7);
    this.lastStorm = storm;
    if (view.phase === 'countdown') {
      this.banner.setText(String(Math.ceil(view.timer))).setAlpha(1);
    } else if (this.bannerTime > 0) {
      this.bannerTime -= dt;
      this.banner.setText(this.bannerText).setAlpha(Math.min(1, this.bannerTime * 3));
    } else {
      this.banner.setAlpha(0);
    }
  }
}

// A rectangle in the arm's frame (origin at the shoulder, x along the aim), mirrored when aiming left.
function rotRect(g, ox, oy, ang, flip, x, y, w, h, color, alpha) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const pts = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ].map(([px, py]) => new Phaser.Math.Vector2(ox + px * c - py * flip * s, oy + px * s + py * flip * c));
  g.fillStyle(color, alpha).fillPoints(pts, true);
}

function drawBullet(g, b, anim) {
  if (b.thrown) {
    const c = Math.cos(anim * 20);
    const s = Math.sin(anim * 20);
    const pts = [
      [-4, -1.5],
      [4, -1.5],
      [4, 1.5],
      [-4, 1.5],
    ].map(([x, y]) => new Phaser.Math.Vector2(b.x + x * c - y * s, b.y + x * s + y * c));
    g.fillStyle(C('#1f2129'), 1).fillPoints(pts, true);
    return;
  }
  const len = Math.hypot(b.vx, b.vy) || 1;
  const ux = b.vx / len;
  const uy = b.vy / len;
  if (b.look === 'rocket') {
    // A rocket: a dark shell with a flame behind it.
    g.lineStyle(4, C('#3b4a2a'), 1).lineBetween(b.x - ux * 6, b.y - uy * 6, b.x, b.y);
    g.fillStyle(Math.floor(anim * 30) % 2 ? C('#ff9933') : C('#ffe14d'), 1).fillCircle(b.x - ux * 8, b.y - uy * 8, 2.5);
    return;
  }
  if (b.look === 'blaster') {
    // A star bolt: a glowing cyan ball, growing with each bounce.
    g.fillStyle(C('#3be3d0'), 0.35).fillCircle(b.x, b.y, 5 * b.size);
    g.fillStyle(C('#c8fff6'), 1).fillCircle(b.x, b.y, 2.5 * b.size);
    return;
  }
  if (b.look === 'bow') {
    // An arrow: a shaft along its flight, a head in front, fletching behind.
    g.lineStyle(1, C('#b07a45'), 1).lineBetween(b.x - ux * 10, b.y - uy * 10, b.x, b.y);
    g.fillStyle(C('#d8dce8'), 1).fillRect(b.x - 1, b.y - 1, 2, 2);
    g.fillStyle(C('#e8e2d0'), 1).fillRect(b.x - ux * 10 - 1, b.y - uy * 10 - 1, 2, 2);
    return;
  }
  if (b.look === 'firestaff') {
    // A flame: orange to yellow, flickering.
    g.fillStyle(C('#ff5a1f'), 0.7).fillCircle(b.x, b.y, 3 + Math.sin(anim * 40 + b.id));
    g.fillStyle(C('#ffd23f'), 1).fillCircle(b.x, b.y, 1.5);
    return;
  }
  if (b.look === 'slimer') {
    g.fillStyle(C('#2e5a12'), 1).fillCircle(b.x, b.y, 4);
    g.fillStyle(C('#8fdc4a'), 1).fillCircle(b.x, b.y, 3);
    g.fillStyle(C('#eaffb0'), 1).fillRect(b.x - 2, b.y - 2, 1, 1);
    return;
  }
  if (b.look === 'spores') {
    g.fillStyle(C('#b6ff6a'), 0.8).fillCircle(b.x, b.y, 1.5 + ((b.id * 7) % 3) * 0.5);
    return;
  }
  if (SPRITE_SHOTS[b.look]) return; // (drawn as sprites: see drawMoney)
  if (b.look === 'golden') {
    g.lineStyle(2, C('#ffd23f'), 0.8).lineBetween(b.x - ux * 14, b.y - uy * 14, b.x, b.y);
    g.fillStyle(C('#fff0a0'), 1).fillRect(b.x - 1, b.y - 1, 3, 3);
    return;
  }
  if (b.look === 'snoozer') {
    g.lineStyle(1, C('#c58bff'), 0.8).lineBetween(b.x - ux * 22, b.y - uy * 22, b.x, b.y);
    g.fillStyle(C('#efdcff'), 1).fillRect(b.x - 1, b.y - 1, 2, 2);
    return;
  }
  const tail = b.look === 'sniper' ? 22 : b.look === 'shotgun' ? 4 : 7;
  g.lineStyle(b.look === 'sniper' ? 1 : 2, C('#ffcc59'), 0.6).lineBetween(b.x - ux * tail, b.y - uy * tail, b.x, b.y);
  g.fillStyle(C('#fff2bf'), 1).fillRect(b.x - 1, b.y - 1, 2, 2);
}

function drawBarrel(g, b, lit) {
  const red = lit ? 0xffffff : C('#b3262f');
  const x = b.x - BARREL.w / 2;
  const y = b.y - BARREL.h;
  g.fillStyle(red, 1).fillRect(x, y, 14, 20);
  g.fillStyle(lit ? 0xdddddd : C('#7d1b21'), 1).fillRect(x, y, 3, 20);
  g.fillStyle(C('#5a1016'), 1).fillRect(x, y + 5, 14, 2).fillRect(x, y + 14, 14, 2);
  g.fillStyle(C('#e8c547'), 1).fillRect(x + 4, y + 8, 6, 4);
  g.fillStyle(C('#8a1c2b'), 1).fillRect(x + 1, y - 1, 12, 2);
}

// sky: the flat sky fill (behind the skyline art); g: towers (when there's no art) and the back wall.
function drawBackdrop(sky, g, st, towers) {
  const cam = st.camera;
  const c = { x: cam.left - 400, y: cam.top - 400, w: cam.right - cam.left + 800, h: cam.bottom - cam.top + 800 };
  sky.fillStyle(C('#2a1d4a'), 1).fillRect(c.x, c.y, c.w, c.h);
  if (!towers) {
    drawBackWall(g, c);
    return;
  }
  g.fillStyle(C('#101427'), 1).fillRect(c.x, c.y, c.w, c.h);
  g.fillStyle(C('#161b33'), 1).fillRect(c.x, -300, c.w, 300);
  // Distant towers with lit windows (fixed pattern, same every time).
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let x = c.x; x < c.x + c.w; ) {
    const w = 60 + rnd() * 80;
    const top = -420 + rnd() * 200;
    g.fillStyle(C('#1a2040'), 1).fillRect(x, top, w - 8, 600);
    for (let wy = top + 12; wy < 0; wy += 14) {
      for (let wx = x + 8; wx < x + w - 16; wx += 10) {
        if (rnd() < 0.18) g.fillStyle(rnd() < 0.7 ? C('#d9a441') : C('#5ec4d6'), 1).fillRect(wx, wy, 4, 6);
      }
    }
    x += w;
  }
  drawBackWall(g, c);
}

// Back wall behind the ground floor.
function drawBackWall(g, c) {
  g.fillStyle(C('#1e2236'), 1).fillRect(c.x, -110, c.w, 110);
  g.fillStyle(C('#181b2c'), 1);
  for (let bx = c.x; bx < c.x + c.w; bx += 48) g.fillRect(bx, -110, 2, 110);
  g.fillStyle(C('#0a0c16'), 1).fillRect(c.x, 64, c.w, 400);
}

// Scaffolding under a platform: poles down to the nearest surface below, with X braces.
// A wooden deck (thin platforms): boards with a bright top edge, seams, a dark underside.
function woodDeck(g, x, y, w) {
  g.fillStyle(C('#3d2a1a'), 1).fillRect(x, y, w, 5);
  g.fillStyle(C('#8c6a44'), 1).fillRect(x, y, w, 3);
  g.fillStyle(C('#c79a62'), 1).fillRect(x, y, w, 1);
  g.fillStyle(C('#5c4128'), 1);
  for (let px = x + 12; px < x + w; px += 14) g.fillRect(px, y, 1, 4);
}

function drawScaffold(g, st, b) {
  const floorBelow = (x) => {
    let best = b.y + 160;
    for (const o of st.blocks) if (o !== b && o.y > b.y && x >= o.x && x <= o.x + o.w) best = Math.min(best, o.y);
    return best;
  };
  const poles = [];
  for (let x = b.x + 2; x < b.x + b.w - 2; x += 48) poles.push(x);
  poles.push(b.x + b.w - 4);
  const pole = C('#56657a');
  const brace = C('#3c4759');
  for (let i = 0; i < poles.length; i++) {
    const x = poles[i];
    const bottom = floorBelow(x + 1);
    g.fillStyle(pole, 1).fillRect(x, b.y + 4, 2, bottom - b.y - 4);
    const next = poles[i + 1];
    if (next === undefined) continue;
    const nb = Math.min(bottom, floorBelow(next + 1));
    g.lineStyle(1, brace, 1);
    for (let y = b.y + 6; y + 8 <= nb; y += 24) {
      const y2 = Math.min(y + 24, nb);
      g.lineBetween(x + 2, y, next, y2).lineBetween(next, y, x + 2, y2);
      g.fillStyle(pole, 1).fillRect(x, y2 - 1, next - x + 2, 2);
    }
  }
}

// A doorway set into the wall: frame, dark opening, a strip of light at the top.
function drawDoor(g, d) {
  const x = d.x - DOOR.w / 2;
  const y = d.y - DOOR.h;
  g.fillStyle(C('#2b3047'), 1).fillRect(x - 5, y - 6, DOOR.w + 10, DOOR.h + 6);
  g.fillStyle(C('#56607f'), 1).fillRect(x - 3, y - 4, DOOR.w + 6, DOOR.h + 4);
  g.fillStyle(C('#07080e'), 1).fillRect(x, y, DOOR.w, DOOR.h);
  g.fillStyle(C('#9fe6ff'), 0.6).fillRect(x - 3, y - 6, DOOR.w + 6, 2);
}

// A building front behind the arena: dark brick, rows of windows (some lit), a cornice on top,
// a vertical neon sign and a few AC units. Drawn from a seed, so each building is different but stable.
// trimOnly: the brick and windows come from a kit; just add the cornice, edges and neon sign.
function drawFacade(g, fa, trimOnly = false) {
  let seed = fa.seed * 7919;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const { x, y, w, h } = fa;
  if (trimOnly) {
    g.fillStyle(C('#15111b'), 1).fillRect(x - 2, y, 2, h).fillRect(x + w, y, 2, h);
    g.fillStyle(C('#3d3245'), 1).fillRect(x - 4, y - 6, w + 8, 8);
    g.fillStyle(C('#56486a'), 1).fillRect(x - 4, y - 6, w + 8, 2);
    g.fillStyle(C('#15111b'), 1).fillRect(x - 2, y + 2, w + 4, 2);
    const sx = rnd() < 0.5 ? x + 4 : x + w - 12;
    const neon = rnd() < 0.5 ? C('#ff4d8a') : C('#4dd8ff');
    g.fillStyle(C('#120e18'), 1).fillRect(sx, y + 30, 8, 70);
    g.fillStyle(neon, 1);
    for (let ny = y + 34; ny < y + 96; ny += 10) g.fillRect(sx + 2, ny, 4, 6);
    return;
  }
  g.fillStyle(C('#2a2131'), 1).fillRect(x, y, w, h);
  // Brick courses.
  g.fillStyle(C('#221a29'), 1);
  for (let by = y + 10; by < y + h; by += 6) g.fillRect(x, by, w, 1);
  for (let by = y + 10, row = 0; by < y + h; by += 6, row++) {
    for (let bx = x + (row % 2 ? 6 : 0); bx < x + w; bx += 12) g.fillRect(bx, by, 1, 6);
  }
  // Cornice and roof edge.
  g.fillStyle(C('#3d3245'), 1).fillRect(x - 4, y, w + 8, 8);
  g.fillStyle(C('#56486a'), 1).fillRect(x - 4, y, w + 8, 2);
  g.fillStyle(C('#15111b'), 1).fillRect(x - 2, y + 8, w + 4, 2);
  // Windows: a grid, skipping some, lit warm or teal, others dark with a blind.
  const cols = Math.floor((w - 24) / 34);
  const rows = Math.floor((h - 40) / 44);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rnd() < 0.12) continue;
      const wx = x + 16 + c * 34;
      const wy = y + 22 + r * 44;
      g.fillStyle(C('#151019'), 1).fillRect(wx - 2, wy - 2, 18, 26);
      const lit = rnd();
      g.fillStyle(lit < 0.25 ? C('#d9a441') : lit < 0.38 ? C('#4fb3c4') : C('#1c1a2e'), 1).fillRect(wx, wy, 14, 22);
      if (lit >= 0.38 && rnd() < 0.5) g.fillStyle(C('#2c2840'), 1).fillRect(wx, wy, 14, 8 + Math.floor(rnd() * 10));
      g.fillStyle(C('#3d3245'), 1).fillRect(wx - 3, wy + 22, 20, 3);
      if (rnd() < 0.15) g.fillStyle(C('#4a4a58'), 1).fillRect(wx + 2, wy + 25, 10, 6); // AC unit
    }
  }
  // Vertical neon sign on one side.
  const sx = rnd() < 0.5 ? x + 4 : x + w - 12;
  const neon = rnd() < 0.5 ? C('#ff4d8a') : C('#4dd8ff');
  g.fillStyle(C('#120e18'), 1).fillRect(sx, y + 30, 8, 70);
  g.fillStyle(neon, 1);
  for (let ny = y + 34; ny < y + 96; ny += 10) g.fillRect(sx + 2, ny, 4, 6);
}

// Lay out one wall run from kit pieces: left corner, then left to right a door piece centered on
// each doorway in the run (cycling bay / door / narrow door), plain wall (now and then a pipe) to
// fill the gaps, and the right corner. The last filler piece is cropped to fit.
function buildKitRun(scene, kit, run, doors) {
  const tint = 0x4a5078;
  const p = kit.pieces;
  const out = [];
  let seed = Math.round(run.x0) + 17;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const place = (name, x, width = p[name].w) => {
    const img = scene.add.image(x, run.y, `${run.kit}/${name}`).setOrigin(0, 1).setTint(tint);
    if (width < p[name].w) img.setCrop(0, 0, width, kit.height);
    out.push(img);
    return x + width;
  };
  // Plain wall from x to `to`, with the odd pipe.
  const fill = (x, to) => {
    while (x < to) {
      if (p.pipe && to - x >= p.pipe.w + 32 && rnd() < 0.15) x = place('pipe', x);
      else x = place('wall', x, Math.min(p.wall.w, to - x));
    }
    return x;
  };
  const styles = ['door', 'bay', 'door_narrow'].filter((n) => p[n]);
  const inRun = doors
    .map((d, i) => ({ ...d, i }))
    .filter((d) => d.y === run.y && d.x > run.x0 && d.x < run.x1)
    .sort((a, b) => a.x - b.x);
  let x = place('left_corner', run.x0);
  inRun.forEach((d, n) => {
    const name = styles[n % styles.length];
    const start = Math.round(d.x - p[name].door);
    x = fill(x, start);
    x = place(name, start);
  });
  fill(x, run.x1 - p.right_corner.w);
  place('right_corner', run.x1 - p.right_corner.w);
  return out;
}

// A building front from a kit's window columns, in a shuffled (but stable) order, each with one
// of its lit-window overlays. Columns are cut to the facade's width and height (keeping the top).
function buildFacadeColumns(scene, kit, fa) {
  let seed = fa.seed * 7919 + 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const names = Object.keys(kit.pieces);
  const out = [];
  const lights = [];
  const h = Math.min(fa.h, kit.height);
  let last = '';
  for (let x = fa.x; x < fa.x + fa.w; ) {
    let name = names[Math.floor(rnd() * names.length)];
    if (name === last) name = names[(names.indexOf(name) + 1) % names.length]; // no twins side by side
    last = name;
    const w = Math.min(kit.pieces[name].w, fa.x + fa.w - x);
    out.push(scene.add.image(x, fa.y, `${fa.kit}/${name}`).setOrigin(0, 0).setTint(0x5c5070).setCrop(0, 0, w, h));
    const v = Math.floor(rnd() * (kit.lights ?? 0));
    if (kit.lights) lights.push(scene.add.image(x, fa.y, `${fa.kit}/${name}_lights${v}`).setOrigin(0, 0).setCrop(0, 0, w, h));
    x += w;
  }
  return [...out, ...lights];
}

function drawBlocks(g, st, kitFacades = new Set()) {
  for (const fa of st.facades ?? []) drawFacade(g, fa, kitFacades.has(fa));
  for (const d of st.doors) drawDoor(g, d);
  for (const b of st.blocks) if (b.look === 'scaffold') drawScaffold(g, st, b);
  for (const b of st.blocks) {
    const { x, y, w, h } = b;
    if (VILLAGE_LOOKS.has(b.look) || DUNGEON_LOOKS.has(b.look) || NIGHT_LOOKS.has(b.look)) continue;
    // (Thin platforms are wood, on every stage; solid ones stone, concrete or metal.)
    if (b.look === 'balcony') {
      // Balcony: a metal railing behind you, a wooden deck, metal brackets under it.
      g.fillStyle(C('#4a5570'), 1).fillRect(x, y - 12, w, 2);
      for (let rx = x; rx <= x + w - 2; rx += 6) g.fillRect(rx, y - 12, 1, 12);
      woodDeck(g, x, y, w);
      g.fillStyle(C('#3a4062'), 1);
      for (let bx = x + 8; bx < x + w; bx += 40) g.fillTriangle(bx, y + 5, bx + 8, y + 5, bx, y + 13);
    } else if (b.look === 'scaffold') {
      // Wooden planks on a metal frame.
      g.fillStyle(C('#8c6a44'), 1).fillRect(x, y, w, 4);
      g.fillStyle(C('#5c4128'), 1);
      for (let px = x + 10; px < x + w; px += 12) g.fillRect(px, y, 1, 4);
      g.fillStyle(C('#56657a'), 1).fillRect(x, y + 4, w, 2);
    } else if (b.oneWay) {
      woodDeck(g, x, y, w);
      g.fillStyle(C('#3a4062'), 1);
      for (let sx = x + 6; sx < x + w; sx += 16) g.fillRect(sx, y + 4, 2, 6);
    } else if (b.look === 'metal') {
      g.fillStyle(C('#39405e'), 1).fillRect(x, y, w, h);
      g.fillStyle(C('#6c769e'), 1).fillRect(x, y, w, 3);
      g.fillStyle(C('#2a3048'), 1);
      for (let yy = y + 8; yy < y + h; yy += 8) g.fillRect(x, yy, w, 1);
      // Hazard stripes along the top.
      g.fillStyle(C('#c9a227'), 1);
      for (let sx = x; sx < x + w; sx += 12) g.fillRect(sx, y + 3, Math.min(6, x + w - sx), 3);
    } else if (b.look === 'catwalk') {
      g.fillStyle(C('#2b3047'), 1).fillRect(x, y, w, h);
      g.fillStyle(C('#7c86ad'), 1).fillRect(x, y, w, 3);
    } else {
      g.fillStyle(C('#2a2f45'), 1).fillRect(x, y, w, h);
      g.fillStyle(C('#5d6690'), 1).fillRect(x, y, w, 4);
      g.fillStyle(C('#1c2033'), 1).fillRect(x, y + 4, w, 2);
      g.fillStyle(C('#232839'), 1);
      for (let by = y + 14, row = 0; by < y + h; by += 9, row++) {
        for (let bx = x + (row % 2 ? 16 : 0); bx < x + w; bx += 32) g.fillRect(bx, by, 1, 8);
        g.fillRect(x, by + 8, w, 1);
      }
    }
  }
  for (const s of isDungeon(st) ? [] : st.spikes) {
    // (The dungeon draws its spike walls from its own tiles.)
    const h = s.height * TILE;
    g.fillStyle(C('#39405e'), 1).fillRect(s.x, s.y, TILE, h);
    g.lineStyle(1, C('#232839'), 1).strokeRect(s.x + 0.5, s.y + 0.5, TILE - 1, h - 1);
    const base = s.face > 0 ? s.x + TILE : s.x;
    const tip = s.face * SPIKES.depth;
    for (let y = s.y; y < s.y + h; y += 8) {
      g.fillStyle(C('#c8ccd8'), 1).fillTriangle(base, y, base + tip, y + 4, base, y + 8);
      g.lineStyle(1, C('#8a1c2b'), 1).lineBetween(base, y + 4, base + tip, y + 4);
    }
  }
}
