// Random stages built from modular sections. The stage is a row of SECTIONS columns, each SECTION
// px wide. Every column gets a lower section (what's on and around the floor, up to y = -96) and an
// upper section (platforms from y = -96 up to the rooftops at y = -256). Layouts are chosen from a
// seed, so the host and the guests build the same stage from the same id ("mixed-<seed>").
// Positions in a section are local (0..SECTION); a section may be mirrored left to right.
import { TILE } from './constants.js';

export const SECTION = 256;
export const SECTIONS = 7;
const W = SECTION * SECTIONS;

const block = (x, y, w, h, look, oneWay = false) => ({ x, y, w: w * TILE, h: h * TILE, look, oneWay });
const stone = (x, y, w, h = 1) => block(x, y, w, h, 'stone');
const ledge = (x, y, w) => block(x, y, w, 1, 'ledge', true);
const icy = (b) => ({ ...b, ice: true });
const glued = (b) => ({ ...b, glue: true });
// Low cover on the floor at floorY (see stage.js).
const boxes = (x, floorY, w = 2) => ({ ...block(x, floorY - TILE, w, 1, 'boxes'), cover: true });
const floor = () => stone(0, 0, 16, 4);
const p = (x, y) => ({ x, y });

// Lower sections. Each build gets a random number source (for timing offsets).
//   edge: allowed at the ends of the stage (next to the spike walls).
//   rough: a gap, a cage or a spike floor; two never sit side by side.
//   deadly: falling in costs a life; the storm only ends here if the upper section has footing.
//   high: the section reaches up to y = -96, so the upper section above it must start higher.
//   unique: at most one per stage.
// Movers are stage pieces that move or change (see MOVERS in constants.js). Glued floors slow you
// and stop you jumping (see GLUE in constants.js).
const LOWER = {
  // Final Destination: a bare floor, nowhere to hide.
  hall: {
    weight: 2,
    edge: true,
    build: () => ({ blocks: [floor()], spawns: [p(64, 0), p(192, 0)], pickupSpots: [p(128, 0)], vases: [p(24, 0), p(216, 0)] }),
  },
  // Shooting gallery: three chest covers to duck behind, a doorway and a barrel.
  gallery: {
    weight: 3,
    edge: true,
    build: () => ({
      blocks: [floor(), boxes(24, 0), boxes(112, 0), boxes(200, 0)],
      spawns: [p(68, 0)],
      doors: [p(168, 0)],
      barrels: [p(92, 0)],
      pickupSpots: [p(184, 0)],
    }),
  },
  // Thin ledges low over the floor.
  ledges: {
    weight: 2,
    edge: true,
    build: () => ({
      blocks: [floor(), ledge(24, -48, 5), ledge(152, -48, 5)],
      spawns: [p(128, 0)],
      pickupSpots: [p(64, -48)],
      barrels: [p(200, -48)],
    }),
  },
  // Rampart: a solid mound in the middle; the high ground, and cover from the other side.
  rampart: {
    weight: 2,
    edge: true,
    build: () => ({
      blocks: [floor(), stone(80, -32, 6, 2)],
      spawns: [p(128, -32)],
      doors: [p(216, 0)],
      pickupSpots: [p(40, 0)],
    }),
  },
  // The pitfall (exactly one per stage): floor stubs and a stepping stone over a drop to your death.
  pitfall: {
    weight: 0,
    rough: true,
    deadly: true,
    build: () => ({ blocks: [stone(0, 0, 3, 4), stone(208, 0, 3, 4), stone(104, -16, 3)] }),
  },
  // The cage: a sunken 1v1 pit with a hard floor. Two hard walls, a narrow opening between the
  // lips above, and the only way out is up (a full jump plus the air jump). A weapon waits inside.
  cage: {
    weight: 1,
    rough: true,
    unique: true,
    build: () => ({
      blocks: [stone(0, 0, 5), stone(0, 16, 2, 9), stone(176, 0, 5), stone(224, 16, 2, 9), stone(32, 80, 12, 5)],
      pickupSpots: [p(128, 80)],
    }),
  },
  // Spike garden: two hard floating platforms over a spike floor, a thin roof above them.
  spikes: {
    weight: 2,
    rough: true,
    high: true,
    build: () => ({
      blocks: [stone(32, -32, 4), stone(160, -32, 4), ledge(16, -96, 14)],
      spikes: [{ x: 0, y: 32, width: 16, up: true }],
      spawns: [p(64, -32), p(192, -32)],
      pickupSpots: [p(128, -96)],
    }),
  },
  // Chasm: a thin bridge between two floor stubs, nothing under it.
  chasm: {
    weight: 1,
    rough: true,
    build: () => ({
      blocks: [stone(0, 0, 4, 4), stone(192, 0, 4, 4), ledge(64, 0, 8)],
      spawns: [p(32, 0)],
      barrels: [p(224, 0)],
      pickupSpots: [p(128, 0)],
    }),
  },
  // Drawbridge: like the chasm, but the bridge opens every so often (it flickers first).
  drawbridge: {
    weight: 1,
    rough: true,
    deadly: true,
    build: (rnd) => ({
      blocks: [stone(0, 0, 4, 4), stone(192, 0, 4, 4)],
      movers: [{ kind: 'bridge', ...ledge(64, 0, 8), phase: rnd() * 12 }],
      spawns: [p(32, 0)],
    }),
  },
  // Crypt: a low stone ceiling over the floor, with doorways inside. Bullets from above can't reach
  // you in there; on top is a standing spot.
  crypt: {
    weight: 2,
    high: true,
    build: () => ({
      blocks: [floor(), stone(48, -96, 10)],
      spawns: [p(32, 0), p(128, -96)],
      doors: [p(96, 0), p(160, 0)],
      pickupSpots: [p(128, 0)],
    }),
  },
  // Crusher hall: a stone block hangs overhead, shakes, slams to the floor and rises again. Anyone
  // under it is hit and thrown out; a weapon lies right under it as bait.
  crusher: {
    weight: 2,
    edge: true,
    high: true,
    build: (rnd) => ({
      blocks: [floor()],
      movers: [{ kind: 'crusher', ...stone(96, 0, 4, 2), top: -96, bottom: -32, phase: rnd() * 7 }],
      spawns: [p(32, 0), p(224, 0)],
      pickupSpots: [p(128, 0)],
    }),
  },
  // Twin towers: two tall solid pillars with ledges between and beside them; snipe across, or
  // fight in the narrow lane at their feet.
  towers: {
    weight: 2,
    high: true,
    build: () => ({
      blocks: [floor(), stone(48, -128, 3, 8), stone(160, -128, 3, 8), ledge(96, -64, 4), ledge(0, -64, 3), ledge(208, -64, 3)],
      spawns: [p(128, 0), p(72, -128)],
      doors: [p(24, 0)],
      pickupSpots: [p(184, -128)],
    }),
  },
  // Weapon shrine: a raised altar where a weapon always comes back, so there's a known spot to
  // fight over.
  shrine: {
    weight: 1,
    edge: true,
    unique: true,
    build: () => ({
      blocks: [floor(), stone(96, -32, 4, 2)],
      spawns: [p(40, 0), p(216, 0)],
      pickupSpots: [{ x: 128, y: -32, shrine: true }],
    }),
  },
  // Barrel cellar: a cluster of explosive barrels between two stacks of crates. One shot sets off the lot.
  cellar: {
    weight: 2,
    edge: true,
    build: () => ({
      blocks: [floor(), boxes(24, 0), boxes(200, 0)],
      barrels: [p(84, 0), p(108, 0), p(148, 0), p(172, 0)],
      spawns: [p(128, 0)],
    }),
  },
  // Crumbling floor: stone tiles over a spike floor. A tile shakes when stood on, falls away, and
  // comes back a few seconds later.
  crumble: {
    weight: 2,
    rough: true,
    build: () => ({
      blocks: [stone(0, 0, 2, 4), stone(224, 0, 2, 4)],
      movers: Array.from({ length: 6 }, (_, k) => ({ kind: 'crumble', ...stone(32 + k * 32, 0, 2), y: 0 })),
      spikes: [{ x: 32, y: 32, width: 12, up: true }],
    }),
  },
  // Sticky crumble: crumbling tiles coated in glue, over a spike floor. Stuck to a tile you can't
  // jump off it, only walk; when it falls, you fall with it.
  stickyCrumble: {
    weight: 2,
    rough: true,
    build: () => ({
      blocks: [stone(0, 0, 2, 4), stone(224, 0, 2, 4)],
      movers: Array.from({ length: 6 }, (_, k) => ({ kind: 'crumble', ...glued(stone(32 + k * 32, 0, 2)), y: 0 })),
      spikes: [{ x: 32, y: 32, width: 12, up: true }],
    }),
  },
  // Glue trap: a glued patch of floor right under a crusher, with a weapon on it as bait.
  glueTrap: {
    weight: 2,
    edge: true,
    high: true,
    build: (rnd) => ({
      blocks: [stone(0, 0, 6, 4), glued(stone(96, 0, 4, 4)), stone(160, 0, 6, 4)],
      movers: [{ kind: 'crusher', ...stone(96, 0, 4, 2), top: -96, bottom: -32, phase: rnd() * 7 }],
      spawns: [p(32, 0), p(224, 0)],
      pickupSpots: [p(128, 0)],
    }),
  },
  // Glue hall: a glued stretch of floor between two chest covers: slow to cross under fire, and
  // no jumping out of it. A ledge above for the long way round.
  glueHall: {
    weight: 2,
    edge: true,
    build: () => ({
      // (The crates stand a step back from the glue: room to walk off it, since there's no
      // jumping out.)
      blocks: [stone(0, 0, 5, 4), glued(stone(80, 0, 6, 4)), stone(176, 0, 5, 4), boxes(24, 0), boxes(200, 0), ledge(96, -64, 4)],
      spawns: [p(68, 0), p(188, 0)],
      pickupSpots: [p(128, -64)],
    }),
  },
  // Cage lift: a platform on chains that rides from just over the floor up near the rafters.
  lift: {
    weight: 2,
    edge: true,
    high: true,
    build: (rnd) => ({
      blocks: [floor()],
      movers: [{ kind: 'lift', ...ledge(104, 0, 3), look: 'lift', top: -160, bottom: -16, phase: rnd() * 8 }],
      spawns: [p(40, 0), p(216, 0)],
      pickupSpots: [p(128, 0)],
    }),
  },
  // Frozen hall: an icy floor and ledges; you slide when you speed up, slow down or turn.
  ice: {
    weight: 2,
    edge: true,
    build: () => ({
      blocks: [icy(floor()), boxes(112, 0), icy(ledge(24, -48, 4)), icy(ledge(168, -48, 4))],
      spawns: [p(64, 0)],
      pickupSpots: [p(192, 0)],
    }),
  },
};

