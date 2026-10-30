// Online rooms, on the game server (see server/): the server runs the matches; everyone sends
// their inputs and draws the state it sends back. The room's owner (whoever made it) sends the
// commands that run it: rules, bots, start, rematch, back to the lobby.
import { pageParams } from '../params.js';
import { cleanName } from './names.js';

export { CODE_LENGTH, cleanCode, cleanName } from './names.js';

// Where the server is: VITE_SERVER_URL when the game was built with one (the game on GitHub
// Pages, the server elsewhere), else /ws on this page's own address (the server serving the game,
// or the dev server passing it on: see vite.config.js).
export const serverUrl = () => import.meta.env.VITE_SERVER_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

// Practice lag (the dev page only): ?lag=70 holds every message back as if your ping were 70 ms
// (half each way), and &jitter=10 makes each one up to 10 ms earlier or later (still in order).
// To see how online play looks and feels at a real ping, on localhost.
const asked = import.meta.env.DEV ? pageParams() : null;
export const PRACTICE_LAG = { ms: Math.max(0, Math.min(1000, Number(asked?.get('lag')) || 0)), jitter: Math.max(0, Math.min(200, Number(asked?.get('jitter')) || 0)) };
// (&delay=N, dev page only: try another input delay, 0 to 6 ticks; see INPUT_DELAY in rollback.js.)
export const PRACTICE_DELAY = asked?.has('delay') ? Math.max(0, Math.min(6, Number(asked.get('delay')) | 0)) : null;

// Messages one way, held back by the practice lag (in order); straight through without it.
function delayLine(deliver) {
  const { ms, jitter } = PRACTICE_LAG;
  if (!ms && !jitter) return deliver;
  let last = 0;
  return (msg) => {
    const at = Math.max(last, performance.now() + ms / 2 + (Math.random() * 2 - 1) * jitter);
    last = at;
    setTimeout(() => deliver(msg), at - performance.now());
  };
}

export function describeNetError(err) {
  return err?.message || 'Something went wrong with the connection.';
}

// This tab's own id, the same across reloads of the tab (sessionStorage) and different for every
// tab or browser: the server uses it to clear out this tab's old seat when it comes back (see
// server/index.js). Without storage, a fresh one each time.
function tabId() {
  const fresh = () => Math.random().toString(36).slice(2, 12);
  try {
    let id = sessionStorage.getItem('oxasmash-tab');
    if (!id) sessionStorage.setItem('oxasmash-tab', (id = fresh()));
    return id;
  } catch {
    return fresh();
  }
}

