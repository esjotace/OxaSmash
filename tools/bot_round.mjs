// A round of bot testing: bot-only matches on every stage and a spread of random dungeons,
// reporting crashes, stalls, broken positions, determinism, match lengths, how KOs happen, and
// how much the bots use running, pickups, death drops and the rest.
//
//   node tools/bot_round.mjs
import { createWorld, step } from '../src/sim/world.js';
import { createBot, botInput } from '../src/bots/bot.js';
import { STAGES } from '../src/sim/stage.js';

const STORM = { startDelay: 25, firstShrink: 25, hold: 10, finalShrink: 20 };
const LEVELS = [['hard', 'hard'], ['hard', 'normal', 'normal', 'easy'], ['normal', 'normal', 'normal']];
const stages = [...Object.keys(STAGES).filter((s) => !STAGES[s].noStorm || s === 'training'), ...Array.from({ length: 12 }, (_, k) => `mixed-${k * 7 + 3}`)];

function play(stage, levels, seed, record = false) {
  const w = createWorld({ stage, players: levels.length, stocks: 3, countdown: 0, seed, storm: STORM });
  const bots = levels.map((l, i) => createBot(l, seed * 31 + i));
  const counts = {};
  const ko = {};
  const drops = new Set();
  let dropsTaken = 0;
  let bad = null;
  let runTicks = 0;
  const trace = [];
  let t = 0;
  for (; t < 60 * 360 && w.phase !== 'over'; t++) {
    const before = new Set(w.pickups.filter((p) => p.life !== undefined).map((p) => p.id));
    for (const id of before) drops.add(id);
    step(w, bots.map((b, i) => botInput(w, i, b)));
    for (const e of w.events) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      if (e.type === 'ko') {
        const key = `${e.how ?? '?'}${e.by >= 0 && e.by !== e.id ? '' : ' (self)'}`;
        ko[key] = (ko[key] ?? 0) + 1;
      }
    }
    const now = new Set(w.pickups.map((p) => p.id));
    for (const id of before) if (!now.has(id) && w.events.some((e) => e.type === 'pickup')) dropsTaken++;
    for (const f of w.fighters) {
      if (f.run >= 0) runTicks++;
      if (f.state === 'ok' && ![f.x, f.y, f.vx, f.vy, f.stamina].every(Number.isFinite)) bad ??= `NaN fighter ${f.id} at tick ${t}`;
      if (f.state === 'ok' && (f.stamina < -0.01 || f.stamina > 1.01)) bad ??= `stamina ${f.stamina} fighter ${f.id} tick ${t}`;
    }
    if (record && t % 30 === 0) trace.push(w.fighters.map((f) => `${f.x.toFixed(3)},${f.y.toFixed(3)},${f.damage.toFixed(2)},${f.stocks}`).join('|'));
  }
  return { stage, levels: levels.join('/'), seed, secs: Math.round(t / 60), over: w.phase === 'over', winner: w.winner, counts, ko, dropsSeen: drops.size, dropsTaken, runSecs: Math.round(runTicks / 60), bad, trace };
}

const results = [];
const errors = [];
let n = 0;
for (const stage of stages) {
  for (const levels of LEVELS) {
    const seed = 1000 + n++;
    try {
      results.push(play(stage, levels, seed));
    } catch (e) {
      errors.push(`${stage} ${levels.join('/')} seed ${seed}: ${e.stack.split('\n').slice(0, 3).join(' / ')}`);
    }
  }
}

// Determinism: the same match twice must be identical, tick for tick (online play relies on it).
const det = [];
for (const [stage, seed] of [['warehouse', 7], ['castle', 8], ['mixed-21', 9], ['village', 10]]) {
  const a = play(stage, ['hard', 'normal', 'normal'], seed, true);
  const b = play(stage, ['hard', 'normal', 'normal'], seed, true);
  det.push(`${stage}: ${a.trace.join() === b.trace.join() && a.winner === b.winner ? 'identical' : 'DIFFERENT'}`);
}

const sum = (k) => results.reduce((s, r) => s + (r.counts[k] ?? 0), 0);
const lengths = results.map((r) => r.secs).sort((a, b) => a - b);
const kos = {};
for (const r of results) for (const [k, v] of Object.entries(r.ko)) kos[k] = (kos[k] ?? 0) + v;
console.log(`matches: ${results.length}, crashes: ${errors.length}, stalled (6 min, no winner): ${results.filter((r) => !r.over).length}, broken numbers: ${results.filter((r) => r.bad).length}`);
for (const e of errors) console.log('  CRASH', e);
for (const r of results.filter((r) => !r.over)) console.log('  STALL', r.stage, r.levels, r.seed);
for (const r of results.filter((r) => r.bad)) console.log('  BAD', r.stage, r.levels, r.seed, r.bad);
console.log(`length (s): min ${lengths[0]}, median ${lengths[Math.floor(lengths.length / 2)]}, max ${lengths.at(-1)}`);
console.log('KOs by how:', JSON.stringify(kos));
console.log(`per match: runs ${(sum('run') / results.length).toFixed(1)} (${(results.reduce((s, r) => s + r.runSecs, 0) / results.length).toFixed(1)} s of running), dashes ${(sum('dodge') / results.length).toFixed(1)}, pickups ${(sum('pickup') / results.length).toFixed(1)}, shots ${(sum('shoot') / results.length).toFixed(0)}, melee hits ${(sum('hit') / results.length).toFixed(1)}, grenade throws ${(sum('throw') / results.length).toFixed(1)}, headshots ${(sum('headshot') / results.length).toFixed(1)}`);
console.log(`death drops: ${results.reduce((s, r) => s + r.dropsSeen, 0)} floated in, ${results.reduce((s, r) => s + r.dropsTaken, 0)} picked up`);
const byStage = {};
for (const r of results) (byStage[r.stage] ??= []).push(r.secs);
console.log('median length by stage:', Object.entries(byStage).map(([s, v]) => `${s} ${v.sort((a, b) => a - b)[Math.floor(v.length / 2)]}`).join(', '));
console.log('determinism:', det.join(', '));
