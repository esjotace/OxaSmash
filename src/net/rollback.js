// Rollback netcode, online: every browser plays the whole match itself, from the same start and
// the same inputs as the game server, so it never waits for the server to see anything happen.
//   - Your input goes into your copy the moment you press (and off to the server, marked with the
//     tick it's for).
//   - Everyone else's: until the server says what they really pressed on a tick, they're guessed
//     (whatever they last pressed, held).
//   - When the server's word on a tick arrives (everyone's inputs on it: `confirm`) and a guess was
//     wrong, the world is put back as it was before that tick and played forward again, right
//     (`settle`); whoever moved because of it is eased over to where they really are.
//   - Every so often the server sends a fingerprint of its world; if this copy has drifted (it
//     shouldn't), the server's whole world is loaded instead (`load`).
// Bots are the server's: their inputs come in like everyone else's. Plain JS, no Phaser.
import { createWorld, step, removeFighter, attachRng } from '../sim/world.js';
import { NEUTRAL, encodeInput, decodeInput } from '../sim/input.js';
import { STORM_PACE, DT } from '../sim/constants.js';
import { save, restore, unpack, fingerprint } from '../sim/snapshot.js';

const KEEP = 240; // ticks of saved worlds and inputs kept (4 s)
// How early your inputs should reach the server (ticks), how hard to steer toward that, how far
// past what the server has confirmed to play on guesses (beyond that, wait), how far behind the
// confirmed ticks to watch from, and at most how many ticks to play in a frame.
export const SYNC = { early: 2, gain: 0.5, aheadMax: 30, watchBehind: 3, catchUp: 8 };
// Fallen well behind (the window was hidden, the computer stalled): up to `replayMax` ticks behind,
// the missed time is played back at once (silently); further, the server's whole world is asked for.
// `behind`: how far behind counts as fallen behind.
const CATCH_UP = { behind: 30, replayMax: 600 };
const SNAP_PAST = 64; // px: put back further than this (a respawn), a fighter just jumps there
const EASE = 18; // how fast a correction is eased out (per second)

// The world a match starts from (the same on the server and every browser).
export const makeWorld = (init) => createWorld({ ...init, storm: STORM_PACE[init.stormPace] ?? {} });

export class Rollback {
  // init: how the server made the match's world; you: your fighter (-1: only watching).
  constructor(init, you, onEvents = () => {}) {
    this.world = makeWorld(init);
    this.you = you;
    this.onEvents = onEvents;
    this.players = this.world.fighters.length;
    this.saves = new Map(); // tick -> the world just before it
    this.used = new Map(); // tick -> the inputs it was played with (encoded, for comparing)
    this.confirmed = new Map(); // tick -> { inputs, codes, outs }: the server's word on it
    this.mine = new Map(); // tick -> your input on it
    this.last = this.world.fighters.map(() => NEUTRAL); // each one's latest known input (the guess)
    this.newest = -1; // the latest tick the server has confirmed
    this.through = -1; // every tick up to this one is confirmed
    this.redoFrom = Infinity; // the earliest tick played on a wrong guess
    this.played = new Set(); // effects already shown (not again when a tick is played again)
    this.offsets = this.world.fighters.map(() => ({ x: 0, y: 0 }));
    this.ready = true; // (false: waiting for the server's whole world, see load)
    // Where the match should have got to here by now (ticks), fingerprints waiting to be checked,
    // the latest pings and characters, the tick it ends on, when the whole world was last asked for.
    this.clock = 0;
    this.checks = [];
    this.pings = null;
    this.chars = null;
    this.endAt = undefined;
    this.resyncAt = -Infinity;
  }

