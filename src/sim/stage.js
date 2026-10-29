// Stages. Positions are the top-left corner, sizes in tiles (16 px).
// Solid blocks stop people and bullets; oneWay platforms catch you from above and let bullets through.
// Barrels: bottom-center position. Spikes: a one-tile-wide solid wall, spikes on the `face` side.
// `theme` picks how the renderer dresses the stage; the rules only use the geometry.
import { TILE } from './constants.js';
import { buildMixedStage } from './sections.js';

const W = 1792; // both stages are this wide, and symmetric
const mirrorX = (x, wTiles) => W - x - wTiles * TILE;

const block = (x, y, w, h, look = 'concrete', oneWay = false) => ({ x, y, w: w * TILE, h: h * TILE, look, oneWay });
const thin = (x, y, w) => block(x, y, w, 1, 'thin', true);
// A thin platform on scaffolding: poles and braces run down to the floor below (looks only).
const scaffold = (x, y, w) => block(x, y, w, 1, 'scaffold', true);
// Low cover (one tile tall): a standing player shoots over it; crouching right beside it tucks you
// fully behind it.
const cover = (x, y, w, look) => ({ ...block(x, y - TILE, w, 1, look), cover: true });
// A thin platform with a railing, on the front of a building facade.
const balcony = (x, y, w) => block(x, y, w, 1, 'balcony', true);

// A block and its mirror image on the other half of the stage.
const pair = (make, x, ...rest) => [make(x, ...rest), make(mirrorX(x, rest[1] ?? 1), ...rest)];
const pairAt = (x, y, extra = {}) => [
  { x, y, ...extra },
  { x: W - x, y, ...extra, ...(extra.face ? { face: -extra.face } : {}) },
];

export const DEFAULT_STAGE = 'dungeon';

