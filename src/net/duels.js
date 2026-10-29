// Honor duels: after an online match, from the results screen, players challenge each other to
// 1v1 duels. The host keeps the board (DuelBoard) and sends everyone its view; guests send their
// moves (invite, accept...) to the host. Plain JS, no network or DOM: times are passed in (ms).
//
// The flow: gather (challenges go out and get accepted; anyone can choose to spectate) →
// countdown (once there's a duel and no challenge is waiting) → for each duel in turn: rules (both
// duellers pick a mode; the same pick applies, different picks mean Normal) → vote (Crowd's
// Choice: the spectators pick) → fight (the host plays the match) → … → done.
// Players are the room's player indexes. Bots accept any challenge and agree to any rules.

// The duel modes: what's in play (see rules in createWorld), lives, and how it reads.
export const DUEL_MODES = {
  normal: { name: 'Normal Duel', text: 'The room as usual: everything in play.', rules: {} },
  crowd: { name: "Crowd's Choice", text: 'Let the spectators decide.', rules: null },
  gentleman: { name: "Gentleman's Duel", text: 'No items. No weapons. Just fists.', rules: { melee: false, ranged: false, thrown: false, items: false } },
  beatdown: { name: 'Beatdown', text: 'Melee weapons only.', rules: { melee: true, ranged: false, thrown: false, items: false } },
  shootout: { name: 'Shootout', text: 'Ranged weapons only.', rules: { melee: false, ranged: true, thrown: false, items: false } },
  grenades: { name: 'Grenade Party', text: 'Grenades only (you start with two).', rules: { melee: false, ranged: false, thrown: true, items: false, startGrenades: 2 } },
  onegun: { name: '1 GUN. 2 FISTS. 3 LIVES', text: 'The 9mm and your fists. Nothing turns up.', rules: { melee: false, ranged: false, thrown: false, items: false, startGun: true } },
};
export const DUEL = {
  lives: 3,
  afterMs: 30000, // undecided this long (with auto-spectate on): spectating
  countdownMs: 10000, // from "everyone's set" to the first duel
  rulesMs: 20000, // to pick the rules
  voteMs: 10000, // the crowd's vote
};

export class DuelBoard {
  // players: the room's players ({ name, kind: host | remote | bot }); now: ms.
  constructor(players, now, rnd = Math.random) {
    this.players = players;
    this.rnd = rnd;
    this.started = now;
    this.phase = 'gather';
    this.present = new Set(players.map((_, i) => i).filter((i) => !players[i].left));
    this.invites = []; // { from, to, at }
    this.duels = []; // { a, b, at, tie, mode, winner } in the order they're fought
    this.watching = new Set(); // spectating the duels
    this.auto = new Map(); // player -> auto-spectate (on unless turned off)
    this.lastAct = new Map(); // player -> when they last did something
    this.countdownEnds = 0;
    this.current = -1; // the duel being set up or fought
    this.picks = {}; // the current duellers' rule picks
    this.rulesEnd = 0;
    this.votes = new Map(); // spectator -> mode
    this.voteEnds = 0;
  }

  isBot = (i) => this.players[i]?.kind === 'bot';
  inDuel = (i) => this.duels.some((d) => d.a === i || d.b === i);
  // Set: in a duel, or spectating (bots never need to decide).
  decided = (i) => this.isBot(i) || this.inDuel(i) || this.watching.has(i);
  free = (i) => this.present.has(i) && !this.inDuel(i);

