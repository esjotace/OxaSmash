// Sound effects (public/sounds, made by tools/make_sounds.py). Two kinds:
//  - World sounds happen somewhere on the stage: louder the closer they are to the middle of your
//    screen, panned left or right toward where they happened, silent far away.
//  - Your own sounds (your reloads, the countdown, storm warnings, the KO and game calls) play at
//    full volume, the same wherever you are.
// Volumes from the settings: master (the whole game), effects (world sounds), announcer (yours).
import { GUNS, MELEE, STRIKE } from '../sim/constants.js';
import { settings } from './settings.js';

export const SOUNDS = [
  'swing-light', 'swing-heavy', 'hit-blunt', 'hit-cut', 'hit-stab',
  'shot-small', 'shot-big', 'shot-sniper', 'impact-wall', 'impact-body', 'explosion',
  'clang', 'hiss', 'warp', 'throw', 'pickup', 'reload',
  'hit-bonk', 'hit-slap', 'hit-clonk', 'ting', 'chomp', 'critical',
  'bow', 'zap', 'flame', 'coin', 'hit-crit-high',
  'ui-beep', 'ui-go', 'ui-storm', 'ko', 'ui-game',
];

const MASTER = 0.55;
// World sounds: full volume within NEAR px of the middle of the screen, silent past FAR.
const NEAR = 160;
const FAR = 760;
// The same sound at most this many times per 50 ms (seven shotgun pellets landing at once).
const BURST = 3;

// Which shot sound each gun makes.
const SHOT_SOUNDS = { sniper: 'shot-sniper', golden: 'shot-sniper', bow: 'bow', cards: 'swing-light', railgun: 'zap', firestaff: 'flame', money: 'coin', slimer: 'throw', spores: 'hiss' };
const shotSound = (gun) => SHOT_SOUNDS[gun] ?? (GUNS[gun]?.weight === 'light' ? 'shot-small' : 'shot-big');

export class Sfx {
  constructor(scene, locals) {
    this.scene = scene;
    this.locals = locals;
    this.recent = new Map(); // sound -> times it played lately
  }

  ok(key) {
    if (!this.scene.cache.audio.exists(key)) return false;
    const now = this.scene.time.now;
    const times = (this.recent.get(key) ?? []).filter((at) => now - at < 50);
    if (times.length >= BURST) return false;
    times.push(now);
    this.recent.set(key, times);
    return true;
  }

  // A sound for you alone (or everyone on this screen): full volume, centred.
  ui(key, volume = 1) {
    if (!this.ok(key)) return;
    this.scene.sound.play(key, { volume: volume * MASTER * settings.volume.announcer });
  }

  // A sound at a spot on the stage, heard from the middle of the screen.
  at(key, x, y, volume = 1) {
    const cam = this.scene.cameras.main;
    const dx = x - cam.midPoint.x;
    const d = Math.hypot(dx, (y - cam.midPoint.y) * 1.3);
    const fall = 1 - Math.min(1, Math.max(0, (d - NEAR) / (FAR - NEAR)));
    if (fall <= 0.02 || !this.ok(key)) return;
    this.scene.sound.play(key, {
      volume: volume * fall * fall * MASTER * settings.volume.effects,
      pan: Math.max(-0.8, Math.min(0.8, dx / 400)),
      detune: (Math.random() * 2 - 1) * 80, // a little variety, so repeats don't sound canned
    });
  }