  // The server's word on the match: a tick's inputs (tk), a fingerprint, pings and characters now
  // and then (ck), its whole world (state), the end (end).
  receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'tk') this.confirm(msg.k, msg.i, Array.isArray(msg.o) ? msg.o : []);
    else if (msg.t === 'state' && typeof msg.w === 'string') this.load(msg.w);
    else if (msg.t === 'end' && Number.isInteger(msg.k)) this.endAt = msg.k;
    else if (msg.t === 'ck' && Number.isInteger(msg.k)) {
      if (Array.isArray(msg.p)) this.pings = msg.p.slice(0, this.players);
      if (Array.isArray(msg.c)) this.chars = msg.c.slice(0, this.players);
      this.checks.push({ k: msg.k, h: msg.h });
      // Your inputs should reach the server a tick or two before it plays them: running late,
      // catch up; well early, ease off (your input then waits less before it counts).
      const early = this.you >= 0 ? msg.e?.[this.you] : null;
      if (Number.isFinite(early)) this.clock += Math.max(-6, Math.min(30, SYNC.early - early)) * SYNC.gain;
    }
  }

  // A frame, dt s after the last (now: ms). read(): your input for the next tick; send(msg): to
  // the server. Returns the final world once the match is over (every tick to the end confirmed).
  frame(dt, now, read, send) {
    // Wrong guesses put right first.
    this.settle();
    // How far the match should have got by now. Playing: ahead of the server, so your input gets
    // there in time (see receive), but never too far past what it has confirmed. Watching: just
    // behind the newest tick it has confirmed (no guessing needed).
    // (Not started yet: the server waits for everyone's game to be ready. Then: from here.)
    if (this.newest < 0) {
      this.clock = 0;
      return null;
    }
    if (!this.started) {
      this.started = true;
      this.rejoin();
    }
    this.clock += dt / DT;
    const confirmed = this.through + 1;
    if (this.ready && this.world.tick < confirmed - CATCH_UP.behind) this.catchUp(confirmed, now, send);
    // (Ticks confirmed past a gap that never filled: a message went missing. The whole world.)
    else if (this.newest > this.through + CATCH_UP.behind && now - this.resyncAt > 1000) {
      this.resyncAt = now;
      send({ t: 'resync' });
    }
    this.clock = this.you >= 0 ? Math.min(this.clock, confirmed + SYNC.aheadMax) : Math.max(confirmed - SYNC.watchBehind * 2, Math.min(this.clock, confirmed - SYNC.watchBehind));
    for (let n = 0; this.ready && this.world.tick < Math.floor(this.clock) && n < SYNC.catchUp; n++) {
      // Your input on it: into the match here at once, and off to the server.
      let input = null;
      if (this.you >= 0) {
        input = read();
        send({ t: 'in', i: encodeInput(input), k: this.world.tick });
      }
      this.advance(input);
    }
    // Does this copy still agree with the server's? (If not, ask for its whole world.)
    this.checks = this.checks.filter(({ k, h }) => {
      const agrees = this.agrees(k, h);
      if (agrees === false && now - this.resyncAt > 1000) {
        this.resyncAt = now;
        send({ t: 'resync' });
      }
      return agrees === null && k > this.world.tick - KEEP;
    });
    // Over: once the server says so and every tick up to then is confirmed.
    if (this.endAt !== undefined && this.through >= this.endAt - 1) {
      this.settle();
      // (Watching a little behind: the last few ticks, played now.)
      while (this.ready && this.world.tick < this.endAt) this.play(this.world.tick);
      return this.endAt === this.world.tick ? this.world : this.saves.get(this.endAt) ?? this.world;
    }
    return null;
  }

  get tick() {
    return this.world.tick;
  }

  // The inputs to play a tick with: the server's word if it's in, else yours and the guesses.
  inputsFor(t) {
    const c = this.confirmed.get(t);
    if (c) return c.inputs;
    return this.last.map((guess, f) => (f === this.you ? this.mine.get(t) ?? guess : guess));
  }

  // Play the next tick (your input on it, if you're playing).
  advance(input = null) {
    const t = this.world.tick;
    // (Exactly as the server will get it: through the same encoding, aim rounded and all.)
    if (input) this.mine.set(t, decodeInput(encodeInput(input)));
    this.play(t);
  }

  play(t) {
    this.saves.set(t, save(this.world));
    const inputs = this.inputsFor(t);
    this.used.set(t, inputs.map(encodeKey));
    for (const f of this.confirmed.get(t)?.outs ?? []) removeFighter(this.world, f);
    step(this.world, inputs);
    // Effects and sounds: each once, even if the tick is played again.
    const fresh = this.world.events.filter((e) => {
      const key = `${t}|${e.type}|${e.id ?? ''}|${e.by ?? ''}|${e.weapon ?? e.kind ?? ''}`;
      if (this.played.has(key)) return false;
      this.played.add(key);
      return true;
    });
    if (fresh.length) this.onEvents(fresh);
  }

  // The server's word on tick k: everyone's inputs on it (encoded), and who left just before it.
  confirm(k, codes, outs = []) {
    if (!Number.isInteger(k) || !Array.isArray(codes) || codes.length !== this.players || this.confirmed.has(k)) return;
    const inputs = codes.map((c) => decodeInput(c) ?? NEUTRAL);
    this.confirmed.set(k, { inputs, codes: inputs.map(encodeKey), outs: outs.filter((f) => Number.isInteger(f)) });
    if (k > this.newest) {
      this.newest = k;
      this.last = inputs;
    }
    while (this.confirmed.has(this.through + 1)) this.through++;
    // Already played on a guess, and the guess was wrong: play it again from there.
    const used = this.used.get(k);
    if (k < this.world.tick && (!used || outs.length || used.some((c, f) => c !== this.confirmed.get(k).codes[f]))) this.redoFrom = Math.min(this.redoFrom, k);
  }

  // Play again from the earliest wrong guess, up to where we were; ease whoever it moved.
  settle() {
    const from = this.redoFrom;
    this.redoFrom = Infinity;
    if (from >= this.world.tick || !this.saves.has(from)) return;
    const to = this.world.tick;
    const before = this.world.fighters.map((f) => ({ x: f.x, y: f.y }));
    restore(this.world, this.saves.get(from));
    while (this.world.tick < to) this.play(this.world.tick);
    this.world.fighters.forEach((f, i) => {
      const o = this.offsets[i];
      const dx = before[i].x - f.x + o.x;
      const dy = before[i].y - f.y + o.y;
      this.offsets[i] = Math.hypot(dx, dy) > SNAP_PAST ? { x: 0, y: 0 } : { x: dx, y: dy };
    });
    this.prune();
  }

  prune() {
    const old = Math.min(this.through, this.world.tick) - KEEP;
    for (const map of [this.saves, this.used, this.confirmed, this.mine]) for (const t of map.keys()) if (t < old) map.delete(t);
    for (const key of this.played) if (Number(key.slice(0, key.indexOf('|'))) < old) this.played.delete(key);
  }

  // Back after a while away (a hidden window stops playing; the server's messages kept coming):
  // straight to the present, so your input counts again at once.
  catchUp(confirmed, now, send) {
    if (confirmed - this.world.tick > CATCH_UP.replayMax) {
      // Too far: the server's whole world (see load), once in a while until it comes.
      if (now - this.resyncAt > 1000) {
        this.resyncAt = now;
        send({ t: 'resync' });
      }
      return;
    }
    // Every tick missed, played now; their effects and sounds are old news.
    const onEvents = this.onEvents;
    this.onEvents = () => {};
    while (this.world.tick < confirmed) this.play(this.world.tick);
    this.onEvents = onEvents;
    this.offsets.forEach((o) => Object.assign(o, { x: 0, y: 0 }));
    this.prune();
    this.rejoin();
  }

  // Your clock put back ahead of the server's, by your ping and a little (see SYNC).
  rejoin() {
    const ping = this.you >= 0 ? this.pings?.[this.you] : null;
    this.clock = this.world.tick + (this.you >= 0 ? (Number.isFinite(ping) ? ping / 1000 / DT : 4) + SYNC.early : 0);
  }

  // The server's fingerprint of its world at tick k: does this copy agree? (null: can't tell yet.)
  agrees(k, hash) {
    if (k > this.through + 1) return null;
    const w = k === this.world.tick ? this.world : this.saves.get(k);
    return w ? fingerprint(w) === hash : null;
  }

  // The server's whole world, as it is at its tick (joining mid-match, or this copy drifted).
  // Whatever you've pressed since is played on top.
  load(packed) {
    const to = this.world.tick;
    const w = unpack(packed);
    Object.assign(this.world, w);
    attachRng(this.world); // (its random numbers, from its own position)
    for (const map of [this.saves, this.used]) map.clear();
    for (const t of this.confirmed.keys()) if (t < w.tick) this.confirmed.delete(t);
    this.through = Math.max(this.through, w.tick - 1);
    this.newest = Math.max(this.newest, w.tick - 1); // (it's under way)
    this.ready = true;
    while (this.world.tick < to) this.play(this.world.tick);
    // (Loaded far ahead of where this copy was: carry on from here.)
    if (this.clock < this.world.tick) this.rejoin();
  }

  // Corrections still being eased out, per fighter (in px), after `dt` s more of easing.
  ease(dt) {
    const k = Math.exp(-EASE * dt);
    for (const o of this.offsets) {
      o.x *= k;
      o.y *= k;
    }
    return this.offsets;
  }
}

// (An input as text, to compare.)
const encodeKey = (input) => encodeInput(input).join(',');
