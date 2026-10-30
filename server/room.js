// One online room on the game server: its players (people and bots), its rules, and the match
// it runs. Every match is played both here and in each player's browser, from the same start and
// the same inputs (rollback: see src/net/rollback.js). Players send their inputs, each marked with
// the tick it's for; each tick, the server plays everyone's inputs (and the bots') and tells
// everyone what they were. This copy is the one that counts: it decides the results, and any
// browser that drifts from it is sent it whole. Whoever made the room is its owner (they set the
// rules, add bots and start matches); if they leave, the next person in the list takes over.
// A room seats up to RULES.maxOnline players (people and bots); up to RULES.maxWatching more
// watch, and take a seat when one opens up (in the lobby), in the order they came.
// After a match, from the results screen, players can set up honor duels (see src/net/duels.js).
//
// No network here: each player's `send(msg)` is given by the caller, and time comes in through
// update(now) (ms), so tests can drive a room directly.
import { step, removeFighter } from '../src/sim/world.js';
import { NEUTRAL, decodeInput, encodeInput } from '../src/sim/input.js';
import { DT, RULES, STORM_PACE } from '../src/sim/constants.js';
import { pack, fingerprint } from '../src/sim/snapshot.js';
import { makeWorld } from '../src/net/rollback.js';
import { isStageId, rollStage, MIXED, DEFAULT_STAGE } from '../src/sim/stage.js';
import { createBot, botInput } from '../src/bots/bot.js';
import { CHARACTERS, pickCast } from '../src/game/cast.js';
import { DuelBoard, DUEL_MODES } from '../src/net/duels.js';
import { cleanName } from '../src/net/names.js';

const CHECK_EVERY = 20; // ticks between fingerprints of the world (and pings, and how early inputs come)
const AHEAD_MAX = 120; // inputs marked further ahead than this (2 s) are ignored
const QUIET_AFTER = 10; // ticks without an input from a player: they've let go of everything
const READY_WAIT = 5000; // ms the start waits for everyone's game to load (then it starts anyway)
// (Letting go: no direction, nothing held; the press counts and aim stay, so nothing reads as a
// press when they come back.)
const COUNTS = ['jp', 'sp', 'mp', 'dp', 'rp', 'hp', 'ep', 'gp', 'xp', 'cp', 'kp'];
const letGo = (input) => ({ ...NEUTRAL, ...Object.fromEntries(COUNTS.map((k) => [k, input[k] ?? 0])), ax: input.ax ?? 0, ay: input.ay ?? 0 });
const MAX_STEPS = 15; // at most this many ticks caught up at once (after a stall)

// The rule presets (the duel modes, but Crowd's Choice); anything else is custom.
const PRESETS = Object.keys(DUEL_MODES).filter((k) => k !== 'crowd');

// The rules a room starts with (the owner changes them).
export const DEFAULT_RULES = { stocks: RULES.stocks, rounds: 1, stage: MIXED, preset: 'normal', rules: { melee: true, ranged: true, thrown: true, items: true }, stormPace: 'normal', crownRule: 'show' };

// Rules from a player: only known values get through.
export function cleanRules(r = {}) {
  const on = (v) => v !== false;
  const rules = r.rules ?? {};
  return {
    stocks: Math.max(1, Math.min(5, Number.isInteger(r.stocks) ? r.stocks : RULES.stocks)),
    rounds: [1, 3, 5].includes(r.rounds) ? r.rounds : 1,
    stage: r.stage === MIXED || isStageId(r.stage) ? r.stage : DEFAULT_STAGE,
    rules: {
      melee: on(rules.melee),
      ranged: on(rules.ranged),
      thrown: on(rules.thrown),
      items: on(rules.items),
      // (A preset's extras: the 9mm without guns turning up, a couple of grenades to start.)
      ...(typeof rules.startGun === 'boolean' ? { startGun: rules.startGun } : {}),
      ...(Number.isInteger(rules.startGrenades) ? { startGrenades: Math.max(0, Math.min(2, rules.startGrenades)) } : {}),
    },
    preset: PRESETS.includes(r.preset) ? r.preset : 'custom',
    stormPace: Object.hasOwn(STORM_PACE, r.stormPace) ? r.stormPace : 'normal',
    crownRule: ['show', 'bounty', 'weight'].includes(r.crownRule) ? r.crownRule : 'show',
  };
}

const clip = (text, n) => String(text ?? '').slice(0, n);

