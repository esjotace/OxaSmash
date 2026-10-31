// On-screen controls for phones and tablets, played sideways: a stick under one thumb and buttons
// under the other (stick on the left by default; swapped in the settings). The stick floats: it
// starts wherever the thumb lands on its half of the screen. Fire, Heavy and Nade aim by dragging:
// put a thumb on the button and slide it the way to aim; a tap without sliding aims at the nearest
// enemy (aim assist, a setting) or the way you face. The stick pushed down crouches (twice quickly:
// drop through a platform), pushed up hides in a doorway (and steers a launch, like a controller).
// It feeds the keyboard + mouse player's Controls (see controls.js) the way a controller does:
// buttons held, presses counted, a direction to aim. No Phaser here: it's plain DOM over the game.
// The buttons can be moved and resized (edit(): drag to place); the layout is kept in the settings.
import { settings, saveSettings } from './settings.js';

// A touch screen without a mouse: the controls show by themselves ('auto'), as they do once the
// screen has been touched at all (a tablet that also has a mouse).
export const TOUCH_SCREEN = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
let touchSeen = TOUCH_SCREEN;

const STICK_RADIUS = 52; // px the thumb travels for a full push
const AIM_DRAG = 12; // px a thumb slides on an aim button before it aims (less: a tap)
const DEAD = 0.35; // the stick's dead zone (a controller's)
const PUSHED = 0.6; // the stick pushed down or up this far crouches or hides
const TILT = 0.2; // the stick tilted this far aims melee (see meleeAim in controls.js)
const STEEP = 0.5; // crouch and hide: the stick within 30° of straight down or up (sin 30°)

// The buttons: where their centres are, in units from their side's bottom corner ([across, up]);
// how big (diameter, in units); what they hold and what they press (see sim/input.js). A unit is
// about a thumb's width (see layout()). Fire is the big one under the resting thumb, with the rest
// in an arc around it and Grab by its right shoulder; the next grenade sits above the stick
// (stick: on the stick's side).
// (No Reload: it reloads by itself.)
const BUTTONS = [
  { id: 'shoot', label: 'Fire', at: [1.85, 1.75], d: 1.8, hold: 'shoot', press: 'sp', aim: true },
  { id: 'jump', label: 'Jump', at: [3.66, 0.9], d: 1.25, hold: 'jump', press: 'jp' },
  { id: 'dodge', label: 'Dash', at: [3.78, 2.27], d: 1.05, press: 'xp' },
  { id: 'melee', label: 'Heavy', at: [3.14, 3.28], d: 1.15, hold: 'melee', press: 'mp', aim: true },
  { id: 'jab', label: 'Jab', at: [2.02, 3.74], d: 0.95, press: 'kp' },
  { id: 'block', label: 'Block', at: [4.62, 3.35], d: 1, hold: 'block' },
  { id: 'grenade', label: 'Nade', at: [3.45, 4.52], d: 1, hold: 'grenade', press: 'gp', aim: true },
  { id: 'pickup', label: 'Grab', at: [0.6, 3], d: 0.9, press: 'ep' },
  { id: 'cycle', label: '⇄', at: [2.85, 4.5], d: 0.8, press: 'cp', stick: true },
];
// Which way a button's "across" runs: from the right edge (false), or the left (true). The buttons
// side is the right, the stick's the left, unless they're swapped.
const fromLeft = (b) => settings.touch.swap !== !!b.stick;
// What each action's button says, for on-screen prompts ("Grab to pick up").
export const TOUCH_LABELS = Object.fromEntries(BUTTONS.map((b) => [b.id, b.label]));

// A button's place and size: as the player placed it ([across, up, diameter], in units), or the default.
const spot = (b) => settings.touch.layout[b.id] ?? [...b.at, b.d];
// One thumb-width unit, in px: smaller on short screens, so the arc fits under the Menu button.
const unit = () => Math.min(56, window.innerHeight * 0.145) * settings.touch.size;
const SIZES = [0.5, 2.5]; // the smallest and biggest a button can be made (units)

