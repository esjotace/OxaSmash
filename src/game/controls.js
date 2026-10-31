// Keyboard, mouse and controllers → the input struct in sim/input.js. Holding down crouches;
// tapping it twice on a thin platform drops through (the sim times the taps). Key and mouse presses
// are counted on events, so a tap shorter than a frame still registers; controller buttons are
// read every tick.
//
// Schemes:
//   kbm      keyboard + mouse (keys from the player's settings), plus the first controller if no
//            one else is using it. The mouse is captured in the game on the first click (pointer
//            lock), and the game draws the cursor (the crosshair) itself.
//   pad0..3  a controller each: left stick moves, right stick aims, buttons from the settings.
// The keyboard + mouse player also gets the on-screen touch controls, on touch screens (touch.js).
import { bump, NEUTRAL } from '../sim/input.js';
import { aimOrigin, gunOrigin } from '../sim/world.js';
import { GUNS } from '../sim/constants.js';
import { settings, padBindings, ui, keyName, padActionName, padStyle, firstPad } from './settings.js';
import { hasIcon } from './padicons.js';
import { touchInput, TOUCH_LABELS } from './touch.js';

const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'shoot', 'melee', 'jab', 'dodge', 'cycle', 'block', 'reload', 'hide', 'pickup', 'grenade'];
const COUNTERS = { jump: 'jp', shoot: 'sp', melee: 'mp', jab: 'kp', dodge: 'xp', cycle: 'cp', down: 'dp', reload: 'rp', hide: 'hp', pickup: 'ep', grenade: 'gp' };
const STICK = 0.35; // stick dead zone
// Melee and shoot pressed together (both triggers, by default) is a grenade: hold to cook and aim,
// let go of either to throw. A trigger pressed alone waits this long (ms) for the other before it
// counts as a shot or a swing.
const GRENADE_CHORD = 50;
const PAD_AIM_DISTANCE = 110; // where the crosshair sits along a controller's aim (px)
const ASSIST_RANGE = 420; // touch aim assist: the nearest enemy within this (px)
// Touch: after a thumb leaves Fire, Heavy or Nade, the aim stays where it was this long (ms), so
// the gun keeps pointing at the target between taps instead of swinging back the way you walk.
const TOUCH_AIM_HOLD = 800;
// Touch, hold to fire: Fire held this long (ms) keeps pulling the trigger of a one-shot-per-press
// gun, at its own rate but no faster than once per TOUCH_REFIRE ms (a quick clicker's pace).
const TOUCH_REFIRE_AFTER = 250;
const TOUCH_REFIRE = 250;

export class Controls {
  // mergePad: the keyboard + mouse player also takes the first controller.
  constructor(scene, scheme, { mergePad = false } = {}) {
    this.scene = scene;
    this.scheme = scheme;
    this.mouse = scheme === 'kbm';
    this.pad = scheme.startsWith('pad') ? Number(scheme.slice(3)) : mergePad ? 0 : -1;
    // The keyboard + mouse player takes the first controller found, in whatever slot it is (their
    // button layout is Controller 1's); a numbered controller slot is that slot only.
    this.merged = !scheme.startsWith('pad') && mergePad;
    this.mouseUsedAt = -Infinity; // when the mouse last moved (ms)
    this.rawDown = null; // the controller's buttons last tick, and where its axes rest (see readPad)
    this.axisBase = null;
    this.padIndex = -1;
    this.counts = { jp: 0, sp: 0, mp: 0, dp: 0, rp: 0, hp: 0, ep: 0, gp: 0, xp: 0, cp: 0, kp: 0 };
    this.mouseMelee = false;
    this.mouseGrenade = false;
    this.mouseShoot = false;
    this.padHeld = {}; // controller actions held last tick (for presses)
    // The triggers, for the grenade: 'free', 'wait' (one down, since chordAt), 'grenade', 'after'
    // (thrown: the triggers do nothing until both are up) or 'alone' (a shot or swing).
    this.chord = 'free';
    this.chordAt = 0;
    this.padAim = null; // the right stick's direction, when pushed
    this.lockId = null; // touch: the fighter the aim assist is locked onto (tap to focus), or null
    this.touchAim = null; // touch: the last aim from Fire, Heavy or Nade, and when it was ([x, y], ms)
    this.touchAimAt = -Infinity;
    this.seenKp = 0; // touch: the jab count last read (a new jab aims as melee does)
    this.fireHeldAt = null; // touch: when Fire went down (hold to fire), and the last pull (ms)
    this.refiredAt = 0;
    this.padUsedAt = -Infinity; // when the controller was last touched (ms)
    this.menuPressed = false; // the controller's menu button (MatchScene opens the menu)
    // The cursor in canvas pixels: the pointer, or (with the mouse captured) moved by the mouse.
    this.cursor = { x: scene.scale.width / 2, y: scene.scale.height / 2 };
    this.keys = {};
    const kb = scene.input.keyboard;
    const map = scheme === 'kbm' ? settings.keys : {};
    for (const name of ACTIONS) {
      this.keys[name] = (map[name] ?? []).map((k) => kb.addKey(k));
      const counter = COUNTERS[name];
      // (Not while the menu's up: Space or Enter on a menu button mustn't jump or shoot on closing.)
      if (counter) for (const key of this.keys[name]) key.on('down', () => !scene.menuOpen && (this.counts[counter] = bump(this.counts[counter])));
    }
    if (this.mouse) this.listenToMouse();
    this.syncPad();
    if (scheme === 'kbm') touchInput.attach(this);
  }

