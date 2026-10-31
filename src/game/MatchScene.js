// One match. Two modes:
//   local  – this browser runs the rules (solo vs bots, or players sharing this screen)
//   client – online: the game server's match, played here too, from the same start and inputs
//            (rollback: see net/rollback.js)
import { SCENERY_ART } from './scenery.js';
import { PERF, perfStart, perfFrame, perfStep, perfMachine } from './perf.js';
import Phaser from 'phaser';
import { COVER_ART } from './cover.js';
import { DT, MELEE, GUNS, GRENADES, ITEMS, STORM_PACE, CAT, ANIMALS } from '../sim/constants.js';
import { createWorld, step, spawnWeapon, setHealthRule } from '../sim/world.js';
import { toView } from '../sim/view.js';
import { NEUTRAL } from '../sim/input.js';
import { Rollback, INPUT_DELAY } from '../net/rollback.js';
import { PRACTICE_DELAY } from '../net/room.js';
import { createBot, botInput, configureBot } from '../bots/bot.js';
import { Controls } from './controls.js';
import { Spectator } from './spectate.js';
import { Renderer, CITY, CHARACTERS, makeCharacterAnims } from './render.js';
import { IDLE_H, IDLE_W, OWN_HANDS } from './cast.js';
import { settings } from './settings.js';
import { SOUNDS } from './audio.js';
import { STAGES, DEFAULT_STAGE, isStageId } from '../sim/stage.js';

// A shot someone else fired (a grenade, a thrown weapon, the trident on its chain, money bursting
// out) often turns up here late (online, once their input arrives: rollback), already well on its
// way. Drawn instead as setting off from where it started and quickly catching up with where it
// really is; where it hits isn't changed.
const LATE_SHOT = { after: 1, ease: 22, max: 600 }; // ticks late to count; catch-up speed (per s); px

