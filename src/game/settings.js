// Player settings, kept in the browser between visits: sound volumes and key bindings, plus
// personal settings per device (keyboard + mouse, and each controller slot): the character that
// player likes (null: dealt at random) and, for controllers, their button layout. Whoever plays on
// Controller 2 keeps their setup on Controller 2. No Phaser here, so the menus can use it before
// the game has loaded.
const STORE = 'oxasmash-settings';

// Keyboard actions you can rebind (keyboard + mouse player), with their labels and defaults (key
// codes). Shoot and melee are also always on the left and right mouse buttons.
export const KEY_ACTIONS = [
  ['left', 'Move left'],
  ['right', 'Move right'],
  ['down', 'Crouch / drop down'],
  ['jump', 'Jump'],
  ['dodge', 'Dodge'],
  ['block', 'Block'],
  ['reload', 'Reload'],
  ['hide', 'Hide in a doorway'],
  ['pickup', 'Pick up'],
  ['grenade', 'Grenade (also middle click)'],
  ['cycle', 'Next grenade (also the wheel)'],
  ['shoot', 'Shoot (also left click)'],
  ['melee', 'Heavy melee (also right click; hold: special)'],
  ['jab', 'Jab'],
];
export const DEFAULT_KEYS = {
  left: [65, 37],
  right: [68, 39],
  down: [83, 40],
  jump: [32],
  dodge: [70],
  block: [81, 16],
  reload: [82],
  hide: [87, 38],
  pickup: [69],
  grenade: [71],
  cycle: [90],
  shoot: [],
  melee: [],
  jab: [67],
};

// Controller actions (standard button numbering), with labels and defaults. Moving is the left
// stick, aiming the right stick.
export const PAD_ACTIONS = [
  ['jump', 'Jump'],
  ['shoot', 'Shoot'],
  ['melee', 'Heavy melee (hold: special)'],
  ['jab', 'Jab'],
  ['dodge', 'Dodge'],
  ['block', 'Block'],
  ['grenade', 'Grenade'],
  ['reload', 'Reload'],
  ['pickup', 'Pick up'],
  ['hide', 'Hide in a doorway'],
  ['down', 'Crouch / drop down'],
  ['cycle', 'Next grenade'],
  ['menu', 'Menu'],
];
// (Pick up on the top face button, block on R, L jabs. The grenade has no button of its own:
// both triggers at once, melee + shoot (see GRENADE_CHORD in controls.js); -1 is "no button".)
export const DEFAULT_PAD = { jump: 0, dodge: 1, reload: 2, pickup: 3, jab: 4, block: 5, melee: 6, shoot: 7, menu: 9, hide: 12, down: 13, cycle: 15, grenade: -1 };
// The layouts the game used to start with: a saved layout still exactly like one of them moves to
// the new one.
const OLD_DEFAULT_PADS = [
  { jump: 0, dodge: 1, reload: 2, pickup: 3, block: 4, grenade: 5, melee: 6, shoot: 7, menu: 9, hide: 12, down: 13, cycle: 15 },
  { jump: 0, dodge: 1, reload: 2, block: 3, jab: 4, grenade: 5, melee: 6, shoot: 7, menu: 9, hide: 12, pickup: 13, down: 14, cycle: 15 },
];
// What kind of controller this is, for button names and pictures: 'switch', 'ps' or 'xbox' (also
// the default). Read from its id: the vendor (057e Nintendo, 054c Sony) or its name.
export function padStyle(gp) {
  const id = (gp?.id ?? '').toLowerCase();
  if (/057e|pro controller|joy-con|nintendo|switch/.test(id)) return 'switch';
  if (/054c|dualshock|dualsense|wireless controller|playstation|ps4|ps5/.test(id)) return 'ps';
  return 'xbox';
}

export const PAD_BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L-stick', 'R-stick', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Home'];

// Button names by controller style, by standard button number (a "standard" layout numbers the
// buttons by position, so the same number is a different label on each kind of controller).
export const PAD_NAMES = {
  xbox: PAD_BUTTONS,
  ps: ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'PS'],
  switch: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'L-stick', 'R-stick', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Home'],
};
// A button's name on a controller (gp: its Gamepad, or null: the Xbox names). A layout that isn't
// "standard" doesn't say what its buttons are, so they're just numbered.
export const padButtonName = (button, gp = null) => (!(button >= 0) ? '—' : gp && gp.mapping !== 'standard' ? `Button ${button}` : PAD_NAMES[padStyle(gp)][button] ?? `Button ${button}`);
// An action's button(s) in a layout: the grenade, with no button of its own, is both triggers.
export const padActionName = (layout, action, gp = null) =>
  action === 'grenade' && !(layout.grenade >= 0) ? `${padButtonName(layout.melee, gp)} + ${padButtonName(layout.shoot, gp)}` : padButtonName(layout[action], gp);

