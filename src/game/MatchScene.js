// One match. Three modes:
//   local  – this browser runs the rules (solo vs bots, or players sharing this screen)
//   host   – same, plus remote players' inputs come in and the state goes out ~30×/s
//   client – sends this player's input, draws the host's state slightly in the past (smooth)
import Phaser from 'phaser';
import { DT, MELEE, GUNS, GRENADES, ITEMS, STORM_PACE } from '../sim/constants.js';
import { createWorld, step, removeFighter, spawnWeapon, setHealthRule } from '../sim/world.js';
import { toView } from '../sim/view.js';
import { NEUTRAL, encodeInput } from '../sim/input.js';
import { createBot, botInput, configureBot } from '../bots/bot.js';
import { Controls } from './controls.js';
import { Renderer, CITY, CHARACTERS, makeCharacterAnims } from './render.js';
import { settings } from './settings.js';
import { SOUNDS } from './audio.js';
import { STAGES, DEFAULT_STAGE, isStageId } from '../sim/stage.js';

const SNAP_EVERY = 2; // ticks between state messages from the host
const INTERP_TICKS = 5; // guests draw this far behind the newest state, to smooth out jitter
const RESEND_MS = 100; // guests resend unchanged input this often anyway

export class MatchScene extends Phaser.Scene {
  constructor() {
    super('match');
  }

  // cfg: { mode, roster: [{ name, kind: kbm|pad0..pad3|bot|remote, level, char }], you, stocks, room, onEnd,
  //        rules: { melee, ranged }, stormPace: off|slow|normal|fast }
  init(cfg) {
    this.cfg = cfg;
    this.menuOpen = false; // the in-game menu is up (the mouse is free, a local match is paused)
    this.acc = 0;
    this.ended = false;
    this.view = null;
    this.snaps = [];
    this.outbox = [];
    this.leavers = [];
    this.lastSent = '';
    this.lastSentAt = 0;
  }

  // Real art, where it exists (public/art/). Anything missing falls back to the greybox shapes.
  preload() {
    for (const key of [...CITY.far, ...CITY.near, ...Object.keys(MELEE), ...Object.keys(GUNS), ...Object.keys(GRENADES), 'sky', 'barrel', 'crate', 'hand', 'crown', 'carrot-rotten', 'chest', ...Object.keys(ITEMS)]) if (!this.textures.exists(key)) this.load.image(key, `art/${key}.png`);
    if (!this.textures.exists('village')) this.load.image('village', 'art/village/tiles.png');
    // Cloud puffs (smoke, poison, spore patches): animation strips of 64×64 frames.
    // Controller button pictures: 16×16 frames (see padicons.js).
    if (!this.textures.exists('buttons')) this.load.spritesheet('buttons', 'art/buttons.png', { frameWidth: 16, frameHeight: 16 });
    // Animated strips: money, the flying card, the chest opening, the banner waving.
    for (const [k, w, h] of [['cash-coin', 10, 10], ['cash-goldcoin', 16, 16], ['cash-bill', 24, 24], ['cash-diamond', 8, 9], ['card-fly', 24, 24], ['chest-open', 48, 48], ['flag-wave', 48, 48]]) {
      if (!this.textures.exists(k)) this.load.spritesheet(k, `art/${k}.png`, { frameWidth: w, frameHeight: h });
    }
    for (const k of ['smoke', 'poison', 'skull', 'spore', 'vortex']) if (!this.textures.exists(`fx-${k}`)) this.load.spritesheet(`fx-${k}`, `art/fx/${k}.png`, { frameWidth: 64, frameHeight: 64 });
    // Sound effects (made by tools/make_sounds.py).
    for (const key of SOUNDS) if (!this.cache.audio.exists(key)) this.load.audio(key, `sounds/${key}.wav`);
    if (!this.textures.exists('dungeon')) this.load.image('dungeon', 'art/dungeon/tiles.png');
    if (!this.textures.exists('dungeon-wall')) this.load.image('dungeon-wall', 'art/dungeon/wall.png');
    // Characters: idle (32x32 frames), run (64x64), and a single stun pose.
    for (const c of CHARACTERS) {
      if (this.textures.exists(`${c}-idle`)) continue;
      this.load.spritesheet(`${c}-idle`, `art/chars/${c}-idle.png`, { frameWidth: 32, frameHeight: 32 });
      this.load.spritesheet(`${c}-run`, `art/chars/${c}-run.png`, { frameWidth: 64, frameHeight: 64 });
      this.load.image(`${c}-stun`, `art/chars/${c}-stun.png`);
    }
    // Building kits: the index (kit.json) lists the pieces; each loads as "<kit>/<piece>".
    const st = STAGES.warehouse;
    for (const kit of new Set([...st.kitRuns, ...st.facades].map((r) => r.kit).filter(Boolean))) {
      if (this.cache.json.exists(`kit-${kit}`)) continue;
      this.load.once(`filecomplete-json-kit-${kit}`, (_key, _type, data) => {
        for (const name of Object.keys(data.pieces)) {
          this.load.image(`${kit}/${name}`, `art/kits/${kit}/${name}.png`);
          // Optional lit-window overlays: <piece>_lights0.png, _lights1.png...
          for (let v = 0; v < (data.lights ?? 0); v++) this.load.image(`${kit}/${name}_lights${v}`, `art/kits/${kit}/${name}_lights${v}.png`);
        }
      });
      this.load.json(`kit-${kit}`, `art/kits/${kit}/kit.json`);
    }
  }

