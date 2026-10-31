// Random stages in the painted themes (El Pantano, El Castillo, Pinar Nevado, Residencia), built
// like the random dungeon (sections.js): a row of COLUMNS columns, each SPAN px wide, each a
// segment drawn from its theme's set by a seed, so everyone builds the same stage from the same id
// ("<theme>-<seed>", see THEME_IDS). Segments keep each stage's quirks: the swamp's bogs (drifting
// logs, crumbling ledges), gas vents and sticky mud, the castle's lopsided split (floating islands
// joined by crumbling bridges, a stone castle with a spiked pit and crushers), the pines' ice, ice
// spikes, wind and end-to-end portals, Residencia's buildings with storeys, furniture to climb on
// and decks between them.
// Positions in a segment are local (0..SPAN); a segment's build gets a random number source.
// Heights: a jump reaches 64 px, with the air jump 128 (FIGHTER.jumpHeight, airJumpHeight), so a
// thin platform sits at most 96 px over whatever you'd jump from, and a solid ledge (climbed from
// beside it) at most 112.
import { TILE } from './constants.js';

export const SPAN = 256;
export const COLUMNS = 7;
const W = SPAN * COLUMNS; // 1792, as wide as the other stages

const block = (x, y, w, h, look, oneWay = false) => ({ x, y, w: w * TILE, h: h * TILE, look, oneWay });
const cover = (x, y, w, look) => ({ ...block(x, y - TILE, w, 1, look), cover: true });
const p = (x, y) => ({ x, y });
const prop = (key, x, y, extra = {}) => ({ key, x, y, ...extra });
const plank = (x, y, w) => block(x, y, w, 1, 'plank', true);
const icy = (b) => ({ ...b, ice: true });
const glued = (b) => ({ ...b, glue: true });
// Spikes: a floor of them (`up`, standing on y + TILE), an underside (`down`, hanging from y).
const spikeFloor = (x, y, width) => ({ x, y, width, up: true });
const spikeUnder = (x, y, width) => ({ x, y, width, down: true });