  // A player's move. Returns true if it changed anything.
  act(i, move, now) {
    if (!this.present.has(i)) return false;
    this.lastAct.set(i, now);
    const { a: kind, to, from, mode, on } = move;
    if (kind === 'auto') {
      this.auto.set(i, !!on);
      return true;
    }
    if (kind === 'spectate') {
      if (on) this.watching.add(i);
      else this.watching.delete(i);
      return true;
    }
    if (kind === 'pick') return this.pick(i, mode, now);
    if (kind === 'vote') return this.vote(i, mode);
    if (this.phase !== 'gather' && this.phase !== 'countdown') return false;
    if (kind === 'invite') {
      // People without a duel can challenge others without one (not twice, not themselves).
      if (to === i || !this.free(i) || !this.free(to) || this.invites.some((v) => v.from === i && v.to === to)) return false;
      this.invites.push({ from: i, to, at: now });
      if (this.isBot(to)) this.accept(to, i, now);
      return true;
    }
    if (kind === 'cancel') return this.dropInvites((v) => v.from === i && v.to === to);
    if (kind === 'decline') return this.dropInvites((v) => v.from === from && v.to === i);
    if (kind === 'accept') return this.accept(i, from, now);
    return false;
  }

  accept(i, from, now) {
    if (!this.invites.some((v) => v.from === from && v.to === i) || !this.free(i) || !this.free(from)) return false;
    // First come, first served (two at the same moment: a coin toss decides).
    this.duels.push({ a: from, b: i, at: now, tie: this.rnd(), mode: null, winner: -1 });
    this.duels.sort((p, q) => p.at - q.at || p.tie - q.tie);
    // They're taken: every other challenge to or from either is off.
    this.dropInvites((v) => [v.from, v.to].some((k) => k === i || k === from));
    return true;
  }

  dropInvites(test) {
    const before = this.invites.length;
    this.invites = this.invites.filter((v) => !test(v));
    return this.invites.length !== before;
  }

  // Someone left: their challenges go, and any duel of theirs not fought yet.
  leave(i) {
    this.present.delete(i);
    this.watching.delete(i);
    this.dropInvites((v) => v.from === i || v.to === i);
    this.duels = this.duels.filter((d, k) => k <= this.current || (d.a !== i && d.b !== i));
  }

  // Someone joined mid-way: they watch.
  join(i, now) {
    this.present.add(i);
    this.watching.add(i);
    this.lastAct.set(i, now);
  }

  // The host skips the wait: whoever hasn't decided spectates, and the countdown starts.
  startNow(now) {
    if (this.phase !== 'gather' || !this.duels.length) return false;
    for (const i of this.present) if (!this.decided(i)) this.watching.add(i);
    this.invites = [];
    this.phase = 'countdown';
    this.countdownEnds = now;
    return true;
  }

  pick(i, mode, now) {
    const d = this.duels[this.current];
    if (this.phase !== 'rules' || !d || (i !== d.a && i !== d.b) || !Object.hasOwn(DUEL_MODES, mode)) return false;
    this.picks[i] = mode;
    // (A bot goes along with whatever its opponent picks.)
    const other = i === d.a ? d.b : d.a;
    if (this.isBot(other)) this.picks[other] = mode;
    if (this.picks[d.a] && this.picks[d.b]) this.settle(now);
    return true;
  }

  vote(i, mode) {
    const d = this.duels[this.current];
    if (this.phase !== 'vote' || !d || i === d.a || i === d.b || !this.present.has(i) || !Object.hasOwn(DUEL_MODES, mode) || mode === 'crowd') return false;
    this.votes.set(i, mode);
    return true;
  }

  // The rules are in: the same pick from both applies; different (or missing) picks, Normal.
  settle(now) {
    const d = this.duels[this.current];
    const [p, q] = [this.picks[d.a], this.picks[d.b]];
    const mode = p && p === q ? p : 'normal';
    if (mode !== 'crowd') return this.fight(mode);
    const voters = [...this.present].filter((k) => k !== d.a && k !== d.b && !this.isBot(k));
    if (!voters.length) return this.fight(this.randomMode());
    this.phase = 'vote';
    this.votes = new Map();
    this.voteEnds = now + DUEL.voteMs;
  }

  randomMode() {
    const modes = Object.keys(DUEL_MODES).filter((m) => m !== 'crowd');
    return modes[Math.floor(this.rnd() * modes.length)];
  }

  fight(mode) {
    this.duels[this.current].mode = mode;
    this.phase = 'fight';
  }

