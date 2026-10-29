// Online rooms over WebRTC (PeerJS). The host's browser runs the match; guests send inputs and
// draw the state the host sends back. The room code is the host's PeerJS id, minus a prefix.
// PeerJS's free public server only introduces the browsers; game traffic then goes peer to peer.
import { Peer } from 'peerjs';
import { encodeInput, decodeInput } from '../sim/input.js';
import { RULES } from '../sim/constants.js';

const PREFIX = 'oxasmash-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1: easy to read out loud
export const CODE_LENGTH = 5;

export function makeCode(rng = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return code;
}

export function cleanCode(text) {
  return String(text).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

export function cleanName(text) {
  const name = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12);
  return name || 'Player';
}

export function describeNetError(err) {
  switch (err?.type) {
    case 'peer-unavailable':
      return 'No room with that code. Check it and try again.';
    case 'browser-incompatible':
      return "This browser can't play online. Try a recent Chrome, Firefox, Edge or Safari.";
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return "Couldn't reach the matchmaking server. Check your connection and try again.";
    default:
      return err?.message || 'Something went wrong with the connection.';
  }
}

function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id) : new Peer();
    const fail = (err) => {
      peer.destroy();
      reject(err);
    };
    peer.once('error', fail);
    peer.once('open', () => {
      peer.off('error', fail);
      resolve(peer);
    });
  });
}

export class HostRoom {
  static async create(hostName) {
    for (let tries = 0; tries < 5; tries++) {
      const code = makeCode();
      try {
        return new HostRoom(await openPeer(PREFIX + code), code, hostName);
      } catch (err) {
        if (err?.type !== 'unavailable-id') throw err;
      }
    }
    throw new Error('Could not get a free room code. Try again.');
  }

  constructor(peer, code, hostName) {
    this.peer = peer;
    this.code = code;
    // Order = fighter order in the match. During a match, leavers are marked, not removed,
    // so everyone's index stays put; they're cleared when the room goes back to the lobby.
    this.players = [{ kind: 'host', name: cleanName(hostName) }];
    this.inMatch = false;
    this.duelOpen = false; // after a match, while the honor duels run: newcomers can join to watch
    // (gone: someone left, whatever's going on; joined: someone came in to watch the duels; duel:
    // a guest's duel move.)
    this.handlers = { change() {}, input() {}, leave() {}, error() {}, gone() {}, joined() {}, duel() {} };
    peer.on('connection', (conn) => this.accept(conn));
    peer.on('error', (err) => this.handlers.error(err));
    // Ping each guest every second; the round trip is their ms (see pings).
    this.pinger = setInterval(() => {
      for (const p of this.players) if (p.conn?.open) p.conn.send({ t: 'ping', s: performance.now() });
    }, 1000);
    // Losing the matchmaking server doesn't drop players already connected; reconnect quietly.
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
  }

  on(name, fn) {
    this.handlers[name] = fn;
    return this;
  }

  accept(conn) {
    conn.on('data', (msg) => this.receive(conn, msg));
    conn.on('close', () => this.drop(conn));
    conn.on('error', () => this.drop(conn));
  }

  receive(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    const index = this.players.findIndex((p) => p.conn === conn);
    if (msg.t === 'hello' && index < 0) {
      // (During the honor duels, come in to watch them.)
      if (this.inMatch && this.duelOpen && this.players.length < RULES.maxPlayers) {
        this.players.push({ kind: 'remote', name: cleanName(msg.name), conn, char: typeof msg.char === 'string' ? msg.char.slice(0, 24) : null, watcher: true });
        this.handlers.joined(this.players.length - 1);
        return;
      }
      if (this.inMatch || this.players.length >= RULES.maxPlayers) {
        conn.send({ t: 'refused', reason: this.inMatch ? 'That room is in the middle of a match. Try again in a moment.' : 'That room is full.' });
        setTimeout(() => conn.close(), 300);
        return;
      }
      this.players.push({ kind: 'remote', name: cleanName(msg.name), conn, char: typeof msg.char === 'string' ? msg.char.slice(0, 24) : null });
      this.sendLobby();
    } else if (msg.t === 'in' && index >= 0) {
      const input = decodeInput(msg.i);
      if (input) this.handlers.input(index, input);
    } else if (msg.t === 'pong' && index >= 0 && typeof msg.s === 'number') {
      this.players[index].ms = Math.max(0, Math.round(performance.now() - msg.s));
    } else if (msg.t === 'duel' && index >= 0 && typeof msg.a === 'string') {
      // A duel move: only plain fields go through (checked by the duel board).
      this.handlers.duel(index, { a: msg.a, to: Number(msg.to), from: Number(msg.from), mode: String(msg.mode ?? ''), on: !!msg.on });
    } else if (msg.t === 'char' && index >= 0 && typeof msg.char === 'string') {
      // A guest picked a character (checked against the cast where it's used).
      this.players[index].char = msg.char.slice(0, 24);
      this.handlers.char?.(index, this.players[index].char);
    }
  }