// ---- Pinar Nevado ----------------------------------------------------------------------------
// Snowy ground, icy ledges (slippery), wooden planks, ice spikes. Ravines are gaps (falling in
// costs a life).
//   edge: allowed at the stage's ends (the portals stand there). gap: no ground there.
//   unique: at most once a stage.
const snow = (x = 0, w = 16, y = 0) => block(x, y, w, 4, 'snow');
const PINES = {
  camp: {
    weight: 2,
    edge: true,
    build: (r) => ({
      blocks: [snow(), plank(r() < 0.5 ? 40 : 120, -96, 6)],
      campfires: [p(128, 0)],
      spawns: [p(208, 0)],
      pickupSpots: [p(72, 0)],
      props: [prop('pines-bigtent', 56, 2), prop('pines-pine8', 236, 2)],
    }),
  },
  crates: {
    weight: 2,
    edge: true,
    build: () => ({
      blocks: [snow(), cover(64, 0, 2, 'crate'), cover(160, 0, 2, 'crate'), plank(64, -96, 8)],
      spawns: [p(128, 0)],
      pickupSpots: [p(128, -96)],
      props: [prop('pines-pine7', 20, 4, { scale: 0.7 })],
    }),
  },
  // Icy steps: a slippery snow ledge, a plank above it.
  icesteps: {
    weight: 2,
    build: (r) => {
      const flip = r() < 0.5;
      return {
        blocks: [snow(), icy(block(flip ? 120 : 24, -96, 7, 2, 'snowledge')), plank(flip ? 24 : 128, -192, 7)],
        spawns: [p(flip ? 176 : 80, -96)],
        pickupSpots: [p(flip ? 80 : 184, -192)],
        props: [prop('pines-pine1', 128, 4, { scale: 0.8, tint: 0xd8e8ee })],
      };
    },
  },
  // A frozen pond: a dip in the ground, its floor slippery ice, a plank over it.
  pond: {
    weight: 1,
    unique: true,
    build: () => ({
      blocks: [icy(block(0, 16, 16, 4, 'pond')), plank(80, -80, 6)],
      spawns: [p(64, 16)],
      pickupSpots: [p(128, -80)],
      props: [prop('pines-pine7', 240, 20, { scale: 0.6, flip: true })],
    }),
  },
  // Ice spikes: a field of them sticking up out of the snow, a plank to cross over them.
  icefield: {
    weight: 2,
    build: () => ({
      blocks: [snow(), plank(72, -80, 7)],
      spikes: [spikeFloor(80, -TILE, 6)],
      spawns: [p(32, 0), p(224, 0)],
      pickupSpots: [p(128, -80)],
    }),
  },
  // An overhang: a snow ledge (its crumbly underside over the icicles' roots) with icicles under
  // it, low enough that a jump under it reaches them: jump there and risk it, or fight on foot.
  // Launch someone up into them.
  overhang: {
    weight: 2,
    build: (r) => {
      const left = r() < 0.5;
      const x = left ? 96 : 32;
      return {
        blocks: [snow(), block(x, -112, 8, 2, 'snowledge')],
        spikes: [spikeUnder(x, -80, 8)],
        spawns: [p(x + 64, -112)],
        pickupSpots: [p(x + 64, 0)],
        props: [prop('pines-pine8', left ? 230 : 30, 2)],
      };
    },
  },
  // A snowdrift: a mound in the middle (high ground, and cover from the other side).
  drift: {
    weight: 2,
    edge: true,
    build: () => ({
      blocks: [snow(), block(80, -32, 6, 2, 'snowledge'), plank(96, -128, 4)],
      spawns: [p(128, -32)],
      pickupSpots: [p(40, 0)],
      props: [prop('pines-pine1', 220, 4, { scale: 0.7, tint: 0xd8e8ee })],
    }),
  },
  // A cliff: the ground steps up halfway across.
  cliff: {
    weight: 2,
    build: (r) => {
      const up = r() < 0.5;
      return {
        blocks: up ? [snow(0, 8), snow(128, 8, -48)] : [snow(0, 8, -48), snow(128, 8)],
        spawns: [p(up ? 64 : 192, 0), p(up ? 192 : 64, -48)],
        pickupSpots: [p(up ? 192 : 64, -48)],
        props: [prop('pines-pine7', up ? 200 : 56, -44, { scale: 0.8 })],
      };
    },
  },
  // A ravine: no ground, a plank bridge low across it.
  ravine: {
    weight: 2,
    gap: true,
    build: (r) => ({
      blocks: [plank(72, -64, 7), plank(r() < 0.5 ? 16 : 144, -160, 6)],
      pickupSpots: [p(128, -64)],
    }),
  },
  // A lookout: planks stacked up beside a big pine.
  lookout: {
    weight: 1,
    unique: true,
    build: () => ({
      blocks: [snow(), plank(24, -88, 6), plank(144, -168, 6), plank(40, -248, 7)],
      spawns: [p(72, -88), p(192, -168)],
      pickupSpots: [p(96, -248)],
      props: [prop('pines-pine7', 128, 4, { scale: 1.3 })],
    }),
  },
};

// A cave, two columns long (`cave` builds both halves: see addCave): a long hard slab with
// spikes on both sides, its underside low enough that jumping under it is a risk (a cave to fight
// in), three floating hard platforms over it, an open mouth at each end with a step up to them.
//   slab(x, y, w): the slab's block (its top at y). top, under: spike rows over and under it.
function cave(slab, slabY, slabH, platform, plankAt) {
  const under = slabY + slabH * TILE;
  const left = {
    blocks: [slab(64, slabY, 12, slabH), plankAt(0, -96, 4), platform(72, slabY - 80), platform(184, slabY - 128)],
    spikes: [spikeFloor(64, slabY - TILE, 12), spikeUnder(64, under, 12)],
    spawns: [p(160, 0), p(104, slabY - 80)],
    pickupSpots: [p(32, 0), p(216, slabY - 128)],
  };
  const right = {
    // (Its platform low and twice as wide: room to fight on, just over the spikes.)
    blocks: [slab(0, slabY, 12, slabH), plankAt(192, -96, 4), platform(48, slabY - 64, 10)],
    spikes: [spikeFloor(0, slabY - TILE, 12), spikeUnder(0, under, 12)],
    spawns: [p(96, 0)],
    pickupSpots: [p(224, 0), p(128, slabY - 64)],
  };
  return [left, right];
}