// The devices that keep personal settings: keyboard + mouse, and controller slots 1-4.
export const DEVICE_SLOTS = ['kbm', 'pad0', 'pad1', 'pad2', 'pad3'];
export const deviceLabel = (slot) => (slot === 'kbm' ? 'Keyboard + mouse' : `Controller ${Number(slot.slice(3)) + 1}`);

function load() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORE) ?? '{}');
  } catch {
    // Unreadable (or blocked) storage: start from the defaults.
  }
  const devices = {};
  for (const slot of DEVICE_SLOTS) {
    const d = saved.devices?.[slot] ?? {};
    devices[slot] = { character: typeof d.character === 'string' ? d.character : null };
    if (slot !== 'kbm') {
      const same = d.pad && OLD_DEFAULT_PADS.some((old) => Object.entries(old).every(([k, v]) => d.pad[k] === v));
      devices[slot].pad = same ? { ...DEFAULT_PAD } : { ...DEFAULT_PAD, ...d.pad };
    }
  }
  // (Older saves had one character and one controller layout: they go to the first slots.)
  if (typeof saved.character === 'string' && !saved.devices) devices.kbm.character = saved.character;
  if (saved.pad && !saved.devices) devices.pad0.pad = { ...DEFAULT_PAD, ...saved.pad };
  // graphics: how sharp the game is drawn ('auto', 'sharp' or 'fast'; see RENDER_SCALE in game.js).
  const graphics = ['auto', 'sharp', 'fast'].includes(saved.graphics) ? saved.graphics : 'auto';
  // touch: the on-screen controls (see touch.js): when they show ('auto': on touch screens), their
  // size and opacity, the stick on the right instead (swap), aim assist on a tap, going
  // fullscreen (sideways where the phone allows it) on the first touch of a match, and where each
  // button was placed.
  const t = saved.touch ?? {};
  const touch = {
    show: ['auto', 'on', 'off'].includes(t.show) ? t.show : 'auto',
    size: [0.85, 1, 1.2].includes(t.size) ? t.size : 1,
    opacity: typeof t.opacity === 'number' ? Math.max(0.2, Math.min(1, t.opacity)) : 0.6,
    swap: !!t.swap,
    assist: t.assist !== false,
    fullscreen: t.fullscreen !== false,
    // meleeAim: how melee (Heavy without sliding, and Jab) aims: 'stick' (facing the enemy, at the
    // stick's angle: up for an uppercut) or 'assist' (straight at the enemy). focus: a tap on a
    // fighter locks the aim assist onto them. holdFire: holding Fire keeps shooting a
    // one-shot-per-press gun (see TOUCH_REFIRE in controls.js).
    meleeAim: ['stick', 'assist'].includes(t.meleeAim) ? t.meleeAim : t.meleeStick === false ? 'assist' : 'stick',
    holdFire: t.holdFire !== false,
    focus: t.focus === true,
    // Buttons the player moved or resized: { id: [across, up, diameter] } in thumb-width units.
    layout: Object.fromEntries(Object.entries(t.layout ?? {}).filter(([, v]) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n)))),
  };
  // cameraLean: the camera leans toward where you aim (off: it stays centred on you).
  const cameraLean = saved.cameraLean !== false;
  return { volume: { master: 0.8, effects: 1, announcer: 1, ...saved.volume }, keys: { ...DEFAULT_KEYS, ...saved.keys }, devices, graphics, touch, cameraLean };
}

export const settings = load();

// The keyboard + mouse player's controller: of the connected ones, whichever was used last (the
// browser stamps each controller's latest input), in whatever slot it sits. (After a reload a
// controller can be listed twice, or a stale one linger: this follows the one in your hands.)
export const firstPad = () =>
  [...(navigator.getGamepads?.() ?? [])].filter((g) => g && g.connected && g.buttons.length > 0).reduce((best, g) => (!best || g.timestamp > best.timestamp ? g : best), null);

// rebinding: a controller button is being picked for a binding (the game mustn't also act on it,
// e.g. open or close the menu).
export const ui = { rebinding: false };

// One device's personal settings: { character, pad } (pad: controller slots only).
export const deviceSettings = (slot) => settings.devices[slot] ?? settings.devices.kbm;
export const padBindings = (slot) => settings.devices[slot]?.pad ?? DEFAULT_PAD;

export function saveSettings() {
  try {
    localStorage.setItem(STORE, JSON.stringify(settings));
  } catch {
    // Private windows can refuse storage: the settings just last until the page closes.
  }
}

// A readable name for a key code.
const NAMED = { 32: 'Space', 16: 'Shift', 17: 'Ctrl', 18: 'Alt', 9: 'Tab', 13: 'Enter', 8: 'Backspace', 37: '←', 38: '↑', 39: '→', 40: '↓', 186: ';', 187: '=', 188: ',', 189: '-', 190: '.', 191: '/', 192: '`', 219: '[', 220: '\\', 221: ']', 222: "'" };
export const keyName = (code) => NAMED[code] ?? (code >= 112 && code <= 123 ? `F${code - 111}` : String.fromCharCode(code));