  drop(conn) {
    const index = this.players.findIndex((p) => p.conn === conn);
    if (index < 0) return;
    if (this.inMatch) {
      this.players[index].left = true;
      this.players[index].conn = null;
      this.handlers.leave(index);
      this.handlers.gone(index);
    } else {
      this.players.splice(index, 1);
      this.sendLobby();
    }
  }

  addBot(level) {
    if (this.inMatch || this.players.length >= RULES.maxPlayers) return;
    const n = this.players.filter((p) => p.kind === 'bot').length + 1;
    this.players.push({ kind: 'bot', name: `Bot ${n}`, level });
    this.sendLobby();
  }

  remove(index) {
    const p = this.players[index];
    if (this.inMatch || !p || p.kind === 'host') return;
    this.players.splice(index, 1);
    if (p.conn) {
      p.conn.send({ t: 'refused', reason: 'The host removed you from the room.' });
      setTimeout(() => p.conn.close(), 300);
    }
    this.sendLobby();
  }

  lobbyPlayers() {
    return this.players.map((p) => ({ name: p.name, kind: p.kind, level: p.level }));
  }

  sendLobby() {
    this.players = this.players.filter((p) => !p.left);
    const players = this.lobbyPlayers();
    this.sendEach((you) => ({ t: 'lobby', code: this.code, players, you }));
    this.handlers.change();
  }

  sendEach(makeMessage) {
    this.players.forEach((p, i) => {
      if (p.conn?.open) p.conn.send(makeMessage(i));
    });
  }

  sendTo(index, msg) {
    const p = this.players[index];
    if (p?.conn?.open) p.conn.send(msg);
  }

  broadcast(msg) {
    for (const p of this.players) if (p.conn?.open) p.conn.send(msg);
  }

  startMatch(setup) {
    this.inMatch = true;
    this.sendEach((you) => ({ t: 'start', ...setup, you }));
  }

  endMatch() {
    this.inMatch = false;
    this.duelOpen = false;
    this.sendLobby();
  }

  // A duel: its two players (slots: room indexes) play as fighters 0 and 1; watchers (room
  // indexes) see it as spectators (you: -1). Others aren't sent it.
  startDuel(setup, slots, watchers) {
    this.players.forEach((p, i) => {
      const you = slots.indexOf(i);
      if (p.conn?.open && (you >= 0 || watchers.includes(i))) p.conn.send({ t: 'start', ...setup, you });
    });
  }

  // Each player's ping in ms, in fighter order: 0 for the host, null for bots (and guests not
  // measured yet).
  pings() {
    return this.players.map((p) => (p.kind === 'host' ? 0 : p.kind === 'remote' && !p.left ? p.ms ?? null : null));
  }

  close() {
    clearInterval(this.pinger);
    this.peer.destroy();
  }
}

export class ClientRoom {
  // char: the character this guest would like to play (null: dealt at random).
  static join(code, name, char = null) {
    return openPeer().then(
      (peer) =>
        new Promise((resolve, reject) => {
          let settled = false;
          const fail = (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            peer.destroy();
            reject(err);
          };
          const timer = setTimeout(() => fail(new Error("Couldn't reach that room. Check the code and try again.")), 10000);
          peer.once('error', fail);
          const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
          conn.once('open', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            peer.off('error', fail);
            conn.send({ t: 'hello', name: cleanName(name), char });
            resolve(new ClientRoom(peer, conn, code));
          });
        }),
    );
  }

  constructor(peer, conn, code) {
    this.peer = peer;
    this.conn = conn;
    this.code = code;
    this.leaving = false;
    this.reason = 'The host closed the room.';
    this.handlers = { lobby() {}, start() {}, snap() {}, closed() {}, duels() {} };
    conn.on('data', (msg) => this.receive(msg));
    conn.on('close', () => this.lost());
    peer.on('error', () => this.lost());
  }

  on(name, fn) {
    this.handlers[name] = fn;
    return this;
  }

  receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'lobby') this.handlers.lobby(msg);
    else if (msg.t === 'start') this.handlers.start(msg);
    else if (msg.t === 'snap') this.handlers.snap(msg);
    else if (msg.t === 'duels') this.handlers.duels(msg);
    else if (msg.t === 'ping' && this.conn.open) this.conn.send({ t: 'pong', s: msg.s });
    else if (msg.t === 'refused' && typeof msg.reason === 'string') this.reason = msg.reason.slice(0, 120);
  }

  lost() {
    if (this.leaving) return;
    this.leaving = true;
    this.peer.destroy();
    this.handlers.closed(this.reason);
  }

  sendInput(input) {
    if (this.conn.open) this.conn.send({ t: 'in', i: encodeInput(input) });
  }

  // A duel move (see DuelBoard.act).
  sendDuel(move) {
    if (this.conn.open) this.conn.send({ t: 'duel', ...move });
  }

  // The character this guest picked (null: dealt at random).
  sendChar(char) {
    if (this.conn.open) this.conn.send({ t: 'char', char });
  }

  close() {
    this.leaving = true;
    this.peer.destroy();
  }
}