  // What each game event sounds like.
  event(e) {
    const mine = this.locals.includes(e.id);
    switch (e.type) {
      case 'shoot':
        return this.at(shotSound(e.gun), e.x, e.y, e.gun === 'rocket' ? 0.8 : e.gun === 'spores' || e.gun === 'firestaff' ? 0.35 : e.gun === 'money' ? 0.5 : 1);
      case 'swing': {
        const m = e.weapon ? MELEE[e.weapon] : STRIKE;
        // (A jab is a light whoosh, whatever the weapon.)
        return this.at(m.weight === 'heavy' && !e.jab ? 'swing-heavy' : 'swing-light', e.x, e.y - 20, e.weapon && !e.jab ? 0.7 : 0.45);
      }
      case 'dash':
        return this.at('swing-heavy', e.x, e.y - 20, 0.9);
      case 'dodge':
        return this.at('throw', e.x, e.y - 16, 0.7);
      case 'strike':
        return this.at(`hit-${e.sound}`, e.x, e.y);
      case 'impact':
        if (e.kind === 'anvil') return this.at('hit-clonk', e.x, e.y);
        if (e.thrown) return this.at(e.on === 'body' ? 'hit-blunt' : 'impact-wall', e.x, e.y, 0.8);
        return this.at(e.on === 'body' ? 'impact-body' : 'impact-wall', e.x, e.y, e.on === 'body' ? 0.8 : 0.35);
      case 'coverbreak':
        return this.at('hit-clonk', e.x, e.y, 1);
      case 'toobig':
        return mine ? this.ui('ui-beep', 0.3) : undefined;
      case 'explosion':
      case 'fireball':
        return this.at('explosion', e.x, e.y);
      case 'block':
      case 'parry':
      case 'evade':
      case 'hooked':
        return this.at('clang', e.x, e.y, e.type === 'parry' || e.type === 'evade' ? 1 : 0.7);
      case 'switch':
        return mine ? this.ui('reload', 0.25) : undefined;
      case 'cloud':
        return this.at('hiss', e.x, e.y, 0.7);
      case 'warp':
        return this.at('warp', e.x, e.y, 0.7);
      case 'critical':
      case 'launch':
        // A full-power bat hit, the keyboard's big phrase landing: the home-run crack.
        return this.at('critical', e.x, e.y);
      case 'radiation':
        return this.at('warp', e.x, e.y, 0.8);
      case 'break':
        return this.at('clang', e.x, e.y, 1);
      case 'plant':
        return this.at('clang', e.x, e.y, 1);
      case 'fizzle':
        return this.at('hiss', e.x, e.y, 0.3);
      case 'dry':
      case 'jam':
        return mine ? this.ui('ui-beep', 0.3) : undefined;
      case 'heal':
      case 'item':
        return this.at('pickup', e.x, e.y, 0.8);
      case 'wish':
        return this.at('warp', e.x, e.y, 1);
      case 'chest':
        this.at('coin', e.x, e.y);
        return this.at('clang', e.x, e.y, 0.8);
      case 'banner':
      case 'crown':
        return this.ui('ui-game', 0.7);
      case 'moneyblast':
        this.at('coin', e.x, e.y);
        return this.at('explosion', e.x, e.y);
      case 'stylereload':
        return mine ? this.ui('reload', 0.8) : this.at('reload', e.x, e.y, 0.5);
      case 'catch':
        return this.at('pickup', e.x, e.y, 0.8);
      case 'ammo':
        this.at('reload', e.x, e.y);
        return this.at('clang', e.x, e.y, 0.5);
      case 'hole':
        return this.at('warp', e.x, e.y, 1);
      case 'jackpot':
        this.at('coin', e.x, e.y);
        return this.at('explosion', e.x, e.y, 0.5);
      case 'cash':
        return this.at('coin', e.x, e.y, 0.7);
      case 'splat':
        return this.at('hit-slap', e.x, e.y, 0.6);
      case 'stick':
        return this.at('impact-wall', e.x, e.y, 0.5);
      case 'ting':
        return this.at('ting', e.x, e.y, 0.8);
      case 'bite':
        return this.at('chomp', e.x, e.y, 0.8);
      case 'yoink':
        return this.at('pickup', e.x, e.y, 0.8);
      case 'throw':
        return this.at('throw', e.x, e.y, 0.8);
      case 'pickup':
        return mine ? this.ui('pickup', 0.8) : this.at('pickup', e.x, e.y, 0.5);
      case 'reload':
        // Your own reload, in your ear; other people's only if they're near.
        return mine ? this.ui('reload', 0.6) : this.at('reload', e.x, e.y, 0.4);
      case 'ko':
        return this.ui('ko', 0.9);
      case 'go':
        return this.ui('ui-go', 0.8);
      case 'game':
        return this.ui('ui-game', 0.8);
    }
  }
}
