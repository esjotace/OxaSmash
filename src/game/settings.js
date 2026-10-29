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
  ['melee', 'Melee (also right click)'],
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
};

// Controller actions (standard button numbering), with labels and defaults. Moving is the left
// stick, aiming the right stick.
export const PAD_ACTIONS = [
  ['jump', 'Jump'],
  ['shoot', 'Shoot'],
  ['melee', 'Melee'],
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
export const DEFAULT_PAD = { jump: 0, dodge: 1, reload: 2, pickup: 3, block: 4, grenade: 5, melee: 6, shoot: 7, menu: 9, hide: 12, down: 13, cycle: 15 };
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
export const padButtonName = (button, gp = null) => (gp && gp.mapping !== 'standard' ? `Button ${button}` : PAD_NAMES[padStyle(gp)][button] ?? `Button ${button}`);

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
    if (slot !== 'kbm') devices[slot].pad = { ...DEFAULT_PAD, ...d.pad };
  }
  // (Older saves had one character and one controller layout: they go to the first slots.)
  if (typeof saved.character === 'string' && !saved.devices) devices.kbm.character = saved.character;
  if (saved.pad && !saved.devices) devices.pad0.pad = { ...DEFAULT_PAD, ...saved.pad };
  return { volume: { master: 0.8, effects: 1, announcer: 1, ...saved.volume }, keys: { ...DEFAULT_KEYS, ...saved.keys }, devices };
}

export const settings = load();

// The first connected controller, whichever browser slot it sits in (the keyboard + mouse player's).
export const firstPad = () => [...(navigator.getGamepads?.() ?? [])].find((g) => g && g.connected && g.buttons.length > 0) ?? null;

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