export class Room {
  constructor(code, onEmpty = () => {}) {
    this.code = code;
    this.onEmpty = onEmpty;
    // Order = fighter order in a match. During a match (and its results and duels), people who
    // leave are marked, not removed, so everyone's index stays put; they're cleared on the way
    // back to the lobby.
    this.players = []; // { kind: 'person' | 'bot', name, char, level, send, ms, left, owner, seated, wins }
    this.rules = { ...DEFAULT_RULES };
    this.phase = 'lobby'; // lobby | match | results (the duels run during results)
    this.match = null; // the match being played: { world, slots, bots, inputs, chars, acc, last, outbox, duel }
    this.series = null; // best of 3 or 5: { rounds, round, over } (each player's wins: their `wins`)
    this.crownName = null; // last match's winner (wears the crown)
    this.duels = null; // the honor duel board, after a match
    this.duelSent = '';
  }

  // ---- People coming and going -------------------------------------------------------------

  // A person joins (send: how to reach them): seated if there's a seat in the lobby, else
  // watching. Returns their index, or the reason they can't come in.
  join(name, char, send, now) {
    const seated = this.phase === 'lobby' && this.seats() < RULES.maxOnline;
    if (!seated && this.watching() >= RULES.maxWatching) return `That room is full (${RULES.maxOnline} playing, ${RULES.maxWatching} watching).`;
    const p = { kind: 'person', name: cleanName(name), char: CHARACTERS.includes(char) ? char : null, send, ms: null, owner: !this.people().length, seated, wins: 0 };
    this.players.push(p);
    const i = this.players.length - 1;
    if (this.phase === 'lobby') this.sendLobby();
    else {
      // (Mid-match, or after one: they watch what's on, and the duels.)
      this.duels?.join(i, now);
      this.pushDuels(now);
      this.sendStanding();
      if (this.phase === 'match') {
        send({ t: 'start', ...this.match.setup, you: -1 });
        send({ t: 'state', w: pack(this.match.world) });
      }
    }
    return i;
  }

  // Seats taken (people and bots), and people watching.
  seats = () => this.players.filter((p) => p.seated && !p.left).length;
  watching = () => this.players.filter((p) => !p.seated && !p.left).length;

  // In the lobby: whoever's been watching longest takes any open seat.
  seatWatchers() {
    for (const p of this.players) if (!p.seated && !p.left && p.kind === 'person' && this.seats() < RULES.maxOnline) p.seated = true;
  }

  leave(i, now) {
    const p = this.players[i];
    if (!p || p.left) return;
    const wasOwner = p.owner;
    p.owner = false;
    if (this.phase === 'lobby') this.players.splice(i, 1);
    else {
      p.left = true;
      p.send = null;
      // (Out from the next tick, the same in every browser: see tick.)
      const f = this.fighterOf(i);
      if (f >= 0) this.match.outs.push(f);
      this.match?.waiting.delete(i);
      this.duels?.leave(i);
    }
    // Nobody left: the room closes. Otherwise the next person takes over (a seated one first).
    if (!this.people().length) return this.onEmpty(this);
    if (wasOwner) (this.people().find((q) => q.seated) ?? this.people()[0]).owner = true;
    if (this.phase === 'lobby') {
      this.seatWatchers();
      this.sendLobby();
    } else {
      this.pushDuels(now);
      this.sendStanding();
    }
  }

  people = () => this.players.filter((p) => p.kind === 'person' && !p.left);

  // For the room list: whose room, how full, what's on, and its people's average ping (ms; null
  // until measured).
  summary() {
    const owner = this.people().find((p) => p.owner);
    const pings = this.people().map((p) => p.ms).filter((ms) => typeof ms === 'number');
    return {
      code: this.code,
      owner: owner?.name ?? '?',
      players: this.seats(),
      watching: this.watching(),
      phase: this.phase,
      ping: pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null,
    };
  }
  isOwner = (i) => !!this.players[i]?.owner;

  // ---- Messages from a player --------------------------------------------------------------