let root = null; // the overlay, made the first time a player needs it
const els = {}; // its buttons by id, and the stick's base and knob
let owner = null; // the Controls it feeds
let usedAt = -Infinity; // when it was last touched (ms)
// The thumbs on it, by pointer id: { kind: 'stick', from } or { kind: 'button', b, from, aim }.
const thumbs = new Map();
let aimThumb = null; // the latest thumb on an aim button (it sets the aim while it's down)
// Placing the buttons (see edit()): { done, picked (a button's id), drag ({ id, dx, dy }) }, or null.
let editing = null;
// A controller was used since the screen was last touched ('Auto' only): the buttons step aside
// until the next touch. (Only game controllers count: the browser lists nothing else, so a
// Bluetooth speaker or headphones never do this.)
let padTook = false;
const stick = { x: 0, y: 0, down: false, up: false };

const shown = () => settings.touch.show === 'on' || (settings.touch.show === 'auto' && touchSeen);
const tap = (counter) => owner?.tap(counter);

function build() {
  if (root) return;
  root = document.createElement('div');
  root.id = 'touch';
  root.hidden = true;
  els.base = Object.assign(document.createElement('div'), { className: 't-stick' });
  els.knob = Object.assign(document.createElement('div'), { className: 't-knob' });
  els.base.append(els.knob);
  root.append(els.base);
  for (const b of BUTTONS) {
    const el = document.createElement('div');
    el.className = `t-btn${b.aim ? ' aim' : ''}`;
    el.dataset.id = b.id;
    el.textContent = b.label;
    els[b.id] = el;
    root.append(el);
  }
  // The layout editor's bar: what to do, and the picked button's size.
  els.bar = document.createElement('div');
  els.bar.className = 't-edit';
  els.bar.innerHTML = '<span>Drag the buttons to place them. Tap one to resize it.</span><button class="btn small" data-do="smaller">Smaller</button><button class="btn small" data-do="bigger">Bigger</button><button class="btn small ghost" data-do="reset">Reset all</button><button class="btn small primary" data-do="done">Done</button>';
  els.bar.onclick = (e) => editAction(e.target.closest('button')?.dataset.do);
  root.append(els.bar);
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  // (No long-press menu, no text selection, no scrolling or zooming from the controls.)
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  document.body.append(root);
  window.addEventListener('resize', layout);
  layout();
}

// Sizes and places everything from the settings and the screen: a unit is a thumb's width, smaller
// on short screens so the arc of buttons fits under the Menu button.
function layout() {
  if (!root) return;
  const t = settings.touch;
  const u = unit();
  root.style.setProperty('--touch-opacity', String(t.opacity));
  root.classList.toggle('swap', t.swap);
  const place = (el, left, across, upward, size) => {
    const side = `calc(${across - size / 2}px + env(safe-area-inset-${left ? 'left' : 'right'}, 0px))`;
    Object.assign(el.style, { width: `${size}px`, height: `${size}px`, bottom: `${upward - size / 2}px`, left: left ? side : '', right: left ? '' : side });
  };
  for (const b of BUTTONS) {
    const [across, upward, d] = spot(b);
    place(els[b.id], fromLeft(b), across * u, upward * u, d * u);
    els[b.id].style.fontSize = `${Math.max(11, d * u * 0.24)}px`;
    els[b.id].classList.toggle('picked', editing?.picked === b.id);
  }
  els.base.style.width = els.base.style.height = `${STICK_RADIUS * 2}px`;
  if (![...thumbs.values()].some((th) => th.kind === 'stick')) restStick();
}

// The stick's resting place (a hint of where it is): its side's bottom corner.
function restStick() {
  const across = 2.2 * unit();
  const x = settings.touch.swap ? window.innerWidth - across : across;
  setStick(x, window.innerHeight - across, 0, 0);
  els.base.classList.remove('on');
}

function setStick(x, y, kx, ky) {
  Object.assign(els.base.style, { left: `${x - STICK_RADIUS}px`, top: `${y - STICK_RADIUS}px` });
  els.knob.style.transform = `translate(${kx * STICK_RADIUS}px, ${ky * STICK_RADIUS}px)`;
}