// Puts a cave in two side-by-side columns of a planned row (start..end), if there's room for it
// (neither a gap, nor at the stage's ends), half the time.
function addCave(r, names, table, start = 1, end = names.length - 2) {
  if (r() < 0.5) return;
  const spots = [];
  for (let i = start; i < end; i++) if (!table[names[i]]?.gap && !table[names[i + 1]]?.gap) spots.push(i);
  if (!spots.length) return;
  const i = spots[Math.floor(r() * spots.length)];
  names[i] = 'cave';
  names[i + 1] = 'cave-end';
}

const pinesCave = () =>
  cave(
    (x, y, w, h) => block(x, y, w, h, 'snowledge'),
    -112,
    2,
    (x, y, w = 5) => block(x, y, w, 1, 'snowledge'),
    (x, y, w) => plank(x, y, w),
  ).map((part) => ({ ...part, blocks: [snow(), ...part.blocks] }));
const castleCave = () =>
  cave(
    (x, y, w, h) => ({ ...stone(x, y, w, h), spiked: true }),
    -96,
    1,
    (x, y, w = 5) => stone(x, y, w),
    (x, y, w) => plank(x, y, w),
  );

// ---- El Pantano --------------------------------------------------------------------------------
// Mossy banks; bogs between them (gaps of mud: logs drift across, see swamp); gas vents under
// mossy rocks; sticky mud; thin stone ledges above.
const moss = (x = 0, w = 16) => block(x, 0, w, 4, 'moss');
const swampThin = (x, y, w) => block(x, y, w, 1, 'swampthin', true);
const ventRock = (x) => ({ ...block(x, -16, 2, 1, 'ventrock'), lowCover: true });
const SWAMP = {
  bank: {
    weight: 3,
    edge: true,
    build: (r) => ({
      blocks: [moss(), swampThin(r() < 0.5 ? 32 : 96, -96, 8)],
      spawns: [p(128, 0)],
      pickupSpots: [p(200, 0)],
      props: [prop(r() < 0.5 ? 'swamp-willow3' : 'swamp-tree2', 72, 4), prop('swamp-bush3', 220, 2), prop('swamp-grass1', 150, 1, { front: true })],
    }),
  },
  // A mossy rock over a gas vent: low cover that blows now and then (a push and poison).
  vents: {
    weight: 2,
    edge: true,
    build: (r) => ({
      blocks: [moss(), ventRock(112), swampThin(48, -96, 10)],
      vents: [{ x: 128, y: -16, every: 10, phase: Math.floor(r() * 10) }],
      spawns: [p(48, 0)],
      pickupSpots: [p(208, 0)],
      props: [prop('swamp-bush1', 30, 2), prop('swamp-stump', 220, 2)],
    }),
  },
  // A vent in a patch of sticky mud: stuck in it, you can't jump away when it blows.
  stickyvent: {
    weight: 2,
    unique: true,
    build: (r) => ({
      blocks: [moss(0, 4), glued(moss(64, 8)), moss(192, 4), ventRock(112), swampThin(80, -96, 6)],
      vents: [{ x: 128, y: -16, every: 10, phase: Math.floor(r() * 10) }],
      spawns: [p(32, 0), p(224, 0)],
      pickupSpots: [p(96, 0)],
      props: [prop('swamp-stone2', 30, 2)],
    }),
  },
  crates: {
    weight: 2,
    edge: true,
    build: () => ({
      blocks: [moss(), cover(56, 0, 2, 'crate'), swampThin(112, -96, 8)],
      barrels: [p(200, 0)],
      spawns: [p(128, 0)],
      pickupSpots: [p(176, -96)],
      props: [prop('swamp-tree1', 150, 4, { flip: true }), prop('swamp-stone1', 30, 2)],
    }),
  },
  // A bog: mud, a small ledge that crumbles under you, a thin ledge above it.
  bog: {
    weight: 2,
    gap: true,
    build: (r) => {
      const left = r() < 0.5;
      return {
        blocks: [swampThin(left ? 112 : 32, -144, 7)],
        movers: [{ kind: 'crumble', x: left ? 40 : 152, y: -56, w: 64, h: TILE, look: 'swampcrumble', oneWay: true }],
        pickupSpots: [p(left ? 168 : 88, -144)],
      };
    },
  },
  // A boardwalk: old planks low over the bog, broken in the middle.
  boardwalk: {
    weight: 2,
    gap: true,
    build: () => ({
      blocks: [plank(0, -24, 6), plank(160, -24, 6), swampThin(80, -112, 6)],
      pickupSpots: [p(128, -112)],
    }),
  },
  // The ruin: a mossy stone top floating over the bog, a thin ledge above it.
  ruin: {
    weight: 1,
    gap: true,
    unique: true,
    build: () => ({
      blocks: [block(64, -96, 8, 2, 'mossledge'), swampThin(48, -192, 10)],
      spawns: [p(128, -96)],
      pickupSpots: [p(128, -192)],
      props: [prop('swamp-willow1', 128, -84, { alpha: 0.9 })],
    }),
  },
};