  // A press from the touch controls (counter: see COUNTERS).
  tap(counter) {
    this.counts[counter] = bump(this.counts[counter]);
  }

  // Is this player playing on the touch controls right now (they were touched since the mouse moved)?
  usingTouch() {
    return this.scheme === 'kbm' && touchInput.active() && touchInput.usedAt() > this.mouseUsedAt;
  }

  // Tap to focus: a touch at (clientX, clientY) on a fighter locks the aim assist onto them (on
  // the one already locked: unlocks). Whether it touched a fighter.
  touchAt(clientX, clientY) {
    const b = this.scene.scale.canvasBounds;
    if (!b?.width) return false;
    const k = this.scene.scale.width / b.width;
    const p = this.scene.cameras.main.getWorldPoint((clientX - b.left) * k, (clientY - b.top) * k);
    const me = this.scene.view?.fighters[this.scene.controls.indexOf(this)];
    const hit = (this.scene.view?.fighters ?? []).find((f) => f.state === 'ok' && f.id !== me?.id && Math.abs(f.x - p.x) < 16 && p.y > f.y - 38 && p.y < f.y + 6);
    if (!hit) return false;
    this.lockId = this.lockId === hit.id ? null : hit.id;
    return true;
  }

  // Touch aim assist: toward the fighter locked with a tap (while they're in play), else the
  // nearest enemy in range, else [0, 0] (the way you face).
  assistAim(me) {
    const o = me.hasGun && me.gun ? gunOrigin(me) : aimOrigin(me);
    const locked = this.lockId !== null && this.scene.view?.fighters.find((f) => f.id === this.lockId && f.state === 'ok');
    if (locked) return [locked.x - o.x, locked.y - 15 - o.y];
    if (!settings.touch.assist) return [0, 0];
    let best = null;
    let bestD = ASSIST_RANGE;
    for (const f of this.scene.view?.fighters ?? []) {
      if (f.id === me.id || f.state !== 'ok') continue;
      const d = Math.hypot(f.x - o.x, f.y - 15 - o.y);
      if (d < bestD) [best, bestD] = [f, d];
    }
    return best ? [best.x - o.x, best.y - 15 - o.y] : [0, 0];
  }

  // Touch melee: by the setting, straight at the enemy (aim assist), or by the stick: always facing
  // the enemy (else the way the stick leans, else the way you face), at the stick's own angle above
  // or below level, smoothly (stick up: an uppercut; at rest: straight at them).
  meleeAim(me, t) {
    const at = this.assistAim(me);
    const s = t.tilt;
    if (settings.touch.meleeAim !== 'stick' || !s) return at[0] || at[1] ? at : [me.facing, 0];
    const side = Math.sign(at[0]) || Math.sign(s.x) || me.facing;
    // (A sliver toward that side even straight up or down, so you still face it.)
    return [side * Math.max(Math.abs(s.x), 0.1), s.y];
  }

  // Touch, hold to fire: while Fire's held, pull the trigger again when the gun's ready (guns that
  // fire once per press only, and not the charging ones or an empty one).
  refire(me, th) {
    const now = performance.now();
    if (!th.shoot) {
      this.fireHeldAt = null;
      return;
    }
    this.fireHeldAt ??= now;
    const g = me?.hasGun && me.gun ? GUNS[me.gun] : null;
    if (!settings.touch.holdFire || !g || g.automatic || g.charge || !(me.ammo > 0)) return;
    if (now - this.fireHeldAt < TOUCH_REFIRE_AFTER || now - this.refiredAt < Math.max(TOUCH_REFIRE, g.fireInterval * 1000)) return;
    this.refiredAt = now;
    this.tap('sp');
  }

