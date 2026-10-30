// The page's side of an online room (src/net/room.js), with a pretend WebSocket.
import { describe, it, expect } from 'vitest';
import { OnlineRoom } from '../src/net/room.js';
import { Rollback } from '../src/net/rollback.js';
import { makeWorld } from '../src/net/rollback.js';
import { pack } from '../src/sim/snapshot.js';

const fakeSocket = () => ({ readyState: 1, sent: [], send(text) { this.sent.push(JSON.parse(text)); }, close() {} });

describe('online connection', () => {
  it("a match's first messages wait for the match to be listening (it takes a moment to load)", () => {
    const room = new OnlineRoom(fakeSocket());
    room.receive({ t: 'start', names: ['A', 'B'] });
    for (let k = 0; k < 5; k++) room.receive({ t: 'tk', k, i: [] });
    const got = [];
    room.on('match', (msg) => got.push(msg.k));
    room.receive({ t: 'tk', k: 5, i: [] });
    expect(got).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('a tick that never came (a gap the match can\'t fill): it asks for the whole world', () => {
    const init = { players: 2, stocks: 3, stage: 'warehouse', seed: 3, rules: {}, stormPace: 'normal', crown: -1, crownRule: 'show' };
    const net = new Rollback(init, 0);
    const codes = [new Array(15).fill(0), new Array(15).fill(0)];
    for (let k = 1; k < 80; k++) net.confirm(k, codes); // (tick 0 lost)
    const sent = [];
    for (let f = 0; f < 10; f++) net.frame(1 / 60, 2000 + f * 16, () => ({}), (msg) => sent.push(msg.t));
    expect(sent).toContain('resync');
    // The server's world comes: the gap's behind it, and play goes on.
    const server = makeWorld(init);
    server.tick = 80;
    net.load(pack(server));
    expect(net.through).toBeGreaterThanOrEqual(79);
  });
});