// Upper sections. high: nothing below y = -176, so it fits over a lower section with a roof.
// needsRoof: only reachable from such a roof (too high to jump to from the floor).
const UPPER = {
  open: { weight: 2, high: true, build: () => ({}) },
  // A staircase of ledges up to the rooftops.
  stairs: {
    weight: 2,
    build: () => ({ blocks: [ledge(24, -96, 5), ledge(96, -176, 5), ledge(168, -256, 5)], pickupSpots: [p(208, -256)] }),
  },
  // A solid stone walkway with cover on it, reached from two ledges.
  walkway: {
    weight: 2,
    build: () => ({
      blocks: [ledge(24, -96, 4), ledge(168, -96, 4), stone(32, -176, 12), boxes(112, -176)],
      pickupSpots: [p(64, -176)],
      barrels: [p(184, -176)],
    }),
  },
  // A long balcony with a doorway and cover, and a shorter one above.
  balcony: {
    weight: 2,
    build: () => ({
      blocks: [ledge(24, -96, 13), boxes(112, -96), ledge(64, -176, 8)],
      doors: [p(56, -96)],
      pickupSpots: [p(128, -176)],
    }),
  },
  // A sniper's perch: a small solid tower top between two ledges, a lookout above.
  perch: {
    weight: 1,
    build: () => ({
      blocks: [ledge(24, -96, 4), ledge(168, -96, 4), stone(96, -176, 4), ledge(88, -256, 5)],
      pickupSpots: [p(128, -256)],
    }),
  },
  // Rafters: two ledges and one above, high up.
  rafters: {
    weight: 2,
    high: true,
    needsRoof: true,
    build: () => ({ blocks: [ledge(24, -176, 6), ledge(136, -176, 6), ledge(80, -256, 6)], pickupSpots: [p(128, -256)] }),
  },
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rnd, table, names) {
  let total = 0;
  for (const n of names) total += table[n].weight;
  let r = rnd() * total;
  for (const n of names) if ((r -= table[n].weight) < 0) return n;
  return names[names.length - 1];
}