// Real art, where it exists (public/art/). Anything missing falls back to the greybox shapes.
// Loaded by the match (only what isn't already), or ahead of it: see warmUp in game.js.
export function loadArt(scene) {
  for (const key of [...CITY.far, ...CITY.near, ...Object.keys(MELEE), ...Object.keys(GUNS), ...Object.keys(GRENADES), 'sky', 'barrel', ...COVER_ART, 'hand', 'hand-skeleton', 'hand-orc', ...OWN_HANDS.map((n) => `hand-${n}`), 'crown', 'carrot-rotten', 'chest', ...Object.keys(ITEMS)]) if (!scene.textures.exists(key)) scene.load.image(key, `art/${key}.png`);
  if (!scene.textures.exists('village')) scene.load.image('village', 'art/village/tiles.png');
  // Cloud puffs (smoke, poison, spore patches): animation strips of 64×64 frames.
  // Controller button pictures: 16×16 frames (see padicons.js).
  if (!scene.textures.exists('buttons')) scene.load.spritesheet('buttons', 'art/buttons.png', { frameWidth: 16, frameHeight: 16 });
  // Animated strips: money, the flying card, the chest opening, the banner waving.
  for (const [k, w, h] of [['cash-coin', 10, 10], ['cash-goldcoin', 16, 16], ['cash-bill', 24, 24], ['cash-diamond', 8, 9], ['card-fly', 24, 24], ['chest-open', 48, 48], ['flag-wave', 48, 48]]) {
    if (!scene.textures.exists(k)) scene.load.spritesheet(k, `art/${k}.png`, { frameWidth: w, frameHeight: h });
  }
  for (const k of ['smoke', 'poison', 'skull', 'spore', 'vortex']) if (!scene.textures.exists(`fx-${k}`)) scene.load.spritesheet(`fx-${k}`, `art/fx/${k}.png`, { frameWidth: 64, frameHeight: 64 });
  // Sound effects (made by tools/make_sounds.py).
  for (const key of SOUNDS) if (!scene.cache.audio.exists(key)) scene.load.audio(key, `sounds/${key}.wav`);
  if (!scene.textures.exists('dungeon')) scene.load.image('dungeon', 'art/dungeon/tiles.png');
  if (!scene.textures.exists('dungeon-wall')) scene.load.image('dungeon-wall', 'art/dungeon/wall.png');
  if (!scene.textures.exists('dungeon-wood')) scene.load.image('dungeon-wood', 'art/dungeon/wood.png');
  // The night stages: the moon, and the night city's skyline layers (see night.js).
  for (const key of ['moon', 'city1', 'city2', 'city3', 'city4']) if (!scene.textures.exists(`night-${key}`)) scene.load.image(`night-${key}`, `art/night/${key}.png`);
  // The painted stages' art (src/game/scenery.js).
  for (const [theme, art] of Object.entries(SCENERY_ART)) {
    for (const name of art.images) if (!scene.textures.exists(`${theme}-${name}`)) scene.load.image(`${theme}-${name}`, `art/${theme}/${name}.png`);
    for (const [name, [w, h]] of Object.entries(art.sheets ?? {})) if (!scene.textures.exists(`${theme}-${name}`)) scene.load.spritesheet(`${theme}-${name}`, `art/${theme}/${name}.png`, { frameWidth: w, frameHeight: h });
  }
  // Characters: idle (32x32 frames), run (64x64), and a single stun pose.
  for (const c of CHARACTERS) {
    if (scene.textures.exists(`${c}-idle`)) continue;
    scene.load.spritesheet(`${c}-idle`, `art/chars/${c}-idle.png`, { frameWidth: IDLE_W(c), frameHeight: IDLE_H(c) });
    scene.load.spritesheet(`${c}-run`, `art/chars/${c}-run.png`, { frameWidth: 64, frameHeight: 64 });
    scene.load.image(`${c}-stun`, `art/chars/${c}-stun.png`);
    scene.load.image(`${c}-sleep`, `art/chars/${c}-sleep.png`);
    scene.load.image(`${c}-fall`, `art/chars/${c}-fall.png`);
  }
  // The Ring of Cat's cats and the polymorph potion's animals (tools/critter_art.py).
  for (let n = 1; n <= CAT.kinds; n++) {
    for (const a of ['idle', 'walk', 'run', 'sitting', 'laying', 'sleeping', 'meow']) if (!scene.textures.exists(`cat${n}-${a}`)) scene.load.spritesheet(`cat${n}-${a}`, `art/cats/cat${n}-${a}.png`, { frameWidth: 50, frameHeight: 50 });
  }
  for (const a of ANIMALS) if (!scene.textures.exists(`animal-${a}`)) scene.load.spritesheet(`animal-${a}`, `art/animals/${a}.png`, { frameWidth: 16, frameHeight: 16 });
  // Building kits: the index (kit.json) lists the pieces; each loads as "<kit>/<piece>".
  const st = STAGES.warehouse;
  for (const kit of new Set([...st.kitRuns, ...st.facades].map((r) => r.kit).filter(Boolean))) {
    if (scene.cache.json.exists(`kit-${kit}`)) continue;
    scene.load.once(`filecomplete-json-kit-${kit}`, (_key, _type, data) => {
      for (const name of Object.keys(data.pieces)) {
        scene.load.image(`${kit}/${name}`, `art/kits/${kit}/${name}.png`);
        // Optional lit-window overlays: <piece>_lights0.png, _lights1.png...
        for (let v = 0; v < (data.lights ?? 0); v++) scene.load.image(`${kit}/${name}_lights${v}`, `art/kits/${kit}/${name}_lights${v}.png`);
      }
    });
    scene.load.json(`kit-${kit}`, `art/kits/${kit}/kit.json`);
  }
}

export class MatchScene extends Phaser.Scene {
  constructor() {
    super('match');
  }

  // cfg: { mode, roster: [{ name, kind: kbm|pad0..pad3|bot|remote, level, char }], you, stocks, room, onEnd,
  //        rules: { melee, ranged }, stormPace: off|slow|normal|fast }
  // you: -1 for someone only watching (spectating a duel).
  init(cfg) {
    this.cfg = cfg;
    this.menuOpen = false; // the in-game menu is up (the mouse is free, a local match is paused)
    this.acc = 0;
    this.ended = false;
    this.view = null;
    this.net = null; // online: the match, played here too (rollback)
    this.lateShots = new Map(); // online: things that flew in late: key -> { x, y } still to catch up
  }

