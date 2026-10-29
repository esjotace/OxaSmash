// Controllers in the page's menus (main menu, setup, lobby, results, the in-game menu): the D-pad
// moves between buttons and fields, A presses, B goes back. On a dropdown or a slider, left and
// right change it. The left stick moves a mouse pointer instead (A clicks what's under it; the
// right stick scrolls). Any connected controller can drive the menus; the fixed buttons here don't
// follow anyone's in-game layout.
//
// root(): the element to move around in (null: hands off, the game has the controllers).
// back(): what B does. busy(): true while something else is reading the controllers.
export function startPadNav({ root, back, busy }) {
  const held = new Map(); // "pad:control" -> when it went down (ms), for repeats
  const REPEAT_AFTER = 380;
  const REPEAT_EVERY = 110;
  let lastFocus = null;
  const STICK = 0.2; // dead zone
  const SPEED = 1100; // the pointer's top speed, px/s (slow near the dead zone, for aiming)
  const SCROLL = 900; // px/s
  let last = performance.now();
  // The controller's pointer: an arrow drawn over the page, shown while the stick is in use.
  const pointer = { x: innerWidth / 2, y: innerHeight / 2, on: false, over: null };
  const arrow = document.createElement('div');
  arrow.className = 'pad-pointer';
  arrow.hidden = true;
  document.body.append(arrow);
  const showPointer = (on) => {
    pointer.on = on;
    arrow.hidden = !on;
    if (!on) hover(null);
  };
  // What the pointer is over: the button or field there (highlighted like the mouse would).
  function hover(el) {
    if (el === pointer.over) return;
    pointer.over?.classList.remove('pad-hover');
    el?.classList.add('pad-hover');
    pointer.over = el;
  }
  const under = (root) => {
    const el = document.elementFromPoint(pointer.x, pointer.y)?.closest('button, select, input, label, summary, [tabindex]:not([tabindex="-1"])');
    return el && root.contains(el) && !el.disabled ? el : null;
  };
  // A on what's under the pointer: press it; a slider jumps to where it points; a dropdown steps on.
  function clickAt(el) {
    if (!el) return;
    if (el.type === 'range') {
      const r = el.getBoundingClientRect();
      const k = Math.max(0, Math.min(1, (pointer.x - r.left) / r.width));
      const step = Number(el.step) || 1;
      el.value = String(Number(el.min) + Math.round((k * (Number(el.max) - Number(el.min))) / step) * step);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    el.focus({ preventScroll: true });
    if (el.tagName === 'SELECT') nudge(el, 1);
    else el.click();
  }
  // The right stick scrolls whatever scrolls under the pointer (or the page).
  function scrollAt(root, dy) {
    let el = document.elementFromPoint(pointer.x, pointer.y);
    while (el && el !== document.body && !(el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    (el && el !== document.body ? el : root).scrollBy(0, dy);
  }

  // A press, or a held direction repeating.
  const pressed = (key, down, now, repeat) => {
    if (!down) {
      held.delete(key);
      return false;
    }
    const since = held.get(key);
    if (since === undefined) {
      held.set(key, now);
      return true;
    }
    if (repeat && now - since > REPEAT_AFTER) {
      held.set(key, now - REPEAT_AFTER + REPEAT_EVERY);
      return true;
    }
    return false;
  };

  function focusables(el) {
    return [...el.querySelectorAll('button, select, input, [tabindex]:not([tabindex="-1"])')].filter((e) => !e.disabled && e.offsetParent !== null && !e.closest('[hidden]'));
  }

  function focus(el) {
    lastFocus?.classList.remove('pad-focus');
    el.classList.add('pad-focus');
    el.focus({ preventScroll: false });
    el.scrollIntoView?.({ block: 'nearest' });
    lastFocus = el;
  }

  // The nearest field in a direction (dx, dy), favouring ones straight in line.
  function move(list, from, dx, dy) {
    const a = from.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const el of list) {
      if (el === from) continue;
      const b = el.getBoundingClientRect();
      const ox = b.left + b.width / 2 - ax;
      const oy = b.top + b.height / 2 - ay;
      const along = ox * dx + oy * dy;
      if (along <= 4) continue;
      const across = Math.abs(ox * dy - oy * dx);
      const score = along + across * 2.5;
      if (score < bestScore) [best, bestScore] = [el, score];
    }
    return best;
  }

  // Left/right on a dropdown or slider changes it (as if picked by hand).
  function nudge(el, dir) {
    if (el.tagName === 'SELECT') {
      const i = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + dir));
      if (i === el.selectedIndex) return true;
      el.selectedIndex = i;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (el.type === 'range') {
      const step = Number(el.step) || 1;
      el.value = String(Math.max(Number(el.min), Math.min(Number(el.max), Number(el.value) + dir * step)));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }

  function tick() {
    requestAnimationFrame(tick);
    const el = root();
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!el || busy()) {
      showPointer(false);
      // Hands off. Whatever is held now (the button just picked for a binding, say) only counts
      // again once it's let go, so it doesn't also press or go back the moment we take over.
      for (const gp of navigator.getGamepads?.() ?? []) {
        if (!gp || !gp.connected) continue;
        for (const [name, down] of controls(gp)) {
          if (down) held.set(`${gp.index}:${name}`, Infinity);
          else held.delete(`${gp.index}:${name}`);
        }
      }
      return;
    }
    for (const gp of navigator.getGamepads?.() ?? []) {
      if (!gp || !gp.connected) continue;
      const c = controls(gp);
      const [dirs, a, bk] = [c.slice(0, 4), c[4][1], c[5][1]];
      // The left stick moves the pointer; the right one scrolls.
      const [lx = 0, ly = 0, rx = 0, ry = 0] = gp.axes;
      const mag = Math.hypot(lx, ly);
      if (mag > STICK) {
        if (!pointer.on) showPointer(true);
        const v = SPEED * ((mag - STICK) / (1 - STICK)) ** 2;
        pointer.x = Math.max(0, Math.min(innerWidth - 1, pointer.x + (lx / mag) * v * dt));
        pointer.y = Math.max(0, Math.min(innerHeight - 1, pointer.y + (ly / mag) * v * dt));
        arrow.style.transform = `translate(${pointer.x}px, ${pointer.y}px)`;
      }
      if (Math.abs(ry) > STICK + 0.1) scrollAt(el, Math.sign(ry) * SCROLL * ((Math.abs(ry) - STICK) / (1 - STICK)) * dt);
      if (pointer.on) hover(under(el));
      const list = focusables(el);
      if (!list.length) continue;
      const current = list.includes(document.activeElement) ? document.activeElement : null;
      for (const [name, down, dx, dy] of dirs) {
        if (!pressed(`${gp.index}:${name}`, down, now, true)) continue;
        showPointer(false); // (the D-pad: back to moving between fields)
        if (!current) {
          focus(list[0]);
          continue;
        }
        if (dx && nudge(current, dx)) continue;
        const next = move(list, current, dx, dy);
        if (next) focus(next);
      }
      if (pressed(`${gp.index}:a`, a, now, false)) {
        if (pointer.on) clickAt(pointer.over);
        else if (!current) focus(list[0]);
        else if (current.tagName === 'SELECT') nudge(current, 1);
        else current.click();
      }
      if (pressed(`${gp.index}:b`, bk, now, false)) back(el);
    }
  }

  // A controller's menu controls: [name, down, dx, dy] for the four directions (the D-pad), then A
  // and B.
  function controls(gp) {
    const b = (i) => !!gp.buttons[i]?.pressed;
    return [
      ['up', b(12), 0, -1],
      ['down', b(13), 0, 1],
      ['left', b(14), -1, 0],
      ['right', b(15), 1, 0],
      ['a', b(0)],
      ['b', b(1)],
    ];
  }
  // Using the mouse again hides the controller's highlight and pointer.
  window.addEventListener('pointerdown', () => lastFocus?.classList.remove('pad-focus'));
  window.addEventListener('mousemove', (e) => {
    if (!pointer.on || (e.movementX === 0 && e.movementY === 0)) return;
    showPointer(false);
    Object.assign(pointer, { x: e.clientX, y: e.clientY });
  });
  requestAnimationFrame(tick);
}
