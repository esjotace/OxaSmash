import { describe, it, expect } from 'vitest';
import { DuelBoard, DUEL, DUEL_MODES } from '../src/net/duels.js';
import { createWorld } from '../src/sim/world.js';

const people = (n, bots = 0) => [{ name: 'Host', kind: 'host' }, ...Array.from({ length: n - 1 - bots }, (_, i) => ({ name: `P${i + 1}`, kind: 'remote' })), ...Array.from({ length: bots }, (_, i) => ({ name: `Bot ${i + 1}`, kind: 'bot' }))];

describe('honor duels', () => {
  it('a challenge accepted is a duel; their other challenges are off', () => {
    const b = new DuelBoard(people(4), 0);
    b.act(0, { a: 'invite', to: 1 }, 10);
    b.act(2, { a: 'invite', to: 1 }, 20);
    b.act(1, { a: 'invite', to: 3 }, 30);
    expect(b.act(1, { a: 'accept', from: 0 }, 40)).toBe(true);
    expect(b.duels).toEqual([expect.objectContaining({ a: 0, b: 1 })]);
    expect(b.invites).toEqual([]);
    // (Taken: no more challenges to or from them.)
    expect(b.act(2, { a: 'invite', to: 0 }, 50)).toBe(false);
  });

  it('the challenger can cancel, the challenged can say no', () => {
    const b = new DuelBoard(people(3), 0);
    b.act(0, { a: 'invite', to: 1 }, 1);
    b.act(0, { a: 'invite', to: 2 }, 2);
    b.act(0, { a: 'cancel', to: 1 }, 3);
    b.act(2, { a: 'decline', from: 0 }, 4);
    expect(b.invites).toEqual([]);
  });

  it('duels go first come, first served', () => {
    const b = new DuelBoard(people(4), 0);
    b.act(0, { a: 'invite', to: 1 }, 1);
    b.act(2, { a: 'invite', to: 3 }, 2);
    b.act(3, { a: 'accept', from: 2 }, 5);
    b.act(1, { a: 'accept', from: 0 }, 9);
    expect(b.duels.map((d) => d.a)).toEqual([2, 0]);
  });

  it('a bot takes any challenge and goes along with the rules', () => {
    const b = new DuelBoard(people(2, 1), 0);
    b.act(0, { a: 'invite', to: 1 }, 1);
    expect(b.duels.length).toBe(1);
    b.tick(2);
    expect(b.phase).toBe('countdown');
    b.tick(2 + DUEL.countdownMs);
    expect(b.phase).toBe('rules');
    b.act(0, { a: 'pick', mode: 'shootout' }, 3 + DUEL.countdownMs);
    expect(b.phase).toBe('fight');
    expect(b.setup()).toEqual(expect.objectContaining({ a: 0, b: 1, mode: 'shootout', stocks: 3 }));
  });

  it("the countdown waits for everyone to decide (or 30 s), then idle players watch", () => {
    const b = new DuelBoard(people(3), 0);
    b.act(0, { a: 'invite', to: 1 }, 1);
    b.act(1, { a: 'accept', from: 0 }, 2);
    b.tick(100);
    expect(b.phase).toBe('gather'); // (player 2 hasn't decided)
    b.tick(DUEL.afterMs);
    expect(b.watching.has(2)).toBe(true);
    expect(b.phase).toBe('countdown');
  });

  it('with auto-spectate off, an idle player is left alone', () => {
    const b = new DuelBoard(people(3), 0);
    b.act(2, { a: 'auto', on: false }, 0);
    b.act(0, { a: 'invite', to: 1 }, 1);
    b.act(1, { a: 'accept', from: 0 }, 2);
    b.tick(DUEL.afterMs + 10);
    expect(b.watching.has(2)).toBe(false);
    expect(b.phase).toBe('countdown'); // (30 s on: the duels go ahead anyway)
  });

  it('different picks mean a Normal duel; both on Crowd\'s Choice, the spectators vote', () => {
    const b = new DuelBoard(people(4), 0, () => 0.99);
    b.act(0, { a: 'invite', to: 1 }, 1);
    b.act(1, { a: 'accept', from: 0 }, 2);
    b.act(2, { a: 'invite', to: 3 }, 3);
    b.act(3, { a: 'accept', from: 2 }, 4);
    b.tick(5);
    b.tick(5 + DUEL.countdownMs);
    b.act(0, { a: 'pick', mode: 'beatdown' }, 6);
    b.act(1, { a: 'pick', mode: 'shootout' }, 7);
    expect(b.setup().mode).toBe('normal');
    b.result(0, 8);
    expect(b.phase).toBe('rules');
    b.act(2, { a: 'pick', mode: 'crowd' }, 9);
    b.act(3, { a: 'pick', mode: 'crowd' }, 10);
    expect(b.phase).toBe('vote');
    b.act(0, { a: 'vote', mode: 'gentleman' }, 11);
    b.act(1, { a: 'vote', mode: 'gentleman' }, 12);
    expect(b.act(2, { a: 'vote', mode: 'shootout' }, 13)).toBe(false); // (duellers don't vote)
    b.tick(10 + DUEL.voteMs);
    expect(b.setup().mode).toBe('gentleman');
    b.result(3, 20);
    expect(b.phase).toBe('done');
  });

  it('every mode sets up a match', () => {
    for (const [key, m] of Object.entries(DUEL_MODES)) {
      if (!m.rules) continue;
      const w = createWorld({ players: 2, rules: m.rules, stocks: 3 });
      const f = w.fighters[0];
      if (key === 'gentleman' || key === 'beatdown' || key === 'grenades') expect(f.hasGun).toBe(false);
      if (key === 'onegun' || key === 'shootout' || key === 'normal') expect(f.gun).toBe('pistol');
      expect(f.grenades.length).toBe(key === 'grenades' ? 2 : 0);
    }
  });
});
