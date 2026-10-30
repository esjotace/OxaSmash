// Rollback rests on this: a world saved and played on with the same inputs comes out the same,
// tick for tick (src/sim/snapshot.js).
import { describe, it, expect } from 'vitest';
import { createWorld, step } from '../src/sim/world.js';
import { createBot, botInput } from '../src/bots/bot.js';
import { save, restore, pack, unpack, fingerprint } from '../src/sim/snapshot.js';

// A busy 6-bot match: the inputs each tick, recorded, so they can be played again exactly.
function record(ticks, stage = 'mixed-4242') {
  const w = createWorld({ stage, players: 6, countdown: 0, seed: 99, storm: { startDelay: 5, firstShrink: 10, hold: 5, finalShrink: 10 } });
  const bots = w.fighters.map((_, i) => createBot('hard', i + 7));
  const inputs = [];
  for (let t = 0; t < ticks; t++) {
    const tick = w.fighters.map((_, i) => botInput(w, i, bots[i]));
    inputs.push(tick);
    step(w, tick);
  }
  return { w, inputs };
}
const fresh = (stage = 'mixed-4242') => createWorld({ stage, players: 6, countdown: 0, seed: 99, storm: { startDelay: 5, firstShrink: 10, hold: 5, finalShrink: 10 } });

describe('rollback: the world plays back exactly', () => {
  const { w: played, inputs } = record(2400);

  it('the same inputs from the start: the same world (40 s of 6 hard bots)', () => {
    const w = fresh();
    for (const tick of inputs) step(w, tick);
    expect(fingerprint(w)).toBe(fingerprint(played));
    expect(w.fighters.map((f) => [f.x, f.y, f.damage, f.stocks])).toEqual(played.fighters.map((f) => [f.x, f.y, f.damage, f.stocks]));
  });

  it('saved partway, played on, rolled back and played again: the same world', () => {
    const w = fresh();
    for (const tick of inputs.slice(0, 1000)) step(w, tick);
    const saved = save(w);
    for (const tick of inputs.slice(1000, 1300)) step(w, tick); // (a guess, played ahead)
    restore(w, saved);
    for (const tick of inputs.slice(1000)) step(w, tick);
    expect(fingerprint(w)).toBe(fingerprint(played));
  });

  it('sent over the network partway (packed and unpacked) and played on: the same world', () => {
    const w = fresh();
    for (const tick of inputs.slice(0, 1500)) step(w, tick);
    const copy = unpack(pack(w));
    for (const tick of inputs.slice(1500)) step(copy, tick);
    expect(fingerprint(copy)).toBe(fingerprint(played));
  });
});