// ---- El Castillo -------------------------------------------------------------------------------
// Lopsided: a stone castle on one side (3 or 4 columns, floors on top of one another, wooden
// walkways, a spiked pit, crushers, its far wall spiked), floating islands on the other, joined by
// bridges that give way under you (see castle). `floor`: where the segment's ground runs.
const earth = (x, y, w, h = 3) => block(x, y, w, h, 'earth');
const stone = (x, y, w, h = 1) => block(x, y, w, h, 'stone');
const castleFloor = () => stone(0, 0, 16, 3);
const ISLANDS = {
  island: {
    weight: 3,
    build: (r) => {
      const up = r() < 0.5;
      return {
        floor: [32, 224],
        blocks: [earth(32, 0, 12), up ? earth(96, -96, 5, 2) : plank(80, -96, 6)],
        spawns: [p(128, 0)],
        pickupSpots: [p(up ? 136 : 128, -96)],
      };
    },
  },
  twinisles: {
    weight: 2,
    build: () => ({
      floor: [16, 240],
      blocks: [earth(16, 0, 5), earth(160, 0, 5), plank(96, -80, 4)],
      movers: [{ kind: 'crumble', x: 96, y: 0, w: 64, h: TILE, look: 'bridge', oneWay: true }],
      spawns: [p(56, 0), p(200, 0)],
      pickupSpots: [p(128, -80)],
    }),
  },
  // A high isle: a plank halfway up to a small island over the big one.
  highisle: {
    weight: 2,
    build: () => ({
      floor: [48, 208],
      blocks: [earth(48, 0, 10), plank(56, -88, 4), earth(112, -176, 6, 2)],
      spawns: [p(128, 0), p(160, -176)],
      pickupSpots: [p(88, 0)],
    }),
  },
  // A floating rock: a hard island over the ground one.
  floatrock: {
    weight: 2,
    build: (r) => {
      const x = r() < 0.5 ? 64 : 96;
      return {
        floor: [32, 224],
        blocks: [earth(32, 0, 12), earth(x, -112, 6, 2)],
        spawns: [p(48, 0), p(x + 48, -112)],
        pickupSpots: [p(208, 0)],
      };
    },
  },
};
const CASTLE = {
  hall: {
    weight: 3,
    build: (r) => ({
      blocks: [castleFloor(), stone(32, -112, 12), plank(64, -208, 8), cover(r() < 0.5 ? 48 : 176, 0, 2, 'crate')],
      spawns: [p(128, 0), p(128, -112)],
      pickupSpots: [p(96, -208)],
      windows: [128],
      props: [prop('castle-vase', r() < 0.5 ? 24 : 232, 0)],
    }),
  },
  walkways: {
    weight: 2,
    build: () => ({
      blocks: [castleFloor(), plank(0, -96, 16), stone(64, -192, 8)],
      spawns: [p(64, 0), p(192, -96)],
      pickupSpots: [p(128, -192)],
      windows: [64, 192],
    }),
  },
  // A spiked ledge: a stone ledge with spikes under it, low enough that a jump under it reaches
  // them: jump there and risk it, or fight on foot. Launch someone up into them.
  spikedhall: {
    weight: 2,
    build: (r) => {
      const left = r() < 0.5;
      const x = left ? 80 : 16;
      return {
        blocks: [castleFloor(), { ...stone(x, -96, 10), spiked: true }, plank(64, -192, 8)],
        spikes: [spikeUnder(x, -80, 10)],
        spawns: [p(x + 80, -96), p(left ? 32 : 224, 0)],
        pickupSpots: [p(x + 80, 0), p(128, -192)],
        windows: [left ? 40 : 216],
      };
    },
  },
  // A crusher over the middle of the floor, ledges either side of it.
  crusher: {
    weight: 2,
    build: (r) => ({
      blocks: [castleFloor(), stone(0, -112, 4), stone(192, -112, 4), plank(64, -208, 8)],
      movers: [{ kind: 'crusher', ...stone(96, 0, 4, 2), top: -104, bottom: -32, phase: r() * 7 }],
      spawns: [p(32, 0), p(224, 0)],
      pickupSpots: [p(128, 0), p(128, -208)],
    }),
  },
  // The pit: a hole down the middle of the floor, spikes down both its sides, a walkway over it.
  pit: {
    weight: 2,
    unique: true,
    inner: true,
    build: () => ({
      blocks: [stone(0, 0, 4, 3), stone(192, 0, 4, 3), plank(48, -96, 10)],
      spikes: [
        { x: 48, y: 16, height: 8, face: 1 },
        { x: 192, y: 16, height: 8, face: -1 },
      ],
      pit: { x: 64, w: 128 },
      spawns: [p(32, 0)],
      pickupSpots: [p(128, -96)],
      props: [prop('castle-cage', 128, -208)],
    }),
  },
  // The tower: floors stepping up to its top.
  tower: {
    weight: 1,
    unique: true,
    build: () => ({
      blocks: [castleFloor(), stone(0, -96, 8), plank(160, -96, 6), stone(48, -192, 10), stone(96, -288, 8)],
      spawns: [p(64, -96), p(128, -192)],
      pickupSpots: [p(160, -288)],
      windows: [192],
    }),
  },
};