  create() {
    const { mode, roster, you, stocks, room } = this.cfg;
    const stage = isStageId(this.cfg.stage) ? this.cfg.stage : DEFAULT_STAGE;
    const locals = roster.map((p, i) => (isLocal(p) ? i : -1)).filter((i) => i >= 0);
    makeCharacterAnims(this);
    this.draw = new Renderer(this, roster, you, locals, locals.length === 1 && roster[locals[0]].kind === 'kbm', stage);
    this.makeControls();
    this.applySettings();

    if (mode === 'client') {
      room.on('snap', (msg) => this.receiveSnap(msg));
    } else {
      // (Same screen matches can set the weapons in play and the storm's pace.)
      const storm = STORM_PACE[this.cfg.stormPace] ?? {};
      // (The crown: on last round's winner; what it does is the match's crown rule.)
      const crown = roster.findIndex((p) => p.crowned);
      this.world = createWorld({ players: roster.length, stocks, stage, seed: (Date.now() * 2654435761) >>> 0, training: !!this.cfg.training, rules: this.cfg.rules, storm, crown, crownRule: this.cfg.crownRule ?? 'show' });
      this.bots = roster.map((p, i) => (p.kind === 'bot' ? createBot(p.level, (Date.now() + i * 7919) >>> 0) : null));
      // (Training: the dummies as set in the menu.)
      if (this.cfg.dummies) {
        this.setDummies(this.cfg.dummies);
        this.setDummyHealth(this.cfg.dummies.health);
        this.setTrainingOptions(this.cfg.dummies);
      }
      this.remote = roster.map(() => NEUTRAL);
      if (mode === 'host') {
        room.on('input', (i, input) => (this.remote[i] = input));
        room.on('leave', (i) => this.leavers.push(i));
        // A guest picked another character: show it, and pass it on to everyone (in the snaps).
        room.on('char', (i, char) => this.draw.setChar(i, char));
      }
      this.view = toView(this.world);
    }

    // The mouse player gets a crosshair (drawn by the renderer) in place of the pointer.
    if (this.draw.mouseLook) this.input.setDefaultCursor('none');
    this.events.once('shutdown', () => {
      this.input.setDefaultCursor('default');
      this.dropControls();
      if (this.input.mouse?.locked) this.input.mouse.releasePointerLock();
      if (mode === 'client') room.on('snap', () => {});
      if (mode === 'host') room.on('input', () => {}).on('leave', () => {}).on('char', () => {});
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
    if (this.cfg.mode === 'client') this.updateClient(time);
    else if (!this.paused) this.updateLocal(delta);
    this.draw.render(this.view, delta);
    if (!this.ended && this.view?.phase === 'over' && this.view.timer <= 0) {
      this.ended = true;
      this.cfg.onEnd(this.view);
    }
  }

  updateLocal(delta) {
    const { mode, roster, room } = this.cfg;
    // Fixed steps: the rules always advance in 1/60 s ticks, whatever the screen's refresh rate.
    this.acc = Math.min(this.acc + delta / 1000, 0.25);
    while (this.acc >= DT) {
      this.acc -= DT;
      for (const i of this.leavers.splice(0)) removeFighter(this.world, i);
      step(this.world, roster.map((p, i) => this.inputFor(i)));
      if (this.world.events.length) {
        this.draw.effects(this.world.events);
        if (mode === 'host') this.outbox.push(...this.world.events);
      }
      if (mode === 'host' && this.world.tick % SNAP_EVERY === 0) {
        room.broadcast({ t: 'snap', v: { ...toView(this.world), pings: room.pings() }, e: this.outbox, c: this.draw.chars });
        this.outbox = [];
      }
    }
    this.view = toView(this.world);
    if (mode === 'host') this.view.pings = room.pings();
  }

  inputFor(i) {
    // (With the menu up, your own players stand still: online matches keep going.)
    if (this.controls[i]) return this.menuOpen ? this.controls[i].idle() : this.controls[i].read(this.world.fighters[i]);
    if (this.bots[i]) return botInput(this.world, i, this.bots[i]);
    return this.remote[i];
  }

  receiveSnap(msg) {
    const v = msg?.v;
    if (!v || !Array.isArray(v.fighters) || !Array.isArray(v.bullets) || !Array.isArray(v.barrels) || !v.storm || typeof v.tick !== 'number') return;
    const newest = this.snaps[this.snaps.length - 1];
    if (newest && v.tick <= newest.v.tick) return;
    this.snaps.push({ at: performance.now(), v });
    if (this.snaps.length > 30) this.snaps.shift();
    if (Array.isArray(msg.e)) this.draw.effects(msg.e.slice(0, 64));
    // Characters picked mid-match (the renderer ignores anything that isn't one).
    if (Array.isArray(msg.c)) msg.c.slice(0, 4).forEach((char, i) => this.draw.setChar(i, char));
  }

  updateClient(time) {
    const { you, room } = this.cfg;
    const input = this.menuOpen ? this.controls[you].idle() : this.controls[you].read(this.view?.fighters[you]);
    const packed = JSON.stringify(encodeInput(input));
    if (packed !== this.lastSent || time - this.lastSentAt > RESEND_MS) {
      room.sendInput(input);
      this.lastSent = packed;
      this.lastSentAt = time;
    }
    const newest = this.snaps[this.snaps.length - 1];
    if (!newest) return;
    const sinceNewest = (performance.now() - newest.at) / 1000 / DT;
    const renderTick = Math.min(newest.v.tick, newest.v.tick - INTERP_TICKS + sinceNewest);
    this.view = interpolate(this.snaps, renderTick);
  }
}

const isLocal = (p) => p.kind === 'kbm' || /^pad[0-3]$/.test(p.kind);

function interpolate(snaps, tick) {
  let a = snaps[0];
  let b = null;
  for (const s of snaps) {
    if (s.v.tick <= tick) a = s;
    else {
      b = s;
      break;
    }
  }
  if (!b) return a.v;
  const k = Math.max(0, Math.min(1, (tick - a.v.tick) / (b.v.tick - a.v.tick)));
  const lerp = (p, q) => p + (q - p) * k;
  return {
    ...b.v,
    fighters: b.v.fighters.map((f, i) => {
      const prev = a.v.fighters[i];
      if (!prev || prev.state !== 'ok' || f.state !== 'ok') return f;
      return { ...f, x: lerp(prev.x, f.x), y: lerp(prev.y, f.y) };
    }),
    movers: (b.v.movers ?? []).map((m, i) => {
      const prev = a.v.movers?.[i];
      return prev ? [lerp(prev[0], m[0]), m[1], m[2]] : m;
    }),
    bullets: b.v.bullets.map((p) => {
      const prev = a.v.bullets.find((q) => q.id === p.id);
      return prev ? { ...p, x: lerp(prev.x, p.x), y: lerp(prev.y, p.y) } : p;
    }),
  };
}