export const STAGES = {
  // A night village (art: Legacy Vania Village by Anokolisa). Four levels: the street (split by a
  // canal), house balconies, a stone walkway on columns with a bridge over the canal, and rooftops.
  village: {
    name: 'Village',
    theme: 'village',
    blocks: [
      // Street, with the canal between the halves.
      block(48, 0, 50, 4, 'slab'),
      block(944, 0, 50, 4, 'slab'),
      // Low cover: log piles.
      ...pair((x, y, w) => cover(x, y, w, 'logs'), 288, 0, 2),
      ...pair((x, y, w) => cover(x, y, w, 'logs'), 640, 0, 2),
      // Wooden balconies on the houses.
      ...pair((x, y, w) => block(x, y, w, 1, 'wood', true), 112, -96, 12),
      ...pair((x, y, w) => block(x, y, w, 1, 'wood', true), 480, -96, 11),
      // Stone walkway on columns, a log pile on it, and the bridge over the canal.
      ...pair((x, y, w) => block(x, y, w, 1, 'slab'), 208, -176, 22),
      ...pair((x, y, w) => cover(x, y, w, 'logs'), 400, -176, 2),
      block(752, -128, 18, 1, 'bridge', true),
      // Rooftops and the tower top.
      ...pair((x, y, w) => block(x, y, w, 1, 'wood', true), 96, -256, 11),
      block(832, -224, 8, 1, 'slab'),
    ],
    // Stone columns under the walkway (looks only): x, from y (top) down to the street.
    columns: [240, 400, 528].flatMap((x) => [x, W - x - 32]).map((x) => ({ x, top: -160, bottom: 0 })),
    // House fronts behind the street (looks only); each has its door at x + 48.
    houses: [152, 512].flatMap((x) => [x, W - x - 96]).map((x) => ({ x, y: 0 })),
    spikes: [
      { x: 32, y: -112, height: 7, face: 1 },
      { x: 1744, y: -112, height: 7, face: -1 },
      { x: 832, y: 16, height: 3, face: 1 },
      { x: 944, y: 16, height: 3, face: -1 },
    ],
    barrels: [...pairAt(440, 0), ...pairAt(800, 0), ...pairAt(600, -96), { x: 896, y: -128 }],
    pickupSpots: [...pairAt(360, 0), ...pairAt(256, -96), ...pairAt(520, -176), ...pairAt(180, -256), { x: 860, y: -128 }, { x: 896, y: -224 }],
    doors: [...pairAt(200, 0), ...pairAt(560, 0), ...pairAt(176, -96), ...pairAt(480, -176)],
    spawns: [...pairAt(160, 0), ...pairAt(300, -176)],
    blast: { left: -120, top: -440, right: 1912, bottom: 200 },
    camera: { left: -60, top: -400, right: 1852, bottom: 160 },
    storm: { left: 48, right: 1744, top: -500, bottom: 200 },
  },

  // The first stage: a warehouse district at night. Kept as it was.
  warehouse: {
    name: 'Warehouse',
    theme: 'warehouse',
    blocks: [
      block(64, 0, 48, 4),
      block(960, 0, 48, 4),
      // Low cover: x, the floor it sits on, width in tiles.
      cover(288, 0, 2, 'crate'),
      cover(1472, 0, 2, 'crate'),
      cover(528, 0, 1, 'metal'),
      cover(1248, 0, 1, 'metal'),
      scaffold(96, -48, 4),
      scaffold(1632, -48, 4),
      scaffold(592, -48, 6),
      scaffold(1104, -48, 6),
      block(160, -96, 25, 1, 'metal'),
      block(1232, -96, 25, 1, 'metal'),
      thin(736, -96, 20),
      cover(400, -96, 2, 'crate'),
      cover(1360, -96, 2, 'crate'),
      scaffold(176, -144, 5),
      scaffold(1536, -144, 5),
      scaffold(320, -192, 16),
      scaffold(1216, -192, 16),
      block(832, -192, 8, 1, 'catwalk'),
      // Fourth level: balconies on the buildings behind the arena.
      balcony(176, -272, 17),
      balcony(1344, -272, 17),
      balcony(800, -272, 12),
    ],
    // Ground-floor back walls built from a modular kit (art/kits/<kit>): corners at the ends, a door
    // piece on every doorway along the run, wall pieces in between. Looks only.
    kitRuns: [
      { kit: 'warehouse', x0: 64, x1: 832, y: 0 },
      { kit: 'warehouse', x0: 960, x1: 1728, y: 0 },
    ],
    // Building fronts right behind the arena (looks only; the balconies above are what you stand on).
    // With a kit, the front is built from its window columns; without one, it's drawn in code.
    facades: [
      { x: 128, y: -372, w: 496, h: 276, seed: 3, kit: 'apartment' },
      { x: 1168, y: -372, w: 496, h: 276, seed: 8, kit: 'apartment' },
      { x: 720, y: -332, w: 352, h: 236, seed: 5, kit: 'apartment' },
    ],
    spikes: [
      { x: 48, y: -144, height: 9, face: 1 },
      { x: 1728, y: -144, height: 9, face: -1 },
      { x: 816, y: 16, height: 3, face: 1 },
      { x: 960, y: 16, height: 3, face: -1 },
    ],
    barrels: [
      { x: 420, y: 0 },
      { x: 1372, y: 0 },
      { x: 780, y: 0 },
      { x: 1012, y: 0 },
      { x: 480, y: -96 },
      { x: 1312, y: -96 },
      { x: 896, y: -96 },
      { x: 448, y: -192 },
      { x: 1344, y: -192 },
    ],
    // Where melee weapon pickups appear (x center, y the floor), one on each level.
    pickupSpots: [
      { x: 330, y: 0 },
      { x: 1462, y: 0 },
      { x: 300, y: -96 },
      { x: 1492, y: -96 },
      { x: 860, y: -96 },
      { x: 400, y: -192 },
      { x: 1392, y: -192 },
      { x: 850, y: -272 },
    ],
    // Doorways to hide in: x is the center, y the floor they stand on.
    doors: [
      { x: 470, y: 0 },
      { x: 700, y: 0 },
      { x: 1092, y: 0 },
      { x: 1322, y: 0 },
      { x: 260, y: -96 },
      { x: 1532, y: -96 },
      { x: 312, y: -272 },
      { x: 1480, y: -272 },
      { x: 896, y: -272 },
    ],
    spawns: [
      { x: 200, y: 0 },
      { x: 1592, y: 0 },
      { x: 360, y: -96 },
      { x: 1432, y: -96 },
    ],
    // Fly or fall outside this box and you lose a life.
    blast: { left: -120, top: -420, right: 1912, bottom: 200 },
    camera: { left: -80, top: -380, right: 1872, bottom: 160 },
    storm: { left: 64, right: 1728, top: -480, bottom: 200 },
  },
};

