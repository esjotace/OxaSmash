// Watching a match you're not in (a bot match, someone else's duel) or are out of: the camera
// follows one fighter at a time, or roams free.
//   Keyboard: ←/→ (A/D) switch who's followed; Space frees the camera (it pulls back to the whole
//   stage; the mouse moves it), Space again (or ←/→) goes back to whoever was followed; ↑/↓ (W/S)
//   zoom in and out.
//   Controller (any): the D-pad the same, the bottom face button (A, Cross) as Space, the right
//   stick moves the free camera.
// Reads the keyboard and mouse straight from the page (not through the match's controls, which
// belong to the players).
const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'toggle' };
const PAD = { 14: 'left', 15: 'right', 12: 'up', 13: 'down', 0: 'toggle' };
const STICK = 0.25;

// A page screen is up over the match (the results, a menu, the duel rules): the camera is left
// alone, and the keys and the controller belong to that screen.
const covered = () => !!document.querySelector('.screen:not([hidden]), .game-menu:not([hidden])');
const NOTHING = { cycle: 0, toggle: false, zoom: 0, pan: { x: 0, y: 0 } };

export class Spectator {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.pressed = new Set();
    this.padDown = new Set();
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, on: false };
    this.active = false; // watching right now (then Space and the arrows don't scroll the page)
    this.onKey = (e) => {
      const k = KEYS[e.code];
      if (!k) return;
      if (covered()) return this.held.delete(k);
      if (this.active && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target?.tagName ?? '')) e.preventDefault();
      if (e.repeat) return;
      if (e.type === 'keydown') {
        this.held.add(k);
        this.pressed.add(k);
      } else this.held.delete(k);
    };
    this.onMouse = (e) => {
      const r = this.canvas.getBoundingClientRect();
      // Offset from the middle of the screen, -1..1 (or, with the mouse captured, how far it moved).
      Object.assign(this.mouse, { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1, on: true });
      this.mouse.dx += e.movementX ?? 0;
      this.mouse.dy += e.movementY ?? 0;
    };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('mousemove', this.onMouse);
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('mousemove', this.onMouse);
  }

  // This frame's asks: { cycle: -1 | 0 | 1, toggle, zoom: -1 | 0 | 1 (held), pan: { x, y } in
  // screens per second, roughly }.
  poll() {
    if (covered()) {
      // (Nothing carries over to when the screen goes: presses, held keys, mouse movement.)
      this.pressed.clear();
      this.held.clear();
      Object.assign(this.mouse, { dx: 0, dy: 0, on: false });
      for (const gp of navigator.getGamepads?.() ?? []) if (gp?.connected) for (const b of Object.keys(PAD)) if (gp.buttons[b]?.pressed) this.padDown.add(`${gp.index}:${b}`);
      return NOTHING;
    }
    const pressed = new Set(this.pressed);
    const held = new Set(this.held);
    this.pressed.clear();
    let pan = { x: 0, y: 0 };
    for (const gp of navigator.getGamepads?.() ?? []) {
      if (!gp?.connected) continue;
      for (const [b, k] of Object.entries(PAD)) {
        const down = !!gp.buttons[b]?.pressed;
        const key = `${gp.index}:${b}`;
        if (down) {
          held.add(k);
          if (!this.padDown.has(key)) pressed.add(k);
          this.padDown.add(key);
        } else this.padDown.delete(key);
      }
      const [rx = 0, ry = 0] = gp.axes.slice(2, 4);
      if (Math.hypot(rx, ry) > STICK) pan = { x: rx, y: ry };
    }
    // The mouse: captured, it moves the camera as far as it moves; free, the camera drifts toward
    // where the pointer is (past a dead zone in the middle).
    if (!pan.x && !pan.y) {
      if (document.pointerLockElement) pan = { x: this.mouse.dx / 40, y: this.mouse.dy / 40, raw: true };
      else if (this.mouse.on) {
        const dead = (v) => Math.sign(v) * Math.max(0, (Math.abs(v) - 0.25) / 0.75);
        pan = { x: dead(this.mouse.x), y: dead(this.mouse.y) };
      }
    }
    this.mouse.dx = this.mouse.dy = 0;
    return {
      cycle: pressed.has('left') ? -1 : pressed.has('right') ? 1 : 0,
      toggle: pressed.has('toggle'),
      zoom: held.has('up') ? 1 : held.has('down') ? -1 : 0,
      pan,
    };
  }
}
