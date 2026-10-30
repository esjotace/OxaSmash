// The game server's rooms (server/room.js), driven directly: no network, time passed in.
import { describe, it, expect } from 'vitest';
import { Room, IDLE_MS } from '../server/room.js';
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

  it('rule presets come through (what they put in play, and their extras)', () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    room.receive(a.i, { t: 'rules', rules: { preset: 'grenades', rules: { melee: false, ranged: false, thrown: true, items: false, startGrenades: 2 } } }, 0);
    expect(a.last('lobby').rules).toMatchObject({ preset: 'grenades', rules: { ranged: false, thrown: true, startGrenades: 2 } });
    room.receive(a.i, { t: 'rules', rules: { preset: 'nonsense', rules: { startGrenades: 99 } } }, 0);
    expect(a.last('lobby').rules).toMatchObject({ preset: 'custom', rules: { startGrenades: 2 } });
    room.receive(a.i, { t: 'addBot' }, 0);
    room.receive(a.i, { t: 'rules', rules: { preset: 'gentleman', rules: { melee: false, ranged: false, thrown: false, items: false } } }, 0);
    room.receive(a.i, { t: 'start' }, 0);
    expect(room.match.world.fighters.every((f) => !f.hasGun)).toBe(true);
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

  it("plays the match itself: inputs in (for their tick), everyone's inputs out, then the results and the duels", () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    room.receive(a.i, { t: 'rules', rules: { stocks: 1, stormPace: 'fast' } }, 0);
    for (let k = 0; k < 3; k++) room.receive(a.i, { t: 'addBot', level: 'hard' }, 0);
    room.receive(a.i, { t: 'start' }, 0);
    room.receive(a.i, { t: 'ready' }, 0); // (Ana's game has loaded: the match can start)
    const start = a.last('start');
    expect(start.names.length).toBe(4);
    expect(start.you).toBe(0);
    const x0 = room.match.world.fighters[0].x;
    // Past the countdown, walking right for a second (each input sent ahead, for its tick).
    let t = run(room, 0, 3.2);
    const from = room.match.world.tick;
    for (let k = from; k < from + 60; k++) room.receive(a.i, { t: 'in', i: encodeInput({ ...NEUTRAL, mx: 1 }), k }, t);
    t = run(room, t, 1.1);
    const tk = a.inbox.filter((m) => m.t === 'tk');
    expect(tk.length).toBeGreaterThan(200);
    expect(tk[200].i.length).toBe(4); // (everyone's inputs, the bots' too)
    expect(a.inbox.some((m) => m.t === 'ck' && Number.isInteger(m.h))).toBe(true);
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

  it('guests suggest a stage and rules (the owner decides); suggestions clear when a match starts', () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    const b = person(room, 'Beto');
    // A guest can't change the rules...
    room.receive(b.i, { t: 'rules', rules: { stocks: 1 } }, 0);
    expect(a.last('lobby').rules.stocks).toBe(RULES.stocks);
    // ...but can suggest (checked: a stage that doesn't exist is dropped).
    room.receive(b.i, { t: 'suggest', stage: 'castle', preset: 'grenades' }, 0);
    expect(a.last('lobby').players[b.i].suggest).toEqual({ stage: 'castle', preset: 'grenades' });
    room.receive(b.i, { t: 'suggest', stage: 'nowhere', preset: 'shootout' }, 0);
    expect(a.last('lobby').players[b.i].suggest).toEqual({ stage: null, preset: 'shootout' });
    // (The owner doesn't suggest: they set the rules.)
    room.receive(a.i, { t: 'suggest', preset: 'beatdown' }, 0);
    expect(a.last('lobby').players[a.i].suggest).toBe(null);
    room.receive(a.i, { t: 'start' }, 0);
    expect(room.players[b.i].suggest).toBe(null);
  });

  it('a rematch is an invite: 30 s to accept or sit out; everyone in: 10 s, or now if the owner says', () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    const b = person(room, 'Beto');
    const c = person(room, 'Caro');
    room.receive(a.i, { t: 'start' }, 0);
    room.matchOver(room.match, 0);
    room.receive(a.i, { t: 'again' }, 0);
    expect(b.last('rematch').r.invited).toEqual([b.i, c.i]);
    expect(b.last('rematch').r.left).toBe(30);
    // Beto accepts, Caro sits it out: when the time's up, Caro watches.
    room.receive(b.i, { t: 'rematchAnswer', yes: true }, 0);
    room.receive(c.i, { t: 'rematchAnswer', yes: false }, 0);
    let t = run(room, 0, 29);
    expect(room.phase).toBe('results');
    t = run(room, t, 1.2);
    expect(room.phase).toBe('match');
    expect(room.match.slots).toEqual([a.i, b.i]);
    expect(c.last('start').you).toBe(-1);
    // Next time everyone's in at once: 10 s left, and the owner can start it now.
    room.matchOver(room.match, t);
    room.receive(a.i, { t: 'again' }, t);
    room.receive(b.i, { t: 'rematchAnswer', yes: true }, t);
    room.receive(c.i, { t: 'rematchAnswer', yes: true }, t);
    expect(b.last('rematch').r.allIn).toBe(true);
    expect(b.last('rematch').r.left).toBe(10);
    room.receive(a.i, { t: 'rematchNow' }, t);
    expect(room.phase).toBe('match');
  });

  it('duels go on during a rematch invite, and the rematch waits for them', () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    const b = person(room, 'Beto');
    const c = person(room, 'Caro');
    room.receive(a.i, { t: 'start' }, 0);
    room.matchOver(room.match, 0);
    // A challenge waiting: the owner can't offer a rematch.
    room.receive(b.i, { t: 'duel', a: 'invite', to: c.i }, 0);
    room.receive(a.i, { t: 'again' }, 0);
    expect(room.rematch).toBe(null);
    room.receive(b.i, { t: 'duel', a: 'cancel', to: c.i }, 0);
    room.receive(a.i, { t: 'again' }, 0);
    expect(room.rematch).not.toBe(null);
    // Both accept the rematch, then Beto still challenges Caro: the rematch waits past its time.
    room.receive(b.i, { t: 'rematchAnswer', yes: true }, 0);
    room.receive(c.i, { t: 'rematchAnswer', yes: true }, 0);
    room.receive(b.i, { t: 'duel', a: 'invite', to: c.i }, 0);
    expect(room.duels.invites.length).toBe(1);
    let t = run(room, 0, 31);
    expect(room.phase).toBe('results');
    expect(a.last('rematch').r.duels).toBe(true);
    // Caro says no: no duels on, the rematch goes ahead.
    room.receive(c.i, { t: 'duel', a: 'decline', from: b.i }, t);
    t = run(room, t, 0.1);
    expect(room.phase).toBe('match');
  });

  it("no answer to a rematch invite: you watch it (and you're invited to the next one)", () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    const b = person(room, 'Beto');
    const c = person(room, 'Caro');
    room.receive(a.i, { t: 'start' }, 0);
    room.matchOver(room.match, 0);
    room.receive(a.i, { t: 'again' }, 0);
    room.receive(b.i, { t: 'rematchAnswer', yes: true }, 0);
    let t = run(room, 0, 31);
    expect(room.match.slots.map((i) => room.players[i].name)).toEqual(['Ana', 'Beto']);
    // Caro watched that one; the next invite is hers too.
    room.matchOver(room.match, t);
    room.receive(a.i, { t: 'again' }, t);
    expect(c.last('rematch').r.invited).toContain(c.i);
  });

  it("someone spectating the duels is asked too, and can accept without stopping", () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    const b = person(room, 'Beto');
    const e = person(room, 'Eli');
    room.receive(a.i, { t: 'start' }, 0);
    room.matchOver(room.match, 0);
    room.receive(e.i, { t: 'duel', a: 'spectate', on: true }, 0);
    room.receive(a.i, { t: 'again' }, 0);
    expect(e.last('rematch').r.invited).toContain(e.i);
    room.receive(b.i, { t: 'rematchAnswer', yes: true }, 0);
    room.receive(e.i, { t: 'rematchAnswer', yes: true }, 0);
    room.receive(a.i, { t: 'rematchNow' }, 0);
    expect(room.match.slots.map((i) => room.players[i].name)).toEqual(['Ana', 'Beto', 'Eli']);
  });

  it('lobby: ready, votes on suggestions, private rooms, handing over the room', () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    const b = person(room, 'Beto');
    const c = person(room, 'Caro');
    room.receive(b.i, { t: 'lobbyReady', on: true }, 0);
    expect(a.last('lobby').players[b.i].ready).toBe(true);
    room.receive(b.i, { t: 'suggest', preset: 'grenades' }, 0);
    room.receive(c.i, { t: 'vote', i: b.i }, 0);
    expect(a.last('lobby').players[b.i].votes).toBe(1);
    expect(c.last('lobby').players[b.i].voted).toBe(true);
    room.receive(b.i, { t: 'vote', i: b.i }, 0); // (not your own)
    expect(a.last('lobby').players[b.i].votes).toBe(1);
    room.receive(a.i, { t: 'private', on: true }, 0);
    expect(room.summary().private).toBe(true);
    room.receive(a.i, { t: 'giveOwner', i: c.i }, 0);
    expect(c.last('lobby').owner).toBe(true);
    expect(b.last('notice').text).toContain('Caro');
  });

  it('when the owner leaves, the room goes to whoever joined first', () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana', 0);
    const b = person(room, 'Beto', 5);
    const c = person(room, 'Caro', 10);
    room.leave(a.i, 20);
    expect(b.last('lobby').owner).toBe(true);
    expect(c.last('notice').text).toContain('Beto');
  });

  it('an idle seat in the lobby goes to whoever is waiting', () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana', 0);
    const others = ['Beto', 'Caro', 'Dani', 'Eli', 'Fer', 'Gus'].map((n) => person(room, n, 0));
    const waiting = others.at(-1);
    expect(waiting.last('lobby').players.at(-1).watching).toBe(true);
    // Everyone but Beto does something now and then.
    for (const p of [a, ...others.slice(1)]) room.receive(p.i, { t: 'lobbyReady', on: true }, IDLE_MS - 1000);
    room.update(IDLE_MS + 1000);
    const names = waiting.last('lobby').players;
    expect(names.find((p) => p.name === 'Beto').watching).toBe(true);
    expect(names.find((p) => p.name === 'Gus').watching).toBe(false);
  });

  it('player rotation: Pass the Crown sits the best player out for whoever is waiting', () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    room.receive(a.i, { t: 'rules', rules: { rotation: 'crown' } }, 0);
    const others = ['Beto', 'Caro', 'Dani', 'Eli', 'Fer', 'Gus'].map((n) => person(room, n, 0));
    room.receive(a.i, { t: 'start' }, 0);
    // Beto did best.
    room.match.world.fighters.forEach((f, k) => Object.assign(f, { stocks: k === 1 ? 3 : 0, kos: k === 1 ? 5 : 0 }));
    room.matchOver(room.match, 0);
    room.receive(a.i, { t: 'again' }, 0);
    for (const p of others.slice(0, 5)) room.receive(p.i, { t: 'rematchAnswer', yes: true }, 0);
    room.receive(a.i, { t: 'rematchNow' }, 0);
    expect(room.phase).toBe('match');
    const playing = room.match.slots.map((i) => room.players[i].name);
    expect(playing).not.toContain('Beto');
    expect(playing).toContain('Gus');
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

  it("the countdown waits for everyone's game to load (or 5 s), not for bots or anyone watching", () => {
    const room = new Room('ABCDE');
    const a = person(room, 'Ana');
    const b = person(room, 'Beto');
    room.receive(a.i, { t: 'addBot' }, 0);
    room.receive(a.i, { t: 'start' }, 0);
    room.receive(a.i, { t: 'ready' }, 0);
    run(room, 0, 1);
    expect(room.match.world.tick).toBe(0); // (Beto's still loading)
    room.receive(b.i, { t: 'ready' }, 1000);
    run(room, 1000, 1);
    expect(room.match.world.tick).toBeGreaterThan(50);
    // A game that never says it's ready: the match starts anyway after 5 s.
    const late = new Room('FGHIJ');
    const c = person(late, 'Caro');
    person(late, 'Dani');
    late.receive(c.i, { t: 'start' }, 0);
    late.receive(c.i, { t: 'ready' }, 0);
    run(late, 0, 4.9);
    expect(late.match.world.tick).toBe(0);
    run(late, 4900, 1);
    expect(late.match.world.tick).toBeGreaterThan(30);
  });
});