// The same layout as `base`, dressed differently: block looks renamed through `looks`.
const restyle = (base, name, theme, looks) => ({
  ...base,
  name,
  theme,
  blocks: base.blocks.map((b) => ({ ...b, look: looks[b.look] ?? b.look })),
});

// A castle dungeon (art: Legacy Dungeon by Anokolisa): the village's layout indoors, against a
// brick back wall, so there's no distant scenery to plan. Stone floors and walkway, stone ledges
// for the balconies, rooftops and bridge, crates for cover.
STAGES.dungeon = restyle(STAGES.village, 'Dungeon', 'dungeon', { slab: 'stone', wood: 'ledge', bridge: 'ledge', logs: 'boxes' });
delete STAGES.dungeon.houses;

// The training room: a long dungeon hall with cover, barrels, a doorway and a few platforms.
// Weapons are spawned from the Training menu. Not in the stage menus: the Training button uses it.
STAGES.training = {
  name: 'Training Room',
  theme: 'dungeon',
  blocks: [
    block(48, 0, 106, 4, 'stone'),
    ...pair((x, y, w) => cover(x, y, w, 'boxes'), 112, 0, 2),
    ...pair((x, y, w) => block(x, y, w, 1, 'ledge', true), 176, -96, 10),
    block(576, -176, 40, 1, 'stone'),
    ...pair((x, y, w) => block(x, y, w, 1, 'ledge', true), 448, -96, 6),
  ],
  spikes: [
    { x: 32, y: -112, height: 7, face: 1 },
    { x: 1744, y: -112, height: 7, face: -1 },
  ],
  barrels: [...pairAt(240, -96)],
  pickupSpots: [],
  doors: [...pairAt(200, 0)],
  // You and the dummies start (and come back) near the middle of the hall, a few steps apart.
  spawns: [{ x: 820, y: 0 }, { x: 972, y: 0 }, { x: 1036, y: 0 }, { x: 1100, y: 0 }],
  blast: { left: -120, top: -440, right: 1912, bottom: 200 },
  camera: { left: -60, top: -400, right: 1852, bottom: 160 },
  storm: { left: 48, right: 1744, top: -500, bottom: 200 },
};

// Random stages: the menu choice MIXED becomes "mixed-<seed>" when a match starts (rollStage), and
// everyone builds the same layout from that id (getStage).
export const MIXED = 'mixed';
const mixedCache = new Map();

export function getStage(id) {
  if (Object.hasOwn(STAGES, id)) return STAGES[id];
  const m = typeof id === 'string' && /^mixed-(\d{1,10})$/.exec(id);
  if (!m) return null;
  if (!mixedCache.has(id)) {
    if (mixedCache.size > 8) mixedCache.clear();
    mixedCache.set(id, buildMixedStage(Number(m[1]) >>> 0));
  }
  return mixedCache.get(id);
}

export const isStageId = (id) => getStage(id) !== null;

// A menu choice (a stage id or MIXED) to the id a match is played on.
export const rollStage = (choice) => (choice === MIXED ? `mixed-${Math.floor(Math.random() * 2 ** 32)}` : choice);
