// Performance log (?perf in the address): records how long every frame takes and what was on the
// screen, shows a small FPS readout in the corner, and builds a text log to copy and paste (the
// in-game menu's "Copy performance log"). Measures only; it changes nothing in the game.
//
// Per frame: the time since the last frame, the game rules' share (stepping the match, and online
// the rollback replays) and the drawing's share, and counts of what's alive (display objects,
// particles, smoke puffs, dash afterimages, clouds, bullets).

import { pageParams } from '../params.js';

export const PERF = pageParams().has('perf');

const SECONDS = 120; // how much per-second history the log keeps
const SPIKE_MS = 33; // a frame this slow (or slower) is a stutter: logged with what was happening
const MAX_SPIKES = 40;

const rec = {
  start: 0,
  frames: [], // every frame's length (ms), for the averages and lows
  sim: [],
  draw: [],
  seconds: [], // one row a second: { t, fps, worst, sim, draw, steps, objs, parts, puffs, ghosts, clouds, bullets }
  bucket: null,
  spikes: [],
  steps: 0, // game ticks played (online: replays included)
  info: {}, // the machine and the match
};
let overlay = null;

// A match started (or the measuring was restarted): clear everything, note the setup.
export function perfStart(info = {}) {
  if (!PERF) return;
  Object.assign(rec, { start: performance.now(), frames: [], sim: [], draw: [], seconds: [], bucket: null, spikes: [], steps: 0 });
  rec.info = { ...rec.info, ...info };
  if (!overlay && typeof document !== 'undefined') {
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;left:8px;top:8px;z-index:50;font:12px/1.3 ui-monospace,monospace;color:#d9ffe0;background:rgba(0,0,0,.55);padding:3px 7px;border-radius:4px;pointer-events:none';
    document.body.append(overlay);
  }
}

export const perfRestart = () => perfStart();
// (The rules count the ticks they play: online, rollback replays are more than one a frame.)
export function perfStep() {
  if (PERF) rec.steps++;
}

// One frame: its length and the rules' and drawing's shares (ms), and what's alive right now.
export function perfFrame(ms, sim, draw, counts) {
  if (!PERF || !rec.start) return;
  rec.frames.push(ms);
  rec.sim.push(sim);
  rec.draw.push(draw);
  const now = performance.now();
  const t = Math.floor((now - rec.start) / 1000);
  let b = rec.bucket;
  if (!b || b.t !== t) {
    if (b) closeBucket(b);
    b = rec.bucket = { t, n: 0, worst: 0, sim: 0, draw: 0, steps0: rec.steps, ...counts };
  }
  b.n++;
  b.worst = Math.max(b.worst, ms);
  b.sim += sim;
  b.draw += draw;
  for (const [k, v] of Object.entries(counts)) b[k] = Math.max(b[k] ?? 0, v);
  if (ms >= SPIKE_MS && rec.spikes.length < MAX_SPIKES) rec.spikes.push({ at: ((now - rec.start) / 1000).toFixed(1), ms: Math.round(ms), sim: sim.toFixed(1), draw: draw.toFixed(1), ...counts });
  if (overlay && b.n % 10 === 1) overlay.textContent = `FPS ${Math.round(1000 / avg(rec.frames.slice(-60)))} · worst ${Math.round(Math.max(...rec.frames.slice(-60)))}ms · rules ${avg(rec.sim.slice(-60)).toFixed(1)}ms · draw ${avg(rec.draw.slice(-60)).toFixed(1)}ms · objs ${counts.objs ?? '?'}`;
}

function closeBucket(b) {
  rec.seconds.push({ t: b.t, fps: b.n, worst: Math.round(b.worst), sim: (b.sim / b.n).toFixed(1), draw: (b.draw / b.n).toFixed(1), steps: rec.steps - b.steps0, objs: b.objs, parts: b.parts, puffs: b.puffs, ghosts: b.ghosts, clouds: b.clouds, bullets: b.bullets });
  if (rec.seconds.length > SECONDS) rec.seconds.shift();
}

