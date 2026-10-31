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
import { isStageId, isStageChoice, rollStage, MIXED, DEFAULT_STAGE } from '../src/sim/stage.js';
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
// A rematch or a new series, after a match: the owner invites everyone, who has REMATCH_MS to
// accept or sit it out; once everyone's in, it starts within ALL_IN_MS (or now, if the owner says).
// It never starts while duels are being set up or fought: it waits for them.
export const REMATCH_MS = 30000;
export const ALL_IN_MS = 10000;
// In the lobby, someone seated who does nothing for this long gives their seat to whoever's been
// waiting (only if someone is).
export const IDLE_MS = 3 * 60 * 1000;
// Player rotation (more people than seats): after each match (after a series, once it's decided),
// one player sits out and joins the back of the queue. 'crown': Pass the Crown, the best score;
// 'skill': Skill Issue, whoever lost by the widest margin.
const ROTATIONS = ['off', 'crown', 'skill'];

// A guest's suggestion for the next match (the owner can adopt it): a stage and a rule preset,
// either one optional.
function cleanSuggestion(s) {
  const stage = isStageChoice(s?.stage) || isStageId(s?.stage) ? s.stage : null;
  const preset = PRESETS.includes(s?.preset) ? s.preset : null;
  return stage || preset ? { stage, preset } : null;
}

// The rules a room starts with (the owner changes them).
export const DEFAULT_RULES = { stocks: RULES.stocks, rounds: 1, stage: MIXED, preset: 'normal', rules: { melee: true, ranged: true, thrown: true, items: true }, stormPace: 'normal', crownRule: 'show', rotation: 'off' };

