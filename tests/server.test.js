// The game server's rooms (server/room.js), driven directly: no network, time passed in.
import { describe, it, expect } from 'vitest';
import { Room } from '../server/room.js';
import { RULES } from '../src/sim/constants.js';
import { encodeInput, NEUTRAL } from '../src/sim/input.js';

// A person: what the room sends them, in order.
function person(room, name, now = 0) {
  const inbox = [];
  const i = room.join(name, null, (msg) => inbox.push(msg), now);
  return { i, inbox, last: (t) => inbox.filter((m) => m.t === t).at(-1) };
}

// Run the room's clock from `from` for `seconds`, in screen-sized steps.
function run(room, from, seconds) {
  let t = from;
  for (; t < from + seconds * 1000; t += 16) room.update(t);
  return t;
}

describe('game server rooms', () => {
  it('whoever made the room owns it; when they leave, the next person does', () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    const b = person(room, 'Beto');
    expect(a.last('lobby').owner).toBe(true);
    expect(b.last('lobby').owner).toBe(false);
    // Only the owner's commands count.
    room.receive(b.i, { t: 'addBot', level: 'hard' }, 0);
    expect(room.players.length).toBe(2);
    room.receive(a.i, { t: 'addBot', level: 'hard' }, 0);
    expect(room.players.length).toBe(3);
    room.leave(a.i, 0);
    expect(b.last('lobby').owner).toBe(true);
  });

  it('rules from the owner are checked', () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    room.receive(a.i, { t: 'rules', rules: { stocks: 99, rounds: 7, stage: 'nowhere', stormPace: 'warp', rules: { melee: false } } }, 0);
    const r = a.last('lobby').rules;
    expect(r.stocks).toBe(5);
    expect(r.rounds).toBe(1);
    expect(r.stormPace).toBe('normal');
    expect(r.rules.melee).toBe(false);
    expect(r.rules.ranged).toBe(true);
  });

  it(`takes up to ${RULES.maxOnline} players, people and bots, and ${RULES.maxWatching} watching`, () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    for (let k = 0; k < 4; k++) room.receive(a.i, { t: 'addBot' }, 0);
    const f = person(room, 'Fede');
    expect(f.i).toBe(5);
    // (Full: the next ones watch, as many as come.)
    const g = person(room, 'Gil');
    person(room, 'Hugo');
    const lobby = g.last('lobby').players;
    expect(lobby[6]).toMatchObject({ name: 'Gil', watching: true });
    expect(lobby[7]).toMatchObject({ name: 'Hugo', watching: true });
    expect(lobby.filter((p) => !p.watching).length).toBe(RULES.maxOnline);
    // (Up to the watching limit; after that, turned away.)
    for (let k = 2; k < RULES.maxWatching; k++) person(room, `W${k}`);
    expect(typeof person(room, 'Late').i).toBe('string');
  });

  it('a seat that opens up goes to whoever has watched longest; watchers see matches', () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    for (let k = 0; k < 5; k++) room.receive(a.i, { t: 'addBot' }, 0);
    const g = person(room, 'Gil');
    person(room, 'Hugo');
    room.receive(a.i, { t: 'start' }, 0);
    expect(room.match.slots.length).toBe(RULES.maxOnline);
    expect(g.last('start').you).toBe(-1); // watching
    expect(g.inbox.length).toBeGreaterThan(0);
    // Back in the lobby, a bot is removed: Gil (first in line) takes the seat, Hugo still waits.
    room.receive(a.i, { t: 'lobby' }, 1);
    room.receive(a.i, { t: 'remove', i: 1 }, 1);
    const lobby = a.last('lobby').players;
    expect(lobby.find((p) => p.name === 'Gil').watching).toBe(false);
    expect(lobby.find((p) => p.name === 'Hugo').watching).toBe(true);
  });

  it('plays the match itself: inputs in, snapshots out, then the results and the duels', () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    room.receive(a.i, { t: 'rules', rules: { stocks: 1, stormPace: 'fast' } }, 0);
    for (let k = 0; k < 3; k++) room.receive(a.i, { t: 'addBot', level: 'hard' }, 0);
    room.receive(a.i, { t: 'start' }, 0);
    const start = a.last('start');
    expect(start.names.length).toBe(4);
    expect(start.you).toBe(0);
    const x0 = room.match.world.fighters[0].x;
    room.receive(a.i, { t: 'in', i: encodeInput({ ...NEUTRAL, mx: 1 }) }, 0);
    let t = run(room, 0, 4); // (past the countdown)
    expect(a.inbox.some((m) => m.t === 'snap')).toBe(true);
    expect(room.match.world.fighters[0].x).toBeGreaterThan(x0 + 20);
    // Bots fight it out (the person walking into whatever stopped them) until it's over.
    for (let k = 0; k < 400 && room.phase === 'match'; k++) t = run(room, t, 1);
    expect(room.phase).toBe('results');
    expect(a.last('duels').d.phase).toBe('gather');
    // Back to the lobby.
    room.receive(a.i, { t: 'lobby' }, t);
    expect(room.phase).toBe('lobby');
    expect(a.last('duels').d).toBe(null);
  });

  it('a duel against a bot: challenge, rules, played between just the two', () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    const b = person(room, 'Beto');
    room.receive(a.i, { t: 'addBot' }, 0);
    room.receive(a.i, { t: 'start' }, 0);
    room.matchOver(room.match, 0);
    room.receive(a.i, { t: 'duel', a: 'invite', to: 2 }, 0);
    room.receive(b.i, { t: 'duel', a: 'spectate', on: true }, 0);
    room.receive(a.i, { t: 'duelNow' }, 0);
    let t = run(room, 0, 0.5);
    room.receive(a.i, { t: 'duel', a: 'pick', mode: 'gentleman' }, t);
    t = run(room, t, 0.1);
    expect(room.phase).toBe('match');
    expect(room.match.slots).toEqual([0, 2]);
    expect(a.last('start').duel).toBe('gentleman');
    expect(b.last('start').you).toBe(-1); // watching
    expect(room.match.world.fighters.every((f) => !f.hasGun)).toBe(true);
  });

  it('in a series, the duels only open once it is decided', () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    room.receive(a.i, { t: 'rules', rules: { rounds: 3 } }, 0);
    room.receive(a.i, { t: 'addBot' }, 0);
    // Round 1: Ana wins (1 of the 2 needed): no duels yet.
    room.receive(a.i, { t: 'start' }, 0);
    room.match.world.winner = 0;
    room.matchOver(room.match, 0);
    expect(room.duels).toBe(null);
    // Round 2: Ana wins again: the series is hers, and the duels open.
    room.receive(a.i, { t: 'again' }, 1);
    room.match.world.winner = 0;
    room.matchOver(room.match, 1);
    expect(room.series.over).toBe(true);
    expect(a.last('duels').d.phase).toBe('gather');
  });
});