// ---- Residencia --------------------------------------------------------------------------------
// Apartment buildings 1 to 3 columns wide, one column of open air between them with metal decks
// over the drop (built whole in residencia). In the rooms: furniture, some of it to climb on (its
// top is a thin platform: a step between storeys).
const STOREY = 112;
const HOUSE_ROWS = [[3, 3], [2, 2, 1], [1, 2, 2], [2, 1, 2], [3, 1, 1], [1, 3, 1], [1, 1, 3], [1, 1, 1, 1]];
// Furniture (its picture: retro-<kind>): all of it blows up like a barrel when shot or hit, and
// comes back later (see BARREL); solid, to stand on. The small pieces are cover too. Packed in, so one
// going off sets off the next.
const FURNITURE = ['desk', 'table', 'chair', 'cabinet', 'shelf', 'bed', 'longtable'];
const MIDROOM = ['desk', 'table', 'chair', 'cabinet'];

// ---- Building ----------------------------------------------------------------------------------

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, table, names) => {
  const total = names.reduce((s, n) => s + table[n].weight, 0);
  let x = r() * total;
  for (const n of names) if ((x -= table[n].weight) < 0) return n;
  return names[names.length - 1];
};

// A row of segments from a table: the ends `edge` ones, never the same one twice in a row (nor two
// gaps side by side), at most two gaps (at least `minGaps`: a swamp needs its bog), each `unique`
// one at most once.
function plan(r, table, minGaps = 0, count = COLUMNS) {
  const out = [];
  let gaps = 0;
  for (let i = 0; i < count; i++) {
    const end = i === 0 || i === count - 1;
    const names = Object.keys(table).filter((n) => {
      const s = table[n];
      if (end && !s.edge) return false;
      if (s.gap && (gaps >= 2 || table[out[i - 1]]?.gap)) return false;
      if (s.unique && out.includes(n)) return false;
      return n !== out[i - 1];
    });
    const n = pick(r, table, names);
    if (table[n].gap) gaps++;
    out.push(n);
  }
  // Too few gaps: turn an inner column with no gap beside it into one.
  while (gaps < minGaps) {
    const spots = out.map((n, i) => i).filter((i) => i > 0 && i < count - 1 && !table[out[i]].gap && !table[out[i - 1]].gap && !table[out[i + 1]].gap);
    if (!spots.length) break;
    const i = spots[Math.floor(r() * spots.length)];
    out[i] = pick(r, table, Object.keys(table).filter((n) => table[n].gap && !(table[n].unique && out.includes(n)) && n !== out[i - 1] && n !== out[i + 1]));
    gaps++;
  }
  return out;
}

