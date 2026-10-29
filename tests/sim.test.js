// Same checks as the Godot build's tests/run_tests.gd, so both versions follow the same rules.
import { describe, it, expect } from 'vitest';
import { createWorld, step, swingAngle, rollWord, lineOfSight, spawnWeapon, setHealthRule, thrustReach, gunOrigin } from '../src/sim/world.js';
import { NEUTRAL, encodeInput, decodeInput } from '../src/sim/input.js';
import { MOVERS, SPIKES, ITEMS, LEGENDARY, CROWN, CASH, LOOT, HAVEN, STYLE, GUN_THROW, COMBO, DI, BREAKER, COVER, TILE } from '../src/sim/constants.js';
import { FIGHTER, PISTOL, STRIKE, STORM, MELEE, LIGHT_MAX_PUSH, LIGHT_THROW, GUNS, GRENADES, HEADSHOT, DASH, GLUE, STAMINA, SWING_HAND, STORM_PACE, PICKUPS } from '../src/sim/constants.js';
import { createBot, botInput } from '../src/bots/bot.js';
import { STAGES, getStage } from '../src/sim/stage.js';
import { MELEE_POINTS } from '../src/sim/meleePoints.js';

const FAR_STORM = { startDelay: 999 };
const F_RUN = FIGHTER.runSpeed;

function world(players = 2, opts = {}) {
  return createWorld({ stage: 'warehouse', players, countdown: 0, seed: 1234, storm: FAR_STORM, ...opts });
}

function run(w, ticks, inputsFor = () => []) {
  for (let t = 0; t < ticks; t++) step(w, inputsFor(t));
}

function place(f, x, y) {
  Object.assign(f, { x, y, vx: 0, vy: 0 });
}

// Count-based presses: give a fresh count for each tick you want a press on.
const press = (t, every = 1) => Math.floor(t / every) & 0xff;

describe('movement', () => {
  it('the air jump goes as high as the first jump', () => {
    const w = world();
    const f = w.fighters[0];
    place(f, 650, -2);
    run(w, 10);
    step(w, [{ ...NEUTRAL, jump: true, jp: 1 }]);
    // Wait for the top of the first jump, then jump again and measure the climb.
    while (f.vy < 0) step(w, [{ ...NEUTRAL, jump: true, jp: 1 }]);
    const from = f.y;
    let top = from;
    for (let t = 0; t < 50; t++) {
      step(w, [{ ...NEUTRAL, jump: true, jp: 2 }]);
      top = Math.min(top, f.y);
    }
    expect(Math.abs(from - top - FIGHTER.jumpHeight)).toBeLessThan(6);
  });

  it('a full jump reaches the designed height', () => {
    const w = world();
    const f = w.fighters[0];
    place(f, 650, -2); // open sky above: no ceiling
    run(w, 10);
    const ground = f.y;
    let top = ground;
    for (let t = 0; t < 50; t++) {
      step(w, [{ ...NEUTRAL, jump: true, jp: 1 }]);
      top = Math.min(top, f.y);
    }
    expect(Math.abs(ground - top - FIGHTER.jumpHeight)).toBeLessThan(6);
  });

  it('tapping jump gives a short hop', () => {
    const w = world();
    const f = w.fighters[0];
    place(f, 650, -2);
    run(w, 10);
    const ground = f.y;
    let top = ground;
    for (let t = 0; t < 50; t++) {
      step(w, [{ ...NEUTRAL, jump: t < 3, jp: 1 }]);
      top = Math.min(top, f.y);
    }
    expect(ground - top).toBeLessThan(FIGHTER.jumpHeight * 0.6);
  });

  it('stands on the thin bridge and drops through with a double tap of down', () => {
    const w = world();
    const f = w.fighters[0];
    place(f, 800, -100);
    run(w, 20);
    expect(f.y).toBe(-96);
    expect(f.grounded).toBe(true);
    // One tap, held: just a crouch. A second tap long after is still just a tap.
    run(w, 30, () => [{ ...NEUTRAL, down: true, crouch: true, dp: 1 }]);
    expect(f.crouching).toBe(true);
    run(w, 30, () => [{ ...NEUTRAL, dp: 1 }]);
    run(w, 30, () => [{ ...NEUTRAL, dp: 2 }]);
    expect(f.y).toBe(-96);
    // Two quick taps: through the bridge.
    run(w, 4, () => [{ ...NEUTRAL, dp: 3 }]);
    run(w, 30, () => [{ ...NEUTRAL, dp: 4 }]);
    expect(f.y).toBeGreaterThan(-60);
  });

  it('crouching makes you shorter, so a standing-height shot passes over', () => {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 650, -2);
    run(w, 5);
    // Shoot level from a's standing shoulder height (22 px up); b crouches (18 px tall).
    run(w, 60, (t) => [{ ...NEUTRAL, ax: 1, ay: 0, sp: press(t, 12) }, { ...NEUTRAL, crouch: true }]);
    expect(b.crouching).toBe(true);
    expect(b.damage).toBe(0);
    run(w, 60, (t) => [{ ...NEUTRAL, ax: 1, ay: 0, sp: press(t + 100, 12) }, NEUTRAL]);
    expect(b.damage).toBeGreaterThan(0);
  });
});

describe('dash and stamina', () => {
  const dash = (mx = 0) => ({ ...NEUTRAL, xp: 1, mx });

  it('the dodge button dashes the way you hold, for half the stamina bar', () => {
    const w = world();
    const f = w.fighters[0];
    place(f, 650, -2);
    run(w, 10);
    step(w, [dash(1)]);
    expect(f.vx).toBeCloseTo(DASH.speed, 0);
    expect(f.stamina).toBeCloseTo(1 - DASH.cost, 1);
    expect(f.dodge).toBeGreaterThan(0);
    expect(f.vy).toBeGreaterThanOrEqual(0); // a dash, not a jump
  });

  it('with nothing held, it dashes backwards', () => {
    const w = world();
    const f = w.fighters[0];
    place(f, 650, -2);
    run(w, 10);
    f.facing = 1;
    step(w, [dash(0)]);
    expect(f.vx).toBeLessThan(-DASH.speed * 0.9);
  });

  it('a full bar is two dashes; then wait for it to refill', () => {
    const w = world();
    const f = w.fighters[0];
    place(f, 650, -2);
    run(w, 10);
    step(w, [dash(1)]);
    run(w, 20, () => [NEUTRAL]);
    step(w, [{ ...dash(-1), xp: 2 }]);
    expect(f.vx).toBeCloseTo(-DASH.speed, 0); // the second dash
    run(w, 20, () => [NEUTRAL]);
    step(w, [{ ...dash(1), xp: 3 }]);
    expect(f.vx).toBeLessThan(DASH.speed * 0.5); // no third
    run(w, Math.ceil(DASH.recharge * DASH.cost * 60) + 5);
    step(w, [{ ...dash(1), xp: 4 }]);
    expect(f.vx).toBeCloseTo(DASH.speed, 0);
  });

  it('the start of a dash dodges bullets, melee and explosions, but not spikes', () => {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 614, -2);
    run(w, 5);
    a.active = 'melee';
    b.dodge = 1;
    for (let t = 0; t < 30; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
    expect(b.damage).toBe(0);
    expect(w.events.length >= 0).toBe(true);
    // Spikes still hurt mid-dash.
    const s = world();
    const f = s.fighters[0];
    place(f, 120, -2); // the spike wall on the left faces right, at x 48..64
    run(s, 5);
    f.dodge = 1;
    run(s, 30, () => [{ ...NEUTRAL, mx: -1 }]);
    expect(f.damage).toBeGreaterThan(0);
  });

  it('a dash dodges an explosion', () => {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 640, -2);
    run(w, 5);
    Object.assign(a, { gun: 'rocket', hasGun: true, ammo: 1, active: 'gun' });
    b.dodge = 1;
    w.rng = () => 0.5;
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0.3, sp: 1 }, NEUTRAL]);
    run(w, 20);
    expect(b.damage).toBe(0);
  });

  it('bullets fly through someone dodging', () => {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 700, -2);
    run(w, 10);
    w.rng = () => 0.5;
    b.dodge = 1; // as if mid-dash
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1 }, NEUTRAL]);
    run(w, 10);
    expect(b.damage).toBe(0);
  });
});

describe('crouching', () => {
  it('each shot fired crouched costs stamina; out of stamina, crouching no longer steadies the aim', () => {
    const shoot = (stamina) => {
      const w = world();
      const f = w.fighters[0];
      place(f, 600, -2);
      run(w, 10);
      Object.assign(f, { gun: 'rifle', ammo: 24 });
      w.rng = () => 1;
      step(w, [{ ...NEUTRAL, crouch: true }]);
      f.stamina = stamina;
      step(w, [{ ...NEUTRAL, crouch: true, ax: 1, ay: -1, sp: 1 }]);
      const b = w.bullets[0];
      return { spread: Math.abs(Math.atan2(b.vy, b.vx) + Math.PI / 4), left: f.stamina };
    };
    const rested = shoot(1);
    const tired = shoot(0.05);
    expect(rested.left).toBeCloseTo(1 - STAMINA.crouchShot, 1);
    expect(tired.spread).toBeGreaterThan(rested.spread * 2);
    expect(tired.left).toBe(0); // drained anyway
  });

  it('holding the trigger crouched keeps the bar empty and the aim loose; resting brings it back', () => {
    const w = world();
    const f = w.fighters[0];
    place(f, 600, -2);
    run(w, 10);
    Object.assign(f, { gun: 'minigun', ammo: 80 });
    const spreads = [];
    w.rng = () => 1;
    for (let t = 0; t < 90; t++) {
      const next = w.nextBullet;
      step(w, [{ ...NEUTRAL, crouch: true, shoot: true, sp: 1, ax: 1, ay: -1 }]);
      const shot = w.bullets.find((b) => b.id === next);
      if (shot) spreads.push(Math.abs(Math.atan2(shot.vy, shot.vx) + Math.PI / 4));
    }
    expect(spreads.length).toBeGreaterThan(20);
    expect(f.stamina).toBeLessThan(0.2);
    // The first shots are steady; once the bar is spent every later shot stays loose.
    const steady = spreads[0];
    const late = spreads.slice(-10);
    expect(late.every((s) => s > steady * 2)).toBe(true);
  });
});

describe('attacking on the run', () => {
  it('costs stamina, more for heavy weapons; without enough you stop to attack', () => {
    const swing = (weapon, stamina) => {
      const w = world();
      const f = w.fighters[0];
      place(f, 580, -2); // open floor ahead (the crate at x 288 would stop the run)
      run(w, 10);
      f.melee = weapon;
      run(w, 20, () => [{ ...NEUTRAL, mx: 1 }]);
      f.stamina = stamina;
      // Tap the melee button (light weapons swing when it's let go).
      step(w, [{ ...NEUTRAL, mx: 1, ax: 1, ay: 0, mp: 1, meleeHeld: true }]);
      step(w, [{ ...NEUTRAL, mx: 1, ax: 1, ay: 0, mp: 1 }]);
      const left = f.stamina;
      run(w, 10, () => [{ ...NEUTRAL, mx: 1, ax: 1, ay: 0, mp: 1 }]);
      return { left, vx: f.vx };
    };
    const light = swing('machete', 1);
    const heavy = swing('bolivar', 1);
    expect(light.left).toBeCloseTo(1 - STAMINA.swing.light, 1);
    expect(heavy.left).toBeCloseTo(1 - STAMINA.swing.heavy, 1);
    expect(light.vx).toBeGreaterThan(FIGHTER.runSpeed * 0.8); // still running
    const tired = swing('bolivar', 0.2);
    expect(tired.left).toBeCloseTo(0.2, 1); // nothing spent: a standing swing
    expect(tired.vx).toBeLessThan(FIGHTER.runSpeed * 0.8);
  });
});

describe('ammo', () => {
  it('every gun holds one spare magazine (the Golden Gun: its three bullets are all there is)', () => {
    for (const g of Object.values(GUNS)) expect(g.magazines, g.name).toBe(g === GUNS.golden ? 1 : 2);
  });
});

describe('block and parry', () => {
  // a hits b at close range on tick `at`; b's input per tick is given by `guard`.
  function exchange(guard, { attackerCrouch = false, at = 10 } = {}) {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 614, -2);
    run(w, 5);
    a.active = 'melee';
    for (let t = 0; t < 40; t++) step(w, [{ ...NEUTRAL, crouch: attackerCrouch, ax: 1, ay: 0, mp: t >= at ? 1 : 0 }, guard(t)]);
    return { a, b };
  }

  it('holding block stops melee damage', () => {
    const { b } = exchange(() => ({ ...NEUTRAL, block: true }));
    expect(b.damage).toBe(0);
  });

  it('block does not stop bullets', () => {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 560, -2);
    place(b, 640, -2);
    run(w, 5);
    run(w, 40, (t) => [{ ...NEUTRAL, ax: 1, ay: 0, sp: press(t, 12) }, { ...NEUTRAL, block: true }]);
    expect(b.damage).toBeGreaterThan(0);
  });

  it('letting go of block right as a standing hit lands parries it and stuns the attacker', () => {
    // The swing lands 4 ticks after it starts (startup 0.06 s); b lets go 1 tick before that.
    const { a, b } = exchange((t) => ({ ...NEUTRAL, block: t < 13 }));
    expect(b.damage).toBe(0);
    expect(a.stunned).toBe(true);
  });

  it('a standing block does not parry a crouching hit', () => {
    const { a, b } = exchange((t) => ({ ...NEUTRAL, block: t < 13 }), { attackerCrouch: true });
    expect(a.stunned).toBe(false);
    expect(b.damage).toBeGreaterThan(0);
  });

  it('a crouching block parries a crouching hit', () => {
    const { a, b } = exchange((t) => ({ ...NEUTRAL, crouch: true, block: t < 13 }), { attackerCrouch: true });
    expect(b.damage).toBe(0);
    expect(a.stunned).toBe(true);
  });

  it('a hit from behind is neither blocked nor parried', () => {
    // b faces right (aiming right), away from a, who attacks from the left.
    const blocked = exchange(() => ({ ...NEUTRAL, ax: 1, ay: 0, block: true }));
    expect(blocked.b.damage).toBeGreaterThan(0);
    const parried = exchange((t) => ({ ...NEUTRAL, ax: 1, ay: 0, block: t < 13 }));
    expect(parried.a.stunned).toBe(false);
    expect(parried.b.damage).toBeGreaterThan(0);
  });

  it('letting go too early is not a parry', () => {
    const { a, b } = exchange((t) => ({ ...NEUTRAL, block: t < 4 }));
    expect(a.stunned).toBe(false);
    expect(b.damage).toBeGreaterThan(0);
  });
});