export class OnlineRoom {
  // Make a room ({ create: true, rules }) or join one ({ code }). Resolves once in the room.
  static connect({ name, char = null, create = false, code = '', rules = null }) {
    const tab = tabId();
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(serverUrl());
      } catch {
        return reject(new Error("Couldn't reach the game server."));
      }
      let settled = false;
      const fail = (message) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.close();
        reject(new Error(message));
      };
      const timer = setTimeout(() => fail("Couldn't reach the game server. Check your connection and try again."), 10000);
      ws.onerror = () => fail("Couldn't reach the game server. It may be down; try again in a moment.");
      ws.onopen = () => ws.send(JSON.stringify(create ? { t: 'create', name: cleanName(name), char, rules, tab } : { t: 'join', code, name: cleanName(name), char, tab }));
      ws.onmessage = (e) => {
        const msg = parse(e.data);
        if (msg?.t === 'refused') return fail(String(msg.reason ?? 'The room refused you.').slice(0, 120));
        if (settled || !msg || (msg.t !== 'lobby' && msg.t !== 'duels' && msg.t !== 'start')) return;
        // In: the room takes over the connection (and gets this first message too).
        settled = true;
        clearTimeout(timer);
        const room = new OnlineRoom(ws, code);
        resolve(room);
        setTimeout(() => room.receive(msg));
      };
    });
  }

  constructor(ws, code = '') {
    this.ws = ws;
    this.code = code;
    this.leaving = false;
    this.reason = 'The connection to the room was lost.';
    this.handlers = { lobby() {}, start() {}, match() {}, closed() {}, duels() {}, standing() {}, rematch() {}, notice() {} };
    // A match's first messages, kept until the match is listening (it takes a moment to load).
    this.early = null;
    // (Both ways through the practice lag, if it's on.)
    this.out = delayLine((text) => this.ws.readyState === WebSocket.OPEN && this.ws.send(text));
    const incoming = delayLine((msg) => this.receive(msg));
    ws.onmessage = (e) => incoming(parse(e.data));
    ws.onclose = () => this.lost();
    ws.onerror = () => this.lost();
  }

  on(name, fn) {
    this.handlers[name] = fn;
    // (The match listening now: what came in meanwhile, in order.)
    if (name === 'match' && this.early) {
      const early = this.early;
      this.early = null;
      for (const msg of early) fn(msg);
    }
    return this;
  }

  receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'lobby') {
      if (typeof msg.code === 'string') this.code = msg.code.slice(0, 8);
      this.handlers.lobby(msg);
    } else if (msg.t === 'start') {
      this.early = [];
      this.handlers.start(msg);
    } else if (msg.t === 'tk' || msg.t === 'ck' || msg.t === 'state' || msg.t === 'end') {
      if (this.early) this.early.push(msg);
      else this.handlers.match(msg);
    } else if (msg.t === 'standing') this.handlers.standing(msg);
    else if (msg.t === 'duels') this.handlers.duels(msg);
    else if (msg.t === 'rematch') this.handlers.rematch(msg);
    else if (msg.t === 'notice' && typeof msg.text === 'string') this.handlers.notice(msg.text.slice(0, 120));
    else if (msg.t === 'ping') this.send({ t: 'pong', s: msg.s });
    else if (msg.t === 'refused' && typeof msg.reason === 'string') this.reason = msg.reason.slice(0, 120);
  }

  lost() {
    if (this.leaving) return;
    this.leaving = true;
    this.handlers.closed(this.reason);
  }

  send(msg) {
    if (this.ws.readyState === WebSocket.OPEN) this.out(JSON.stringify(msg));
  }

  // A duel move (see DuelBoard.act).
  sendDuel(move) {
    this.send({ t: 'duel', ...move });
  }

  // The character this player picked (null: dealt at random).
  sendChar(char) {
    this.send({ t: 'char', char });
  }

  // The owner's commands: rules, addBot, remove, start, again, lobby, duelNow, rematchNow, private,
  // giveOwner. (Anyone: suggest, vote, lobbyReady, rematchAnswer.)
  command(t, extra = {}) {
    this.send({ t, ...extra });
  }

  // Leaving: say so first (a relay in between doesn't always pass on a closed connection), then go.
  close() {
    this.leaving = true;
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'bye' }));
    this.ws.close();
  }
}

// The open rooms, for the Online menu: asks the server every few seconds while it's up.
// onUpdate({ ping, rooms }) with your ping to the server (ms) and its rooms, best ping first;
// onUpdate(null) when the server can't be reached.
export class RoomList {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.ws = null;
    this.timer = 0;
  }

  start() {
    if (this.ws) return;
    const ws = (this.ws = new WebSocket(serverUrl()));
    const ask = () => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: 'list', s: performance.now() }));
    ws.onopen = () => {
      ask();
      this.timer = setInterval(ask, 3000);
    };
    ws.onmessage = (e) => {
      const msg = parse(e.data);
      if (msg?.t !== 'rooms' || !Array.isArray(msg.rooms)) return;
      this.onUpdate({ ping: typeof msg.s === 'number' ? Math.round(performance.now() - msg.s) : null, rooms: msg.rooms });
    };
    ws.onclose = () => {
      if (this.ws === ws) {
        this.stop();
        this.onUpdate(null);
      }
    };
  }

  stop() {
    clearInterval(this.timer);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}

function parse(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