const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

// The log, as text to paste.
export function perfLog() {
  if (!PERF) return '';
  if (rec.bucket) closeBucket(rec.bucket), (rec.bucket = null);
  const f = rec.frames;
  const secs = ((performance.now() - rec.start) / 1000).toFixed(0);
  const lines = [];
  lines.push('OXASMASH PERF LOG');
  for (const [k, v] of Object.entries(rec.info)) lines.push(`${k}: ${v}`);
  lines.push(`recorded: ${secs} s, ${f.length} frames`);
  lines.push('');
  lines.push('SUMMARY');
  lines.push(`fps avg ${(1000 / avg(f)).toFixed(1)} | 1% low ${(1000 / pct(f, 0.99)).toFixed(1)} | 0.1% low ${(1000 / pct(f, 0.999)).toFixed(1)}`);
  lines.push(`frame ms: median ${pct(f, 0.5).toFixed(1)} | p95 ${pct(f, 0.95).toFixed(1)} | p99 ${pct(f, 0.99).toFixed(1)} | max ${Math.max(0, ...f).toFixed(1)}`);
  lines.push(`frames >= 33 ms: ${f.filter((v) => v >= 33).length} | >= 50 ms: ${f.filter((v) => v >= 50).length} | >= 100 ms: ${f.filter((v) => v >= 100).length}`);
  lines.push(`rules ms/frame: avg ${avg(rec.sim).toFixed(2)} | p99 ${pct(rec.sim, 0.99).toFixed(2)}`);
  lines.push(`draw ms/frame: avg ${avg(rec.draw).toFixed(2)} | p99 ${pct(rec.draw, 0.99).toFixed(2)}`);
  lines.push(`rest of the frame: ${(avg(f) - avg(rec.sim) - avg(rec.draw)).toFixed(1)} ms avg (the browser and graphics card finishing the picture, or, at a steady 60 fps, just waiting for the screen's next refresh)`);
  lines.push('');
  lines.push('PER SECOND (fps, worst ms, rules ms, draw ms, ticks played, display objects, particles, puffs, afterimages, clouds, bullets)');
  for (const s of rec.seconds) lines.push([s.t, s.fps, s.worst, s.sim, s.draw, s.steps, s.objs, s.parts, s.puffs, s.ghosts, s.clouds, s.bullets].join(','));
  lines.push('');
  lines.push(`STUTTERS (frames >= ${SPIKE_MS} ms; first ${MAX_SPIKES}): at s, ms, rules, draw, objects, particles, puffs, afterimages, clouds, bullets`);
  for (const s of rec.spikes) lines.push([s.at, s.ms, s.sim, s.draw, s.objs, s.parts, s.puffs, s.ghosts, s.clouds, s.bullets].join(','));
  return lines.join('\n');
}

// The machine: screen, scaling, the canvas, the graphics card, the browser.
export function perfMachine(game, renderScale) {
  if (!PERF) return {};
  let gpu = 'unknown';
  try {
    const gl = game.renderer?.gl;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  } catch {
    // (Not available: fine.)
  }
  // (Firefox hides the real graphics card from pages, for privacy: it names a common one instead.)
  if (/firefox/i.test(navigator.userAgent)) gpu += ' [Firefox reports a stand-in card for privacy, not the real one]';
  return {
    browser: navigator.userAgent,
    cores: navigator.hardwareConcurrency ?? '?',
    memoryGB: navigator.deviceMemory ?? '?',
    screen: `${screen.width}x${screen.height}`,
    window: `${innerWidth}x${innerHeight}`,
    pixelRatio: devicePixelRatio,
    renderScale: renderScale,
    graphics: (() => {
      try {
        return JSON.parse(localStorage.getItem('oxasmash-settings') ?? '{}').graphics ?? 'auto';
      } catch {
        return '?';
      }
    })(),
    canvas: `${game.canvas?.width}x${game.canvas?.height}`,
    renderer: game.renderer?.gl ? 'WebGL' : 'Canvas',
    gpu,
  };
}
