// Knockout lines: the rules record what knocked someone out; kolines.js says it.
import { describe, it, expect } from 'vitest';
import { createWorld, step } from '../src/sim/world.js';
import { NEUTRAL } from '../src/sim/input.js';
import { MELEE, GUNS } from '../src/sim/constants.js';
import { KO_LINES, koLine } from '../src/game/kolines.js';

const names = ['Ana', 'Beto'];
const first = () => 0;

describe('knockout lines', () => {
  it('three lines for every weapon, and the catch-alls', () => {
    for (const key of ['fists', ...Object.keys(MELEE), ...Object.keys(GUNS), 'explosion', 'self', 'unknown', 'storm', 'spikes', 'crusher']) {
      expect(KO_LINES[key]?.length, key).toBe(3);
    }
  });

  it('names who did it, with what', () => {
    expect(koLine({ id: 1, by: 0, with: 'knife' }, names, first)).toBe('Ana stabbed Beto out of the stage');
    expect(koLine({ id: 1, by: 0, with: 'c4' }, names, first)).toBe('Ana blew Beto sky-high');
    expect(koLine({ id: 1, by: 0, with: 'mystery' }, names, first)).toContain('Ana');
    expect(koLine({ id: 1, by: -1, with: null }, names, first)).toBe('Beto tripped on nothing and left the stage');
    expect(koLine({ id: 1, by: -1, with: 'spikes' }, names, first)).toBe('Beto found the spikes. Pointy.');
    expect(koLine({ id: 1, by: 0, with: 'spikes' }, names, first)).toBe('Ana introduced Beto to the spikes');
  });

  it("a knockout says what did it, and who's to blame", () => {
    const w = createWorld({ stage: 'warehouse', players: 2, countdown: 0, seed: 3, storm: { startDelay: 999 } });
    const [a, b] = w.fighters;
    Object.assign(a, { x: 600, y: -2, melee: 'hammer', active: 'melee' });
    Object.assign(b, { x: 614, y: -2, damage: 400 });
    let ko = null;
    for (let t = 0; t < 400 && !ko; t++) {
      step(w, [{ ...NEUTRAL, ax: 1, ay: -0.3, mp: 1 }, NEUTRAL]);
      ko = w.events.find((e) => e.type === 'ko');
    }
    // (Here the hammer sends Beto into a spike wall, and he bounces off it again 2 s later
    // and out: too long after Ana's hit for her to get it.)
    expect(ko).toMatchObject({ id: 1, by: -1, with: 'spikes' });
    expect(koLine(ko, names, first)).toBe('Beto found the spikes. Pointy.');
  });
});

describe('knockout credit', () => {
  // Beto, at 400%, is knocked out of the stage `ago` s after Ana's hit (or a hazard's).
  function koAfter(ago, hazard = null) {
    const w = createWorld({ stage: 'warehouse', players: 2, countdown: 0, seed: 3, storm: { startDelay: 999 } });
    const [a, b] = w.fighters;
    w.tick = 1000;
    Object.assign(b, { lastHitBy: 0, lastPlayerHitAt: w.tick - Math.round(ago * 60), lastHitAt: w.tick - (hazard ? 0 : Math.round(ago * 60)), lastHitWith: hazard ?? 'knife' });
    Object.assign(b, { x: 600, y: 900 }); // (below the stage: out)
    step(w, [NEUTRAL, NEUTRAL]);
    return { ko: w.events.find((e) => e.type === 'ko'), a };
  }

  it('the KO point and the line go to whoever hit you in the last 2 s', () => {
    expect(koAfter(1.5).ko.by).toBe(0);
    expect(koAfter(1.5).a.kos).toBe(1);
    expect(koAfter(3).ko.by).toBe(-1);
    expect(koAfter(3).a.kos).toBe(0);
    expect(koLine(koAfter(3).ko, names, first)).toBe('Beto tripped on nothing and left the stage');
  });

  it('finished off by spikes: only if they hit you within 1 s of it', () => {
    expect(koAfter(0.5, 'spikes').ko.by).toBe(0);
    expect(koAfter(2, 'spikes').ko.by).toBe(-1);
    expect(koLine(koAfter(2, 'spikes').ko, names, first)).toBe('Beto found the spikes. Pointy.');
  });
});