  // Take the controller's buttons as they are now, without counting any as presses: a button
  // still held from a menu (A to start, B to close) mustn't jump or dodge.
  // The controller this player uses right now, or null.
  gamepad() {
    const gp = this.merged ? firstPad() : this.pad >= 0 ? navigator.getGamepads?.()[this.pad] : null;
    if (!gp) return null;
    // (A different controller than before: start measuring it afresh.)
    if (gp.index !== this.padIndex) Object.assign(this, { padIndex: gp.index, rawDown: null, axisBase: null });
    return gp;
  }

  syncPad() {
    const gp = this.gamepad();
    if (!gp) return;
    this.rawDown = gp.buttons.map((b) => b.pressed);
    this.axisBase = [...gp.axes];
    const held = {};
    for (const [action, button] of Object.entries(padBindings(`pad${this.pad}`))) held[action] = !!gp.buttons[button]?.pressed;
    held.down ||= (gp.axes[1] ?? 0) > 0.6;
    this.padHeld = held;
  }

  listenToMouse() {
    const input = this.scene.input;
    input.mouse?.disableContextMenu();
    input.on('pointerdown', (pointer) => {
      // The first click captures the mouse (it doesn't also shoot).
      if (!input.mouse.locked && !this.scene.menuOpen) {
        input.mouse.requestPointerLock();
        return;
      }
      if (pointer.button === 0) {
        this.counts.sp = bump(this.counts.sp);
        this.mouseShoot = true;
      } else if (pointer.button === 2) {
        this.counts.mp = bump(this.counts.mp);
        this.mouseMelee = true;
      } else if (pointer.button === 1) {
        // Middle click: take out a grenade; hold to cook and aim, let go to throw.
        this.counts.gp = bump(this.counts.gp);
        this.mouseGrenade = true;
      }
    });
    input.on('pointerup', (pointer) => {
      if (pointer.button === 0) this.mouseShoot = false;
      else if (pointer.button === 2) this.mouseMelee = false;
      else if (pointer.button === 1) this.mouseGrenade = false;
    });
    // Captured, the mouse has no position, only movement: move the game's cursor by it, kept
    // inside the game.
    this.onMouseMove = (e) => {
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.mouseUsedAt = performance.now();
      if (!input.mouse.locked) return;
      const { width, height } = this.scene.scale;
      const k = width / (this.scene.scale.canvasBounds.width || width);
      this.cursor.x = Math.max(0, Math.min(width, this.cursor.x + e.movementX * k));
      this.cursor.y = Math.max(0, Math.min(height, this.cursor.y + e.movementY * k));
    };
    document.addEventListener('mousemove', this.onMouseMove);
    // The wheel cycles grenades (either way).
    input.on('wheel', (_pointer, _over, _dx, dy) => {
      if (dy !== 0) this.counts.cp = bump(this.counts.cp);
    });
  }

  // Stop listening (the match is over, or the controls are being rebuilt).
  destroy() {
    if (this.onMouseMove) document.removeEventListener('mousemove', this.onMouseMove);
    touchInput.detach(this);
  }

  // The cursor, in canvas pixels: the pointer itself, or (with the mouse captured) the game's own.
  pointer() {
    const input = this.scene.input;
    if (!input.mouse?.locked) {
      this.cursor.x = input.activePointer.x;
      this.cursor.y = input.activePointer.y;
    }
    return this.cursor;
  }

  held(name) {
    return (this.keys[name] ?? []).some((k) => k.isDown);
  }