// A segment's parts moved to its column (x0).
function place(st, part, x0) {
  const mx = (q) => ({ ...q, x: q.x + x0 });
  for (const b of part.blocks ?? []) st.blocks.push(mx(b));
  for (const m of part.movers ?? []) st.movers.push(mx(m));
  for (const s of part.spikes ?? []) st.spikes.push(mx(s));
  for (const key of ['spawns', 'pickupSpots', 'barrels', 'doors', 'props', 'campfires', 'vents']) for (const q of part[key] ?? []) st[key].push(mx(q));
}

// Ground blocks side by side with the same look become one (so their edges don't show).
function mergeGround(blocks) {
  const out = [];
  const same = (a, b) => a.look === b.look && a.y === b.y && a.h === b.h && !!a.ice === !!b.ice && !!a.glue === !!b.glue && !a.cover && !b.cover && !a.lowCover && !b.lowCover && !a.oneWay && !b.oneWay;
  for (const b of [...blocks].sort((a, c) => a.y - c.y || a.x - c.x)) {
    const prev = out.at(-1);
    if (prev && same(prev, b) && prev.x + prev.w === b.x) prev.w += b.w;
    else out.push({ ...b });
  }
  return out;
}

// Spawns spread out: the first few far apart (each player starts away from the others).
function spread(spawns) {
  const left = [...spawns].sort((a, b) => a.x - b.x);
  const out = [];
  while (left.length) {
    out.push(left.shift());
    if (left.length) out.push(left.pop());
  }
  return out;
}

const empty = () => ({ blocks: [], movers: [], spikes: [], spawns: [], pickupSpots: [], barrels: [], doors: [], props: [], campfires: [], vents: [], sections: [] });

// A row of segments built into a stage.
function lay(r, table, names, caveParts) {
  const st = empty();
  names.forEach((n, i) => {
    if (n === 'cave') caveParts().forEach((part, k) => place(st, part, (i + k) * SPAN));
    else if (n !== 'cave-end') place(st, table[n].build(r), i * SPAN);
    st.sections.push({ left: i * SPAN, right: (i + 1) * SPAN, lower: n });
  });
  return st;
}

function pines(r) {
  const names = plan(r, PINES, 1);
  addCave(r, names, PINES);
  const st = lay(r, PINES, names, pinesCave);
  return {
    ...st,
    name: 'Random Pinar Nevado',
    theme: 'pines',
    wind: { every: 20 },
    // (The two ends joined, on their ground.)
    portals: [p(56, 0), p(W - 56, 0)],
    blast: { left: -120, top: -460, right: W + 120, bottom: 200 },
    camera: { left: -60, top: -400, right: W + 60, bottom: 160 },
    storm: { left: 0, right: W, top: -500, bottom: 200 },
  };
}

function swamp(r) {
  const names = plan(r, SWAMP, 1);
  const st = lay(r, SWAMP, names);
  // Each stretch of bog: mud filling it, logs drifting from bank to bank (one per column, spread
  // out along the way).
  st.water = [];
  for (let i = 0; i < names.length; i++) {
    if (!SWAMP[names[i]].gap) continue;
    let j = i;
    while (j + 1 < names.length && SWAMP[names[j + 1]].gap) j++;
    const x = i * SPAN;
    const w = (j - i + 1) * SPAN;
    st.water.push({ x, y: 22, w });
    const logs = j - i + 1;
    const period = Math.round((12 * w) / 512);
    for (let k = 0; k < logs; k++) st.movers.push({ kind: 'drift', x: x + 12, y: 14, w: 80, h: TILE, look: 'log', oneWay: true, left: x + 12, right: x + w - 92, period, phase: Math.round((period * k) / logs + r() * 2) });
    i = j;
  }
  return {
    ...st,
    name: 'Random Pantano',
    theme: 'swamp',
    blast: { left: -60, top: -460, right: W + 60, bottom: 170 },
    camera: { left: 16, top: -400, right: W - 16, bottom: 130 },
    storm: { left: 0, right: W, top: -500, bottom: 200 },
  };
}