  preload() {
    loadArt(this);
  }

  create() {
    const { mode, roster, you, stocks, room } = this.cfg;
    const stage = isStageId(this.cfg.stage) ? this.cfg.stage : DEFAULT_STAGE;
    const locals = roster.map((p, i) => (isLocal(p) ? i : -1)).filter((i) => i >= 0);
    makeCharacterAnims(this);
    this.draw = new Renderer(this, roster, you, locals, locals.length === 1 && roster[locals[0]].kind === 'kbm', stage);
    // (?perf: measuring starts with the match; see perf.js.)
    if (PERF) {
      perfStart({
        version: import.meta.env.VITE_APP_VERSION || 'dev',
        date: new Date().toISOString(),
        mode: this.cfg.mode + (this.cfg.training ? ' (training)' : ''),
        stage,
        players: `${roster.length} (${roster.map((p) => p.kind).join(', ')})`,
        ...perfMachine(this.game, this.scale.width / 640),
      });
    }
    // (Watching, or once out: the spectator camera's own keys.)
    this.spectator = new Spectator(this.game.canvas);
    this.draw.spectator = this.spectator;
    this.makeControls();
    this.applySettings();

    if (mode === 'client') {
      // The match runs here too, from how the server made it (see net/rollback.js).
      this.net = new Rollback(this.cfg.init, you, (events) => this.draw.effects(events), PRACTICE_DELAY ?? INPUT_DELAY);
      this.view = toView(this.net.world);
      room.on('match', (msg) => this.net.receive(msg));
      // (Loaded: the server can start once everyone is.)
      room.send({ t: 'ready' });
    } else {
      // (Same screen matches can set the weapons in play and the storm's pace.)
      const storm = STORM_PACE[this.cfg.stormPace] ?? {};
      // (The crown: on last round's winner; what it does is the match's crown rule.)
      const crown = roster.findIndex((p) => p.crowned);
      this.world = createWorld({ players: roster.length, stocks, stage, seed: (Date.now() * 2654435761) >>> 0, training: !!this.cfg.training, rules: this.cfg.rules, storm, crown, crownRule: this.cfg.crownRule ?? 'show' });
      this.bots = roster.map((p, i) => (p.kind === 'bot' ? createBot(p.level, (Date.now() + i * 7919) >>> 0) : null));
      // Each player's presses, held back by the input delay (as online, so play feels the same
      // everywhere: see INPUT_DELAY in net/rollback.js).
      this.delay = PRACTICE_DELAY ?? INPUT_DELAY;
      this.pressed = roster.map(() => []);
      // (Training: the dummies as set in the menu.)
      if (this.cfg.dummies) {
        this.setDummies(this.cfg.dummies);
        this.setDummyHealth(this.cfg.dummies.health);
        this.setTrainingOptions(this.cfg.dummies);
      }
      this.view = toView(this.world);
    }

    // The mouse player gets a crosshair (drawn by the renderer) in place of the pointer.
    if (this.draw.mouseLook) this.input.setDefaultCursor('none');
    this.events.once('shutdown', () => {
      this.input.setDefaultCursor('default');
      this.dropControls();
      this.spectator.destroy();
      if (this.input.mouse?.locked) this.input.mouse.releasePointerLock();
      if (mode === 'client') room.on('match', () => {});
    });
  }

  // Controls for everyone playing on this screen (rebuilt when the bindings change).
  makeControls() {
    const roster = this.cfg.roster;
    const pads = roster.some((p) => p.kind.startsWith('pad'));
    this.controls = roster.map((p) => (isLocal(p) ? new Controls(this, p.kind, { mergePad: p.kind === 'kbm' && !pads }) : null));
  }

  dropControls() {
    for (const c of this.controls ?? []) c?.destroy();
    this.input.keyboard.removeAllKeys(true, true);
    for (const event of ['pointerdown', 'pointerup', 'pointermove', 'wheel']) this.input.removeAllListeners(event);
  }