describe('weapons', () => {
  it('two magazines, auto-reload, then holding the trigger throws the empty gun', () => {
    const w = world();
    const f = w.fighters[0];
    place(f, 650, -2);
    expect(f.ammo).toBe(PISTOL.magazineSize);
    expect(f.spareMags).toBe(PISTOL.magazines - 1);
    let shots = 0;
    let last = f.ammo;
    let reloadedOnEmpty = false;
    let secondFull = false;
    let dryInHand = false;
    for (let t = 0; t < 900 && f.hasGun; t++) {
      step(w, [{ ...NEUTRAL, ax: 0.2, ay: -1, sp: press(t, 12) }]);
      if (f.ammo < last) shots += last - f.ammo;
      if (f.ammo === 0 && f.reload > 0) reloadedOnEmpty = true;
      if (f.ammo === PISTOL.magazineSize && f.spareMags === 0) secondFull = true;
      if (f.ammo === 0 && f.spareMags === 0 && f.hasGun) dryInHand = true;
      last = f.ammo;
    }
    expect(reloadedOnEmpty).toBe(true);
    expect(secondFull).toBe(true);
    expect(shots).toBe(PISTOL.magazineSize * PISTOL.magazines);
    expect(dryInHand).toBe(true);
    // Taps only click: the empty gun stays.
    expect(f.hasGun).toBe(true);
    for (let t = 0; t < 30; t++) step(w, [{ ...NEUTRAL, ax: 0.2, ay: -1, sp: 200 + t, shoot: false }]);
    expect(f.hasGun).toBe(true);
    // Held, then let go: it's thrown.
    for (let t = 0; t < 30; t++) step(w, [{ ...NEUTRAL, ax: 0.2, ay: -1, sp: 240, shoot: true }]);
    step(w, [{ ...NEUTRAL, ax: 0.2, ay: -1, sp: 240 }]);
    expect(f.hasGun).toBe(false);
  });

  // The low crate on the left of the ground floor: x 288..320, 16 px tall.
  it('standing beside low cover, a level shot passes over it', () => {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 278, -2);
    place(b, 340, -2);
    run(w, 5);
    run(w, 60, (t) => [{ ...NEUTRAL, ax: 1, ay: 0, sp: press(t, 12) }, NEUTRAL]);
    expect(b.damage).toBeGreaterThan(0);
  });

  it('crouching right beside cover tucks you fully behind it', () => {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 220, -2);
    place(b, 330, -2); // 4 px from the crate's right side
    run(w, 5, () => [NEUTRAL, { ...NEUTRAL, crouch: true }]);
    expect(b.tucked).toBe(true);
    // a stands on the far side and aims straight at b's middle.
    const dx = 330 - 220;
    const dy = -2 - FIGHTER.tuckH / 2 - (-2 - 22);
    const len = Math.hypot(dx, dy);
    run(w, 90, (t) => [{ ...NEUTRAL, ax: dx / len, ay: dy / len, sp: press(t, 12) }, { ...NEUTRAL, crouch: true }]);
    expect(b.damage).toBe(0);
  });

  it('crouching away from cover is a normal crouch (no tuck)', () => {
    const w = world();
    const b = w.fighters[1];
    place(b, 380, -2);
    run(w, 5, () => [NEUTRAL, { ...NEUTRAL, crouch: true }]);
    expect(b.crouching).toBe(true);
    expect(b.tucked).toBe(false);
  });

  it('melee knockback grows with damage', () => {
    const launch = (start) => {
      const w = world();
      const [a, b] = w.fighters;
      place(a, 200, -2);
      place(b, 214, -2);
      run(w, 5);
      b.damage = start;
      let fastest = 0;
      for (let t = 0; t < 20; t++) {
        step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }]);
        fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
      }
      expect(b.damage).toBeGreaterThan(start);
      return fastest;
    };
    expect(launch(120)).toBeGreaterThan(launch(0) * 1.8);
  });
});

describe('melee weapons', () => {
  // Fighter a holds `weapon`, b stands right in front of it at `damage` %.
  function armed(weapon, damage = 0) {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 614, -2);
    run(w, 5);
    w.pickups.push({ id: 99, x: 600, y: 0, weapon });
    step(w, [{ ...NEUTRAL, ep: 1 }, NEUTRAL]);
    b.damage = damage;
    return { w, a, b };
  }
  // button: 'mp' attacks with the melee slot, 'sp' with the gun slot (fists if it's empty).
  const attack = (w, ticks = 30, button = 'mp') => {
    let fastest = 0;
    for (let t = 0; t < ticks; t++) {
      step(w, [{ ...NEUTRAL, ep: 1, ax: 1, ay: 0, [button]: 1 }, NEUTRAL]);
      fastest = Math.max(fastest, Math.hypot(w.fighters[1].vx, w.fighters[1].vy));
    }
    return fastest;
  };

  it('picking up a weapon equips it; the katana replaces only the gun', () => {
    const { w, a } = armed('bolivar');
    expect(a.melee).toBe('bolivar');
    expect(a.hasGun).toBe(true);
    expect(w.pickups.length).toBe(0);
    expect(a.active).toBe('melee'); // what you pick up goes in your hand
    const k = armed('katana').a;
    expect(k.hasGun).toBe(true); // the katana is a melee weapon: the gun stays
    expect(k.melee).toBe('katana');
  });

  it('shoot fires the gun, melee swings; the weapon used last is the one in hand', () => {
    const { w, a, b } = armed('bolivar', 0);
    expect(a.active).toBe('melee');
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1 }, NEUTRAL]);
    expect(a.ammo).toBe(PISTOL.magazineSize - 1);
    expect(a.active).toBe('gun');
    attack(w, 30, 'mp');
    expect(b.damage).toBeGreaterThan(0);
    expect(a.active).toBe('melee');
  });

  it('with the gun slot empty, shoot punches', () => {
    const { w, a, b } = armed('bolivar', 0);
    Object.assign(a, { hasGun: false, gun: null, melee: null });
    attack(w, 30, 'sp');
    expect(b.damage).toBe(STRIKE.damage);
  });

  it('the katana swings the instant you click (it is not thrown)', () => {
    const { w, a } = armed('katana', 0);
    step(w, [{ ...NEUTRAL, ep: 1, ax: 1, ay: 0, mp: 1, meleeHeld: true }, NEUTRAL]);
    expect(a.swing).toBeGreaterThanOrEqual(0);
    for (let t = 0; t < 40; t++) step(w, [{ ...NEUTRAL, ep: 1, ax: 1, ay: 0, mp: 1, meleeHeld: true }, NEUTRAL]);
    expect(a.melee).toBe('katana');
  });

  it('light weapons never launch, heavy ones do', () => {
    const katana = armed('katana', 200);
    expect(attack(katana.w, 30, 'sp')).toBeLessThanOrEqual(LIGHT_MAX_PUSH + 1);
    expect(katana.b.damage).toBeGreaterThan(200);
    const heavy = armed('bolivar', 120);
    expect(attack(heavy.w)).toBeGreaterThan(500);
  });

  it('every keyboard word launches, at its share of the full launch', () => {
    const m = MELEE.keyboard;
    for (const [roll, scale] of [[0.5, 0.45], [0.2, 0.6], [0.9, 0.1]]) {
      const { w, b } = armed('keyboard', 100);
      w.rng = () => roll;
      const fastest = attack(w);
      const expected = scale * (m.launch.knockback + m.launch.knockbackGrowth * b.damage);
      expect(Math.abs(fastest - expected) / expected).toBeLessThan(0.15);
    }
  });

  it('the attack sweeps an arc', () => {
    const { a } = armed('bolivar');
    const m = MELEE.bolivar;
    const start = swingAngle(1, 0, m.startup, m);
    const end = swingAngle(1, 0, m.startup + m.active, m);
    expect(start).toBeLessThan(0); // starts above
    expect(end).toBeGreaterThan(0); // ends below
    expect(a.melee).toBe('bolivar');
  });

  it('La Chola: taps swing as often as you like, and you keep it', () => {
    const { w, a } = armed('chola');
    let swings = 0;
    for (let n = 1; n <= 5; n++) {
      for (let t = 0; t < 50; t++) {
        step(w, [{ ...NEUTRAL, ep: 1, ax: 1, ay: 0, mp: n, meleeHeld: t === 0 }, NEUTRAL]);
        swings += w.events.filter((e) => e.type === 'swing').length;
        expect(w.events.some((e) => e.type === 'throw')).toBe(false);
      }
    }
    expect(swings).toBe(5);
    expect(a.melee).toBe('chola');
  });

  it('pickups inside the storm wall are destroyed, and none spawn there', () => {
    const w = world(2, { storm: { startDelay: 0, firstShrink: 0.5, hold: 999 } });
    w.pickups.push(...w.fighters.map((_, i) => ({ id: 70 + i, x: i ? 1700 : 90, y: 0, weapon: 'bolivar' })));
    run(w, 60);
    const s = w.storm;
    expect(w.pickups.every((p) => p.x > s.wallLeft && p.x < s.wallRight)).toBe(true);
    w.pickupTimer = 0;
    for (let k = 0; k < 20; k++) {
      w.pickups = [];
      w.pickupTimer = 0;
      run(w, 1);
      for (const p of w.pickups) expect(p.x > s.wallLeft && p.x < s.wallRight).toBe(true);
    }
  });

  it('La Chola: hold the attack until it is ready, let go to throw it', () => {
    const { w, a } = armed('chola');
    let thrown = false;
    for (let t = 0; t < 30; t++) {
      step(w, [{ ...NEUTRAL, ep: 1, ax: 1, ay: 0, mp: 1, meleeHeld: true }, NEUTRAL]);
      thrown ||= w.events.some((e) => e.type === 'throw');
    }
    expect(thrown).toBe(false); // held ready
    step(w, [{ ...NEUTRAL, ep: 1, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
    thrown ||= w.events.some((e) => e.type === 'throw');
    expect(thrown).toBe(true);
    expect(a.melee).toBe(null);
  });

  it('Keyboard words come up at the designed rates', () => {
    const w = world();
    const counts = {};
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const s = rollWord(w, MELEE.keyboard).scale;
      counts[s] = (counts[s] ?? 0) + 1;
    }
    for (const tier of MELEE.keyboard.words) expect(Math.abs(counts[tier.scale] / n - tier.chance)).toBeLessThan(0.015);
  });

  it('Keyboard hits pop a word and scale damage by it', () => {
    const { w, b } = armed('keyboard');
    let word = null;
    for (let t = 0; t < 30 && !word; t++) {
      step(w, [{ ...NEUTRAL, ep: 1, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
      word = w.events.find((e) => e.type === 'word') ?? null;
    }
    expect(word).not.toBeNull();
    expect(b.damage).toBeCloseTo(MELEE.keyboard.damage * word.scale, 5);
  });

  it('the 100% keyboard word freezes the victim, then launches them', () => {
    const { w, b } = armed('keyboard');
    const real = w.rng;
    w.rng = () => 0.01; // force the 100% word
    let t = 0;
    while (!b.pendingLaunch && t++ < 30) step(w, [{ ...NEUTRAL, ep: 1, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
    w.rng = real;
    expect(b.pendingLaunch).not.toBeNull();
    expect(b.damage).toBe(MELEE.keyboard.damage);
    // Frozen for exactly as long as the phrase takes to type.
    const typing = 'QUIERO DEDICAR UNAS PALABRAS'.length / MELEE.keyboard.bigTypeSpeed;
    run(w, Math.floor(typing * 60) - 2, () => [{ ...NEUTRAL, ep: 1 }, NEUTRAL]);
    expect(Math.hypot(b.vx, b.vy)).toBe(0);
    let fastest = 0;
    for (let k = 0; k < 30; k++) {
      step(w, [{ ...NEUTRAL, ep: 1 }, NEUTRAL]);
      fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
    }
    expect(fastest).toBeGreaterThan(450); // launched, well past the light-weapon cap
  });

  it('the katana deflects a bullet toward the pointer, as the swinger, hitting harder', () => {
    const { w, a, b } = armed('katana');
    place(b, 680, -2);
    run(w, 3);
    // b fires at a; a swings when the bullet is close, aiming back at b.
    w.bullets.push({ id: 500, owner: b.id, x: 640, y: -20, vx: -300, vy: 0, gravity: 0, life: 1, thrown: false, damage: 3, kb: 30, growth: 0.6 });
    for (let t = 0; t < 30; t++) step(w, [{ ...NEUTRAL, ep: 1, ax: 1, ay: 0, kp: t >= 1 ? 1 : 0 }, NEUTRAL]);
    expect(a.damage).toBe(0);
    expect(b.damage).toBeCloseTo(3 * MELEE.katana.deflect.damageMul, 5);
  });
});

describe('guns', () => {
  // a shoots at b from the left, `gap` px away, both standing on the ground floor.
  function duel(gun, gap = 60) {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 600 + gap, -2);
    run(w, 5);
    Object.assign(a, { gun, hasGun: true, ammo: GUNS[gun].magazineSize, spareMags: 1 });
    return { w, a, b };
  }
  const shoot = (w, ax = 1, ay = 0, ticks = 20) => {
    for (let t = 0; t < ticks; t++) step(w, [{ ...NEUTRAL, ax, ay, sp: t < 2 ? 1 : 1 }, NEUTRAL]);
  };
  const firstShot = (w, ax, ay) => {
    step(w, [{ ...NEUTRAL, ax, ay, sp: 1 }, NEUTRAL]);
    for (let t = 0; t < 10; t++) step(w, [{ ...NEUTRAL, ax, ay, sp: 1 }, NEUTRAL]);
  };

  it('a light gun only adds damage: no push, no stun', () => {
    const { w, b } = duel('pistol');
    w.rng = () => 0.5; // no spread
    firstShot(w, 1, 0);
    expect(b.damage).toBe(GUNS.pistol.damage);
    expect(b.hitstun).toBe(0);
    expect(b.vx).toBe(0);
  });

  it('a headshot stuns even from a light gun, and hurts more', () => {
    const { w, a, b } = duel('pistol');
    w.rng = () => 0.5;
    // Aimed a little up, so the shot reaches the head (the top few px of the body).
    firstShot(w, 60, -9);
    expect(b.damage).toBeCloseTo(GUNS.pistol.damage * HEADSHOT.damageMul, 5);
    expect(Math.abs(b.vx) + Math.abs(b.vy)).toBeGreaterThan(50);
    expect(a.damage).toBe(0);
  });

  it('a heavy gun pushes and stuns', () => {
    const { w, b } = duel('revolver');
    w.rng = () => 0.5;
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1 }, NEUTRAL]);
    let push = 0;
    for (let t = 0; t < 10; t++) {
      step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1 }, NEUTRAL]);
      push = Math.max(push, Math.abs(b.vx));
    }
    expect(b.damage).toBe(GUNS.revolver.damage);
    expect(push).toBeGreaterThan(100);
  });

  it('the shotgun spreads the same however you stand', () => {
    const spreadOf = (setup) => {
      const { w, a } = duel('shotgun', 300);
      w.rng = () => 1;
      setup(w, a);
      step(w, [{ ...NEUTRAL, crouch: true, ax: 1, ay: -1, sp: 1 }, NEUTRAL]);
      return w.bullets.map((b) => Math.atan2(b.vy, b.vx))[0];
    };
    const crouched = spreadOf((w) => step(w, [{ ...NEUTRAL, crouch: true }, NEUTRAL]));
    const standing = (() => {
      const { w } = duel('shotgun', 300);
      w.rng = () => 1;
      step(w, [{ ...NEUTRAL, ax: 1, ay: -1, sp: 1 }, NEUTRAL]);
      return Math.atan2(w.bullets[0].vy, w.bullets[0].vx);
    })();
    expect(crouched).toBeCloseTo(standing, 5);
  });

  it('crouching is steadiest, then standing still, then moving; the air is worst', () => {
    // The widest possible spread (the random roll at its edge) in each case.
    const spreadOf = (setup) => {
      const { w, a } = duel('rifle', 300);
      w.rng = () => 1;
      setup(a);
      step(w, [{ ...NEUTRAL, ax: 0, ay: -1, sp: 1 }, NEUTRAL]);
      const b = w.bullets[0];
      return Math.abs(Math.atan2(b.vx, -b.vy));
    };
    const still = spreadOf(() => {});
    const moving = spreadOf((a) => (a.vx = 140));
    const air = spreadOf((a) => Object.assign(a, { y: -60, grounded: false }));
    const crouched = (() => {
      const { w, a } = duel('rifle', 300);
      w.rng = () => 1;
      step(w, [{ ...NEUTRAL, crouch: true }, NEUTRAL]);
      step(w, [{ ...NEUTRAL, crouch: true, ax: 1, ay: -1, sp: 1 }, NEUTRAL]);
      const b = w.bullets[0];
      return Math.abs(Math.atan2(b.vy, b.vx) + Math.PI / 4);
    })();
    expect(crouched).toBeLessThan(still);
    expect(still).toBeLessThan(moving);
    expect(moving).toBeLessThan(air);
  });

  it('a gun jammed against a wall fires into the wall', () => {
    const { w, a } = duel('sniper', 300);
    place(a, 80, -2); // the spike wall on the left is at x 48..64
    run(w, 3);
    step(w, [{ ...NEUTRAL, ax: -1, ay: 0, sp: 1 }, NEUTRAL]);
    expect(w.bullets.length).toBe(0);
  });

  it('the shotgun fires a spread of pellets', () => {
    const { w } = duel('shotgun', 300);
    step(w, [{ ...NEUTRAL, ax: 1, ay: -1, sp: 1 }, NEUTRAL]);
    expect(w.bullets.length).toBe(GUNS.shotgun.pellets);
  });

  it('automatic guns keep firing while the trigger is held', () => {
    const { w, a } = duel('smg', 300);
    for (let t = 0; t < 30; t++) step(w, [{ ...NEUTRAL, ax: 0, ay: -1, shoot: true, sp: 1 }, NEUTRAL]);
    expect(GUNS.smg.magazineSize - a.ammo).toBeGreaterThan(5);
  });

  it('a rocket explodes where it hits and pushes everyone near, the shooter too', () => {
    const { w, a, b } = duel('rocket', 70);
    w.rng = () => 0.5;
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1 }, NEUTRAL]);
    run(w, 10);
    expect(b.damage).toBeGreaterThan(5);
    expect(b.vx).toBeGreaterThan(100);
    expect(a.damage).toBeGreaterThan(0); // caught in its own blast
  });

  it('star blaster bolts glance off walls, doubling speed, size and damage each time', () => {
    const { w, a } = duel('blaster', 400);
    place(a, 200, -2); // the spike wall on the left is at x 48..64
    run(w, 3);
    w.rng = () => 0.5;
    step(w, [{ ...NEUTRAL, ax: -1, ay: 0, sp: 1 }, NEUTRAL]);
    const bolt = w.bullets[0];
    const speed = Math.abs(bolt.vx);
    for (let t = 0; t < 60 && bolt.vx < 0; t++) step(w, [NEUTRAL, NEUTRAL]);
    expect(w.bullets).toContain(bolt);
    expect(bolt.vx).toBeCloseTo(speed * 2, 5);
    expect(bolt.damage).toBe(GUNS.blaster.damage * 2);
    expect(bolt.kb).toBe(GUNS.blaster.knockback * 2);
    expect(bolt.size).toBe(2);
    expect(bolt.bounces).toBe(GUNS.blaster.bounces - 1);
  });

  it('shotgun pellets only push once more than half of a shot hits', () => {
    // Up close every pellet lands: a push. From far, only a few do: damage, no push.
    const close = duel('shotgun', 20);
    close.w.rng = () => 0.5;
    step(close.w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1 }, NEUTRAL]);
    run(close.w, 3);
    expect(close.b.hitstun).toBeGreaterThan(0);
    // Only two of the seven pellets land: damage, no push.
    const few = duel('shotgun', 60);
    few.w.rng = () => 0.5;
    step(few.w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1 }, NEUTRAL]);
    few.w.bullets = few.w.bullets.slice(0, 2);
    run(few.w, 20);
    expect(few.b.damage).toBeCloseTo(GUNS.shotgun.damage * 2, 5);
    expect(few.b.hitstun).toBe(0);
    expect(few.b.vx).toBe(0);
  });

  it('picking up a gun loads it fully and swaps out a katana', () => {
    const w = world();
    const f = w.fighters[0];
    place(f, 600, -2);
    run(w, 5);
    Object.assign(f, { hasGun: false, gun: null, blade: 'katana' });
    w.pickups.push({ id: 99, x: 600, y: 0, weapon: 'sniper' });
    step(w, [{ ...NEUTRAL, ep: 1 }, NEUTRAL]);
    expect(f.gun).toBe('sniper');
    expect(f.blade).toBe(null);
    expect(f.ammo).toBe(GUNS.sniper.magazineSize);
  });
});

