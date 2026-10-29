// Diagnostic, not a test: many 4-bot matches with different seeds; reports any that stall.
import { createWorld, step } from '../src/sim/world.js';
import { createBot, botInput } from '../src/bots/bot.js';

const lengths = [];
for (let seed = 1; seed <= 20; seed++) {
  const w = createWorld({ players: 4, stocks: 2, countdown: 0, seed, storm: { startDelay: 20, firstShrink: 20, hold: 10, finalShrink: 15 } });
  const bots = ['hard', 'hard', 'normal', 'easy'].map((l, i) => createBot(l, seed * 10 + i));
  let t = 0;
  for (; t < 60 * 300 && w.phase !== 'over'; t++) step(w, bots.map((b, i) => botInput(w, i, b)));
  lengths.push(Math.round(t / 60));
  if (w.phase !== 'over') {
    console.log(`seed ${seed} STALLED, zone ${Math.round(w.storm.left)}..${Math.round(w.storm.right)} | ` + w.fighters.map((f) => `${f.id} (${Math.round(f.x)},${Math.round(f.y)}) st${f.stocks} ${f.grounded ? 'G' : 'A'}${f.onThin ? 'thin' : ''}`).join(' | '));
  }
}
console.log('match lengths (s):', lengths.join(' '));