  receive(i, msg, now) {
    const p = this.players[i];
    if (!p || p.left || !msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'in': {
        // An input, for tick k: kept until then (too late for it: the last one stands in).
        const f = this.fighterOf(i);
        const input = f >= 0 && Number.isInteger(msg.k) && decodeInput(msg.i);
        if (!input) break;
        const m = this.match;
        m.heard[f] = m.world.tick;
        const early = msg.k - m.world.tick;
        m.early[f] = Math.min(m.early[f], early);
        if (early >= 0 && early <= AHEAD_MAX) m.pending[f].set(msg.k, input);
        break;
      }
      case 'ready':
        // (Their game has loaded the match: see waiting.)
        this.match?.waiting.delete(i);
        break;
      case 'resync':
        // (Their copy drifted from this one: here it is, whole.)
        if (this.phase === 'match' && this.match) p.send?.({ t: 'state', w: pack(this.match.world) });
        break;
      case 'pong':
        if (typeof msg.s === 'number') p.ms = Math.max(0, Math.round(now - msg.s));
        break;
      case 'char': {
        if (!CHARACTERS.includes(msg.char)) break;
        p.char = msg.char;
        const f = this.fighterOf(i);
        if (f >= 0) this.match.chars[f] = msg.char;
        break;
      }
      case 'duel':
        if (this.duels?.act(i, { a: clip(msg.a, 16), to: Number(msg.to), from: Number(msg.from), mode: clip(msg.mode, 16), on: !!msg.on }, now)) this.pushDuels(now);
        break;
      default:
        if (p.owner) this.ownerCommand(msg, now);
    }
  }

  // The owner runs the room.
  ownerCommand(msg, now) {
    switch (msg.t) {
      case 'rules':
        if (this.phase !== 'lobby') return;
        this.rules = cleanRules(msg.rules);
        this.series = null;
        return this.sendLobby();
      case 'addBot': {
        if (this.phase !== 'lobby' || this.seats() >= RULES.maxOnline) return;
        const n = this.players.filter((p) => p.kind === 'bot').length + 1;
        this.players.push({ kind: 'bot', name: `Bot ${n}`, level: ['easy', 'normal', 'hard'].includes(msg.level) ? msg.level : 'normal', seated: true, wins: 0 });
        return this.sendLobby();
      }
      case 'remove': {
        const p = this.players[msg.i];
        if (this.phase !== 'lobby' || !p || p.owner) return;
        this.players.splice(msg.i, 1);
        if (p.send) {
          p.send({ t: 'refused', reason: 'The owner removed you from the room.' });
          p.kick?.();
        }
        this.seatWatchers();
        return this.sendLobby();
      }
      case 'start':
        if (this.phase === 'lobby') this.startMatch(now);
        return;
      case 'again':
        // Rematch (or the series' next round); not enough people left for one: the lobby.
        if (this.phase !== 'results') return;
        if (!this.canRematch()) return this.ownerCommand({ t: 'lobby' }, now);
        if (this.series) {
          if (this.series.over) {
            Object.assign(this.series, { round: 1, over: false });
            for (const p of this.players) p.wins = 0;
          } else this.series.round++;
        }
        this.closeDuels();
        this.tidy();
        return this.startMatch(now);
      case 'lobby':
        if (this.phase === 'lobby') return;
        this.series = null;
        this.closeDuels();
        this.match = null;
        this.phase = 'lobby';
        this.tidy();
        return this.sendLobby();
      case 'duelNow':
        if (this.duels?.startNow(now)) this.pushDuels(now);
        return;
    }
  }

  // ---- The lobby ---------------------------------------------------------------------------

  // (Back to the lobby or a rematch: people who left are cleared out, and anyone watching takes
  // the seats they freed.)
  tidy() {
    this.players = this.players.filter((p) => !p.left);
    this.seatWatchers();
  }

  lobbyPlayers() {
    // (kind: 'host' marks the owner, for the page; watching: no seat yet, waiting in this order.)
    return this.players.map((p) => ({ name: p.name, kind: p.kind === 'bot' ? 'bot' : p.owner ? 'host' : 'remote', level: p.level, watching: !p.seated }));
  }

  sendLobby() {
    const players = this.lobbyPlayers();
    this.players.forEach((p, you) => p.send?.({ t: 'lobby', code: this.code, players, you, owner: !!p.owner, rules: this.rules }));
  }

  // ---- Matches -----------------------------------------------------------------------------