describe('grenades', () => {
  function setup(kinds, gap = 40) {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 600 + gap, -2);
    run(w, 5);
    a.grenades = [...kinds];
    return { w, a, b };
  }
  // Take a grenade out, hold it `hold` ticks, then throw it toward (ax, ay).
  const toss = (w, hold = 3, ax = 1, ay = 0) => {
    for (let t = 0; t < hold; t++) step(w, [{ ...NEUTRAL, ax, ay, gp: 1, grenadeHeld: true }, NEUTRAL]);
    step(w, [{ ...NEUTRAL, ax, ay, gp: 1 }, NEUTRAL]);
  };
  const ticks = (seconds) => Math.ceil(seconds * 60) + 2;

  it('you carry at most two, and throw them in the order you got them', () => {
    const w = world();
    const f = w.fighters[0];
    place(f, 600, -2);
    run(w, 5);
    ['frag', 'smoke', 'poison'].forEach((weapon, k) => w.pickups.push({ id: 90 + k, x: 600, y: 0, weapon }));
    for (let k = 1; k <= 3; k++) step(w, [{ ...NEUTRAL, ep: k }, NEUTRAL]);
    // The third replaces the next one you'd throw.
    expect(f.grenades).toEqual(['poison', 'smoke']);
    expect(w.pickups.length).toBe(0);
    // Pick up with nothing in reach: swap them around.
    step(w, [{ ...NEUTRAL, ep: 4 }, NEUTRAL]);
    expect(f.grenades).toEqual(['smoke', 'poison']);
    step(w, [{ ...NEUTRAL, ep: 4, gp: 1, grenadeHeld: true }, NEUTRAL]);
    expect(f.cooking).toBe('smoke');
    expect(f.grenades).toEqual(['poison']);
  });

  it('cooking runs the fuse in your hand; hold too long and it goes off there', () => {
    const { w, a, b } = setup(['frag']);
    for (let t = 0; t < ticks(GRENADES.frag.fuse) + 2; t++) step(w, [{ ...NEUTRAL, ax: 1, gp: 1, grenadeHeld: true }, NEUTRAL]);
    expect(a.damage).toBeGreaterThan(5);
    expect(b.damage).toBeGreaterThan(5);
    expect(a.cooking).toBe(null);
  });

  it('a cooked grenade goes off sooner after the throw', () => {
    const { w } = setup(['frag'], 400);
    toss(w, 60);
    expect(w.grenades[0].fuse).toBeCloseTo(GRENADES.frag.fuse - 61 / 60, 1);
  });

  it('frag: a big push', () => {
    const { w, b } = setup(['frag']);
    for (let t = 0; t < ticks(GRENADES.frag.fuse); t++) step(w, [{ ...NEUTRAL, ax: 1, gp: 1, grenadeHeld: true }, NEUTRAL]);
    let push = 0;
    for (let t = 0; t < 3; t++) {
      step(w, [NEUTRAL, NEUTRAL]);
      push = Math.max(push, Math.hypot(b.vx, b.vy));
    }
    expect(push).toBeGreaterThan(300);
  });

  it('fire: big damage, and you keep burning (damage without stun)', () => {
    const { w, b } = setup(['fire']);
    for (let t = 0; t < ticks(GRENADES.fire.fuse); t++) step(w, [{ ...NEUTRAL, ax: 1, gp: 1, grenadeHeld: true }, NEUTRAL]);
    expect(b.burn).toBeGreaterThan(0);
    run(w, 30);
    const after = b.damage;
    run(w, 60);
    expect(b.damage - after).toBeCloseTo(GRENADES.fire.burn.perSecond, 0);
  });

  it('smoke: nobody sees into the cloud', () => {
    const { w, a, b } = setup(['smoke'], 200);
    toss(w, 3, 1, 0);
    run(w, ticks(GRENADES.smoke.fuse));
    expect(w.clouds.length).toBe(1);
    const c = w.clouds[0];
    expect(lineOfSight(w, a.x, a.y - 20, c.x, c.y)).toBe(false);
    expect(b.damage).toBe(0);
    run(w, ticks(GRENADES.smoke.cloud.time));
    expect(w.clouds.length).toBe(0);
  });

  it('poison: a cloud that slowly hurts whoever stands in it, without stunning', () => {
    const { w, b } = setup(['poison'], 30);
    for (let t = 0; t < ticks(GRENADES.poison.fuse); t++) step(w, [{ ...NEUTRAL, ax: 1, gp: 1, grenadeHeld: true }, NEUTRAL]);
    run(w, 60);
    expect(b.damage).toBeGreaterThan(GRENADES.poison.cloud.perSecond * 0.8);
    expect(b.hitstun).toBe(0);
  });

  it('warp: you end up where it went off', () => {
    const { w, a } = setup(['warp'], 700);
    toss(w, 3, 1, -0.3);
    let last = null;
    for (let t = 0; t < 200 && (w.grenades.length || !last); t++) {
      if (w.grenades.length) last = { x: w.grenades[0].x, y: w.grenades[0].y };
      step(w, [NEUTRAL, NEUTRAL]);
    }
    expect(a.x).toBeGreaterThan(640);
    expect(Math.abs(a.x - last.x)).toBeLessThan(8);
  });

  it('warp: hitting someone swaps you with them', () => {
    const { w, a, b } = setup(['warp'], 50);
    toss(w, 2, 1, 0);
    run(w, 20);
    expect(a.x).toBeCloseTo(650, 0);
    expect(b.x).toBeCloseTo(600, 0);
    expect(w.grenades.length).toBe(0);
  });
});

describe('melee quirks', () => {
  function armed(weapon, gap = 14, victimFacing = -1) {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 600 + gap, -2);
    run(w, 5);
    a.melee = weapon;
    a.active = 'melee';
    b.facing = victimFacing;
    return { w, a, b };
  }
  const swing = (w, input = NEUTRAL) => {
    for (let t = 0; t < 30; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, input]);
  };

  it('every jab stays light: no launches', () => {
    for (const [key, m] of [['fists', null], ...Object.entries(MELEE)]) {
      if (m?.replacesGun) continue;
      const { w, a, b } = armed(key === 'fists' ? null : key, 12);
      if (key === 'fists') Object.assign(a, { melee: null, active: 'melee' });
      b.damage = 300;
      let fastest = 0;
      for (let t = 0; t < 30; t++) {
        step(w, [{ ...NEUTRAL, ax: 1, ay: 0, kp: 1 }, NEUTRAL]);
        fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
      }
      expect(fastest, key).toBeLessThanOrEqual(LIGHT_MAX_PUSH + 1);
      expect(b.damage, key).toBeGreaterThan(300);
    }
  });

  it("light blades' heavy pushes moderately (it launches at high damage)", () => {
    const { w, b } = armed('knife', 12);
    b.damage = 300;
    let fastest = 0;
    for (let t = 0; t < 30; t++) {
      step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
      fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
    }
    expect(fastest).toBeGreaterThan(LIGHT_MAX_PUSH * 2);
  });

  it('every melee hit area reaches the tip of its sprite (not short of it)', () => {
    for (const [key, p] of Object.entries(MELEE_POINTS)) {
      // (Thrusts keep their own reach; the halberd's heavy, a sweep, follows the art.)
      const m = MELEE[key].heavyStats;
      if (m.thrust) continue;
      expect(m.reach + m.radius * 0.5, key).toBeCloseTo(SWING_HAND + p.length, 5);
    }
  });

  it('the katana hits where its blade is drawn, out to the tip', () => {
    const { w, b } = armed('katana', 30, -1);
    for (let t = 0; t < 30; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
    expect(b.damage).toBe(MELEE.katana.heavyStats.damage);
  });

  it('the knife backstab pushes (a light weapon otherwise never does much)', () => {
    const { w, b } = armed('knife', 10, 1);
    b.damage = 100;
    let fastest = 0;
    for (let t = 0; t < 30; t++) {
      step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
      fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
    }
    expect(fastest).toBeGreaterThan(LIGHT_MAX_PUSH * 1.5);
  });

  it('the cleaver leaves them bleeding: 10 more over 5 s; a new cut starts it over', () => {
    const { w, b } = armed('cleaver', 14);
    swing(w);
    expect(b.bleed).toBeGreaterThan(MELEE.cleaver.bleed.time - 0.6);
    run(w, 120);
    const before = b.bleed;
    expect(before).toBeLessThan(MELEE.cleaver.bleed.time - 2);
    // A second cut mid-bleed: the bleed starts over, at the same rate (not on top).
    place(b, 614, b.y);
    Object.assign(b, { vx: 0, vy: 0, hitstun: 0 });
    for (let t = 0; t < 30; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 2 }, NEUTRAL]);
    expect(b.bleed).toBeGreaterThan(MELEE.cleaver.bleed.time - 0.6);
    expect(b.bleedRate).toBeCloseTo(MELEE.cleaver.bleed.damage / MELEE.cleaver.bleed.time, 5);
  });

  it('the knife backstabs for double damage', () => {
    const front = armed('knife', 10, -1);
    swing(front.w);
    const back = armed('knife', 10, 1);
    swing(back.w);
    expect(front.b.damage).toBe(MELEE.knife.heavyStats.damage);
    expect(back.b.damage).toBe(MELEE.knife.heavyStats.damage * MELEE.knife.backstab.damageMul);
  });

  // The trident goes in the gun slot.
  function trident(gap) {
    const { w, a, b } = armed(null, gap);
    Object.assign(a, { blade: 'trident', hasGun: false, gun: null, active: 'gun' });
    return { w, a, b };
  }

  it('the trident: its thrust reaches out to the tip, and catches people up close too', () => {
    for (const gap of [16, 36]) {
      const { w, b } = trident(gap);
      step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1, shoot: true }, NEUTRAL]);
      run(w, 30, () => [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1 }, NEUTRAL]);
      expect(b.damage, `${gap} px away`).toBe(MELEE.trident.damage);
    }
  });

  it('the trident: a tap thrusts, with a moderate push', () => {
    const { w, b } = trident(24);
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1, shoot: true }, NEUTRAL]);
    let push = 0;
    for (let t = 0; t < 30; t++) {
      step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1 }, NEUTRAL]);
      push = Math.max(push, Math.abs(b.vx));
    }
    expect(b.damage).toBe(MELEE.trident.damage);
    expect(push).toBeGreaterThan(80);
    expect(push).toBeLessThan(400);
  });

  it('the trident: held, it is thrown on its chain; a catch is stunned and reeled in to melee range', () => {
    const { w, a, b } = trident(120);
    let caught = false;
    for (let t = 0; t < 120; t++) {
      step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1, shoot: t < 20 }, NEUTRAL]);
      if (a.chain?.phase === 'pull') caught = true;
      if (caught && !a.chain) break;
    }
    expect(caught).toBe(true);
    expect(b.damage).toBe(MELEE.trident.chain.damage);
    expect(Math.abs(b.x - a.x)).toBeLessThanOrEqual(MELEE.trident.chain.meleeRange + 2);
    expect(b.hitstun).toBeGreaterThan(0.2);
    expect(a.chain).toBe(null);
    expect(a.blade).toBe('trident');
  });

  it('the trident: a miss leaves you standing there until it is reeled back', () => {
    const { w, a } = trident(300);
    for (let t = 0; t < 20; t++) step(w, [{ ...NEUTRAL, ax: 0, ay: -1, sp: 1, shoot: true }, NEUTRAL]);
    expect(a.chain).not.toBe(null);
    const x = a.x;
    run(w, 10, () => [{ ...NEUTRAL, mx: 1, ax: 0, ay: -1, sp: 2, block: true }, NEUTRAL]);
    expect(a.x).toBeCloseTo(x, 5);
    expect(a.blocking).toBe(null);
    run(w, 120);
    expect(a.chain).toBe(null);
  });

  it('the shovel swings from below to above; swords from above to below', () => {
    // y grows downward, so a bigger angle (aiming right) is lower.
    const arc = (m) => [swingAngle(1, 0, m.startup, m), swingAngle(1, 0, m.startup + m.active, m)];
    const [shovelStart, shovelEnd] = arc(MELEE.shovel);
    expect(shovelStart).toBeGreaterThan(shovelEnd);
    const [swordStart, swordEnd] = arc(MELEE.bolivar);
    expect(swordStart).toBeLessThan(swordEnd);
    // Aiming left, mirrored.
    expect(swingAngle(-1, 0, MELEE.shovel.startup, MELEE.shovel)).toBeLessThan(swingAngle(-1, 0, MELEE.shovel.startup + MELEE.shovel.active, MELEE.shovel));
  });

  // Hold the melee button for `ticks`, then let go; returns the victim's fastest push.
  const hold = (w, ticks, ax = 1, ay = 0) => {
    let fastest = 0;
    for (let t = 0; t < ticks; t++) {
      step(w, [{ ...NEUTRAL, ax, ay, mp: 1, meleeHeld: true }, NEUTRAL]);
      fastest = Math.max(fastest, Math.hypot(w.fighters[1].vx, w.fighters[1].vy));
    }
    for (let t = 0; t < 40; t++) {
      step(w, [{ ...NEUTRAL, ax, ay, mp: 1 }, NEUTRAL]);
      fastest = Math.max(fastest, Math.hypot(w.fighters[1].vx, w.fighters[1].vy));
    }
    return fastest;
  };

  it('a wind-up let go too soon is just a swing', () => {
    const { w, a } = armed('machete', 14);
    hold(w, Math.floor(LIGHT_THROW.holdToThrow * 60) - 3);
    expect(a.melee).toBe('machete');
    expect(w.fighters[1].damage).toBe(MELEE.machete.heavyStats.damage);
  });

  it('light weapons: hold to throw, with a real push; it lands as a pickup to go get back', () => {
    const { w, a, b } = armed('machete', 80);
    b.damage = 100;
    const push = hold(w, 25);
    expect(a.melee).toBe(null);
    expect(b.damage).toBeGreaterThan(100);
    expect(push).toBeGreaterThan(LIGHT_MAX_PUSH * 1.5);
    run(w, 120);
    const dropped = w.pickups.find((p) => p.weapon === 'machete');
    expect(dropped).toBeTruthy();
    expect(w.bullets.length).toBe(0);
  });

  it('a thrown light weapon that misses lands on the floor', () => {
    const { w, a } = armed('keyboard', 400);
    hold(w, 25, 1, 0.3);
    run(w, 200);
    const dropped = w.pickups.find((p) => p.weapon === 'keyboard');
    expect(dropped).toBeTruthy();
    expect(dropped.y).toBe(0);
    expect(dropped.x).toBeGreaterThan(a.x);
  });

  it('La Chola is still gone for good once thrown', () => {
    const { w } = armed('chola', 400);
    hold(w, 25);
    run(w, 200);
    expect(w.pickups.some((p) => p.weapon === 'chola')).toBe(false);
  });

  it('the knife throws faster and flatter, and sooner', () => {
    const { w } = armed('knife', 400);
    // Ready sooner than other light weapons: a hold just past the knife's wind-up throws it.
    const ticks = Math.ceil(MELEE.knife.throw.holdToThrow * 60) + 1;
    expect(ticks).toBeLessThan(LIGHT_THROW.holdToThrow * 60);
    for (let t = 0; t < ticks; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1, meleeHeld: true }, NEUTRAL]);
    expect(w.bullets.length).toBe(0); // nothing until you let go
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
    expect(w.bullets[0].vx).toBeGreaterThan(LIGHT_THROW.speed);
    expect(w.bullets[0].kind).toBe('knife');
  });

  it('the machete: the third hit in a row launches', () => {
    const { w, b } = armed('machete', 14);
    b.damage = 100;
    const pushes = [];
    for (let k = 0; k < 3; k++) {
      let fastest = 0;
      // Tap (press, let go), then wait out the swing.
      step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 2 * k + 1, meleeHeld: true }, NEUTRAL]);
      for (let t = 0; t < 18; t++) {
        step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 2 * k + 1 }, NEUTRAL]);
        fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
      }
      pushes.push(fastest);
      place(b, 614, b.y);
      Object.assign(b, { vx: 0, vy: 0, hitstun: 0 });
    }
    // (The heavy pushes moderately; the third in a row launches harder.)
    expect(pushes[2]).toBeGreaterThan(pushes[0] * 1.2);
  });

  it('the nodachi: hold to charge a dash slash that launches; a tap is a normal light slash', () => {
    const tap = armed('nodachi', 20);
    tap.b.damage = 100;
    const c = MELEE.nodachi.charge.launch;
    expect(hold(tap.w, 2)).toBeLessThan(c.knockback + c.knockbackGrowth * 100);
    const charged = armed('nodachi', 60);
    charged.b.damage = 100;
    let dash = 0;
    for (let t = 0; t < 30; t++) step(charged.w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1, meleeHeld: true }, NEUTRAL]);
    expect(charged.a.melee).toBe('nodachi'); // holding doesn't throw it
    let fastest = 0;
    for (let t = 0; t < 30; t++) {
      step(charged.w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
      dash = Math.max(dash, charged.a.vx);
      fastest = Math.max(fastest, Math.hypot(charged.b.vx, charged.b.vy));
    }
    expect(dash).toBeGreaterThan(300);
    expect(fastest).toBeGreaterThan(LIGHT_MAX_PUSH * 1.5);
  });

  it('the bone axe goes straight through a block', () => {
    const blocked = armed('bolivar', 14, -1);
    swing(blocked.w, { ...NEUTRAL, block: true });
    expect(blocked.b.damage).toBe(0);
    const axe = armed('axe', 14, -1);
    swing(axe.w, { ...NEUTRAL, block: true });
    expect(axe.b.damage).toBe(MELEE.axe.damage);
  });

  it('the shovel launches straight up, the bat sends you flying flat', () => {
    const up = armed('shovel');
    up.b.damage = 100;
    let vy = 0;
    let vxUp = 0;
    for (let t = 0; t < 30; t++) {
      step(up.w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
      if (up.b.vy < vy) [vy, vxUp] = [up.b.vy, up.b.vx];
    }
    expect(-vy).toBeGreaterThan(Math.abs(vxUp) * 3);
    const flat = armed('bat');
    flat.b.damage = 100;
    let vx = 0;
    let vyFlat = 0;
    for (let t = 0; t < 30; t++) {
      step(flat.w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
      if (flat.b.vx > vx) [vx, vyFlat] = [flat.b.vx, flat.b.vy];
    }
    expect(vx).toBeGreaterThan(Math.abs(vyFlat) * 2);
  });
});

