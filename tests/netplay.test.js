// Online play end to end, with rollback: the game server's room and real browser-side copies of
// the match (src/net/rollback.js), talking through pretend connections with a delay (and some
// jitter) each way. Everyone's copy must end exactly like the server's.
import { describe, it, expect } from 'vitest';
import { Room } from '../server/room.js';
import { Rollback } from '../src/net/rollback.js';
import { NEUTRAL } from '../src/sim/input.js';
import { DT } from '../src/sim/constants.js';
import { fingerprint } from '../src/sim/snapshot.js';

// A pretend connection: messages arrive `ms` later, give or take `jitter` ms (in order).
function link(ms, jitter, rnd) {
  const queue = [];
  let last = 0;
  return {
    send(now, msg) {
      last = Math.max(last, now + ms + (rnd() * 2 - 1) * jitter);
      queue.push([last, JSON.parse(JSON.stringify(msg))]);
    },
    take(now) {
      const out = [];
      while (queue.length && queue[0][0] <= now) out.push(queue.shift()[1]);
      return out;
    },
  };
}

function seeded(seed) {
  let a = seed;
  return () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

// Pressing things: a new mix every half second (different for each player).
const busy = (who) => (tick) => {
  const k = Math.floor(tick / 30) + who * 7;
  return { ...NEUTRAL, mx: [1, -1, 0, 1, -1][k % 5], jump: k % 3 === 0, jp: Math.floor(tick / (41 + who)), xp: Math.floor(tick / 77), kp: Math.floor(tick / (23 + who)), mp: Math.floor(tick / 61), sp: Math.floor(tick / 17), shoot: k % 4 === 1, crouch: k % 6 === 5, ax: who ? -1 : 1, ay: -0.2 };
};

describe('online play with rollback', () => {
  it('two players (70 and 140 ms of ping) and bots: every copy ends exactly like the server', () => {
    const rnd = seeded(7);
    const room = new Room('ABCDE');
    const clients = [];
    let now = 0;
    // Each person: their connection both ways (half their ping each way).
    const person = (name, ping) => {
      const up = link(ping / 2, 6, rnd);
      const down = link(ping / 2, 6, rnd);
      const c = { name, up, down, net: null, ended: null, frames: 0, resyncs: 0 };
      c.i = room.join(name, null, (msg) => down.send(now, msg), now);
      clients.push(c);
      return c;
    };
    const ana = person('Ana', 70);
    const beto = person('Beto', 140);
    room.receive(ana.i, { t: 'rules', rules: { stocks: 1, stormPace: 'fast' } }, 0);
    room.receive(ana.i, { t: 'addBot', level: 'hard' }, 0);
    room.receive(ana.i, { t: 'addBot', level: 'normal' }, 0);
    room.receive(ana.i, { t: 'start' }, 0);
    let late = null;
    let tick = 0;
    // Up to 2 min of frames (a 60 Hz screen), until everyone's seen the end.
    for (now = 0; now < 120000; now += 1000 / 60, tick++) {
      // Halfway through the first match, someone comes in to watch.
      if (!late && now > 20000) late = person('Caro', 100);
      room.update(now);
      for (const c of clients) {
        for (const msg of c.down.take(now)) {
          if (msg.t === 'start') {
            c.net = new Rollback(msg.init, msg.you);
            c.up.send(now, { t: 'ready' });
          }
          else c.net?.receive(msg);
        }
        if (!c.net || c.ended) continue;
        const final = c.net.frame(1 / 60, now, () => busy(c.i)(c.net.tick), (msg) => {
          if (msg.t === 'resync') c.resyncs++;
          c.up.send(now, msg);
        });
        c.frames++;
        if (final) c.ended = fingerprint(final);
        for (const msg of c.up.take(now)) room.receive(c.i, msg, now);
      }
      // (The server takes what's arrived from everyone each frame too.)
      for (const c of clients) for (const msg of c.up.take(now)) room.receive(c.i, msg, now);
      if (clients.every((c) => c.ended)) break;
    }
    expect(room.phase).toBe('results');
    // Everyone saw the same ending as the server, without needing its whole world sent again
    // (Caro got it once, joining late).
    const serverEnd = fingerprint(room.match.world);
    for (const c of clients) {
      expect(c.ended, c.name).toBe(serverEnd);
      expect(c.resyncs, `${c.name} drifted`).toBe(0);
    }
  }, 60000); // (a minute of play, simulated: a few seconds)
});

describe('online play: a window hidden for a while', () => {
  // Ana (70 ms) and Beto (140 ms); Beto's window is hidden for `away` s (it stops playing; the
  // server's messages keep coming), then he's back, holding right. Returns what happened.
  function hide(away) {
    const rnd = seeded(11);
    const room = new Room('ABCDE');
    const clients = [];
    let now = 0;
    const person = (name, ping) => {
      const c = { name, up: link(ping / 2, 4, rnd), down: link(ping / 2, 4, rnd), net: null };
      c.i = room.join(name, null, (msg) => c.down.send(now, msg), now);
      clients.push(c);
      return c;
    };
    const ana = person('Ana', 70);
    const beto = person('Beto', 140);
    room.receive(ana.i, { t: 'rules', rules: { stocks: 5, stormPace: 'off' } }, 0);
    room.receive(ana.i, { t: 'start' }, 0);
    const hiddenFrom = 6000;
    const back = hiddenFrom + away * 1000;
    const out = { xHidden: [], xBack: null, movedBack: null };
    const fighter = () => room.match.world.fighters[1];
    for (now = 0; now < back + 3000; now += 1000 / 60) {
      room.update(now);
      for (const c of clients) {
        for (const msg of c.down.take(now)) {
          if (msg.t === 'start') {
            c.net = new Rollback(msg.init, msg.you);
            c.up.send(now, { t: 'ready' });
          }
          else c.net?.receive(msg);
        }
        const hidden = c === beto && now >= hiddenFrom && now < back;
        if (!c.net || hidden) continue;
        // (Beto holds right throughout, so if the server kept repeating it he'd run on.)
        const input = c === beto ? { ...NEUTRAL, mx: 1 } : NEUTRAL;
        c.net.frame(1 / 60, now, () => input, (msg) => c.up.send(now, msg));
      }
      for (const c of clients) for (const msg of c.up.take(now)) room.receive(c.i, msg, now);
      if (now >= hiddenFrom + 1000 && now < back) out.xHidden.push(fighter().x);
      if (out.xBack === null && now >= back) out.xBack = fighter().x;
      // (Moving again: how long after coming back.)
      if (out.movedBack === null && now >= back && Math.abs(fighter().x - out.xBack) > 4) out.movedBack = now - back;
    }
    return out;
  }

  for (const away of [5, 15]) {
    it(`hidden ${away} s: stands still meanwhile, and can move again within a second of coming back`, () => {
      const { xHidden, movedBack } = hide(away);
      // While away: let go of everything (not running on, holding right).
      expect(Math.max(...xHidden) - Math.min(...xHidden)).toBeLessThan(2);
      expect(movedBack).not.toBe(null);
      expect(movedBack).toBeLessThan(1000);
    });
  }
});