  // The settings changed (in the menu): volume now, new key and button bindings.
  applySettings() {
    this.sound.volume = settings.volume.master;
    if (this.controls) {
      const cursors = this.controls.map((c) => c?.cursor);
      this.dropControls();
      this.makeControls();
      this.controls.forEach((c, i) => c && cursors[i] && Object.assign(c.cursor, cursors[i]));
    }
  }

  // The in-game menu opened or closed. A local match pauses while it's up; online ones can't.
  setMenu(open) {
    this.menuOpen = open;
    if (!open) for (const c of this.controls) c?.syncPad();
    if (open && this.input.mouse?.locked) this.input.mouse.releasePointerLock();
  }

  get paused() {
    return this.menuOpen && this.cfg.mode === 'local';
  }

  // A player on this screen picked another character: the one on that device (slot: kbm, padN).
  // Training, from the menu: drop a weapon in front of the player.
  trainingSpawn(weapon) {
    if (!this.world?.training) return;
    spawnWeapon(this.world, this.cfg.you ?? 0, weapon);
    this.view = toView(this.world);
  }

  // Training, from the menu: how the dummies behave and what they pick up.
  // Training, from the menu: infinite ammo on or off, hitboxes shown or not.
  setTrainingOptions({ infinite = true, hitboxes = false }) {
    if (!this.world?.training) return;
    this.world.infiniteAmmo = infinite;
    this.draw.showHitboxes = hitboxes;
    this.view = toView(this.world);
  }

  setDummies(cfg) {
    for (const bot of this.bots ?? []) if (bot) configureBot(bot, cfg);
  }

  // Training, from the menu: the dummies' health ({ mode: normal | set | banded | reset, value }).
  setDummyHealth(health) {
    if (!this.world || !health) return;
    this.bots.forEach((bot, i) => {
      if (!bot) return;
      if (health.mode === 'normal') this.world.fighters[i].healthRule = null;
      else setHealthRule(this.world, i, health);
    });
    this.view = toView(this.world);
  }

  setCharacter(char, slot = 'kbm') {
    const own = this.cfg.roster.findIndex((p) => p.kind === slot);
    const i = this.cfg.mode !== 'local' ? this.cfg.you : own >= 0 ? own : this.draw.locals[0];
    if (i < 0) return; // (only watching)
    this.draw.setChar(i, char);
    if (this.cfg.mode === 'client') this.cfg.room.sendChar(char);
  }

  update(time, delta) {
    // A controller's menu button opens (and closes) the in-game menu (the page runs the menu).
    if (this.menuOpen) for (const c of this.controls) c?.pollMenu();
    if (this.controls.some((c) => c?.menuPressed)) {
      // Say who opened it: the menu edits that player's own settings (their device's slot).
      const opener = this.controls.find((c) => c?.menuPressed);
      for (const c of this.controls) if (c) c.menuPressed = false;
      window.dispatchEvent(new CustomEvent('oxasmash-menu', { detail: { player: opener.scheme, pad: `pad${opener.pad}` } }));
    }
    const t0 = PERF ? performance.now() : 0;
    if (this.cfg.mode === 'client') this.updateClient(time, delta);
    else if (!this.paused) this.updateLocal(delta);
    const t1 = PERF ? performance.now() : 0;
    this.draw.render(this.view, delta);
    if (PERF && !this.menuOpen) {
      const d = this.draw;
      const w = this.net?.world ?? this.world;
      perfFrame(delta, t1 - t0, performance.now() - t1, {
        objs: this.children.list.length + (d.world?.list?.length ?? 0) + (d.hud?.list?.length ?? 0),
        parts: d.particles?.length ?? 0,
        puffs: d.puffs?.length ?? 0,
        ghosts: d.ghosts?.length ?? 0,
        clouds: w?.clouds?.length ?? 0,
        bullets: w?.bullets?.length ?? 0,
      });
    }
    // (Online, the end comes from the server: see updateClient.)
    if (this.cfg.mode === 'local' && !this.ended && this.view?.phase === 'over' && this.view.timer <= 0) {
      this.ended = true;
      this.cfg.onEnd(this.view);
    }
  }