function fullscreen() {
  if (!settings.touch.fullscreen || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  // (Phones that allow it also turn the game sideways; others, like the iPhone, just ignore this.)
  document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('landscape')?.catch(() => {}))
    .catch(() => {});
}

function down(e) {
  if (e.target.closest('.t-edit')) return; // (the editor's bar: its own buttons)
  e.preventDefault();
  if (editing) return editDown(e);
  usedAt = performance.now();
  fullscreen();
  root.setPointerCapture(e.pointerId);
  const el = e.target.closest('.t-btn');
  if (el) {
    const b = BUTTONS.find((x) => x.id === el.dataset.id);
    thumbs.set(e.pointerId, { kind: 'button', b, el, from: [e.clientX, e.clientY], aim: null });
    el.classList.add('on');
    if (b.press) tap(b.press);
    if (b.aim) aimThumb = e.pointerId;
    return;
  }
  // Tap to focus (a setting): a touch on a fighter locks the aim assist onto them (again: off).
  if (settings.touch.focus && owner?.touchAt(e.clientX, e.clientY)) return;
  // The stick's half of the screen: the stick starts under the thumb.
  const stickSide = settings.touch.swap ? e.clientX > window.innerWidth / 2 : e.clientX < window.innerWidth / 2;
  if (!stickSide || [...thumbs.values()].some((th) => th.kind === 'stick')) return;
  thumbs.set(e.pointerId, { kind: 'stick', from: [e.clientX, e.clientY] });
  els.base.classList.add('on');
  setStick(e.clientX, e.clientY, 0, 0);
}

function move(e) {
  if (editing) return editMove(e);
  const th = thumbs.get(e.pointerId);
  if (!th) return;
  usedAt = performance.now();
  const dx = e.clientX - th.from[0];
  const dy = e.clientY - th.from[1];
  const len = Math.hypot(dx, dy);
  if (th.kind === 'button') {
    if (th.b.aim && len > AIM_DRAG) th.aim = { x: dx / len, y: dy / len };
    return;
  }
  const k = Math.min(1, len / STICK_RADIUS) / (len || 1);
  stick.x = dx * k;
  stick.y = dy * k;
  setStick(th.from[0], th.from[1], stick.x, stick.y);
  // Pushed down or up: a press as it gets there (crouch, or drop through twice; hide in a doorway).
  // (Only near straight down or up, within STEEP of it: a diagonal walks and aims instead.)
  const steep = Math.abs(stick.x) < STEEP * Math.hypot(stick.x, stick.y);
  const isDown = stick.y > PUSHED && steep;
  const isUp = stick.y < -PUSHED && steep;
  if (isDown && !stick.down) tap('dp');
  if (isUp && !stick.up) tap('hp');
  stick.down = isDown;
  stick.up = isUp;
}

function up(e) {
  if (editing) {
    editing.drag = null;
    return;
  }
  const th = thumbs.get(e.pointerId);
  if (!th) return;
  thumbs.delete(e.pointerId);
  if (th.kind === 'button') {
    th.el.classList.remove('on');
    if (aimThumb === e.pointerId) aimThumb = null;
    return;
  }
  Object.assign(stick, { x: 0, y: 0, down: false, up: false });
  restStick();
}

function release() {
  thumbs.clear();
  aimThumb = null;
  Object.assign(stick, { x: 0, y: 0, down: false, up: false });
  if (root) {
    for (const b of BUTTONS) els[b.id].classList.remove('on');
    restStick();
  }
}

function refresh() {
  const on = !!editing || (!!owner && shown() && !padTook);
  if (on) build();
  if (root) {
    root.hidden = !on;
    root.classList.toggle('editing', !!editing);
  }
  if (!on || editing) release();
}

// ---- Placing the buttons ------------------------------------------------------------------
// Drag a button to move it; tap one to pick it, then Smaller or Bigger. Places are kept in units
// from their side's bottom corner, so they fit any screen (and mirror when the sides swap).