function castle(r) {
  const n = r() < 0.5 ? 3 : 4;
  const right = r() < 0.5;
  const start = right ? COLUMNS - n : 0;
  const inCastle = (k) => k >= start && k < start + n;
  // The castle's columns: the pit (if any) never at either end of the castle.
  const inner = (i) => i > start && i < start + n - 1;
  const names = [];
  for (let i = 0; i < COLUMNS; i++) {
    if (inCastle(i)) {
      const ok = Object.keys(CASTLE).filter((k) => (!CASTLE[k].inner || inner(i)) && !(CASTLE[k].unique && names.includes(k)) && k !== names[i - 1]);
      names.push(pick(r, CASTLE, ok));
    } else names.push(pick(r, ISLANDS, Object.keys(ISLANDS).filter((k) => k !== names[i - 1])));
  }
  // (A castle of 4: maybe a cave in two of them, the pit and the castle's ends left alone.)
  if (n === 4 && !names.includes('pit')) addCave(r, names, CASTLE, start + 1, start + n - 2);
  const caves = names.includes('cave') ? castleCave() : null;
  const st = empty();
  const floors = [];
  const pits = [];
  const windows = [];
  names.forEach((name, i) => {
    const x0 = i * SPAN;
    const part = name === 'cave' ? { ...caves[0], blocks: [castleFloor(), ...caves[0].blocks] } : name === 'cave-end' ? { ...caves[1], blocks: [castleFloor(), ...caves[1].blocks] } : (inCastle(i) ? CASTLE : ISLANDS)[name].build(r);
    place(st, part, x0);
    st.sections.push({ left: x0, right: x0 + SPAN, lower: name });
    floors.push(part.floor ? [x0 + part.floor[0], x0 + part.floor[1]] : [x0, x0 + SPAN]);
    if (part.pit) pits.push({ x: x0 + part.pit.x, w: part.pit.w });
    for (const wx of part.windows ?? []) windows.push(x0 + wx);
  });
  // Bridges that give way: between the islands, and from the last island to the castle.
  for (let i = 0; i + 1 < COLUMNS; i++) {
    if (inCastle(i) && inCastle(i + 1)) continue;
    const from = floors[i][1];
    const to = floors[i + 1][0];
    if (to - from >= TILE) st.movers.push({ kind: 'crumble', x: from, y: 0, w: to - from, h: TILE, look: 'bridge', oneWay: true });
  }
  const cx = start * SPAN;
  const cw = n * SPAN;
  // The castle's far wall: spikes, as on El Castillo.
  st.spikes.push(right ? { x: W - TILE, y: -112, height: 7, face: -1 } : { x: 0, y: -112, height: 7, face: 1 });
  const islands = right ? [0, cx] : [cx + cw, W];
  return {
    ...st,
    name: 'Random Castillo',
    theme: 'castle',
    castle: { x: cx, w: cw, top: -352, pits, windows, windowYs: [0, -112], banners: Array.from({ length: n }, (_, k) => [cx + k * SPAN + SPAN / 2, -336]) },
    sea: { x: islands[0] - 400, w: islands[1] - islands[0] + 800, y: 150 },
    blast: { left: -140, top: -500, right: W + 140, bottom: 200 },
    camera: { left: -80, top: -440, right: W + 80, bottom: 160 },
    storm: { left: 0, right: W, top: -540, bottom: 200 },
  };
}