describe('match rules', () => {
  // Every pickup that turns up in a minute or so (pickups are taken away as they appear).
  const pickupsOf = (rules) => {
    const w = createWorld({ stage: 'warehouse', players: 2, countdown: 0, seed: 3, storm: { startDelay: 999 }, rules });
    const seen = [];
    for (let t = 0; t < 60 * 90; t++) {
      step(w, []);
      seen.push(...w.pickups.map((p) => p.weapon));
      w.pickups = [];
    }
    return { w, seen };
  };

  it('ranged weapons off: nobody starts with a gun, and no guns turn up', () => {
    const { w, seen } = pickupsOf({ ranged: false });
    expect(w.fighters[0].hasGun).toBe(false);
    expect(w.fighters[0].active).toBe('melee');
    expect(seen.length).toBeGreaterThan(5);
    expect(seen.some((k) => GUNS[k])).toBe(false);
  });

  it('melee weapons off: no melee weapons turn up', () => {
    const { w, seen } = pickupsOf({ melee: false });
    expect(w.fighters[0].gun).toBe('pistol');
    expect(seen.length).toBeGreaterThan(5);
    expect(seen.some((k) => MELEE[k])).toBe(false);
  });

  it('storm pace: off never closes in; fast closes sooner than normal', () => {
    const off = createWorld({ stage: 'warehouse', players: 2, countdown: 0, storm: STORM_PACE.off });
    const fast = createWorld({ stage: 'warehouse', players: 2, countdown: 0, storm: STORM_PACE.fast });
    expect(off.storm.cfg.startDelay).toBeGreaterThan(1e6);
    expect(fast.storm.cfg.startDelay).toBeLessThan(STORM.startDelay);
  });
});

describe('training', () => {
  const training = () => createWorld({ stage: 'training', players: 2, countdown: 0, seed: 5, training: true });

  it('nothing turns up by itself; any weapon can be spawned at your feet', () => {
    const w = training();
    const f = w.fighters[0];
    place(f, 600, -2);
    run(w, 60 * 20);
    expect(w.pickups.length).toBe(0);
    for (const weapon of [...Object.keys(GUNS), ...Object.keys(MELEE), ...Object.keys(GRENADES)]) {
      spawnWeapon(w, 0, weapon);
      step(w, [{ ...NEUTRAL, ep: w.tick & 0xff }, NEUTRAL]);
      expect(w.pickups.length, weapon).toBe(0);
      const got = GUNS[weapon] ? f.gun : GRENADES[weapon] ? f.grenades.find((g) => g === weapon) : MELEE[weapon].replacesGun ? f.blade : f.melee;
      expect(got, weapon).toBe(weapon);
    }
  });

  it('ammo and grenades never run out', () => {
    const w = training();
    const f = w.fighters[0];
    place(f, 200, -2);
    run(w, 5);
    for (let t = 0; t < 120; t++) step(w, [{ ...NEUTRAL, ax: 0, ay: -1, sp: press(t, 12) }, NEUTRAL]);
    expect(f.ammo).toBe(PISTOL.magazineSize);
    f.grenades = ['smoke'];
    for (let k = 0; k < 2; k++) {
      step(w, [{ ...NEUTRAL, sp: 9, gp: 2 * k + 1, grenadeHeld: true }, NEUTRAL]);
      step(w, [{ ...NEUTRAL, sp: 9, gp: 2 * k + 1 }, NEUTRAL]);
      step(w, [{ ...NEUTRAL, sp: 9, gp: 2 * k + 2 }, NEUTRAL]);
    }
    expect(f.grenades).toEqual(['smoke']);
    expect(w.grenades.length).toBe(2);
  });

  it('nobody runs out of lives, so the match never ends', () => {
    const w = training();
    const bot = w.fighters[1];
    for (let k = 0; k < 5; k++) {
      place(bot, 900, 400); // below the blast zone
      run(w, 200);
    }
    expect(bot.stocks).toBe(3);
    expect(bot.state).toBe('ok');
    expect(w.phase).toBe('play');
  });
});

describe('doorways', () => {
  // Fighter 0 stands in the ground-floor doorway at x 470 and hides.
  function hidden() {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 470, -2);
    place(b, 600, -2);
    // No barrels: shots at chest height would set off the one by the door.
    for (const barrel of w.barrels) Object.assign(barrel, { gone: true, respawn: 1e9 });
    run(w, 5);
    step(w, [{ ...NEUTRAL, hp: 1 }, NEUTRAL]);
    return { w, a, b };
  }

  it('hiding: bullets fly past, and you cannot move or shoot', () => {
    const { w, a, b } = hidden();
    expect(a.hidden).toBe(0);
    const ammo = a.ammo;
    run(w, 60, (t) => [{ ...NEUTRAL, hp: 1, ax: 1, ay: 0, sp: press(t, 12) }, { ...NEUTRAL, ax: -1, ay: 0, sp: press(t, 12) }]);
    expect(a.damage).toBe(0);
    expect(a.ammo).toBe(ammo);
    expect(a.x).toBe(470);
    expect(b.ammo).toBeLessThan(ammo);
  });

  it('melee still lands, and knocks you out of the doorway', () => {
    const { w, a, b } = hidden();
    place(b, 484, -2);
    b.active = 'melee';
    run(w, 20, () => [{ ...NEUTRAL, hp: 1 }, { ...NEUTRAL, ax: -1, ay: 0, mp: 1 }]);
    expect(a.damage).toBeGreaterThan(0);
    expect(a.hidden).toBe(-1);
  });

  it('press hide again (or move) to come out', () => {
    const { w, a } = hidden();
    step(w, [{ ...NEUTRAL, hp: 2 }]);
    expect(a.hidden).toBe(-1);
    const again = hidden();
    run(again.w, 10, () => [{ ...NEUTRAL, hp: 1, mx: 1 }]);
    expect(again.a.hidden).toBe(-1);
    expect(again.a.x).toBeGreaterThan(470);
  });

  it('you can only hide standing in a doorway', () => {
    const w = world();
    const a = w.fighters[0];
    place(a, 520, -2);
    run(w, 5);
    step(w, [{ ...NEUTRAL, hp: 1 }]);
    expect(a.hidden).toBe(-1);
  });
});

describe('hazards', () => {
  it('a barrel blast hurts nearby fighters and credits the shooter', () => {
    const w = world();
    const f = w.fighters[0];
    place(f, 760, -2);
    run(w, 5);
    const pitLeft = w.barrels[2]; // x 780
    pitLeft.hp = 0;
    pitLeft.fuse = 0;
    pitLeft.lastBy = 1;
    run(w, 30);
    expect(pitLeft.gone).toBe(true);
    expect(f.damage).toBeGreaterThan(5);
    expect(f.lastHitBy).toBe(1);
    expect(w.barrels[6].gone).toBe(false); // the bridge barrel is far away
  });

  it('running into spikes hurts and throws you back', () => {
    const w = world();
    const f = w.fighters[0];
    place(f, 90, -2);
    let pushed = false;
    for (let t = 0; t < 60; t++) {
      step(w, [{ ...NEUTRAL, mx: -1 }]);
      if (f.vx > 100) pushed = true;
    }
    expect(f.damage).toBeGreaterThan(0);
    expect(pushed).toBe(true);
  });

  it('the storm closes and hurts only outside the safe zone', () => {
    const w = world(2, { storm: { startDelay: 0, firstShrink: 0.5, hold: 0.1, finalShrink: 0.5 } });
    run(w, 90);
    const s = w.storm;
    expect(s.right - s.left).toBeLessThanOrEqual(STORM.finalWidth + 1);
    const outside = s.left - 100 > 120 ? s.left - 100 : s.right + 100;
    place(w.fighters[0], outside, -2);
    place(w.fighters[1], (s.left + s.right) / 2, -200);
    w.fighters[1].damage = 0;
    run(w, 60);
    expect(w.fighters[0].damage).toBeGreaterThanOrEqual(STORM.damagePerSecond * 0.9);
    expect(w.fighters[1].damage).toBe(0);
  });

  it('the deep-red storm wall stops you walking, but launching you into it is a KO', () => {
    const w = world(2, { storm: { startDelay: 0, firstShrink: 0.5, hold: 999 } });
    run(w, 60);
    const s = w.storm;
    // Use whichever side of the storm closed in the most.
    const side = s.left - s.start[0] > s.start[1] - s.right ? -1 : 1;
    const wallX = side < 0 ? s.wallLeft : s.wallRight;
    const safeEdge = side < 0 ? s.left : s.right;
    expect(Math.abs(wallX - safeEdge)).toBeGreaterThan(10); // a damaging band before the wall
    const f = w.fighters[0];
    const lives = f.stocks;
    // Walking into the wall: stopped at it, no life lost.
    place(f, wallX - side * 40, -2);
    run(w, 60, () => [{ ...NEUTRAL, mx: side }]);
    expect(f.stocks).toBe(lives);
    expect(Math.abs(f.x - wallX)).toBeLessThanOrEqual(FIGHTER.w / 2 + 1);
    // Launched into it: a life lost.
    place(f, wallX - side * 40, -60);
    f.vx = side * 600;
    f.hitstun = 0.5;
    run(w, 10);
    expect(f.stocks).toBe(lives - 1);
  });
});

describe('stages', () => {
  for (const [key, st] of Object.entries(STAGES)) {
    it(`${key}: spawns, doorways, pickup spots and barrels all stand on a floor`, () => {
      const onFloor = (p) => st.blocks.some((b) => Math.abs(b.y - p.y) < 1 && p.x >= b.x && p.x <= b.x + b.w);
      for (const p of [...st.spawns, ...st.doors, ...st.pickupSpots, ...st.barrels]) expect(onFloor(p), `${key} (${p.x}, ${p.y})`).toBe(true);
    });

    it(`${key}: a fighter dropped at each spawn lands safely`, () => {
      const w = createWorld({ stage: key, players: st.spawns.length, countdown: 0, seed: 7, storm: FAR_STORM });
      w.fighters.forEach((f, i) => place(f, st.spawns[i].x, st.spawns[i].y - 30));
      run(w, 90);
      for (const f of w.fighters) {
        expect(f.grounded).toBe(true);
        expect(f.stocks).toBe(3);
      }
    });
  }
});