// Rules from a player: only known values get through.
export function cleanRules(r = {}) {
  const on = (v) => v !== false;
  const rules = r.rules ?? {};
  return {
    stocks: Math.max(1, Math.min(5, Number.isInteger(r.stocks) ? r.stocks : RULES.stocks)),
    rounds: [1, 3, 5].includes(r.rounds) ? r.rounds : 1,
    stage: isStageChoice(r.stage) || isStageId(r.stage) ? r.stage : DEFAULT_STAGE,
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
    rotation: ROTATIONS.includes(r.rotation) ? r.rotation : 'off',
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
    this.rematch = null; // a rematch or new series on offer: { ends, yes, no } (sets of players)
    this.private = false; // kept off the public room list (join by code only)
    this.lastScores = null; // the last match's players, how they did: [{ p, stocks, kos }]
    this.duelSent = '';
  }

  // ---- People coming and going -------------------------------------------------------------

  // A person joins (send: how to reach them): seated if there's a seat in the lobby, else
  // watching. Returns their index, or the reason they can't come in.
  join(name, char, send, now) {
    const seated = this.phase === 'lobby' && this.seats() < RULES.maxOnline;
    if (!seated && this.watching() >= RULES.maxWatching) return `That room is full (${RULES.maxOnline} playing, ${RULES.maxWatching} watching).`;
    const p = { kind: 'person', name: cleanName(name), char: CHARACTERS.includes(char) ? char : null, send, ms: null, owner: !this.people().length, seated, wins: 0, joined: now, active: now };
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
    for (const p of this.players) if (!p.seated && !p.left && !p.sitOut && p.kind === 'person' && this.seats() < RULES.maxOnline) p.seated = true;
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
      if (this.rematch) this.allIn(now);
    }
    // Nobody left: the room closes. Otherwise the next person takes over (a seated one first).
    if (!this.people().length) return this.onEmpty(this);
    if (wasOwner) this.passOwner([...this.people()].sort((a, b) => (a.joined ?? 0) - (b.joined ?? 0))[0]);
    if (this.phase === 'lobby') {
      this.seatWatchers();
      this.sendLobby();
    } else {
      this.pushDuels(now);
      this.sendStanding();
    }
  }

  people = () => this.players.filter((p) => p.kind === 'person' && !p.left);

  // A new owner (the previous one left, or handed it over): everyone's told.
  passOwner(q) {
    if (!q) return;
    for (const p of this.players) p.owner = p === q;
    this.notice(`${q.name} is now the room's owner.`);
  }

  // A line for everyone (shown for a moment).
  notice(text) {
    for (const p of this.players) p.send?.({ t: 'notice', text });
  }

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
      private: this.private,
    };
  }
  isOwner = (i) => !!this.players[i]?.owner;

  // ---- Messages from a player --------------------------------------------------------------

  receive(i, msg, now) {
    const p = this.players[i];
    if (!p || p.left || !msg || typeof msg !== 'object') return;
    if (msg.t !== 'pong') p.active = now;
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
        // (From the room, for the next match: a character, or null for Random.)
        if (msg.char !== null && !CHARACTERS.includes(msg.char)) break;
        p.char = msg.char;
        const f = this.fighterOf(i);
        if (f >= 0 && msg.char) this.match.chars[f] = msg.char;
        break;
      }
      case 'duel':
        // (Duels go on as usual while a rematch is on offer: see invited.)
        if (this.duels?.act(i, { a: clip(msg.a, 16), to: Number(msg.to), from: Number(msg.from), mode: clip(msg.mode, 16), on: !!msg.on }, now)) {
          this.pushDuels(now);
          this.pushRematch(now);
        }
        break;
      case 'suggest':
        // A guest's suggestion for the next match (the owner changes the rules themselves). A new
        // suggestion starts with no votes.
        if (this.phase !== 'lobby' || p.owner) break;
        p.suggest = cleanSuggestion(msg);
        p.voters = new Set();
        this.sendLobby();
        break;
      case 'vote': {
        // +1 (or take it back) on someone else's suggestion.
        const q = this.players[msg.i];
        if (this.phase !== 'lobby' || !q?.suggest || q === p) break;
        q.voters ??= new Set();
        if (q.voters.has(p)) q.voters.delete(p);
        else q.voters.add(p);
        this.sendLobby();
        break;
      }
      case 'lobbyReady':
        // Ready for the next match (the owner sees who is; they can start anyway).
        if (this.phase !== 'lobby' || p.owner) break;
        p.ready = !!msg.on;
        this.sendLobby();
        break;
      case 'rematchAnswer': {
        const r = this.rematch;
        if (!r || !this.invited(i, now)) break;
        r.yes.delete(p);
        r.no.delete(p);
        (msg.yes ? r.yes : r.no).add(p);
        this.allIn(now);
        this.pushRematch(now);
        break;
      }
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
        // The series' next round: right away. A rematch or a new series: an invite (see
        // offerRematch). Not enough people left for one: the lobby. Not while duels are being set
        // up (someone challenged, or a duel's on).
        if (this.phase !== 'results' || this.rematch) return;
        if (!this.canRematch()) return this.ownerCommand({ t: 'lobby' }, now);
        if (this.duelsBusy()) return;
        if (this.series && !this.series.over) {
          this.series.round++;
          this.closeDuels();
          this.tidy();
          return this.startMatch(now);
        }
        return this.offerRematch(now);
      case 'lobby':
        if (this.phase === 'lobby') return;
        this.series = null;
        this.rematch = null;
        this.lastScores = null;
        for (const p of this.players) p.sitOut = false;
        this.closeDuels();
        this.match = null;
        this.phase = 'lobby';
        this.tidy();
        return this.sendLobby();
      case 'duelNow':
        if (this.duels?.startNow(now)) this.pushDuels(now);
        return;
      case 'rematchNow':
        // Everyone's in: start without waiting out the last seconds (not while duels are on).
        if (this.rematch && this.everyoneIn(now) && !this.duelsBusy()) this.startRematch(now);
        return;
      case 'private':
        this.private = !!msg.on;
        return this.sendLobby();
      case 'giveOwner': {
        const q = this.players[msg.i];
        if (!q || q.kind !== 'person' || q.left || q.owner) return;
        this.passOwner(q);
        return this.phase === 'lobby' ? this.sendLobby() : (this.pushDuels(now), this.sendStanding(), this.pushRematch(now));
      }
    }
  }

  // ---- The lobby ---------------------------------------------------------------------------

  // (Back to the lobby or a rematch: people who left are cleared out, and anyone watching takes
  // the seats they freed.)
  tidy() {
    this.players = this.players.filter((p) => !p.left);
    this.seatWatchers();
  }

  // viewer: who it's for (whether they voted for each suggestion).
  lobbyPlayers(viewer) {
    // (kind: 'host' marks the owner, for the page; watching: no seat yet, waiting in this order.)
    return this.players.map((p) => ({
      name: p.name,
      kind: p.kind === 'bot' ? 'bot' : p.owner ? 'host' : 'remote',
      level: p.level,
      watching: !p.seated,
      ready: !!p.ready,
      suggest: p.suggest ?? null,
      votes: p.voters?.size ?? 0,
      voted: !!p.voters?.has(viewer),
    }));
  }

  sendLobby() {
    this.players.forEach((p, you) => p.send?.({ t: 'lobby', code: this.code, players: this.lobbyPlayers(p), you, owner: !!p.owner, rules: this.rules, private: this.private }));
  }

  // ---- Matches -----------------------------------------------------------------------------

  // Everyone seated plays (a fresh character each, but anyone who picked one keeps it); everyone
  // else watches.
  startMatch(now) {
    const slots = this.players.map((p, i) => (p.seated ? i : -1)).filter((i) => i >= 0);
    if (slots.length < 2) return;
    for (const p of this.players) Object.assign(p, { suggest: null, voters: null, ready: false });
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
    if (this.rematch && this.phase === 'results') {
      // (Anyone asked for the first time now, back from a duel: at least ALL_IN_MS to answer.)
      const r = this.rematch;
      for (const i of this.invitedList(now)) {
        const p = this.players[i];
        if (r.asked.has(p)) continue;
        r.asked.add(p);
        if (now > r.ends - ALL_IN_MS) r.ends = now + ALL_IN_MS;
      }
      if (now >= this.rematch.ends && !this.duelsBusy()) this.startRematch(now);
      else this.pushRematch(now);
    }
    // The lobby: an idle seat goes to whoever's waiting.
    if (this.phase === 'lobby') this.idleSeats(now);
  }

  // In the lobby, anyone seated (not the owner) idle for IDLE_MS gives their seat to whoever's
  // been waiting longest, and joins the back of the queue.
  idleSeats(now) {
    const waiting = () => this.players.some((p) => !p.seated && !p.left && p.kind === 'person');
    if (!waiting()) return;
    const idle = this.players.find((p) => p.kind === 'person' && p.seated && !p.owner && !p.left && now - (p.active ?? now) > IDLE_MS);
    if (!idle) return;
    this.toBack(idle);
    this.seatWatchers();
    this.notice(`${idle.name} was idle: their seat went to the next in line.`);
    this.sendLobby();
  }

  // Someone gets up: no seat, at the back of the queue (the list's order is the queue's).
  toBack(p) {
    p.seated = false;
    p.ready = false;
    this.players.splice(this.players.indexOf(p), 1);
    this.players.push(p);
  }

  // Player rotation (see ROTATIONS): one of the last match's players gets up for whoever's
  // waiting. Only between matches with someone waiting, and never mid-series.
  rotate() {
    const how = this.rules.rotation;
    if (how === 'off' || !this.lastScores || (this.series && !this.series.over)) return;
    if (!this.players.some((p) => !p.seated && !p.left && !p.sitOut && p.kind === 'person')) return;
    const seated = this.lastScores.filter((s) => s.p.kind === 'person' && s.p.seated && !s.p.left);
    if (!seated.length) return;
    const by = (s) => s.stocks * 100 + s.kos;
    const pick = seated.reduce((a, b) => (how === 'crown' ? (by(b) > by(a) ? b : a) : by(b) < by(a) ? b : a));
    this.toBack(pick.p);
    this.notice(how === 'crown' ? `${pick.p.name} passes the crown and sits out a turn.` : `Skill issue: ${pick.p.name} rotates out.`);
  }

  // ---- Rematch invites ---------------------------------------------------------------------

  // Duels being set up: a challenge waiting, or a duel accepted and not fought yet.
  duelsBusy() {
    const d = this.duels;
    return !!d && (d.invites.length > 0 || (d.duels.length > 0 && d.phase !== 'done'));
  }

  // Who the rematch invite is for right now: everyone who played (or sat the last one out) and is
  // still here, spectating the duels or not, but the owner (it's theirs) and anyone in a duel
  // (they're asked once the duels are over). Only those who accept play: anyone who says no, or
  // doesn't answer by the start, watches (and is invited to the next one).
  invited(i) {
    const p = this.players[i];
    if (!p || p.kind !== 'person' || p.left || !(p.seated || p.sitOut) || p.owner) return false;
    return !(this.duelsBusy() && this.duels?.inDuel(i));
  }
  invitedList = (now) => this.players.map((_, i) => i).filter((i) => this.invited(i, now));
  everyoneIn = (now) => this.invitedList(now).every((i) => this.rematch.yes.has(this.players[i]));

  // Everyone's in: it starts within ALL_IN_MS.
  allIn(now) {
    if (this.everyoneIn(now)) this.rematch.ends = Math.min(this.rematch.ends, now + ALL_IN_MS);
  }

  // The owner offers a rematch (or a new series): everyone it's for has REMATCH_MS to accept or
  // sit it out.
  offerRematch(now) {
    // (asked: who's seen the invite; anyone first asked late, coming back from a duel, gets at
    // least ALL_IN_MS to answer.)
    this.rematch = { ends: now + REMATCH_MS, yes: new Set(), no: new Set(), asked: new Set(), sent: '' };
    this.allIn(now);
    this.pushRematch(now);
  }

  // The time's up (and no duels on): whoever sat it out watches; the rest play. With player
  // rotation, someone takes a turn out (see rotate). Too few: the lobby.
  startRematch(now) {
    const r = this.rematch;
    // (Everyone who played but didn't accept: said no, didn't answer, or was moved to spectate.)
    const out = this.players.filter((p) => p.kind === 'person' && !p.left && !p.owner && (p.seated || p.sitOut) && !r.yes.has(p));
    this.rematch = null;
    for (const p of this.players) p.sitOut = false;
    for (const p of [...r.no, ...out]) Object.assign(p, { seated: false, sitOut: true });
    this.pushRematch(now);
    this.rotate();
    if (this.players.filter((p) => p.seated && !p.left).length < 2) return this.ownerCommand({ t: 'lobby' }, now);
    if (this.series?.over) {
      Object.assign(this.series, { round: 1, over: false });
      for (const p of this.players) p.wins = 0;
    }
    this.closeDuels();
    this.tidy();
    this.startMatch(now);
  }

  // Everyone hears about the invite (null: none), when anything about it changes (each second
  // the countdown ticks).
  pushRematch(now) {
    const r = this.rematch;
    const idx = (set) => [...set].map((p) => this.players.indexOf(p)).filter((i) => i >= 0);
    const view = r && { left: Math.max(0, Math.ceil((r.ends - now) / 1000)), invited: this.invitedList(now), yes: idx(r.yes), no: idx(r.no), series: !!this.series, allIn: this.everyoneIn(now), duels: this.duelsBusy() };
    const key = JSON.stringify(view);
    if (r && key === r.sent) return;
    if (r) r.sent = key;
    const owner = this.players.find((p) => p.owner)?.name ?? '';
    this.players.forEach((p, you) => p.send?.({ t: 'rematch', r: view, owner, you }));
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
    this.lastScores = m.slots.map((i, f) => ({ p: this.players[i], stocks: m.world.fighters[f]?.stocks ?? 0, kos: m.world.fighters[f]?.kos ?? 0 }));
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
