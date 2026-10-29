// Controllers in the page's menus (main menu, setup, lobby, results, the in-game menu): the D-pad
// or left stick moves between buttons and fields, A presses, B goes back. On a dropdown or a
// slider, left and right change it. Any connected controller can drive the menus; the fixed
// buttons here don't follow anyone's in-game layout.
//
// root(): the element to move around in (null: hands off, the game has the controllers).
// back(): what B does. busy(): true while something else is reading the controllers.
export function startPadNav({ root, back, busy }) {
  const held = new Map(); // "pad:control" -> when it went down (ms), for repeats
  const REPEAT_AFTER = 380;
  const REPEAT_EVERY = 110;
  let lastFocus = null;

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
    if (!el || busy()) {
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
      const list = focusables(el);
      if (!list.length) continue;
      const current = list.includes(document.activeElement) ? document.activeElement : null;
      for (const [name, down, dx, dy] of dirs) {
        if (!pressed(`${gp.index}:${name}`, down, now, true)) continue;
        if (!current) {
          focus(list[0]);
          continue;
        }
        if (dx && nudge(current, dx)) continue;
        const next = move(list, current, dx, dy);
        if (next) focus(next);
      }
      if (pressed(`${gp.index}:a`, a, now, false)) {
        if (!current) focus(list[0]);
        else if (current.tagName === 'SELECT') nudge(current, 1);
        else current.click();
      }
      if (pressed(`${gp.index}:b`, bk, now, false)) back(el);
    }
  }

  // A controller's menu controls: [name, down, dx, dy] for the four directions, then A and B.
  function controls(gp) {
    const b = (i) => !!gp.buttons[i]?.pressed;
    const [lx = 0, ly = 0] = gp.axes;
    return [
      ['up', b(12) || ly < -0.6, 0, -1],
      ['down', b(13) || ly > 0.6, 0, 1],
      ['left', b(14) || lx < -0.6, -1, 0],
      ['right', b(15) || lx > 0.6, 1, 0],
      ['a', b(0)],
      ['b', b(1)],
    ];
  }
  // Using the mouse again hides the controller's highlight.
  window.addEventListener('pointerdown', () => lastFocus?.classList.remove('pad-focus'));
  requestAnimationFrame(tick);
}