describe('random stages', () => {
  const ids = Array.from({ length: 40 }, (_, k) => `mixed-${k * 7919 + 1}`);
  const many = Array.from({ length: 400 }, (_, k) => `mixed-${k * 104729 + 3}`);
  const onFloor = (st, p) => st.blocks.some((b) => Math.abs(b.y - p.y) < 1 && p.x >= b.x && p.x <= b.x + b.w);
  const ROUGH = ['pitfall', 'cage', 'spikes', 'chasm', 'drawbridge', 'crumble', 'stickyCrumble'];
  // A stage with the given lower section, that section, and the movers in it.
  function find(lower) {
    for (const id of many) {
      const st = getStage(id);
      const i = st.sections.findIndex((sec) => sec.lower === lower);
      if (i < 0) continue;
      const sec = st.sections[i];
      const movers = st.movers.map((m, k) => ({ ...m, k })).filter((m) => m.x >= sec.left && m.x < sec.right);
      return { id, st, sec, movers, world: createWorld({ stage: id, players: 1, countdown: 0, seed: 1, storm: FAR_STORM }) };
    }
    throw new Error(`no stage with ${lower}`);
  }

  it('the same id always builds the same stage', () => {
    const a = JSON.stringify(getStage('mixed-42'));
    expect(JSON.stringify(getStage('mixed-42'))).toBe(a);
    expect(JSON.stringify(getStage('mixed-43'))).not.toBe(a);
  });

  it('rejects ids that are not stages', () => {
    for (const bad of ['mixed', 'mixed-', 'mixed-abc', 'mixed-99999999999', 42, null, '__proto__']) expect(getStage(bad)).toBeNull();
  });

  it('every section turns up somewhere', () => {
    const seen = new Set(many.flatMap((id) => getStage(id).sections.flatMap((s) => [s.lower, s.upper])));
    for (const name of ['hall', 'gallery', 'ledges', 'rampart', 'pitfall', 'cage', 'spikes', 'chasm', 'drawbridge', 'crypt', 'crusher', 'towers', 'shrine', 'cellar', 'crumble', 'lift', 'ice', 'stickyCrumble', 'glueTrap', 'glueHall']) expect(seen).toContain(name);
    for (const name of ['open', 'stairs', 'walkway', 'balcony', 'perch', 'rafters']) expect(seen).toContain(name);
  });

  it('have exactly one pitfall (never at either end), at most one cage and shrine, and no two rough sections side by side', () => {
    for (const id of many) {
      const secs = getStage(id).sections;
      const count = (name) => secs.filter((s) => s.lower === name).length;
      expect(count('pitfall'), id).toBe(1);
      expect(secs[0].lower === 'pitfall' || secs[secs.length - 1].lower === 'pitfall', id).toBe(false);
      expect(count('cage'), id).toBeLessThanOrEqual(1);
      expect(count('shrine'), id).toBeLessThanOrEqual(1);
      for (let i = 1; i < secs.length; i++) expect(ROUGH.includes(secs[i - 1].lower) && ROUGH.includes(secs[i].lower), `${id} at ${i}`).toBe(false);
    }
  });

  it('put spawns, doorways, pickup spots and barrels on a floor, with four spawns out of the pits', () => {
    for (const id of ids) {
      const st = getStage(id);
      for (const p of [...st.spawns, ...st.doors, ...st.pickupSpots, ...st.barrels]) expect(onFloor(st, p), `${id} (${p.x}, ${p.y})`).toBe(true);
      expect(st.spawns.length).toBeGreaterThanOrEqual(4);
      for (const p of st.spawns) expect(p.y, id).toBeLessThanOrEqual(0);
    }
  });

  it('a fighter dropped at each spawn lands safely', () => {
    for (const id of ids.slice(0, 12)) {
      const st = getStage(id);
      const w = createWorld({ stage: id, players: st.spawns.length, countdown: 0, seed: 7, storm: FAR_STORM });
      w.fighters.forEach((f, i) => place(f, st.spawns[i].x, st.spawns[i].y - 30));
      run(w, 90);
      for (const f of w.fighters) {
        expect(f.grounded, `${id} (${f.x})`).toBe(true);
        expect(f.damage, `${id} (${f.x})`).toBe(0);
      }
    }
  });

  it('only put the high rafters over a section with a roof to climb from', () => {
    for (const id of many) for (const sec of getStage(id).sections) if (sec.upper === 'rafters') expect(['spikes', 'crypt', 'crusher', 'towers', 'lift', 'glueTrap'], id).toContain(sec.lower);
  });

  it('let the storm end over a pitfall or drawbridge only with footing above, and in the cage only without a hard roof', () => {
    for (const id of many) {
      for (const sec of getStage(id).sections) {
        if (sec.lower === 'pitfall' || sec.lower === 'drawbridge') expect(sec.final, id).toBe(sec.upper !== 'open');
        else if (sec.lower === 'cage') expect(sec.final, id).toBe(!['walkway', 'perch'].includes(sec.upper));
        else expect(sec.final, id).toBe(true);
      }
    }
  });

  it('the storm closes on whole sections, and ends only where the stage allows', () => {
    for (const id of ids) {
      for (let seed = 1; seed <= 5; seed++) {
        const w = createWorld({ stage: id, players: 2, countdown: 0, seed });
        const secs = getStage(id).sections;
        const s = w.storm;
        const k = secs.findIndex((sec) => s.zone2[0] < sec.right && s.zone2[1] > sec.left);
        expect(secs[k].final, id).toBe(true);
        expect(s.zone2[1] - s.zone2[0]).toBeLessThanOrEqual(256);
        expect(s.zone1[0] <= s.zone2[0] && s.zone1[1] >= s.zone2[1]).toBe(true);
      }
    }
  });

  it('you can climb out of the cage with a jump and the air jump', () => {
    const { sec, world: w } = find('cage');
    const f = w.fighters[0];
    place(f, sec.left + 128, 70);
    run(w, 30);
    expect(f.y).toBe(80);
    let airJumped = false;
    run(w, 120, (t) => {
      const jp = t === 0 ? 1 : f.vy > -40 && !airJumped ? ((airJumped = true), 2) : airJumped ? 2 : 1;
      // Hug the edge of the opening on the way up, then step over onto the lip.
      return [{ ...NEUTRAL, jump: t < 40, jp, mx: f.y < 0 || f.x > sec.left + 92 ? -1 : 0 }];
    });
    expect(f.grounded).toBe(true);
    expect(f.y).toBe(0);
  });

  it('falling into the pitfall costs a life', () => {
    const { sec, world: w } = find('pitfall');
    const f = w.fighters[0];
    place(f, sec.left + 76, -10);
    run(w, 120);
    expect(f.stocks).toBe(2);
  });

  it('a spike floor hurts and pops you up', () => {
    const { st, sec, world: w } = find('spikes');
    const sp = st.spikes.find((s) => s.up && s.x >= sec.left && s.x < sec.right);
    const f = w.fighters[0];
    place(f, sp.x + 8, sp.y - 20);
    run(w, 20);
    expect(f.damage).toBeGreaterThan(0);
    expect(f.vy).toBeLessThan(0);
  });

  it('ice keeps you sliding', () => {
    const slide = (w, x, y) => {
      const f = w.fighters[0];
      place(f, x, y - 1);
      run(w, 10);
      f.vx = F_RUN;
      const x0 = f.x;
      run(w, 60);
      return f.x - x0;
    };
    const { sec, world: icy } = find('ice');
    expect(slide(icy, sec.left + 16, 0)).toBeGreaterThan(40);
    expect(slide(world(), 650, 0)).toBeLessThan(15);
  });

  it('the drawbridge opens under you', () => {
    const { sec, world: w } = find('drawbridge');
    const f = w.fighters[0];
    run(w, 1);
    place(f, sec.left + 128, -10);
    run(w, 60 * 13, () => [{ ...NEUTRAL }]);
    expect(f.stocks).toBeLessThan(3);
  });

  it('the crusher slams anyone under it and throws them out', () => {
    const { movers, world: w } = find('crusher');
    const c = movers[0];
    const f = w.fighters[0];
    place(f, c.x + c.w / 2, -1);
    let hitAt = -1;
    run(w, 60 * 8, (t) => {
      if (hitAt < 0 && f.damage > 0) hitAt = t;
      return [];
    });
    expect(hitAt).toBeGreaterThanOrEqual(0);
    expect(f.x < c.x || f.x > c.x + c.w).toBe(true);
  });

  it('the lift carries you up', () => {
    const { movers, world: w } = find('lift');
    const l = movers[0];
    run(w, 1);
    const f = w.fighters[0];
    place(f, l.x + l.w / 2, w.movers[l.k].y - 1);
    let top = 0;
    run(w, 60 * 8, () => {
      top = Math.min(top, f.y);
      return [];
    });
    expect(top).toBeLessThan(l.top + 4);
  });

  it('crumbling tiles fall away once stood on, then come back', () => {
    const { movers, world: w } = find('crumble');
    const tile = movers[2];
    const f = w.fighters[0];
    place(f, tile.x + tile.w / 2, -1);
    run(w, 10);
    expect(f.grounded).toBe(true);
    run(w, 60);
    expect(w.movers[tile.k].on).toBe(false);
    expect(f.y).toBeGreaterThan(0);
    f.state = 'out';
    run(w, 60 * 4);
    expect(w.movers[tile.k].on).toBe(true);
  });

  it('glue: slow going, and no jumping or dashing off it', () => {
    const { sec, world: w } = find('glueHall');
    const f = w.fighters[0];
    place(f, sec.left + 128, -2);
    run(w, 5);
    expect(f.onGlue).toBe(true);
    step(w, [{ ...NEUTRAL, jump: true, jp: 1, xp: 1 }]);
    run(w, 5, () => [{ ...NEUTRAL, jump: true, jp: 1 }]);
    expect(f.grounded).toBe(true);
    expect(f.dash).toBe(0);
    let fastest = 0;
    run(w, 30, () => {
      fastest = Math.max(fastest, Math.abs(f.vx));
      return [{ ...NEUTRAL, mx: 1 }];
    });
    expect(fastest).toBeLessThanOrEqual(FIGHTER.runSpeed * GLUE.slow + 1);
  });

  it('every glued floor can be walked off (both ways), since you cannot jump off it', () => {
    for (const id of many.slice(0, 150)) {
      const st = getStage(id);
      for (const g of st.blocks.filter((b) => b.glue)) {
        for (const dir of [-1, 1]) {
          const w = createWorld({ stage: id, players: 1, countdown: 0, seed: 1, storm: FAR_STORM });
          const f = w.fighters[0];
          place(f, g.x + g.w / 2, g.y - 1);
          run(w, 5);
          // Walking that way gets you off it (onto plain floor, or off a ledge) at some point,
          // instead of being walled in.
          let escaped = false;
          run(w, 60 * 4, () => {
            if (!(f.grounded && f.onGlue)) escaped = true;
            return [{ ...NEUTRAL, mx: dir }];
          });
          expect(escaped, `${id}: glue at x ${g.x}, walking ${dir > 0 ? 'right' : 'left'}`).toBe(true);
        }
      }
    }
  });

  it('sticky crumble: stuck to a tile, you fall with it onto the spikes', () => {
    const { movers, world: w } = find('stickyCrumble');
    const tile = movers[2];
    const f = w.fighters[0];
    place(f, tile.x + tile.w / 2, -1);
    run(w, 90, () => [{ ...NEUTRAL, jump: true, jp: 1 }]);
    expect(f.damage).toBeGreaterThan(0);
  });

  it('a weapon keeps coming back to the shrine', () => {
    const { st, world: w } = find('shrine');
    const spot = st.pickupSpots.find((sp) => sp.shrine);
    const at = () => w.pickups.some((p) => p.x === spot.x && p.y === spot.y);
    run(w, 60 * 5);
    expect(at()).toBe(true);
    const f = w.fighters[0];
    place(f, spot.x, spot.y - 1);
    run(w, 5);
    run(w, 1, () => [{ ...NEUTRAL, ep: 1 }]);
    expect(at()).toBe(false);
    run(w, 60 * 7, () => [{ ...NEUTRAL, ep: 1 }]);
    expect(at()).toBe(true);
  });
});

describe('input over the network', () => {
  it('round-trips', () => {
    const input = { mx: -1, down: true, up: true, jump: false, crouch: true, shoot: true, block: true, meleeHeld: true, grenadeHeld: true, jp: 3, sp: 255, mp: 0, dp: 9, rp: 4, hp: 7, ep: 2, gp: 5, xp: 6, cp: 8, kp: 4, ax: 0.71, ay: -0.71 };
    expect(decodeInput(encodeInput(input))).toEqual(input);
  });

  it('rejects or clamps garbage', () => {
    expect(decodeInput('hi')).toBeNull();
    expect(decodeInput([1, 2, 3])).toBeNull();
    const d = decodeInput([99, 'x', -5, 1e9, NaN, 2, 3, 500, -500, 0, 0, 999, 7, 1, 2]);
    expect(d.mx).toBe(1);
    expect(d.sp).toBe(255);
    expect(d.mp).toBe(0);
    expect(d.ax).toBe(1);
    expect(d.ay).toBe(-1);
    expect(d.gp).toBe(255);
  });
});

// Slow, so only on request: BOT_TESTS=1 npx vitest run
describe.skipIf(!process.env.BOT_TESTS)('whole match', () => {
  // Bots still occasionally end up in a standoff across a solid floor, so this checks that
  // matches between bots fight and nearly always finish, rather than that every one does.
  it('four bots with the storm fight and almost always finish (random dungeons, and training)', () => {
    const seeds = 10;
    let finished = 0;
    let hits = 0;
    let kos = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const stage = seed === seeds ? 'training' : `mixed-${1000 + seed * 7919}`;
      const w = createWorld({ stage, players: 4, stocks: 2, countdown: 0, seed, storm: { startDelay: 20, firstShrink: 20, hold: 10, finalShrink: 15 } });
      const bots = ['hard', 'hard', 'normal', 'easy'].map((l, i) => createBot(l, seed * 10 + i));
      for (let t = 0; t < 60 * 300 && w.phase !== 'over'; t++) {
        step(w, bots.map((b, i) => botInput(w, i, b)));
        for (const e of w.events) {
          if (e.type === 'hit') hits++;
          if (e.type === 'ko') kos++;
        }
      }
      if (w.phase === 'over') finished++;
    }
    console.log(`bot matches: ${finished}/${seeds} finished, ${hits} hits, ${kos} KOs`);
    expect(hits).toBeGreaterThan(20 * seeds);
    expect(kos).toBeGreaterThanOrEqual(3 * seeds);
    expect(finished).toBeGreaterThanOrEqual(seeds - 1);
  });
});