// Which lower and upper section goes in each column.
export function planSections(seed) {
  const rnd = rng(seed);
  const pitfallAt = 1 + Math.floor(rnd() * (SECTIONS - 2));
  const lower = [];
  for (let i = 0; i < SECTIONS; i++) {
    if (i === pitfallAt) {
      lower.push('pitfall');
      continue;
    }
    const ok = Object.keys(LOWER).filter((n) => {
      const L = LOWER[n];
      if (L.weight === 0 || n === lower[i - 1] || (L.unique && lower.includes(n))) return false;
      if ((i === 0 || i === SECTIONS - 1) && !L.edge) return false;
      return !(L.rough && ((i > 0 && LOWER[lower[i - 1]].rough) || i + 1 === pitfallAt));
    });
    lower.push(pickWeighted(rnd, LOWER, ok));
  }
  const upper = [];
  for (let i = 0; i < SECTIONS; i++) {
    const roof = LOWER[lower[i]].high;
    const ok = Object.keys(UPPER).filter((n) => n !== upper[i - 1] && (!roof || UPPER[n].high) && (roof || !UPPER[n].needsRoof));
    upper.push(pickWeighted(rnd, UPPER, ok));
  }
  const mirror = lower.map(() => rnd() < 0.5);
  return { lower, upper, mirror };
}