  // Everyone seated plays (a fresh character each, but anyone who picked one keeps it); everyone
  // else watches.
  startMatch(now) {
    const slots = this.players.map((p, i) => (p.seated ? i : -1)).filter((i) => i >= 0);
    if (slots.length < 2) return;
    const r = this.rules;
    if (r.rounds > 1 && !this.series) {
      this.series = { rounds: r.rounds, round: 1, over: false };
      for (const p of this.players) p.wins = 0;
    }
    if (r.rounds <= 1) this.series = null;
    const crown = slots.findIndex((i) => this.crownName && this.players[i].name === this.crownName);
    const series = this.series && { rounds: this.series.rounds, round: this.series.round, wins: slots.map((i) => this.players[i].wins ?? 0) };
    this.play(slots, { stocks: r.stocks, stage: rollStage(r.stage), rules: r.rules, stormPace: r.stormPace, crownRule: r.crownRule, crown, series }, now);
  }

  // Start a match between these players (slots: room indexes, in fighter order). duel: the duel's
  // mode, for a duel (then only its players and its watchers are sent it).
  play(slots, { stocks, stage, rules = {}, stormPace = 'normal', crownRule = 'show', crown = -1, series = null, duel = null }, now) {
    const chars = castFor(slots.map((i) => this.players[i]));
    // (init: how the world is made; every browser makes the very same one from it.)
    const init = { players: slots.length, stocks, stage, seed: (now * 2654435761) >>> 0, rules, stormPace: Object.hasOwn(STORM_PACE, stormPace) ? stormPace : 'normal', crown, crownRule };
    const world = makeWorld(init);
    const bots = slots.map((i, f) => (this.players[i].kind === 'bot' ? createBot(this.players[i].level, (now + f * 7919) >>> 0) : null));
    const setup = { names: slots.map((i) => this.players[i].name), chars, stocks, stage, crown, series, init, ...(duel ? { duel } : {}) };
    // (pending: each player's inputs waiting for their tick; early: how early (in ticks) their
    // inputs have been arriving, at worst, since the last check; outs: who left, out next tick.)
    // (heard: the tick each player's last input arrived on.)
    // (waiting: the people whose game hasn't said it's ready yet; the match starts once none are,
    // or at `startBy`.)
    const waiting = new Set(slots.filter((i) => this.players[i].kind === 'person'));
    this.match = { world, slots, bots, inputs: slots.map(() => NEUTRAL), pending: slots.map(() => new Map()), early: slots.map(() => Infinity), heard: slots.map(() => 0), outs: [], chars: [...chars], acc: 0, last: now, duel, setup, waiting, startBy: now + READY_WAIT };
    this.phase = 'match';
    const watchers = duel ? this.duels.view(now).watching : [];
    this.players.forEach((p, i) => {
      const you = slots.indexOf(i);
      if (!duel || you >= 0 || watchers.includes(i)) p.send?.({ t: 'start', ...setup, you });
    });
  }

  fighterOf(i) {
    return this.match && this.phase === 'match' ? this.match.slots.indexOf(i) : -1;
  }

  // Time passing: the match plays on in fixed 1/60 s ticks; the duels' timers run.
  update(now) {
    const m = this.match;
    // (Not started until everyone's game is ready, or it's waited long enough.)
    if (m && this.phase === 'match' && m.waiting.size && now < m.startBy) m.last = now;
    else if (m && this.phase === 'match') {
      m.waiting.clear();
      m.acc = Math.min(m.acc + (now - m.last) / 1000, MAX_STEPS * DT);
      m.last = now;
      while (m.acc >= DT && this.match === m) {
        m.acc -= DT;
        this.tick(m, now);
      }
    }
    if (this.duels && this.phase === 'results') {
      if (this.duels.tick(now) === 'fight') this.startDuel(now);
      this.pushDuels(now);
    }
  }

  // Everyone who sees this match (its players, and whoever's watching).
  audience(m, now) {
    const watchers = m.duel ? this.duels.view(now).watching : null;
    return this.players.filter((p, i) => !watchers || m.slots.includes(i) || watchers.includes(i));
  }