  // The duel being fought is over (winner: a player index, or -1 for a draw); on to the next.
  result(winner, now) {
    const d = this.duels[this.current];
    if (this.phase !== 'fight' || !d) return;
    d.winner = winner;
    this.next(now);
  }

  next(now) {
    // (Duels whose players left are skipped.)
    do this.current++;
    while (this.current < this.duels.length && !(this.present.has(this.duels[this.current].a) && this.present.has(this.duels[this.current].b)));
    if (this.current >= this.duels.length) {
      this.phase = 'done';
      return;
    }
    this.phase = 'rules';
    this.picks = {};
    this.rulesEnd = now + DUEL.rulesMs;
  }

  // Time passing: idle players start spectating, the countdown runs out, the rules or the vote
  // time out. Returns 'fight' when a duel is ready to be played (once).
  tick(now) {
    if (this.phase === 'gather' || this.phase === 'countdown') {
      // Idle 30 s (with auto-spectate on): spectating.
      for (const i of this.present) {
        if (this.decided(i) || this.auto.get(i) === false) continue;
        if (now - Math.max(this.started, this.lastAct.get(i) ?? this.started) >= DUEL.afterMs) this.watching.add(i);
      }
      const ready = this.duels.length > 0 && this.invites.length === 0;
      if (this.phase === 'gather' && ready && [...this.present].every((i) => this.decided(i) || now - this.started >= DUEL.afterMs)) {
        this.phase = 'countdown';
        this.countdownEnds = now + DUEL.countdownMs;
      } else if (this.phase === 'countdown' && !ready) {
        this.phase = 'gather'; // (a new challenge: wait for it)
      }
      if (this.phase === 'countdown' && now >= this.countdownEnds) {
        // Whoever still hasn't decided watches (unless they turned auto-spectate off).
        for (const i of this.present) if (!this.decided(i) && this.auto.get(i) !== false) this.watching.add(i);
        this.next(now);
      }
    }
    if (this.phase === 'rules' && now >= this.rulesEnd) this.settle(now);
    if (this.phase === 'vote' && now >= this.voteEnds) {
      const count = new Map();
      for (const m of this.votes.values()) count.set(m, (count.get(m) ?? 0) + 1);
      const top = Math.max(0, ...count.values());
      const best = [...count].filter(([, n]) => n === top && n > 0).map(([m]) => m);
      this.fight(best.length ? best[Math.floor(this.rnd() * best.length)] : this.randomMode());
    }
    if (this.phase === 'fight' && !this.fighting) {
      this.fighting = true;
      return 'fight';
    }
    if (this.phase !== 'fight') this.fighting = false;
    return null;
  }

  // The duel to play now: { a, b, mode, rules, stocks }.
  setup() {
    const d = this.duels[this.current];
    return d && { a: d.a, b: d.b, mode: d.mode, rules: DUEL_MODES[d.mode].rules, stocks: DUEL.lives };
  }

  // What everyone sees (sent to guests as is): times as seconds left.
  view(now) {
    const left = (t) => Math.max(0, Math.ceil((t - now) / 1000));
    const d = this.duels[this.current];
    return {
      phase: this.phase,
      present: [...this.present],
      invites: this.invites.map(({ from, to }) => ({ from, to })),
      duels: this.duels.map(({ a, b, mode, winner }) => ({ a, b, mode, winner })),
      watching: [...this.watching],
      autoOff: [...this.auto].filter(([, on]) => !on).map(([i]) => i),
      current: this.current,
      countdown: this.phase === 'countdown' ? left(this.countdownEnds) : 0,
      picks: this.phase === 'rules' && d ? { a: this.picks[d.a] ?? null, b: this.picks[d.b] ?? null } : null,
      rulesLeft: this.phase === 'rules' ? left(this.rulesEnd) : 0,
      votes: this.phase === 'vote' ? Object.fromEntries([...this.votes]) : null,
      voteLeft: this.phase === 'vote' ? left(this.voteEnds) : 0,
      idleLeft: this.phase === 'gather' ? left(this.started + DUEL.afterMs) : 0,
    };
  }
}
