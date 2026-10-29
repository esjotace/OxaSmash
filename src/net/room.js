// Online rooms, on the game server (see server/): the server runs the matches; everyone sends
// their inputs and draws the state it sends back. The room's owner (whoever made it) sends the
// commands that run it: rules, bots, start, rematch, back to the lobby.
import { encodeInput } from '../sim/input.js';
import { cleanName } from './names.js';

export { CODE_LENGTH, cleanCode, cleanName } from './names.js';

// Where the server is: VITE_SERVER_URL when the game was built with one (the game on GitHub
// Pages, the server elsewhere), else /ws on this page's own address (the server serving the game,
// or the dev server passing it on: see vite.config.js).
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

export function describeNetError(err) {
  return err?.message || 'Something went wrong with the connection.';
}

export class OnlineRoom {
  // Make a room ({ create: true, rules }) or join one ({ code }). Resolves once in the room.
  static connect({ name, char = null, create = false, code = '', rules = null }) {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(SERVER_URL);
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
      ws.onopen = () => ws.send(JSON.stringify(create ? { t: 'create', name: cleanName(name), char, rules } : { t: 'join', code, name: cleanName(name), char }));
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
    this.handlers = { lobby() {}, start() {}, snap() {}, closed() {}, duels() {} };
    ws.onmessage = (e) => this.receive(parse(e.data));
    ws.onclose = () => this.lost();
    ws.onerror = () => this.lost();
  }

  on(name, fn) {
    this.handlers[name] = fn;
    return this;
  }

  receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'lobby') {
      if (typeof msg.code === 'string') this.code = msg.code.slice(0, 8);
      this.handlers.lobby(msg);
    } else if (msg.t === 'start') this.handlers.start(msg);
    else if (msg.t === 'snap') this.handlers.snap(msg);
    else if (msg.t === 'duels') this.handlers.duels(msg);
    else if (msg.t === 'ping') this.send({ t: 'pong', s: msg.s });
    else if (msg.t === 'refused' && typeof msg.reason === 'string') this.reason = msg.reason.slice(0, 120);
  }

  lost() {
    if (this.leaving) return;
    this.leaving = true;
    this.handlers.closed(this.reason);
  }

  send(msg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  sendInput(input) {
    this.send({ t: 'in', i: encodeInput(input) });
  }

  // A duel move (see DuelBoard.act).
  sendDuel(move) {
    this.send({ t: 'duel', ...move });
  }

  // The character this player picked (null: dealt at random).
  sendChar(char) {
    this.send({ t: 'char', char });
  }

  // The owner's commands: rules, addBot, remove, start, again, lobby, duelNow.
  command(t, extra = {}) {
    this.send({ t, ...extra });
  }

  close() {
    this.leaving = true;
    this.ws.close();
  }
}

function parse(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