  tick(m, now) {
    const w = m.world;
    const t = w.tick;
    // Each player's input for this tick (not here in time: their last one again); the bots'.
    m.pending.forEach((pending, f) => {
      if (pending.has(t)) m.inputs[f] = pending.get(t);
      // (Not heard from in a while, a hidden window, say: they've let go, rather than running on.)
      else if (t - m.heard[f] > QUIET_AFTER) m.inputs[f] = letGo(m.inputs[f]);
      for (const k of pending.keys()) if (k <= t) pending.delete(k);
    });
    // (Played exactly as sent: through the same encoding, the bots' aim rounded like everyone's.)
    const codes = m.slots.map((_, f) => encodeInput(m.bots[f] ? botInput(w, f, m.bots[f]) : m.inputs[f]));
    const inputs = codes.map((c) => decodeInput(c));
    const outs = m.outs.splice(0);
    for (const f of outs) removeFighter(w, f);
    step(w, inputs);
    // Everyone's inputs on it, to everyone: each browser plays the same tick with them.
    const audience = this.audience(m, now);
    const msg = { t: 'tk', k: t, i: codes, ...(outs.length ? { o: outs } : {}) };
    for (const p of audience) p.send?.(msg);
    // Now and then: a fingerprint of the world (to catch a browser that drifted), pings, how early
    // each player's inputs arrive (their browser keeps it to a tick or two), the characters.
    if (w.tick % CHECK_EVERY === 0) {
      const check = { t: 'ck', k: w.tick, h: fingerprint(w), p: m.slots.map((i) => (this.players[i].kind === 'bot' ? null : this.players[i].ms)), e: m.early.map((e) => (e === Infinity ? null : e)), c: m.chars };
      m.early.fill(Infinity);
      for (const p of audience) p.send?.(check);
    }
    // Over (and the end shown for a moment): the results.
    if (w.phase === 'over' && w.timer <= 0) {
      for (const p of audience) p.send?.({ t: 'end', k: w.tick });
      this.matchOver(m, now);
    }
  }

  matchOver(m, now) {
    const winner = m.world.winner >= 0 ? m.slots[m.world.winner] : -1;
    this.phase = 'results';
    if (m.duel) {
      this.duels.result(winner, now);
      return this.pushDuels(now);
    }
    this.crownName = winner >= 0 ? this.players[winner].name : null;
    if (this.series && winner >= 0) {
      const w = this.players[winner];
      w.wins = (w.wins ?? 0) + 1;
      this.series.over = w.wins >= Math.ceil(this.series.rounds / 2);
    }
    // The honor duels open at the end of the match (in a series, once the series is decided).
    if (!this.series || this.series.over) {
      this.duels = new DuelBoard(this.players, now);
      this.pushDuels(now);
    }
    this.sendStanding();
  }

  // After a match: enough people (and bots) left for another? (Anyone watching gets a seat.)
  canRematch() {
    const seated = this.players.filter((p) => p.seated && !p.left).length;
    const waiting = this.players.filter((p) => !p.seated && !p.left).length;
    return Math.min(RULES.maxOnline, seated + waiting) >= 2;
  }

  // On the results screen: who from the match has left (by fighter), and whether a rematch and
  // a duel are still possible.
  sendStanding() {
    const m = this.match;
    if (this.phase !== 'results' || !m) return;
    const left = m.slots.map((i, f) => (this.players[i]?.left ? f : -1)).filter((f) => f >= 0);
    const duel = this.players.filter((p) => !p.left).length >= 2;
    for (const p of this.players) p.send?.({ t: 'standing', left, rematch: this.canRematch(), duel });
  }

  // ---- Honor duels -------------------------------------------------------------------------

  startDuel(now) {
    const s = this.duels.setup();
    this.play([s.a, s.b], { stocks: s.stocks, stage: rollStage(MIXED), rules: s.rules ?? {}, duel: s.mode }, now);
  }

  closeDuels() {
    if (!this.duels) return;
    this.duels = null;
    this.duelSent = '';
    for (const p of this.players) p.send?.({ t: 'duels', d: null });
  }

  // The board, to everyone (when it changed).
  pushDuels(now) {
    if (!this.duels) return;
    const d = this.duels.view(now);
    const names = this.players.map((p) => p.name);
    const bots = this.players.map((p, i) => (p.kind === 'bot' ? i : -1)).filter((i) => i >= 0);
    const owners = this.players.map((p, i) => (p.owner ? i : -1)).filter((i) => i >= 0);
    const packed = JSON.stringify([d, names, owners]);
    if (packed === this.duelSent) return;
    this.duelSent = packed;
    this.players.forEach((p, you) => p.send?.({ t: 'duels', d, names, bots, you, owner: !!p.owner }));
  }
}

// A character for each player: a fresh random one, but anyone who picked one keeps it.
function castFor(players) {
  const chars = pickCast(players.length);
  players.forEach((p, i) => {
    if (!CHARACTERS.includes(p.char)) return;
    const j = chars.indexOf(p.char);
    if (j >= 0 && j !== i) chars[j] = chars[i];
    chars[i] = p.char;
  });
  return chars;
}
