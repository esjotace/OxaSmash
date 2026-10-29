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
import { bump, NEUTRAL } from '../sim/input.js';
import { aimOrigin, gunOrigin } from '../sim/world.js';
import { settings, padBindings, ui, keyName, padButtonName, padStyle, firstPad } from './settings.js';
import { hasIcon } from './padicons.js';

const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'shoot', 'melee', 'dodge', 'cycle', 'block', 'reload', 'hide', 'pickup', 'grenade'];
const COUNTERS = { jump: 'jp', shoot: 'sp', melee: 'mp', dodge: 'xp', cycle: 'cp', down: 'dp', reload: 'rp', hide: 'hp', pickup: 'ep', grenade: 'gp' };
const STICK = 0.35; // stick dead zone
const PAD_AIM_DISTANCE = 110; // where the crosshair sits along a controller's aim (px)

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
    this.counts = { jp: 0, sp: 0, mp: 0, dp: 0, rp: 0, hp: 0, ep: 0, gp: 0, xp: 0, cp: 0 };
    this.mouseMelee = false;
    this.mouseGrenade = false;
    this.mouseShoot = false;
    this.padHeld = {}; // controller actions held last tick (for presses)
    this.padAim = null; // the right stick's direction, when pushed
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
      if (counter) for (const key of this.keys[name]) key.on('down', () => (this.counts[counter] = bump(this.counts[counter])));
    }
    if (this.mouse) this.listenToMouse();
    this.syncPad();
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
    const [lx = 0, ly = 0, rx = 0, ry = 0] = gp.axes;
    held.down ||= ly > 0.6;
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
    if (this.pad >= 0 && (!this.mouse || this.usingPad())) {
      return padButtonName(padBindings(`pad${this.pad}`)[action], this.gamepad());
    }
    const key = settings.keys[action]?.[0];
    return key === undefined ? '?' : keyName(key);
  }

  // The same, as a picture: { style, button } while the controller's in use and that button has
  // one (a standard layout only), or null.
  buttonIcon(action) {
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
    if (this.usingPad()) {
      const o = me.hasGun && me.gun ? gunOrigin(me) : aimOrigin(me);
      const len = Math.hypot(me.aimX, me.aimY) || 1;
      return { x: o.x + (me.aimX / len) * PAD_AIM_DISTANCE, y: o.y + (me.aimY / len) * PAD_AIM_DISTANCE, pad: true };
    }
    if (!this.mouse) return null;
    const c = this.pointer();
    return this.scene.cameras.main.getWorldPoint(c.x, c.y);
  }

  // me: this player's fighter as last drawn, used to aim.
  read(me) {
    const pad = this.readPad();
    const ph = pad?.held ?? {};
    const keyMx = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    const mx = keyMx || pad?.mx || 0;
    const down = this.held('down') || !!ph.down;
    let ax = 0;
    let ay = 0;
    if (me && this.padAim && (!this.mouse || this.usingPad())) {
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
      jump: this.held('jump') || !!ph.jump,
      crouch: down,
      shoot: this.held('shoot') || this.mouseShoot || !!ph.shoot,
      block: this.held('block') || !!ph.block,
      meleeHeld: this.held('melee') || this.mouseMelee || !!ph.melee,
      grenadeHeld: this.held('grenade') || this.mouseGrenade || !!ph.grenade,
      ax: ax / len,
      ay: ay / len,
      ...this.counts,
    };
  }
}