  // The controller, read once a tick: sticks, held buttons, and presses (counted on the way down).
  readPad() {
    if (this.pad < 0) return null;
    const gp = this.gamepad();
    if (!gp) return null;
    const pressed = (i) => !!gp.buttons[i]?.pressed;
    const held = {};
    // (Each controller slot has its own button layout.)
    for (const [action, button] of Object.entries(padBindings(`pad${this.pad}`))) held[action] = pressed(button);
    this.grenadeChord(held);
    const [lx = 0, ly = 0, rx = 0, ry = 0] = gp.axes;
    held.down ||= ly > 0.6;
    // (Up, for DI: the stick pushed up, or whatever's bound to hide, the D-pad's up by default.)
    held.up = ly < -0.6 || !!held.hide;
    for (const [action, counter] of Object.entries(COUNTERS)) {
      if (held[action] && !this.padHeld[action]) this.counts[counter] = bump(this.counts[counter]);
    }
    if (held.menu && !this.padHeld.menu) this.menuPressed = true;
    this.padHeld = held;
    const aiming = Math.hypot(rx, ry) > STICK;
    this.padAim = aiming ? [rx, ry] : null;
    const mx = Math.abs(lx) > STICK ? Math.sign(lx) : 0;
    // Only moving the sticks counts as switching to the controller (a resting controller, or one
    // with a stuck button, never takes the crosshair from the mouse).
    // Switching over to the controller: a stick pushed, or any button going down, or any axis
    // (a stick on a non-standard layout, a trigger) moving away from where it rests.
    const down = gp.buttons.map((b) => b.pressed);
    const fresh = this.rawDown === null;
    const pressedNew = !fresh && down.some((d, i) => d && !this.rawDown[i]);
    this.rawDown = down;
    this.axisBase ??= [...gp.axes];
    const moved = gp.axes.some((v, i) => Math.abs(v - (this.axisBase[i] ?? 0)) > 0.5);
    if (aiming || mx || pressedNew || moved) this.padUsedAt = performance.now();
    return { mx, held };
  }

  // While the menu is up only the controller's menu button is watched (no presses pile up).
  pollMenu() {
    const gp = this.pad >= 0 ? this.gamepad() : null;
    if (!gp) return;
    const down = !!gp.buttons[padBindings(`pad${this.pad}`).menu]?.pressed;
    // (While a button is being picked for a binding, it's only being picked.)
    if (down && !this.padHeld.menu && !ui.rebinding) this.menuPressed = true;
    this.padHeld = { ...this.padHeld, menu: down };
  }

  // What this player sends while the menu is up: nothing held, no new presses.
  idle() {
    return { ...NEUTRAL, ...this.counts };
  }

  // What to press for an action, for on-screen prompts: the controller's button while it's in use,
  // otherwise the first key bound to it.
  buttonName(action) {
    if (this.usingTouch()) return TOUCH_LABELS[action] ?? '?';
    if (this.pad >= 0 && (!this.mouse || this.usingPad())) {
      return padActionName(padBindings(`pad${this.pad}`), action, this.gamepad());
    }
    const key = settings.keys[action]?.[0];
    return key === undefined ? '?' : keyName(key);
  }

  // The same, as a picture: { style, button } while the controller's in use and that button has
  // one (a standard layout only), or null.
  buttonIcon(action) {
    if (this.usingTouch()) return null;
    if (!(this.pad >= 0 && (!this.mouse || this.usingPad()))) return null;
    const gp = this.gamepad();
    if (!gp || gp.mapping !== 'standard') return null;
    const button = padBindings(`pad${this.pad}`)[action];
    const style = padStyle(gp);
    return hasIcon(style, button) ? { style, button } : null;
  }

  // Is the controller what this player is using right now (for the crosshair and camera)?
  usingPad() {
    if (this.pad < 0) return false;
    if (!this.mouse) return true;
    // (The mouse takes the crosshair back as soon as it moves.)
    return this.padUsedAt > this.mouseUsedAt && performance.now() - this.padUsedAt < 1500;
  }

  // Where this player aims in the world: the mouse cursor, or along the right stick.
  aimPoint(me) {
    // (Touch: a crosshair only while a thumb is on Fire, Heavy or Nade, along the aim.)
    if (this.usingTouch() && !touchInput.read().aiming) return null;
    if (this.usingPad() || this.usingTouch()) {
      const o = me.hasGun && me.gun ? gunOrigin(me) : aimOrigin(me);
      const len = Math.hypot(me.aimX, me.aimY) || 1;
      return { x: o.x + (me.aimX / len) * PAD_AIM_DISTANCE, y: o.y + (me.aimY / len) * PAD_AIM_DISTANCE, pad: true };
    }
    if (!this.mouse) return null;
    const c = this.pointer();
    return this.scene.cameras.main.getWorldPoint(c.x, c.y);
  }

