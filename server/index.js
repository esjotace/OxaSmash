// The game server: online rooms over WebSockets (at /ws), each running its own matches (see
// room.js). It also serves the built game (dist/), so one machine can host both:
//   npm run build && npm run server        (PORT, default 8787; HOST, default all interfaces)
// The page finds the server at /ws on its own address, or at VITE_SERVER_URL if it was built with
// one (the game on GitHub Pages, the server elsewhere).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { makeCode, cleanCode } from '../src/net/names.js';

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const TICK_MS = 1000 / 60;
const MAX_ROOMS = 200;
const MAX_MESSAGE = 4096; // bytes: inputs and moves are tiny
// Set by the Docker build (see Dockerfile), so you can tell which build is deployed.
const VERSION = process.env.APP_VERSION ?? 'dev';
const BUILD = process.env.APP_BUILD ?? '';

const rooms = new Map(); // code -> Room
const now = () => performance.now();

// ---- The built game, for anyone opening the server's address -------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end(`ok ${rooms.size} rooms`);
  }
  if (url.pathname === '/version') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ version: VERSION, build: BUILD }));
  }
  // (Only files inside dist/.)
  const file = path.join(DIST, path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '') || 'index.html');
  try {
    if (!file.startsWith(DIST)) throw new Error('outside');
    const s = await stat(file);
    const target = s.isDirectory() ? path.join(file, 'index.html') : file;
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': TYPES[path.extname(target)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found (run "npm run build" to serve the game from here).');
  }
});

// ---- Rooms ---------------------------------------------------------------------------------
function newRoom() {
  for (let tries = 0; tries < 50; tries++) {
    const code = makeCode();
    if (rooms.has(code)) continue;
    const room = new Room(code, (r) => rooms.delete(r.code));
    rooms.set(code, room);
    return room;
  }
  return null;
}

// (Messages are compressed: a 6-player snapshot goes from ~6 KB to a few hundred bytes.)
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE, perMessageDeflate: { threshold: 128 } });
// The same message to many (a snapshot): written out once.
const packed = new WeakMap();
const pack = (msg) => {
  let text = packed.get(msg);
  if (!text) packed.set(msg, (text = JSON.stringify(msg)));
  return text;
};
wss.on('connection', (ws) => {
  let room = null;
  let player = null; // this connection's entry in room.players
  const send = (msg) => ws.readyState === ws.OPEN && ws.send(pack(msg));
  const refuse = (reason) => {
    send({ t: 'refused', reason });
    setTimeout(() => ws.close(), 300);
  };
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (!room) {
      // The room list (the Online menu asks every few seconds; s: its clock, sent back for its ping).
      if (msg.t === 'list') {
        const list = [...rooms.values()].map((r) => r.summary());
        return send({ t: 'rooms', s: msg.s, rooms: list.sort((a, b) => (a.ping ?? Infinity) - (b.ping ?? Infinity)) });
      }
      // The first message: make a room, or join one by its code.
      if (msg.t === 'create') {
        if (rooms.size >= MAX_ROOMS) return refuse('The server is full right now. Try again later.');
        room = newRoom();
        if (!room) return refuse('Could not get a free room code. Try again.');
      } else if (msg.t === 'join') {
        room = rooms.get(cleanCode(msg.code ?? ''));
        if (!room) return refuse('No room with that code. Check it and try again.');
      } else return;
      const i = room.join(msg.name, msg.char, send, now());
      if (typeof i === 'string') {
        room = null;
        return refuse(i);
      }
      player = room.players[i];
      player.kick = () => setTimeout(() => ws.close(), 300);
      // (A new room's own rules, checked like any change.)
      if (msg.t === 'create' && msg.rules) room.receive(i, { t: 'rules', rules: msg.rules }, now());
      return;
    }
    const i = room.players.indexOf(player);
    if (i >= 0) room.receive(i, msg, now());
  });
  ws.on('close', () => {
    const i = room ? room.players.indexOf(player) : -1;
    if (i >= 0) room.leave(i, now());
  });
  ws.on('error', () => ws.close());
});

// Each room's clock, and everyone's ping once a second.
setInterval(() => {
  const t = now();
  for (const room of rooms.values()) room.update(t);
}, TICK_MS);
setInterval(() => {
  const s = now();
  for (const room of rooms.values()) for (const p of room.players) p.send?.({ t: 'ping', s });
}, 1000);

server.listen(PORT, HOST, () => console.log(`OxaSmash ${[VERSION, BUILD].filter(Boolean).join(' ')} server on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} (rooms at /ws)`));