  updateLocal(delta) {
    const { roster } = this.cfg;
    // Fixed steps: the rules always advance in 1/60 s ticks, whatever the screen's refresh rate.
    this.acc = Math.min(this.acc + delta / 1000, 0.25);
    while (this.acc >= DT) {
      this.acc -= DT;
      step(this.world, roster.map((p, i) => this.inputFor(i)));
      perfStep();
      if (this.world.events.length) this.draw.effects(this.world.events);
    }
    this.view = toView(this.world);
  }

  inputFor(i) {
    if (this.controls[i]) {
      // (With the menu up, your own players stand still: online matches keep going.)
      const queue = this.pressed[i];
      queue.push(this.menuOpen ? this.controls[i].idle() : this.controls[i].read(this.world.fighters[i]));
      return queue.length > this.delay ? queue.shift() : NEUTRAL;
    }
    return this.bots[i] ? botInput(this.world, i, this.bots[i]) : NEUTRAL;
  }

  updateClient(time, delta) {
    const { you, room } = this.cfg;
    const net = this.net;
    const read = () => (this.menuOpen ? this.controls[you].idle() : this.controls[you].read(this.view?.fighters[you]));
    const final = net.frame(delta / 1000, time, read, (msg) => room.send(msg));
    if (net.chars) net.chars.forEach((char, i) => this.draw.setChar(i, char));
    // What to draw: the match here, with any correction still being eased out.
    const offsets = net.ease(delta / 1000);
    const view = toView(net.world);
    view.fighters = view.fighters.map((f, i) => (offsets[i].x || offsets[i].y ? { ...f, x: f.x + offsets[i].x, y: f.y + offsets[i].y } : f));
    view.pings = net.pings;
    view.waiting = net.newest < 0; // (the server's still waiting for someone's game to load)
    this.catchUpShots(view, delta / 1000);
    this.view = view;
    if (final && !this.ended) {
      this.ended = true;
      this.cfg.onEnd(toView(final));
    }
  }

  // Everything that flew in late (see LATE_SHOT), drawn catching up from where it set off:
  // shots, thrown weapons and guns, grenades, the trident's head, money.
  catchUpShots(view, dt) {
    const seen = new Set();
    const k = Math.exp(-LATE_SHOT.ease * dt);
    // How far back to draw it (px), for the thing with this key, starting at (x0, y0) on `born`.
    const lagOf = (key, x, y, x0, y0, born) => {
      seen.add(key);
      let lag = this.lateShots.get(key);
      if (!lag) {
        // First seen: late? Then it starts back where it set off.
        const late = view.tick - born > LATE_SHOT.after;
        lag = late && Math.hypot(x0 - x, y0 - y) < LATE_SHOT.max ? { x: x0 - x, y: y0 - y } : { x: 0, y: 0 };
        this.lateShots.set(key, lag);
      } else {
        lag.x *= k;
        lag.y *= k;
      }
      return lag;
    };
    const shift = (kind) => (b) => {
      const lag = lagOf(`${kind}${b.id}`, b.x, b.y, b.x0, b.y0, b.born);
      return lag.x || lag.y ? { ...b, x: b.x + lag.x, y: b.y + lag.y } : b;
    };
    view.bullets = view.bullets.map(shift('b'));
    view.grenades = view.grenades.map(shift('g'));
    view.fighters = view.fighters.map((f) => {
      const c = f.chain;
      if (!c) return f;
      const lag = lagOf(`c${f.id}:${c.born}`, c.x, c.y, c.x0, c.y0, c.born);
      return lag.x || lag.y ? { ...f, chain: { ...c, x: c.x + lag.x, y: c.y + lag.y } } : f;
    });
    view.loot = (view.loot ?? []).map((m) => {
      const [id, x, y, look, blink, x0, y0, born] = m;
      const lag = lagOf(`l${id}`, x, y, x0, y0, born);
      return lag.x || lag.y ? [id, x + lag.x, y + lag.y, look, blink, x0, y0, born] : m;
    });
    for (const key of this.lateShots.keys()) if (!seen.has(key)) this.lateShots.delete(key);
  }
}

const isLocal = (p) => p.kind === 'kbm' || /^pad[0-3]$/.test(p.kind);