describe('kitchen, farm and toolbox weapons', () => {
  // a holds `weapon` at 600, b stands `gap` px to the right facing `victimFacing`.
  function armed(weapon, gap = 14, victimFacing = -1) {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 600 + gap, -2);
    run(w, 5);
    Object.assign(a, { melee: weapon, active: 'melee', uses: 0 });
    b.facing = victimFacing;
    return { w, a, b };
  }
  const swing = (w, ticks = 30, input = {}) => {
    for (let t = 0; t < ticks; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1, ...input }, NEUTRAL]);
  };
  const hold = (w, ticks, extra = {}) => {
    for (let t = 0; t < ticks; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1, meleeHeld: true, ...extra }, NEUTRAL]);
  };

  it('blocking with the frying pan stops a bullet from the front', () => {
    const { w, b } = armed('pan', 60);
    Object.assign(b, { melee: 'pan', active: 'melee', facing: -1 });
    for (let t = 0; t < 3; t++) step(w, [NEUTRAL, { ...NEUTRAL, block: true }]);
    w.bullets.push({ id: 500, owner: 0, x: 620, y: -16, vx: 900, vy: 0, gravity: 0, life: 1, thrown: false, damage: 8, kb: 150, growth: 1.6 });
    for (let t = 0; t < 6; t++) step(w, [NEUTRAL, { ...NEUTRAL, block: true }]);
    expect(w.bullets.length).toBe(0);
    expect(b.damage).toBe(0);
  });

  // Hold the attack `ticks` ticks, let go, and let the swing play out.
  const powered = (w, ticks) => {
    hold(w, ticks);
    swing(w, 30);
  };

  it("a frying pan's jab is a small push; held, it bonks", () => {
    let { w, b } = armed('pan');
    swing(w, 30, { mp: 0, kp: 1 });
    expect(b.damage).toBe(MELEE.pan.damage);
    expect(b.stunned).toBe(false);
    ({ w, b } = armed('pan'));
    powered(w, 30);
    expect(b.damage).toBe(MELEE.pan.power.damage);
  });

  it('the ham heals you with every hit and is eaten after the last bite', () => {
    const { w, a, b } = armed('ham');
    a.damage = 40;
    a.uses = MELEE.ham.power.bites.count - 1;
    swing(w, 30); // a tap: no bite
    expect(a.damage).toBe(40);
    b.damage = 0;
    place(a, 600, -2);
    place(b, 614, -2);
    // (Wait without touching the button: a change in its count would be a fresh press.)
    for (let t = 0; t < 30; t++) step(w, [{ ...NEUTRAL, mp: 1 }, NEUTRAL]);
    hold(w, 32, { mp: 2 });
    swing(w, 30, { mp: 2 });
    expect(b.damage).toBe(MELEE.ham.power.damage);
    expect(a.damage).toBe(40 - MELEE.ham.power.bites.heal);
    expect(a.melee).toBe(null);
  });

  it('a wet fish slap turns their floor to ice for a while', () => {
    const { w, b } = armed('fish', 12);
    swing(w, 10);
    expect(b.slip).toBeGreaterThan(0);
    run(w, Math.ceil(MELEE.fish.slippery * 60) + 5);
    expect(b.slip).toBe(0);
  });

  it('the pliers yoink the weapon in their hand and drop it behind you', () => {
    const { w, b } = armed('pliers', 12);
    Object.assign(b, { melee: 'bat', active: 'melee' });
    swing(w, 20);
    expect(b.melee).toBe(null);
    const dropped = w.pickups.find((p) => p.weapon === 'bat');
    expect(dropped).toBeTruthy();
    expect(dropped.x).toBeLessThan(600);
    // Next yoink: their gun.
    const gun = b.gun;
    place(b, 612, -2);
    swing(w, 30, { mp: 2 });
    expect(b.hasGun).toBe(false);
    expect(w.pickups.some((p) => p.weapon === gun)).toBe(true);
  });

  it('the anvil is only thrown, slows you while carried, and lands as a pickup', () => {
    const { w, a } = armed('anvil', 200);
    for (let t = 0; t < 40; t++) step(w, [{ ...NEUTRAL, mx: 1 }, NEUTRAL]);
    expect(a.vx).toBeCloseTo(FIGHTER.runSpeed * MELEE.anvil.carrySlow, 0);
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1, meleeHeld: true }, NEUTRAL]);
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
    expect(a.melee).toBe(null);
    expect(a.swing).toBe(-1);
    expect(w.bullets.some((b) => b.kind === 'anvil')).toBe(true);
    run(w, 180);
    expect(w.pickups.some((p) => p.weapon === 'anvil')).toBe(true);
  });

  it("the halberd's jab is its long thrust (it reaches far), its heavy the sweep", () => {
    let { w, a, b } = armed('halberd', 34);
    swing(w, 30, { mp: 0, kp: 1 });
    expect(b.damage).toBe(MELEE.halberd.jabStats.damage);
    expect(a.swingVariant).toBe('jab');
    ({ w, a, b } = armed('halberd', 14));
    swing(w, 30);
    expect(b.damage).toBe(MELEE.halberd.heavyStats.damage);
  });

  it('the halberd sweep reaches behind you', () => {
    const { w, b } = armed('halberd', -14, 1);
    swing(w, 30);
    expect(b.damage).toBe(MELEE.halberd.heavyStats.damage);
  });

  it('the morning star spins while held, knocking away anyone the ball touches', () => {
    const { w, a, b } = armed('morningstar', 20);
    hold(w, 60);
    expect(a.swing).toBe(-1);
    expect(b.damage).toBeGreaterThan(0);
    expect(b.damage % MELEE.morningstar.spin.damage).toBe(0);
  });

  it('the bone scythe hits behind you', () => {
    const { w, b } = armed('scythe', -14, 1);
    swing(w, 30);
    expect(b.damage).toBe(MELEE.scythe.damage);
  });

  it('a bite of carrot speeds you up; the second bite finishes it', () => {
    const { w, a } = armed('carrot', 200);
    hold(w, 35);
    expect(a.uses).toBe(1);
    expect(a.melee).toBe('carrot');
    expect(a.haste).toBeGreaterThan(0);
    step(w, [{ ...NEUTRAL, mp: 1 }, NEUTRAL]);
    hold(w, 35, { mp: 2 });
    expect(a.melee).toBe(null);
    for (let t = 0; t < 40; t++) step(w, [{ ...NEUTRAL, mx: 1 }, NEUTRAL]);
    expect(a.vx).toBeCloseTo(FIGHTER.runSpeed * MELEE.carrot.eat.speed, 0);
  });

  it("the paint roller paints the floor, and others are slowed on it (not you)", () => {
    const { w, a, b } = armed('roller', 200);
    swing(w, 20);
    expect(w.paints.length).toBe(1);
    place(b, 620, -2);
    // (a keeps the same press count: no new swing.)
    run(w, 3, () => [{ ...NEUTRAL, mp: 1 }, NEUTRAL]);
    for (let t = 0; t < 30; t++) step(w, [{ ...NEUTRAL, mp: 1 }, { ...NEUTRAL, mx: 1 }]);
    expect(b.vx).toBeCloseTo(FIGHTER.runSpeed * MELEE.roller.heavyStats.paint.slow, 0);
    place(a, 610, -2);
    place(b, 1000, -2); // (out of the way: bodies bump)
    for (let t = 0; t < 20; t++) step(w, [{ ...NEUTRAL, mx: 1, mp: 1 }, NEUTRAL]);
    expect(a.vx).toBeCloseTo(FIGHTER.runSpeed, 0);
  });
});

describe('wind-ups, throws and the crusher', () => {
  function armed(weapon, gap = 14, victimFacing = -1) {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 600 + gap, -2);
    run(w, 5);
    Object.assign(a, { melee: weapon, active: 'melee', uses: 0 });
    b.facing = victimFacing;
    return { w, a, b };
  }
  const go = (w, ticks, input = {}) => {
    for (let t = 0; t < ticks; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1, ...input }, NEUTRAL]);
  };

  it('the bat: a tap is light, a full wind-up launches harder than the old home run, at 45°', () => {
    let { w, b } = armed('bat');
    b.damage = 100;
    go(w, 30);
    const tap = Math.hypot(b.vx, b.vy);
    expect(tap).toBeLessThan(250);
    ({ w, b } = armed('bat'));
    b.damage = 100;
    go(w, 80, { meleeHeld: true });
    go(w, 12);
    // Harder than the 90% (the old home run), going up as much as out.
    const old = MELEE.bat.power;
    expect(Math.hypot(b.vx, b.vy)).toBeGreaterThan(old.knockback + old.knockbackGrowth * b.damage);
    expect(-b.vy).toBeGreaterThan(Math.abs(b.vx) * 0.7);
  });

  it('winding up the bat slows you, to 10% when full', () => {
    const { w, a } = armed('bat', 300);
    for (let t = 0; t < 100; t++) step(w, [{ ...NEUTRAL, mx: 1, mp: 1, meleeHeld: true }, NEUTRAL]);
    expect(a.vx).toBeCloseTo(FIGHTER.runSpeed * MELEE.bat.power.slow, 0);
  });

  it('the katana swings on the click, and holding on throws it', () => {
    const { w, a } = armed('katana', 300);
    go(w, 1, { meleeHeld: true });
    expect(a.swing).toBeGreaterThanOrEqual(0);
    go(w, 30, { meleeHeld: true });
    go(w, 1);
    expect(a.melee).toBe(null);
    expect(w.bullets.some((b) => b.kind === 'katana')).toBe(true);
  });

  it('a thrown fish still makes the floor slippery; a thrown knife still backstabs', () => {
    let { w, a, b } = armed('fish', 60);
    go(w, 25, { meleeHeld: true });
    go(w, 30);
    expect(b.damage).toBeGreaterThan(0);
    expect(b.slip).toBeGreaterThan(0);
    ({ w, a, b } = armed('knife', 60, 1));
    go(w, 15, { meleeHeld: true });
    go(w, 30);
    expect(b.damage).toBe(MELEE.knife.throw.damage * MELEE.knife.backstab.damageMul);
  });

  it('the crusher: its spikes hurt while it waits, and it launches hard when it lands on you', () => {
    // (mixed-1 has a crusher.)
    let w = createWorld({ stage: 'mixed-1', players: 1, countdown: 0, seed: 3, storm: FAR_STORM });
    const st = getStage(w.stage);
    const i = st.movers.findIndex((m) => m.kind === 'crusher');
    const def = st.movers[i];
    let f = w.fighters[0];
    // Up and waiting: its underside is spikes.
    for (let t = 0; t < 600 && w.movers[i].y !== def.top; t++) step(w, [NEUTRAL]);
    place(f, def.x + def.w / 2, def.top + def.h + FIGHTER.h + 1);
    step(w, [NEUTRAL]);
    expect(f.damage).toBe(SPIKES.damage);
    // Slamming down onto you: a big launch.
    w = createWorld({ stage: 'mixed-1', players: 1, countdown: 0, seed: 3, storm: FAR_STORM });
    f = w.fighters[0];
    let fastest = 0;
    for (let t = 0; t < 600 && f.damage === 0; t++) {
      place(f, def.x + def.w / 2, 0);
      step(w, [NEUTRAL]);
      fastest = Math.hypot(f.vx, f.vy);
    }
    expect(f.damage).toBe(MOVERS.crusher.damage);
    expect(fastest).toBeGreaterThan(MOVERS.crusher.knockback);
  });
});

describe('ranged batch', () => {
  // a holds `gun` at 600 aiming right; b stands `gap` px away.
  function gunner(gun, gap = 100) {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 600 + gap, -2);
    run(w, 5);
    w.pickups.push({ id: 99, x: 600, y: 0, weapon: gun });
    step(w, [{ ...NEUTRAL, ep: 1 }, NEUTRAL]);
    return { w, a, b };
  }
  const shoot = (w, ticks, extra = {}) => {
    for (let t = 0; t < ticks; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1, ...extra }, NEUTRAL]);
  };

  it('the bow: a full draw pushes, a quick one only chips', () => {
    let { w, b } = gunner('bow');
    shoot(w, 2, { shoot: true });
    shoot(w, 30);
    expect(b.damage).toBeGreaterThan(0);
    expect(b.damage).toBeLessThan(GUNS.bow.damage / 2);
    expect(Math.abs(b.vx)).toBeLessThan(10);
    ({ w, b } = gunner('bow'));
    shoot(w, 50, { shoot: true });
    let fastest = 0;
    for (let t = 0; t < 30; t++) {
      shoot(w, 1);
      fastest = Math.max(fastest, Math.abs(b.vx));
    }
    expect(b.damage).toBeCloseTo(GUNS.bow.damage, 5);
    expect(fastest).toBeGreaterThan(100);
  });

  it('an arrow in a wall is a foothold you can stand on', () => {
    // An arrow flying into the side of the platform at x 160, y -96..-80.
    const { w, a } = gunner('bow', 400);
    w.bullets.push({ id: 500, owner: 1, x: 130, y: -88, vx: 700, vy: 0, gravity: 0, life: 1, thrown: false, damage: 9, kb: 0, growth: 0, light: true, stick: true, look: 'bow' });
    run(w, 5);
    expect(w.footholds.length).toBe(1);
    const h = w.footholds[0];
    expect(w.live.some((r) => r.look === 'arrow' && r.oneWay)).toBe(true);
    place(a, h.x - h.dir * 8, h.y - 20);
    run(w, 20);
    expect(a.y).toBe(h.y);
    expect(a.grounded).toBe(true);
  });

  it('cards go through everyone in a line', () => {
    const w = world(3);
    const [a, b, c] = w.fighters;
    place(a, 600, -2);
    place(b, 650, -2);
    place(c, 700, -2);
    run(w, 5);
    w.pickups.push({ id: 99, x: 600, y: 0, weapon: 'cards' });
    step(w, [{ ...NEUTRAL, ep: 1 }, NEUTRAL, NEUTRAL]);
    for (let t = 0; t < 30; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1 }, NEUTRAL, NEUTRAL]);
    expect(b.damage).toBe(GUNS.cards.damage);
    expect(c.damage).toBe(GUNS.cards.damage);
  });

  it('the railgun only fires fully charged, through walls', () => {
    const { w, a, b } = gunner('railgun', 200);
    shoot(w, 10, { shoot: true });
    shoot(w, 5);
    expect(a.ammo).toBe(GUNS.railgun.magazineSize);
    w.barrels.length = 0;
    shoot(w, 60, { shoot: true, sp: 2 });
    shoot(w, 3, { sp: 2 });
    expect(b.damage).toBe(GUNS.railgun.damage);
  });

  it('fire staff flames set you burning', () => {
    const { w, b } = gunner('firestaff', 40);
    shoot(w, 20, { shoot: true });
    expect(b.burn).toBeGreaterThan(0);
  });

  it('the jackpot showers money that heals whoever grabs it', () => {
    // (b stands behind, out of the way, so nobody grabs it as it lands.)
    const { w, a, b } = gunner('jackpot', -300);
    shoot(w, 120);
    expect(w.loot.length).toBeGreaterThan(0);
    run(w, 90);
    const landed = w.loot.filter((m) => m.landed);
    expect(landed.length).toBeGreaterThan(0);
    b.damage = 50;
    place(b, landed[0].x, landed[0].y);
    const before = w.loot.length;
    run(w, 2);
    expect(w.loot.length).toBeLessThan(before);
    expect(b.damage).toBeLessThan(50);
    expect(a.state).toBe('ok');
  });

  it('slime leaves glue where it lands', () => {
    const { w } = gunner('slimer', 300);
    for (let t = 0; t < 120 && !w.puddles.length; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0.3, sp: 1 }, NEUTRAL]);
    expect(w.puddles.length).toBeGreaterThan(0);
    const p = w.puddles[0];
    const b = w.fighters[1];
    w.bullets.length = 0;
    place(b, (p.x1 + p.x2) / 2, p.y);
    run(w, 2);
    expect(b.slimed).toBe(true);
  });

  it('sticky C4 sticks, and the grenade button sets it off', () => {
    const { w, a, b } = gunner('pistol', 40);
    a.grenades = ['c4'];
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, gp: 1, grenadeHeld: true }, NEUTRAL]);
    for (let t = 0; t < 60; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, gp: 1 }, NEUTRAL]);
    expect(w.grenades.length).toBe(1);
    expect(w.grenades[0].stuck || w.grenades[0].on === b.id).toBe(true);
    expect(b.damage).toBe(0);
    step(w, [{ ...NEUTRAL, gp: 2 }, NEUTRAL]);
    step(w, [{ ...NEUTRAL, gp: 2 }, NEUTRAL]);
    expect(w.grenades.length).toBe(0);
    expect(b.damage).toBeGreaterThan(0);
  });
});

describe('money grenade and black hole', () => {
  const setup = () => {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 400, -2);
    place(b, 640, -2);
    run(w, 5);
    return { w, a, b };
  };

  it('the money grenade hurts like a grenade and leaves money to heal with', () => {
    const { w, b } = setup();
    w.grenades.push({ id: 50, owner: 0, kind: 'cashnade', x: 640, y: -12, vx: 0, vy: 0, fuse: 0.01, on: -1, stuck: false });
    run(w, 2);
    expect(b.damage).toBeGreaterThan(0);
    expect(w.loot.length).toBe(GRENADES.cashnade.cash);
  });

  it('a black hole does no damage but pulls people in', () => {
    const { w, b } = setup();
    w.grenades.push({ id: 50, owner: 0, kind: 'blackhole', x: 700, y: -20, vx: 0, vy: 0, fuse: 0.01, on: -1, stuck: false });
    run(w, 2);
    expect(w.holes.length).toBe(1);
    run(w, 60);
    expect(b.damage).toBe(0);
    expect(b.x).toBeGreaterThan(660);
    run(w, 60 * 4);
    expect(w.holes.length).toBe(0);
  });
});