function residencia(r) {
  const row = HOUSE_ROWS[Math.floor(r() * HOUSE_ROWS.length)];
  const st = empty();
  st.houses = [];
  const things = ['retro-tower', 'retro-neon', 'retro-ac', 'retro-fence', 'retro-bin', 'retro-vent', 'retro-bench'];
  let col = 0;
  row.forEach((cols, h) => {
    if (h > 0) {
      // Open air between the buildings: two metal decks over the drop.
      const x0 = col * SPAN;
      const hi = r() < 0.5;
      st.blocks.push(block(x0 + 40, hi ? -80 : -176, 4, 1, 'deck', true), block(x0 + 152, hi ? -176 : -80, 4, 1, 'deck', true));
      st.pickupSpots.push(p(x0 + 72, hi ? -80 : -176));
      st.sections.push({ left: x0, right: x0 + SPAN, lower: 'decks' });
      col++;
    }
    const x = col * SPAN + 16;
    const wTiles = cols * 16 - 2;
    const w = wTiles * TILE;
    const y = r() < 0.4 ? -48 : 0;
    const floors = r() < 0.5 ? 2 : 3;
    const roof = y - floors * STOREY;
    st.houses.push({ x, w, y, floors, storey: STOREY, roof });
    st.blocks.push(block(x, y, wTiles, 3, 'resfloor'));
    for (let f = 1; f < floors; f++) st.blocks.push(block(x, y - f * STOREY, wTiles, 1, 'resplank', true));
    const rooms = Math.max(1, Math.round(w / 160));
    const roomW = w / rooms;
    // A stuffed room on the top floor (buildings of 2 rooms or more), maybe a room of barrels.
    const stuffed = rooms > 1 && r() < 0.7 ? Math.floor(r() * rooms) : -1;
    const barrelRoom = rooms > 1 && r() < 0.35 ? (stuffed === 0 ? rooms - 1 : 0) : -1;
    for (let k = 0; k < rooms; k++) {
      const rx = x + k * roomW;
      for (let f = 0; f < floors; f++) {
        const fy = y - f * STOREY;
        const top = f === floors - 1;
        if (top && k === stuffed) {
          st.blocks.push(block(Math.round(rx + 8), fy - STOREY, Math.floor((roomW - 16) / TILE), 7, 'stuffed'));
          continue;
        }
        if (f === 0 && k === barrelRoom) {
          for (const bx of [0.3, 0.5, 0.7]) st.barrels.push(p(Math.round(rx + roomW * bx), fy));
          continue;
        }
        // Furniture: one piece by the far wall most of the time, often another mid-room (it all
        // blows up), now and then a planter or a crate instead of the second.
        const c = r();
        const piece = (list) => list[Math.floor(r() * list.length)];
        // (Laid out so nothing overlaps, even in the narrow rooms of a wide building: the wall
        // piece on the room's right, a smaller one mid-room, the left side kept free.)
        if (c < 0.85) st.barrels.push({ x: Math.round(rx + roomW * 0.8), y: fy, kind: piece(FURNITURE) });
        if (c > 0.45) st.barrels.push({ x: Math.round(rx + roomW * 0.48), y: fy, kind: piece(MIDROOM) });
        else if (c < 0.2) st.blocks.push(cover(Math.round(rx + roomW * 0.48) - TILE, fy, 2, f === 0 ? 'plant' : 'crate'));
        // (Spawns and pickups on the room's free side, clear of the furniture.)
        const free = 0.15;
        if (f < 2) st.spawns.push(p(Math.round(rx + roomW * free), fy));
        if (c > 0.6) st.pickupSpots.push(p(Math.round(rx + roomW * free), fy));
      }
    }
    // (Somewhere to find things on each building, however the rooms came out.)
    if (!st.pickupSpots.some((q) => q.x > x && q.x < x + w)) st.pickupSpots.push(p(Math.round(x + roomW * 0.15), y));
    // On the roof (looks only).
    for (let k = 0; k < cols; k++) {
      const key = things[Math.floor(r() * things.length)];
      st.props.push(prop(key, x + 40 + k * SPAN + Math.floor(r() * 120), roof, key === 'retro-tower' || key === 'retro-neon' ? { scale: 2 } : {}));
    }
    for (let k = 0; k < cols; k++) st.sections.push({ left: (col + k) * SPAN, right: (col + k + 1) * SPAN, lower: `house ${cols}w ${floors}f${y ? ' raised' : ''}` });
    col += cols;
  });
  return {
    ...st,
    name: 'Random Residencia',
    theme: 'retro',
    blast: { left: -120, top: -560, right: W + 120, bottom: 220 },
    camera: { left: -60, top: -470, right: W + 60, bottom: 170 },
    storm: { left: 0, right: W, top: -580, bottom: 220 },
  };
}

// The themes, by the id's prefix: "<prefix>-<seed>".
export const THEME_IDS = { pines, castle, swamp, res: residencia };

// Never where the storm starts: spawns and pickups at least SAFE px inside its walls.
const SAFE = 32;

export function buildThemedStage(prefix, seed) {
  const st = THEME_IDS[prefix](rng(seed));
  const inside = (q) => q.x >= st.storm.left + SAFE && q.x <= st.storm.right - SAFE;
  return { ...st, blocks: mergeGround(st.blocks), spawns: spread(st.spawns.filter(inside)), pickupSpots: st.pickupSpots.filter(inside), seed };
}