  // Melee + shoot together → a grenade (see GRENADE_CHORD). Changes held in place.
  grenadeChord(held) {
    const m = held.melee;
    const s = held.shoot;
    const now = performance.now();
    if (this.chord === 'grenade' && !(m && s)) this.chord = 'after';
    if (this.chord === 'after' && !m && !s) this.chord = 'free';
    if (this.chord === 'alone' && !m && !s) this.chord = 'free';
    if (this.chord === 'free' && (m || s)) {
      this.chord = 'wait';
      this.chordAt = now;
    }
    if (this.chord === 'wait') {
      if (m && s) this.chord = 'grenade';
      else if (!m && !s) {
        // (A tap shorter than the wait: still a tap.)
        this.counts[this.lastAlone === 'melee' ? 'mp' : 'sp'] = bump(this.counts[this.lastAlone === 'melee' ? 'mp' : 'sp']);
        this.chord = 'free';
      } else if (now - this.chordAt >= GRENADE_CHORD) this.chord = 'alone';
      else this.lastAlone = m ? 'melee' : 'shoot';
    }
    if (this.chord === 'grenade') held.grenade = true;
    if (this.chord !== 'alone') held.melee = held.shoot = false;
  }

  // me: this player's fighter as last drawn, used to aim.
  read(me) {
    const pad = this.readPad();
    const ph = pad?.held ?? {};
    const t = this.scheme === 'kbm' && touchInput.active() ? touchInput.read() : null;
    const th = t?.held ?? {};
    const keyMx = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    const mx = keyMx || pad?.mx || t?.mx || 0;
    const down = this.held('down') || !!ph.down || !!t?.down;
    let ax = 0;
    let ay = 0;
    if (t) this.refire(me, th);
    // (A controller in use instead hides the touch controls, on 'Auto': see touch.js.)
    if (this.scheme === 'kbm') touchInput.padUsed(this.padUsedAt);
    const jabbed = this.counts.kp !== this.seenKp;
    this.seenKp = this.counts.kp;
    if (me && t?.aiming) {
      // A thumb on an aim button: the way it slid; or (a tap) Heavy as melee aims, the others by
      // aim assist.
      [ax, ay] = t.aim ? [t.aim.x, t.aim.y] : t.aimBy === 'melee' ? this.meleeAim(me, t) : this.assistAim(me);
      this.touchAim = [ax, ay];
      this.touchAimAt = performance.now();
    } else if (me && this.usingTouch()) {
      // (Touch, not aiming: a jab, as melee aims; else, just after aiming, still that aim
      // (TOUCH_AIM_HOLD); else the way you walk, or the way you face; never toward the last touch.)
      // (Melee by the stick: the aim follows the stick all the time, so you see it before you hit.)
      if (jabbed) [ax, ay] = this.meleeAim(me, t);
      else if (this.touchAim && performance.now() - this.touchAimAt < TOUCH_AIM_HOLD) [ax, ay] = this.touchAim;
      else if (settings.touch.meleeAim === 'stick') [ax, ay] = this.meleeAim(me, t);
      else ax = mx || me.facing;
    } else if (me && this.padAim && (!this.mouse || this.usingPad())) {
      [ax, ay] = this.padAim;
    } else if (me && this.mouse && !this.usingPad()) {
      const c = this.pointer();
      const world = this.scene.cameras.main.getWorldPoint(c.x, c.y);
      // Aim from where the shot will come from: the gun's height, or the shoulder.
      const o = me.hasGun && me.gun ? gunOrigin(me) : aimOrigin(me);
      ax = world.x - o.x;
      ay = world.y - o.y;
    } else if (me && !this.padAim && this.pad < 0) {
      ax = me.facing;
      ay = this.held('up') ? -1 : down && !me.grounded ? 1 : 0;
    }
    const len = Math.hypot(ax, ay) || 1;
    return {
      mx,
      down,
      up: this.held('hide') || !!ph.up || !!t?.up,
      jump: this.held('jump') || !!ph.jump || !!th.jump,
      crouch: down,
      shoot: this.held('shoot') || this.mouseShoot || !!ph.shoot || !!th.shoot,
      block: this.held('block') || !!ph.block || !!th.block,
      meleeHeld: this.held('melee') || this.mouseMelee || !!ph.melee || !!th.melee,
      grenadeHeld: this.held('grenade') || this.mouseGrenade || !!ph.grenade || !!th.grenade,
      // (On the touch controls right now, not a controller picked up since: a wider grab.)
      touch: this.usingTouch() && !(this.padUsedAt > touchInput.usedAt()),
      ax: ax / len,
      ay: ay / len,
      ...this.counts,
    };
  }
}