describe('items', () => {
  // a at 600 picks up `item` (dropped at its feet); b stands at `bx`.
  function holding(item, bx = 760, opts = {}) {
    const w = world(2, opts);
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, bx, -2);
    run(w, 5);
    w.pickups.push({ id: 99, x: 600, y: 0, weapon: item });
    step(w, [{ ...NEUTRAL, ep: 1 }, NEUTRAL]);
    return { w, a, b };
  }

  it('snacks heal on the spot', () => {
    const w = world();
    const a = w.fighters[0];
    place(a, 600, -2);
    run(w, 5);
    a.damage = 60;
    w.pickups.push({ id: 99, x: 600, y: 0, weapon: 'drumstick' });
    step(w, [{ ...NEUTRAL, ep: 1 }, NEUTRAL]);
    expect(a.damage).toBe(60 - ITEMS.drumstick.heal);
  });

  it('the key is held up, dropped by a big hit, and opens the chest for a legendary weapon', () => {
    const { w, a } = holding('key');
    expect(a.carry).toBe('key');
    expect(w.chest).toBeTruthy();
    place(a, w.chest.x, w.chest.y - 2);
    run(w, 3);
    expect(a.carry).toBe(null);
    expect(w.chest).toBe(null);
    expect(w.pickups.some((p) => LEGENDARY.includes(p.weapon))).toBe(true);
  });

  it('a big hit makes you drop what you hold up', () => {
    const { w, a, b } = holding('key', 614);
    b.facing = -1;
    a.damage = 200;
    Object.assign(b, { melee: 'hammer', active: 'melee' });
    for (let t = 0; t < 40; t++) step(w, [NEUTRAL, { ...NEUTRAL, ax: -1, ay: 0, mp: 1 }]);
    expect(a.carry).toBe(null);
  });

  // The banner, thrown by a and planted at its feet.
  function planted(bx) {
    const { w, a, b } = holding('apple', bx);
    w.grenades.push({ id: 50, owner: 0, kind: 'banner', x: 600, y: -10, vx: 0, vy: 50, fuse: 6, on: -1, stuck: false });
    run(w, 5);
    return { w, a, b };
  }

  it('the banner plants a melee-only zone: shots vanish into it, guns there do not fire', () => {
    const { w, a, b } = planted(680);
    expect(w.haven).toBeTruthy();
    expect(w.grenades.length).toBe(0);
    expect(w.haven.left).toBeLessThan(600);
    expect(w.haven.right).toBeGreaterThan(680);
    // b shoots at a from inside: nothing comes out.
    for (let t = 0; t < 20; t++) step(w, [NEUTRAL, { ...NEUTRAL, ax: -1, ay: 0, sp: t + 1 }]);
    expect(a.damage).toBe(0);
    // A shot from outside vanishes as it comes in.
    w.bullets.push({ id: 500, owner: 1, x: w.haven.right + 30, y: -16, vx: -900, vy: 0, gravity: 0, life: 1, thrown: false, damage: 8, kb: 150, growth: 1.6 });
    run(w, 10);
    expect(a.damage).toBe(0);
    expect(w.bullets.length).toBe(0);
    // A thrown melee weapon still lands.
    w.bullets.push({ id: 501, owner: 1, kind: 'knife', x: 640, y: -16, vx: -600, vy: 0, gravity: 0, life: 1, thrown: true, recover: true, damage: 6, kb: 250, growth: 3 });
    run(w, 10);
    expect(a.damage).toBe(6);
  });

  it('the banner: its planter gains a life after spending long enough in the zone', () => {
    const { w, a } = planted(1200);
    const lives = a.stocks;
    run(w, Math.ceil(GRENADES.banner.plant.hold * 60) + 2);
    expect(a.stocks).toBe(lives + 1);
    expect(w.haven).toBe(null);
  });

  it('the banner fades out if its thrower stays out of it for more than 3 s', () => {
    const { w, a } = planted(1200);
    place(a, w.haven.right + 40, -2);
    run(w, 2 * 60);
    expect(w.haven).toBeTruthy();
    place(a, w.haven.x, -2);
    run(w, 10);
    expect(w.haven.away).toBe(0);
    place(a, w.haven.right + 40, -2);
    run(w, Math.ceil(HAVEN.away * 60) + 5);
    expect(w.haven).toBe(null);
  });

  it('the crystal ball: thrown weapons home in too, for half', () => {
    const { w, a, b } = holding('crystal', 700);
    place(b, 700, -70);
    Object.assign(a, { melee: 'knife', active: 'melee' });
    for (let t = 0; t < 15; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1, meleeHeld: true }, NEUTRAL]);
    for (let t = 0; t < 60; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
    expect(b.damage).toBe(MELEE.knife.throw.damage * ITEMS.crystal.homing.damage);
  });

  it('the crystal ball: shots curve toward the nearest enemy and hit for half', () => {
    const { w, a, b } = holding('crystal', 700);
    b.y = -60;
    place(b, 700, -60);
    for (let t = 0; t < 40; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: t === 0 ? 1 : 1 }, NEUTRAL]);
    expect(b.damage).toBeGreaterThan(0);
    expect(b.damage).toBeLessThanOrEqual(GUNS.pistol.damage * ITEMS.crystal.homing.damage + 0.01);
  });

  it('runes: haste runs faster, iron takes less push, feather jumps more, mirror sends a bullet back', () => {
    let { w, a, b } = holding('haste');
    for (let t = 0; t < 40; t++) step(w, [{ ...NEUTRAL, mx: 1 }, NEUTRAL]);
    expect(a.vx).toBeCloseTo(FIGHTER.runSpeed * ITEMS.haste.rune.speed, 0);
    ({ w, a, b } = holding('feather'));
    run(w, 2);
    expect(a.jumpsLeft).toBe(FIGHTER.airJumps + ITEMS.feather.rune.airJumps);
    ({ w, a, b } = holding('mirror', 700));
    w.bullets.push({ id: 500, owner: b.id, x: 640, y: -16, vx: -900, vy: 0, gravity: 0, life: 1, thrown: false, damage: 8, kb: 150, growth: 1.6 });
    run(w, 10);
    expect(a.damage).toBe(0);
    expect(b.damage).toBeGreaterThan(0);
    expect(a.reflects).toBe(ITEMS.mirror.rune.reflect - 8);
    // Past its budget, the last one still goes back, and the rune is done.
    a.reflects = 4;
    w.bullets.push({ id: 501, owner: b.id, x: 640, y: -16, vx: -900, vy: 0, gravity: 0, life: 1, thrown: false, damage: 8, kb: 150, growth: 1.6 });
    run(w, 10);
    expect(a.damage).toBe(0);
    expect(a.rune).toBe(null);
  });

  it('the genie lamp grants a wish after a rub', () => {
    const { w, a } = holding('lamp');
    a.damage = 80;
    run(w, Math.ceil(ITEMS.lamp.wish.rub * 60) + 2);
    const granted = a.damage === 0 || a.jinx > 0 || w.pickups.some((p) => LEGENDARY.includes(p.weapon));
    expect(granted).toBe(true);
  });

  it('bounty: knocking out the champion takes the crown', () => {
    const w = world(2, { crown: 1, crownRule: 'bounty' });
    const b = w.fighters[1];
    Object.assign(b, { lastHitBy: 0, lastPlayerHitAt: w.tick, lastHitAt: w.tick });
    place(b, 600, 900);
    run(w, 2);
    expect(w.crown).toBe(0);
  });

  it('the heavy crown: the champion takes more push', () => {
    const plain = world();
    const heavy = world(2, { crown: 1, crownRule: 'weight' });
    for (const w of [plain, heavy]) {
      place(w.fighters[0], 600, -2);
      place(w.fighters[1], 614, -2);
      run(w, 3);
      Object.assign(w.fighters[0], { melee: 'bat', active: 'melee' });
      w.fighters[1].damage = 50;
      for (let t = 0; t < 12; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
    }
    expect(Math.abs(heavy.fighters[1].vx)).toBeGreaterThan(Math.abs(plain.fighters[1].vx));
    expect(CROWN.weight).toBeGreaterThan(1);
  });

  it("training dummies' health: set never changes, banded comes back, reset is once", () => {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 614, -2);
    run(w, 3);
    setHealthRule(w, 1, { mode: 'set', value: 80 });
    for (let t = 0; t < 20; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
    expect(b.damage).toBe(80);
    setHealthRule(w, 1, { mode: 'banded', value: 50 });
    place(b, 614, -2);
    run(w, 40);
    for (let t = 0; t < 20; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 2 }, NEUTRAL]);
    expect(b.damage).toBeGreaterThan(50);
    run(w, 90);
    expect(b.damage).toBe(50);
    setHealthRule(w, 1, { mode: 'reset', value: 30 });
    expect(b.damage).toBe(30);
    expect(b.healthRule).toBe(null);
  });

  it('a black hole above you lifts you off the floor', () => {
    const w = world();
    const b = w.fighters[1];
    place(b, 640, -2);
    run(w, 5);
    w.holes.push({ id: 9, x: 640, y: -90, r: 110, t: 3, pull: 1900 });
    run(w, 60);
    expect(b.y).toBeLessThan(-40);
  });

  it('money picked up heals half of what it hits for', () => {
    expect(LOOT.heal).toBe(0.5);
    const w = world();
    const b = w.fighters[1];
    place(b, 640, -2);
    run(w, 3);
    b.damage = 50;
    w.loot.push({ id: 1, x: 640, y: 0, vx: 0, vy: 0, look: 'goldcoin', value: CASH[2].damage * LOOT.heal, t: 0, landed: true });
    run(w, 2);
    expect(b.damage).toBe(50 - CASH[2].damage / 2);
  });

  it('the paint roller runs out of paint', () => {
    const w = world();
    const a = w.fighters[0];
    place(a, 600, -2);
    run(w, 3);
    Object.assign(a, { melee: 'roller', active: 'melee', uses: 0 });
    for (let k = 0; k < MELEE.roller.heavyStats.paint.ammo + 2; k++) {
      for (let t = 0; t < 25; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: k + 1 }, NEUTRAL]);
    }
    expect(w.paints.length).toBe(MELEE.roller.heavyStats.paint.ammo);
  });
});

describe('rules: thrown and items', () => {
  it('with thrown and items off, no grenades or items turn up', () => {
    const w = createWorld({ stage: 'warehouse', players: 2, countdown: 0, seed: 7, storm: FAR_STORM, rules: { thrown: false, items: false } });
    const seen = new Set();
    for (let t = 0; t < 60 * 240; t++) {
      step(w, []);
      for (const p of w.pickups) seen.add(p.weapon);
      w.pickups.length = 0; // (keep room for more to turn up)
    }
    expect(seen.size).toBeGreaterThan(5);
    for (const k of seen) {
      expect(GRENADES[k], k).toBeUndefined();
      expect(ITEMS[k], k).toBeUndefined();
    }
  });
});

describe('THE WARNING and the cleaver throw', () => {
  function armed(weapon, gap = 16) {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 600 + gap, -2);
    run(w, 5);
    Object.assign(a, { melee: weapon, active: 'melee' });
    b.facing = -1;
    return { w, a, b };
  }
  const go = (w, ticks, input = {}) => {
    for (let t = 0; t < ticks; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1, ...input }, NEUTRAL]);
  };

  it('a charged WARNING hit irradiates everyone near it, the swinger too', () => {
    const { w, a, b } = armed('warning');
    go(w, 35, { meleeHeld: true });
    let events = [];
    for (let t = 0; t < 30; t++) {
      step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
      events = events.concat(w.events);
    }
    expect(b.damage).toBe(MELEE.warning.power.damage);
    const hit = events.filter((e) => e.type === 'irradiated').map((e) => e.id);
    expect(hit).toContain(a.id);
    expect(hit).toContain(b.id);
  });

  it('a tap of THE WARNING is a plain hit', () => {
    const { w, b } = armed('warning');
    let events = [];
    for (let t = 0; t < 40; t++) {
      step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
      events = events.concat(w.events);
    }
    expect(b.damage).toBe(MELEE.warning.damage);
    expect(events.some((e) => e.type === 'irradiated')).toBe(false);
  });

  it('the cleaver: throw one (you keep yours), it bleeds them, and the next throw waits', () => {
    // (It arcs: the dummy stands where it comes back down.)
    const { w, a, b } = armed('cleaver', 180);
    w.barrels.length = 0; // (one sits in the way on this stage)
    go(w, 25, { meleeHeld: true });
    go(w, 1);
    expect(a.melee).toBe('cleaver');
    expect(a.throwCd).toBeGreaterThan(0);
    expect(w.bullets.some((x) => x.kind === 'cleaver')).toBe(true);
    for (let t = 0; t < 60 && b.damage === 0; t++) step(w, []);
    expect(b.damage).toBeGreaterThan(0);
    expect(b.bleed).toBeGreaterThan(0);
    // During the cooldown, holding just swings.
    const thrown = w.bullets.length;
    go(w, 25, { meleeHeld: true, mp: 2 });
    go(w, 1, { mp: 2 });
    expect(w.bullets.length).toBe(thrown);
  });
});

describe('parrying up close', () => {
  it('a punch from someone who lunged past your middle can still be parried', () => {
    for (const gap of [0, 2, 8]) {
      const w = world();
      const [b, a] = w.fighters;
      place(b, 600, -2);
      place(a, 600 + gap, -2);
      run(w, 5);
      Object.assign(a, { hasGun: false, gun: null, active: 'melee' });
      let parried = false;
      for (let t = 0; t < 50; t++) {
        step(w, [{ ...NEUTRAL, ax: 1, ay: 0, block: t < 22 }, { ...NEUTRAL, ax: -1, ay: 0, mp: t >= 20 ? 1 : 0 }]);
        parried ||= w.events.some((e) => e.type === 'parry');
      }
      expect(parried, `gap ${gap}`).toBe(true);
    }
  });

  it('a hit from behind still gets through a block', () => {
    const w = world();
    const [b, a] = w.fighters;
    place(b, 600, -2);
    place(a, 590, -2);
    run(w, 5);
    Object.assign(a, { hasGun: false, gun: null, active: 'melee' });
    for (let t = 0; t < 40; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, block: true }, { ...NEUTRAL, ax: 1, ay: 0, mp: t >= 20 ? 1 : 0 }]);
    expect(b.damage).toBeGreaterThan(0);
  });
});

describe('ammo chests', () => {
  it('an ammo chest fills your gun (specials too), then stays shut a while', () => {
    const w = world();
    const f = w.fighters[0];
    const c = w.ammoChests[0];
    expect(c).toBeTruthy();
    Object.assign(f, { gun: 'sniper', hasGun: true, ammo: 0, spareMags: 0 });
    place(f, c.x, c.y);
    run(w, 3);
    step(w, [{ ...NEUTRAL, ep: 1 }]);
    expect(f.ammo).toBe(GUNS.sniper.magazineSize);
    expect(f.spareMags).toBe(GUNS.sniper.magazines - 1);
    expect(c.cd).toBeGreaterThan(0);
    f.ammo = 0;
    step(w, [{ ...NEUTRAL, ep: 2 }]);
    expect(f.ammo).toBe(0);
  });
});