// Order the spawn points so the first ones are spread out (fighter i starts at spawns[i]); the
// rest follow, as more places to respawn.
function orderSpawns(spawns) {
  const left = [...spawns];
  const out = [];
  for (const x of [200, W - 200, 640, W - 640]) {
    if (!left.length) break;
    let best = 0;
    for (let k = 1; k < left.length; k++) if (Math.abs(left[k].x - x) < Math.abs(left[best].x - x)) best = k;
    out.push(...left.splice(best, 1));
  }
  return [...out, ...left];
}

// Can the storm's final zone be this section? Not over a deadly drop with nothing to stand on
// above it, and not the cage when a hard roof seals it (nobody could be knocked out in there).
function canEndHere(name, up, x0) {
  if (LOWER[name].deadly) return (up.blocks ?? []).length > 0;
  if (name === 'cage') return !(up.blocks ?? []).some((b) => !b.oneWay && !b.cover && b.x < x0 + 176 && b.x + b.w > x0 + 80);
  return true;
}

export function buildMixedStage(seed) {
  const { lower, upper, mirror } = planSections(seed);
  const timing = rng(seed ^ 0x9e3779b9);
  const st = { blocks: [], movers: [], spikes: [], spawns: [], doors: [], pickupSpots: [], barrels: [], vases: [], sections: [] };
  for (let i = 0; i < SECTIONS; i++) {
    const x0 = i * SECTION;
    const m = mirror[i];
    const px = (x) => x0 + (m ? SECTION - x : x);
    const bx = (x, w) => x0 + (m ? SECTION - x - w : x);
    const parts = [LOWER[lower[i]].build(timing), UPPER[upper[i]].build(timing)];
    for (const part of parts) {
      for (const b of part.blocks ?? []) b.x = bx(b.x, b.w);
      for (const b of part.blocks ?? []) st.blocks.push(b);
      for (const b of part.movers ?? []) st.movers.push({ ...b, x: bx(b.x, b.w) });
      for (const s of part.spikes ?? []) st.spikes.push({ ...s, x: bx(s.x, s.width * TILE) });
      for (const key of ['spawns', 'doors', 'pickupSpots', 'barrels', 'vases']) {
        for (const q of part[key] ?? []) st[key].push({ ...q, x: px(q.x) });
      }
    }
    st.sections.push({ left: x0, right: x0 + SECTION, lower: lower[i], upper: upper[i], final: canEndHere(lower[i], parts[1], x0) });
  }
  // Spike walls at both ends of the floor.
  st.spikes.push({ x: 0, y: -112, height: 7, face: 1 }, { x: W - TILE, y: -112, height: 7, face: -1 });
  return {
    name: 'Random Dungeon',
    theme: 'dungeon',
    ...st,
    spawns: orderSpawns(st.spawns),
    blast: { left: -120, top: -440, right: W + 120, bottom: 280 },
    camera: { left: -60, top: -400, right: W + 60, bottom: 192 },
    storm: { left: TILE, right: W - TILE, top: -500, bottom: 300 },
  };
}