function editDown(e) {
  const el = e.target.closest('.t-btn');
  if (!el) return;
  root.setPointerCapture(e.pointerId);
  const r = el.getBoundingClientRect();
  editing.picked = el.dataset.id;
  editing.drag = { id: el.dataset.id, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2) };
  layout();
}

function editMove(e) {
  const drag = editing.drag;
  if (!drag) return;
  const b = BUTTONS.find((x) => x.id === drag.id);
  const u = unit();
  const d = spot(b)[2];
  const half = (d * u) / 2;
  // (Kept fully on screen.)
  const x = Math.max(half, Math.min(window.innerWidth - half, e.clientX - drag.dx));
  const y = Math.max(half, Math.min(window.innerHeight - half, e.clientY - drag.dy));
  const across = fromLeft(b) ? x : window.innerWidth - x;
  settings.touch.layout[b.id] = [round(across / u), round((window.innerHeight - y) / u), d];
  layout();
}

const round = (v) => Math.round(v * 100) / 100;

function editAction(what) {
  if (!editing || !what) return;
  if (what === 'done') {
    saveSettings();
    const done = editing.done;
    editing = null;
    refresh();
    layout();
    done?.();
    return;
  }
  if (what === 'reset') {
    settings.touch.layout = {};
    editing.picked = null;
  } else if (editing.picked) {
    const b = BUTTONS.find((x) => x.id === editing.picked);
    const [across, upward, d] = spot(b);
    const size = Math.max(SIZES[0], Math.min(SIZES[1], d * (what === 'bigger' ? 1.12 : 1 / 1.12)));
    settings.touch.layout[b.id] = [across, upward, round(size)];
  }
  layout();
}

// (A touch anywhere makes this a touch screen, for 'auto'.)
// (A touch anywhere also takes back from a controller: see padUsed.)
window.addEventListener(
  'touchstart',
  () => {
    usedAt = performance.now();
    if (touchSeen && !padTook) return;
    touchSeen = true;
    padTook = false;
    refresh();
  },
  { capture: true, passive: true },
);

export const touchInput = {
  // The player these controls play for (the keyboard + mouse player), while a match is on.
  attach(controls) {
    owner = controls;
    refresh();
  },
  detach(controls) {
    if (owner !== controls) return;
    owner = null;
    refresh();
  },
  // Place the buttons (drag to move, tap and resize): over everything, the menus included, until
  // Done (then done() is called).
  edit(done) {
    editing = { done, picked: null, drag: null };
    refresh();
    layout();
  },
  // The settings changed: show, hide or re-lay them out.
  apply() {
    layout();
    refresh();
  },
  // Whether they're on screen, and when they were last touched (ms).
  active: () => !!owner && shown(),
  usedAt: () => usedAt,
  // Let go of everything (a menu opened, the match ended): nothing stays held.
  release,
  // The player's controller was last used at `at` (ms): used since the last touch, the buttons hide.
  padUsed(at) {
    const took = settings.touch.show === 'auto' && at > usedAt;
    if (took === padTook) return;
    padTook = took;
    refresh();
  },
  // This tick: the stick (mx, down, up, and its direction when pushed past the dead zone, or
  // null; tilt: the same from a light tilt, for aiming melee), the buttons held, and the aim: aiming (a thumb on Fire, Heavy or Nade: which, aimBy)
  // and its direction (null: a tap, not slid yet).
  read() {
    const held = {};
    for (const th of thumbs.values()) if (th.kind === 'button' && th.b.hold) held[th.b.hold] = true;
    const aiming = aimThumb !== null && thumbs.has(aimThumb);
    const pushed = Math.hypot(stick.x, stick.y) > DEAD ? { x: stick.x, y: stick.y } : null;
    const tilt = Math.hypot(stick.x, stick.y) > TILT ? { x: stick.x, y: stick.y } : null;
    return { mx: Math.abs(stick.x) > DEAD ? Math.sign(stick.x) : 0, down: stick.down, up: stick.up, stick: pushed, tilt, held, aiming, aimBy: aiming ? thumbs.get(aimThumb).b.id : null, aim: aiming ? thumbs.get(aimThumb).aim : null };
  },
};