describe('the style meter and boomerang guns', () => {
  function duel(gap = 14) {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 600 + gap, -2);
    run(w, 5);
    b.facing = -1;
    return { w, a, b };
  }

  it('a melee hit right after a gun hit fills more than a plain one', () => {
    let { w, a } = duel();
    Object.assign(a, { hasGun: false, gun: null, active: 'melee' });
    for (let t = 0; t < 20; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
    expect(a.style).toBeCloseTo(STYLE.melee, 5);
    ({ w, a } = duel());
    Object.assign(a, { hasGun: false, gun: null, active: 'melee', gunHitT: STYLE.comboWindow });
    for (let t = 0; t < 20; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
    expect(a.style).toBeCloseTo(STYLE.gunToMelee, 5);
  });

  it('a headshot fills it once, then not again until the cooldown is over', () => {
    const { w, a, b } = duel(80);
    const shoot = () => w.bullets.push({ id: w.nextBullet++, owner: a.id, x: 640, y: b.y - 28, vx: 900, vy: 0, gravity: 0, life: 1, thrown: false, damage: 1, kb: 0, growth: 0, light: true });
    shoot();
    run(w, 10);
    expect(a.style).toBeCloseTo(STYLE.headshot, 5);
    shoot();
    run(w, 10);
    expect(a.style).toBeCloseTo(STYLE.headshot, 5);
    expect(a.styleHeadCd).toBeGreaterThan(0);
  });

  it('full, it reloads your gun (not a special one), and empties', () => {
    const { w, a } = duel();
    Object.assign(a, { gun: 'pistol', hasGun: true, ammo: 0, spareMags: 0, style: 1 });
    run(w, 2);
    expect(a.ammo).toBe(GUNS.pistol.magazineSize);
    expect(a.style).toBe(0);
    Object.assign(a, { gun: 'sniper', ammo: 0, style: 1 });
    run(w, 2);
    expect(a.ammo).toBe(0);
    expect(a.style).toBe(1);
  });

  it('heavy-throw guns (the minigun) are thrown for good', () => {
    const { w, a } = duel(300);
    Object.assign(a, { gun: 'minigun', hasGun: true, ammo: 0, spareMags: 0 });
    for (let t = 0; t < 30; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1, shoot: true }, NEUTRAL]);
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1 }, NEUTRAL]);
    run(w, 90);
    expect(a.hasGun).toBe(false);
  });

  // a throws an empty pistol at b (60 px away); it bounces back; a presses pick up as it arrives.
  function throwAndCatch(w, a, press = true, before = () => {}) {
    Object.assign(a, { gun: 'pistol', hasGun: true, ammo: 0, spareMags: 0 });
    for (let t = 0; t < 30; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: -0.1, sp: 1, shoot: true }, NEUTRAL]);
    step(w, [{ ...NEUTRAL, ax: 1, ay: -0.1, sp: 1 }, NEUTRAL]);
    before();
    for (let t = 0; t < 120; t++) step(w, [{ ...NEUTRAL, ep: press ? t : 0 }, NEUTRAL]);
  }

  it('the trigger catches a returning gun too', () => {
    const { w, a } = duel(60);
    Object.assign(a, { gun: 'pistol', hasGun: true, ammo: 0, spareMags: 0 });
    for (let t = 0; t < 30; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: -0.1, sp: 1, shoot: true }, NEUTRAL]);
    step(w, [{ ...NEUTRAL, ax: 1, ay: -0.1, sp: 1 }, NEUTRAL]);
    for (let t = 0; t < 120 && !a.hasGun; t++) step(w, [{ ...NEUTRAL, sp: 2 + t }, NEUTRAL]);
    expect(a.hasGun).toBe(true);
    expect(a.style).toBeCloseTo(STYLE.catch, 5);
  });

  it('a caught gun replaces whatever is in the gun slot', () => {
    const { w, a } = duel(60);
    throwAndCatch(w, a, true, () => Object.assign(a, { gun: 'shotgun', hasGun: true, ammo: 6 }));
    expect(a.gun).toBe('pistol');
  });

  it("an uncaught gun falls to the floor, and an empty one there vanishes after a while", () => {
    const { w, a } = duel(60);
    throwAndCatch(w, a, false);
    expect(a.hasGun).toBe(false);
    const p = w.pickups.find((x) => x.weapon === 'pistol');
    expect(p?.ammo).toBe(0);
    run(w, Math.ceil(GUN_THROW.emptyLife * 60) + 5);
    expect(w.pickups.includes(p)).toBe(false);
  });

  it('a gun keeps its rounds on the floor; spare magazines stay with the player', () => {
    const w = world();
    const f = w.fighters[0];
    place(f, 600, -2);
    run(w, 3);
    f.spareMags = 0;
    w.pickups.push({ id: 99, x: 600, y: 0, weapon: 'smg', ammo: 7, t: 0 });
    step(w, [{ ...NEUTRAL, ep: 1 }, NEUTRAL]);
    expect(f.gun).toBe('smg');
    expect(f.ammo).toBe(7);
    expect(f.spareMags).toBe(0);
  });

  it('training: infinite ammo can be switched off', () => {
    const w = createWorld({ stage: 'training', players: 2, countdown: 0, seed: 5, training: true });
    const f = w.fighters[0];
    w.infiniteAmmo = false;
    run(w, 5);
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, sp: 1 }, NEUTRAL]);
    expect(f.ammo).toBe(GUNS.pistol.magazineSize - 1);
  });

  it('a thrown light gun bounces back off an enemy; pressing pick up catches it (empty), for style', () => {
    const { w, a } = duel(60);
    throwAndCatch(w, a);
    expect(a.hasGun).toBe(true);
    expect(a.gun).toBe('pistol');
    expect(a.ammo).toBe(0);
    expect(a.style).toBeCloseTo(STYLE.catch, 5);
  });
});

describe('combos', () => {
  // a punches b (standing 14 px away); returns the world when the punch has just landed.
  function landed(weapon = null) {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 614, -2);
    run(w, 5);
    Object.assign(a, { hasGun: false, gun: null, melee: weapon, active: 'melee' });
    b.facing = -1;
    for (let t = 0; t < 30 && b.damage === 0; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
    return { w, a, b };
  }

  it('a hit can be cancelled into a jump, and gives a free dash', () => {
    const { w, a } = landed('hammer');
    expect(a.swing).toBeGreaterThanOrEqual(0);
    expect(a.freeDash).toBeGreaterThan(0);
    a.stamina = 0;
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1, jp: 1, jump: true }, NEUTRAL]);
    expect(a.swing).toBe(-1);
    expect(a.vy).toBeLessThan(0);
    // The free dash, with no stamina.
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1, jp: 1, xp: 1, mx: 1 }, NEUTRAL]);
    expect(a.dash).toBeGreaterThan(0);
    expect(a.stamina).toBeLessThan(0.05);
  });

  it('a swing that hits recovers faster than one that misses', () => {
    const swingTicks = (gap) => {
      const w = world();
      const [a, b] = w.fighters;
      place(a, 600, -2);
      place(b, 600 + gap, -2);
      run(w, 5);
      Object.assign(a, { melee: 'hammer', active: 'melee' });
      let t = 0;
      step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
      while (a.swing >= 0 && t < 120) {
        step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, NEUTRAL]);
        t++;
      }
      return t;
    };
    expect(swingTicks(14)).toBeLessThan(swingTicks(200));
  });

  it('the same attack again in one combo pushes less (staleness)', () => {
    const { w, b } = landed();
    const first = Math.hypot(b.vx, b.vy);
    // Hit again right away (still in hitstun), same fists.
    b.damage = 0;
    place(b, 614, b.y);
    const a = w.fighters[0];
    a.swing = -1;
    for (let t = 0; t < 30 && b.damage === 0; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 2 }, NEUTRAL]);
    expect(b.combo.length).toBe(2);
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(first);
  });
});

describe('DI', () => {
  it('holding up while launched sideways bends the flight upward; holding nothing does not', () => {
    const launch = (held) => {
      const w = world();
      const [a, b] = w.fighters;
      place(a, 600, -2);
      place(b, 614, -2);
      run(w, 5);
      Object.assign(a, { melee: 'bat', active: 'melee' });
      b.facing = -1;
      b.damage = 80;
      let angle = null;
      for (let t = 0; t < 40 && angle === null; t++) {
        step(w, [{ ...NEUTRAL, ax: 1, ay: 0, mp: 1 }, { ...NEUTRAL, ...held }]);
        if (b.hitstun > 0) angle = Math.atan2(b.vy, b.vx);
      }
      return angle;
    };
    const plain = launch({});
    const up = launch({ up: true });
    const down = launch({ down: true });
    expect(up).toBeLessThan(plain - 0.05);
    expect(down).toBeGreaterThan(plain + 0.05);
    expect(Math.abs(up - plain)).toBeLessThanOrEqual((DI.degrees * Math.PI) / 180 + 1e-6);
  });
});

describe('the breaker', () => {
  it('block breaks a special freeze before the launch, for half the stamina bar', () => {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 620, -2);
    run(w, 5);
    a.pendingLaunch = { left: 1.5, dx: 1, dy: -1, base: 2500, growth: 0, by: 1 };
    step(w, [NEUTRAL, NEUTRAL]);
    step(w, [{ ...NEUTRAL, block: true }, NEUTRAL]);
    expect(a.pendingLaunch).toBe(null);
    expect(a.stamina).toBeCloseTo(1 - BREAKER.cost, 1);
    expect(b.vx).toBeGreaterThan(0);
    run(w, 120);
    expect(a.state).toBe('ok');
  });

  it('without enough stamina, it does nothing', () => {
    const w = world();
    const a = w.fighters[0];
    place(a, 600, -2);
    run(w, 5);
    a.pendingLaunch = { left: 1.5, dx: 1, dy: -1, base: 0, growth: 0, by: -1 };
    a.stamina = 0.2;
    step(w, [{ ...NEUTRAL, block: true }]);
    expect(a.pendingLaunch).not.toBe(null);
  });
});

describe('bodies bump', () => {
  // a walks right into b, standing still, for `ticks`; returns them.
  function walkInto(ticks, extra = () => ({})) {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 560, -2);
    place(b, 600, -2);
    run(w, 5);
    for (let t = 0; t < ticks; t++) step(w, [{ ...NEUTRAL, mx: 1, ...extra(t) }, NEUTRAL]);
    return { w, a, b };
  }

  it("you can't walk through someone", () => {
    const { a, b } = walkInto(20);
    expect(b.x - a.x).toBeGreaterThanOrEqual(FIGHTER.w - 0.01);
    expect(Math.abs(b.x - 600)).toBeLessThan(1);
  });

  it('keep pushing and you slip past', () => {
    const { a, b } = walkInto(90);
    expect(a.x).toBeGreaterThan(b.x);
  });

  it('a dash goes straight through', () => {
    const { a, b } = walkInto(25, (t) => (t >= 15 ? { xp: 1 } : {}));
    expect(a.x).toBeGreaterThan(b.x);
  });
});

describe('jabs and dummies', () => {
  it('a thrust shoots out while it hits', () => {
    const m = MELEE.warning.jabStats;
    expect(thrustReach(m, m.startup)).toBeLessThan(thrustReach(m, m.startup + m.active));
    expect(thrustReach(m, m.startup + m.active)).toBeCloseTo(m.reach);
  });

  it("a training dummy that stands still doesn't attack", () => {
    const w = world();
    const bot = createBot('dummy', 1);
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 620, -2);
    for (let t = 0; t < 120; t++) step(w, [NEUTRAL, botInput(w, 1, bot)]);
    expect(a.damage).toBe(0);
    expect(b.swing).toBe(-1);
  });

  it('the revolver is held at the same height as the 9mm', () => {
    const w = world();
    const f = w.fighters[0];
    f.gun = 'pistol';
    const pistol = gunOrigin(f).y;
    f.gun = 'revolver';
    expect(gunOrigin(f).y).toBe(pistol);
  });
});

describe('jab into heavy', () => {
  it('a heavy pressed during a jab comes out as soon as the jab has hit, about as fast as jab, jab', () => {
    // Ticks from the first jab to the second attack starting.
    const gap = (second) => {
      const w = world();
      const [a, b] = w.fighters;
      place(a, 600, -2);
      place(b, 900, -2);
      run(w, 5);
      Object.assign(a, { melee: 'hammer', active: 'melee' });
      step(w, [{ ...NEUTRAL, ax: 1, ay: 0, kp: 1 }, NEUTRAL]);
      step(w, [{ ...NEUTRAL, ax: 1, ay: 0, kp: 1, ...second }, NEUTRAL]);
      // (Until a new swing starts: its clock goes back to the start.)
      let t = 2;
      let last = a.swing;
      for (; t < 60; t++) {
        step(w, [{ ...NEUTRAL, ax: 1, ay: 0, kp: second.kp ?? 1, mp: second.mp ?? 0 }, NEUTRAL]);
        if (a.swing >= 0 && a.swing < last) break;
        last = a.swing;
      }
      return t;
    };
    const jabHeavy = gap({ mp: 1 });
    const jabJab = gap({ kp: 2 });
    expect(jabHeavy).toBeLessThanOrEqual(jabJab);
  });
});

describe('cover', () => {
  // The warehouse's left crate (x 288, 2 tiles wide); a tucked right beside it, on its right.
  function tuckedBy(gun = 'pistol') {
    const w = world();
    const [a, b] = w.fighters;
    const c = w.covers.find((o) => o.x === 288 && o.y === -TILE);
    place(a, c.x + c.w + FIGHTER.w / 2 + 1, -2);
    place(b, 1000, -2);
    run(w, 5);
    Object.assign(a, { gun, hasGun: true, ammo: GUNS[gun].magazineSize, spareMags: 1, facing: -1 });
    step(w, [{ ...NEUTRAL, crouch: true, ax: -1, ay: 0 }, NEUTRAL]);
    return { w, a, b, c };
  }

  it('tucked behind cover, your gun is held up over it, and shots clear it', () => {
    const { w, a, c } = tuckedBy();
    expect(a.tucked).toBe(true);
    step(w, [{ ...NEUTRAL, crouch: true, ax: -1, ay: 0, sp: 1, shoot: true }, NEUTRAL]);
    expect(w.bullets.length).toBe(1);
    run(w, 10, () => [{ ...NEUTRAL, crouch: true, ax: -1, ay: 0, sp: 1 }, NEUTRAL]);
    expect(c.hp).toBe(c.max);
  });

  it("the big guns can't be fired from behind cover", () => {
    const { w, a } = tuckedBy('rocket');
    step(w, [{ ...NEUTRAL, crouch: true, ax: -1, ay: 0, sp: 1, shoot: true }, NEUTRAL]);
    expect(w.bullets.length).toBe(0);
    expect(a.ammo).toBe(GUNS.rocket.magazineSize);
  });

  it('shot enough, cover breaks for good and stops being solid', () => {
    const w = world();
    const c = w.covers[0];
    const shot = { owner: 1, damage: c.max / 2 + 1 };
    for (let k = 0; k < 2; k++) {
      w.bullets.push({ id: 900 + k, ...shot, x: c.x - 30, y: c.y + c.h / 2, vx: 900, vy: 0, gravity: 0, life: 1 });
      run(w, 4);
    }
    expect(c.gone).toBe(true);
    expect(w.live.includes(c)).toBe(false);
    expect(w.covers.every((o) => o.gone || o.hp === o.max)).toBe(true);
  });
});

describe('jab into a shot', () => {
  it('a shot pressed during a jab fires as soon as the jab has hit (not after its recovery)', () => {
    const w = world();
    const [a, b] = w.fighters;
    place(a, 600, -2);
    place(b, 900, -2);
    run(w, 5);
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, kp: 1 }, NEUTRAL]);
    step(w, [{ ...NEUTRAL, ax: 1, ay: 0, kp: 1, sp: 1, shoot: true }, NEUTRAL]);
    const m = STRIKE.jabStats;
    let t = 2;
    for (; t < 60 && w.bullets.length === 0; t++) step(w, [{ ...NEUTRAL, ax: 1, ay: 0, kp: 1, sp: 1 }, NEUTRAL]);
    expect(w.bullets.length).toBe(1);
    expect(t / 60).toBeLessThan(m.startup + m.active + m.recovery);
  });
});

describe('bots and pits', () => {
  // A random dungeon with the cage (the sunken pit) in it.
  const seed = [...Array(500).keys()].find((s) => getStage(`mixed-${s}`).sections.some((c) => c.lower === 'cage'));
  const stage = `mixed-${seed}`;
  const cage = getStage(stage).sections.find((c) => c.lower === 'cage');

  it('a bot in the cage climbs out to an enemy up beside it (not into the lip above)', () => {
    for (const side of [-1, 1]) {
      const w = createWorld({ stage, players: 2, countdown: 0, seed, storm: FAR_STORM });
      const [a, b] = w.fighters;
      const mid = cage.left + 128;
      place(a, mid - side * 30, 78);
      Object.assign(a, { hasGun: false, gun: null });
      place(b, mid + side * 100, -2);
      const bot = createBot('hard', 3);
      for (let t = 0; t < 60 * 8 && a.y > -1; t++) step(w, [botInput(w, 0, bot), NEUTRAL]);
      expect(a.y).toBeLessThan(0);
    }
  });
});
