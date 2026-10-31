// Stages. Positions are the top-left corner, sizes in tiles (16 px).
// Solid blocks stop people and bullets; oneWay platforms catch you from above and let bullets through.
// Barrels: bottom-center position. Spikes: a one-tile-wide solid wall, spikes on the `face` side.
// `theme` picks how the renderer dresses the stage; the rules only use the geometry.
import { TILE } from './constants.js';
import { buildMixedStage } from './sections.js';
import { buildThemedStage, THEME_IDS } from './themed.js';

const W = 1792; // both stages are this wide, and symmetric
const mirrorX = (x, wTiles) => W - x - wTiles * TILE;

const block = (x, y, w, h, look = 'concrete', oneWay = false) => ({ x, y, w: w * TILE, h: h * TILE, look, oneWay });
const thin = (x, y, w) => block(x, y, w, 1, 'thin', true);
// A thin platform on scaffolding: poles and braces run down to the floor below (looks only).
const scaffold = (x, y, w) => block(x, y, w, 1, 'scaffold', true);
// Low cover (one tile tall): a standing player shoots over it; crouching right beside it tucks you
// fully behind it. It can be shot to pieces (see COVER). Any other block can be labelled
// `lowCover` to work the same way without ever breaking (the swamp's vent rocks).
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
    // Starting spots (fighter i starts at spawns[i]): the street and the walkway, then (5 or more
    // players) the street again and the rooftops.
    spawns: [...pairAt(160, 0), ...pairAt(300, -176), ...pairAt(720, 0), ...pairAt(184, -256)],
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
    // Starting spots (fighter i starts at spawns[i]): the street and the first floor, then (5 or
    // more players) the street again and the scaffolding.
    spawns: [
      { x: 200, y: 0 },
      { x: 1592, y: 0 },
      { x: 360, y: -96 },
      { x: 1432, y: -96 },
      { x: 620, y: 0 },
      { x: 1172, y: 0 },
      { x: 380, y: -192 },
      { x: 1412, y: -192 },
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

// The night stages, under a starry sky: XXL takes on Smash's Final Destination and Battlefield.
// A main platform 1.5 screens wide (960 px) with nothing but the drop around it; no storm unless
// the rules ask for it (noStorm: the menus start it switched off). Thin platforms are wood.
const NIGHT_LEFT = 416; // the main platform's left edge (it runs to 1376, centred like the rest)
const NIGHT_W = 60; // tiles
const nightStage = (name, blocks, extra = {}) => ({
  name,
  theme: 'night',
  noStorm: true,
  blocks,
  spikes: [],
  barrels: [],
  doors: [],
  // Spread across the platform, the first two well apart (1v1).
  spawns: [596, 1196, 746, 1046, 516, 1276, 896, 826].map((x) => ({ x, y: 0 })),
  pickupSpots: [{ x: 656, y: 0 }, { x: 1136, y: 0 }],
  blast: { left: NIGHT_LEFT - 360, top: -520, right: NIGHT_LEFT + NIGHT_W * TILE + 360, bottom: 260 },
  camera: { left: NIGHT_LEFT - 220, top: -420, right: NIGHT_LEFT + NIGHT_W * TILE + 220, bottom: 170 },
  // (The storm's walls start out by the blast zone, off the screen: you fly off the sides freely.)
  storm: { left: NIGHT_LEFT - 340, right: NIGHT_LEFT + NIGHT_W * TILE + 340, top: -520, bottom: 260 },
  ...extra,
});

// La Bajaita: a stone slab floating in the night sky, and nothing else (bare: not even ammo
// chests). For 1v1.
STAGES.bajaita = nightStage('La Bajaita', [block(NIGHT_LEFT, 0, NIGHT_W, 2, 'slab')], { bare: true });

// La Azotea: the flat roof of a tall building over the night city, three wooden platforms above it.
STAGES.azotea = nightStage(
  'La Azotea',
  [block(NIGHT_LEFT, 0, NIGHT_W, 2, 'roof'), block(560, -80, 12, 1, 'plank', true), block(1040, -80, 12, 1, 'plank', true), block(800, -160, 12, 1, 'plank', true)],
  { pickupSpots: [{ x: 656, y: 0 }, { x: 1136, y: 0 }, { x: 896, y: -160 }] },
);

// ---- The painted stages (src/game/scenery.js dresses them) ----------------------------------
// Solid is always visibly solid (mossy stone, castle stone, snowy ground, rooftops) and thin is
// wood or metal walkways.

// El Pantano: two mossy banks over swamp water, logs drifting between them, small crumbling
// ledges on the way up to the ruin in the middle, gas vents under mossy rocks (cover, but they
// blow now and then: a push and poison), thin stone ledges above.
STAGES.swamp = {
  name: 'El Pantano',
  theme: 'swamp',
  blocks: [
    block(96, 0, 34, 4, 'moss'),
    block(1152, 0, 34, 4, 'moss'),
    // A ruin's top, floating over the water.
    block(832, -112, 8, 2, 'mossledge'),
    ...pair((x, y, w) => block(x, y, w, 1, 'swampthin', true), 224, -112, 10),
    ...pair((x, y, w) => block(x, y, w, 1, 'swampthin', true), 448, -208, 8),
    block(800, -288, 12, 1, 'swampthin', true),
    ...pair((x, y, w) => cover(x, y, w, 'crate'), 512, 0, 2),
    // The mossy rocks over the vents: low cover that never breaks (but blows now and then).
    ...pair((x, y, w) => ({ ...block(x, y, w, 1, 'ventrock'), lowCover: true }), 368, -16, 2),
  ],
  movers: [
    // Two logs on the water, each drifting from bank to bank and back (opposite each other).
    ...[0, 6].map((phase) => ({ kind: 'drift', x: 656, y: 14, w: 80, h: TILE, look: 'log', oneWay: true, left: 652, right: 1060, period: 12, phase })),
    // Small crumbling ledges halfway up to the ruin, one each side.
    ...[696, W - 696 - 64].map((x) => ({ kind: 'crumble', x, y: -56, w: 64, h: TILE, look: 'swampcrumble', oneWay: true })),
  ],
  // The bog between the banks: thick, bubbling mud (the logs float on it).
  water: [{ x: 640, y: 22, w: 512 }],
  vents: [{ x: 384, y: -16, every: 10, phase: 0 }, { x: 1408, y: -16, every: 10, phase: 5 }],
  spikes: [],
  barrels: [...pairAt(600, 0)],
  doors: [],
  pickupSpots: [...pairAt(304, 0), ...pairAt(304, -112), { x: 896, y: -112 }, { x: 896, y: -288 }],
  spawns: [...pairAt(240, 0), ...pairAt(560, 0), ...pairAt(304, -112), ...pairAt(512, -208)],
  props: [
    { key: 'swamp-willow3', x: 250, y: 4 },
    { key: 'swamp-willow2', x: 1540, y: 4, flip: true },
    { key: 'swamp-tree2', x: 560, y: 4 },
    { key: 'swamp-tree1', x: 1240, y: 4, flip: true },
    { key: 'swamp-willow1', x: 896, y: -100, alpha: 0.9 },
    { key: 'swamp-bush1', x: 150, y: 2 },
    { key: 'swamp-bush3', x: 1640, y: 2 },
    { key: 'swamp-bush2', x: 450, y: 2, front: true },
    { key: 'swamp-bush2', x: 1340, y: 2, front: true, flip: true },
    { key: 'swamp-stone1', x: 600, y: 2 },
    { key: 'swamp-stump', x: 1200, y: 2 },
    { key: 'swamp-grass1', x: 330, y: 1, front: true },
    { key: 'swamp-grass2', x: 1460, y: 1, front: true },
  ],
  blast: { left: -60, top: -460, right: W + 60, bottom: 170 },
  camera: { left: 16, top: -400, right: W - 16, bottom: 130 },
  storm: { left: 96, right: 1696, top: -500, bottom: 200 },
};

// El Castillo: lopsided on purpose. On the left, grassy islands joined by wooden bridges under an
// open sky (room to launch and recover); on the right, the castle: stone floors on top of one
// another, wooden walkways between them, spikes on its far wall (cramped, for guns and cover).
STAGES.castle = {
  name: 'El Castillo',
  theme: 'castle',
  blocks: [
    block(80, 0, 14, 3, 'earth'),
    block(400, 0, 12, 3, 'earth'),
    block(176, -128, 6, 2, 'earth'),
    block(432, -192, 6, 2, 'earth'),
    // A small wooden platform between the two floating islands.
    block(320, -160, 4, 1, 'plank', true),
    // The castle: its floor (with a pit in the middle), two floors above (stone with wooden
    // walkways), the tower top.
    block(720, 0, 27, 3, 'stone'),
    block(1280, 0, 27, 3, 'stone'),
    block(784, -112, 14, 1, 'stone'),
    block(1008, -112, 10, 1, 'plank', true),
    block(1168, -112, 14, 1, 'stone'),
    block(1392, -112, 8, 1, 'plank', true),
    block(1520, -112, 12, 1, 'stone'),
    block(880, -224, 10, 1, 'plank', true),
    block(1104, -224, 12, 1, 'stone'),
    block(1360, -224, 10, 1, 'plank', true),
    block(1568, -304, 8, 1, 'stone'),
    cover(880, 0, 2, 'crate'),
    cover(1456, 0, 1, 'metal'),
    cover(1232, -112, 2, 'crate'),
  ],
  // The bridges between the islands: they give way under you (and come back).
  movers: [
    { kind: 'crumble', x: 304, y: 0, w: 96, h: TILE, look: 'bridge', oneWay: true },
    { kind: 'crumble', x: 592, y: 0, w: 128, h: TILE, look: 'bridge', oneWay: true },
  ],
  castle: { x: 720, w: 992, top: -352, pit: { x: 1152, w: 128 }, windows: [848, 1056, 1376, 1600], windowYs: [0, -112], banners: [[976, -336], [1232, -336], [1488, -336]] },
  spikes: [
    { x: 1712, y: -112, height: 7, face: -1 },
    // Down both sides of the pit in the middle.
    { x: 1136, y: 16, height: 8, face: 1 },
    { x: 1280, y: 16, height: 8, face: -1 },
  ],
  barrels: [{ x: 520, y: 0 }, { x: 1040, y: 0 }, { x: 1600, y: -112 }],
  doors: [],
  pickupSpots: [{ x: 200, y: 0 }, { x: 500, y: 0 }, { x: 1000, y: 0 }, { x: 1520, y: 0 }, { x: 1300, y: -112 }, { x: 1160, y: -224 }, { x: 224, y: -128 }],
  spawns: [{ x: 200, y: 0 }, { x: 1400, y: 0 }, { x: 500, y: 0 }, { x: 1600, y: 0 }, { x: 860, y: 0 }, { x: 1300, y: -112 }, { x: 224, y: -128 }, { x: 1600, y: -112 }],
  props: [
    { key: 'castle-cage', x: 1300, y: -224 },
    { key: 'castle-vase', x: 800, y: 0 },
    { key: 'castle-vase', x: 1660, y: -112 },
    { key: 'castle-vase', x: 1700, y: 0 },
  ],
  // Water far below the islands (looks only).
  sea: { x: -400, w: 1120, y: 150 },
  blast: { left: -140, top: -500, right: W + 100, bottom: 200 },
  camera: { left: -80, top: -440, right: W + 40, bottom: 160 },
  storm: { left: 80, right: 1712, top: -540, bottom: 200 },
};

// Pinar Nevado: snowy ground split by a gap, icy ledges (slippery), wooden planks; gusts of wind
// blow everyone sideways now and then (see WIND), and two portals join the stage's far ends.
STAGES.pines = {
  name: 'Pinar Nevado',
  theme: 'pines',
  blocks: [
    block(64, 0, 48, 4, 'snow'),
    block(960, 0, 48, 4, 'snow'),
    ...pair((x, y, w, h) => ({ ...block(x, y, w, h, 'snowledge'), ice: true }), 256, -112, 8, 2),
    ...pair((x, y, w) => block(x, y, w, 1, 'plank', true), 512, -176, 10),
    block(816, -256, 10, 1, 'plank', true),
    block(848, -64, 6, 1, 'plank', true),
    ...pair((x, y, w) => cover(x, y, w, 'crate'), 448, 0, 2),
  ],
  wind: { every: 20 },
  portals: [{ x: 120, y: 0 }, { x: W - 120, y: 0 }],
  campfires: [{ x: 640, y: 0 }],
  spikes: [],
  barrels: [{ x: 1150, y: 0 }],
  doors: [],
  pickupSpots: [...pairAt(352, 0), ...pairAt(320, -112), { x: 896, y: -256 }, { x: 896, y: -64 }],
  spawns: [...pairAt(240, 0), ...pairAt(560, 0), ...pairAt(320, -112), ...pairAt(592, -176)],
  props: [
    { key: 'pines-pine7', x: 200, y: 4 },
    { key: 'pines-pine7', x: 1600, y: 4, flip: true },
    { key: 'pines-pine7', x: 760, y: 4, scale: 0.8 },
    { key: 'pines-pine1', x: 1080, y: 4, scale: 0.8, tint: 0xd8e8ee },
    { key: 'pines-bigtent', x: 330, y: 2 },
    { key: 'pines-tent', x: 1430, y: 2 },
    { key: 'pines-pine8', x: 1300, y: 2 },
    { key: 'pines-pine8', x: 520, y: 2, flip: true },
  ],
  blast: { left: -120, top: -460, right: W + 120, bottom: 200 },
  camera: { left: -60, top: -400, right: W + 60, bottom: 160 },
  storm: { left: 64, right: 1728, top: -500, bottom: 200 },
};

// Residencia: three apartment buildings, the fight inside them, seen through their windows (their
// fronts are drawn over the rooms). Each storey is a room row: solid ground floors, wooden floors
// above (thin, so you can jump up through them), the roofs only for looks (anyone knocked up
// through one falls back in). Some rooms are stuffed full (solid: boxes, crates; one each side is
// a stack of barrels). Between the buildings, metal platforms over the drop; out the sides is the
// way off the stage.
const HOUSES = [
  // x, width (tiles), ground floor y, storeys (each 112 px tall)
  { x: 96, w: 30, y: 0, floors: 3 },
  { x: 672, w: 28, y: -48, floors: 3 },
  { x: 1216, w: 30, y: 0, floors: 3 },
];
const STOREY = 112;
STAGES.residencia = {
  name: 'Residencia',
  theme: 'retro',
  houses: HOUSES.map((h) => ({ ...h, w: h.w * TILE, storey: STOREY, roof: h.y - h.floors * STOREY })),
  blocks: [
    // Ground floors (solid), the wooden floors above them.
    ...HOUSES.map((h) => block(h.x, h.y, h.w, 3, 'resfloor')),
    ...HOUSES.flatMap((h) => Array.from({ length: h.floors - 1 }, (_, k) => block(h.x, h.y - (k + 1) * STOREY, h.w, 1, 'resplank', true))),
    // Stuffed rooms: the top corner rooms of the side buildings, and the middle building's middle.
    block(96, -336, 10, 7, 'stuffed'),
    block(W - 96 - 160, -336, 10, 7, 'stuffed'),
    block(832, -272, 8, 7, 'stuffed'),
    // Metal platforms between the buildings.
    ...pair((x, y, w) => block(x, y, w, 1, 'deck', true), 592, -64, 4),
    ...pair((x, y, w) => block(x, y, w, 1, 'deck', true), 592, -192, 4),
    // Cover: planters and crates in the rooms.
    ...pair((x, y, w) => cover(x, y, w, 'plant'), 240, 0, 2),
    ...pair((x, y, w) => cover(x, y, w, 'crate'), 320, -112, 2),
    cover(880, -48, 2, 'plant'),
    cover(760, -160, 2, 'crate'),
  ],
  // A room stacked with barrels, each side (they're real: shoot them).
  barrels: [...pairAt(488, 0), ...pairAt(512, 0), ...pairAt(536, 0)],
  spikes: [],
  doors: [],
  pickupSpots: [...pairAt(180, 0), ...pairAt(200, -112), { x: 760, y: -48 }, { x: 1032, y: -48 }, ...pairAt(400, -224), { x: 896, y: -384 + STOREY }],
  spawns: [...pairAt(180, 0), { x: 760, y: -48 }, { x: 1032, y: -48 }, ...pairAt(420, -112), ...pairAt(300, -224)],
  // On the roofs (looks only): water towers, neon, AC units, a fence, a bin, a vent.
  props: [
    { key: 'retro-tower', x: 760, y: -384, scale: 2 },
    { key: 'retro-tower', x: 1032, y: -384, scale: 2 },
    { key: 'retro-neon', x: 690, y: -384, scale: 2 },
    { key: 'retro-ac', x: 160, y: -336 },
    { key: 'retro-ac', x: W - 160, y: -336 },
    { key: 'retro-fence', x: 400, y: -336 },
    { key: 'retro-fence', x: W - 400, y: -336, flip: true },
    { key: 'retro-bin', x: 520, y: -336 },
    { key: 'retro-vent', x: W - 520, y: -336 },
    { key: 'retro-bench', x: 900, y: -384 },
  ],
  blast: { left: -120, top: -560, right: W + 120, bottom: 220 },
  camera: { left: -60, top: -470, right: W + 60, bottom: 170 },
  storm: { left: 96, right: W - 96, top: -580, bottom: 220 },
};

// Random stages: the menu choice MIXED becomes "mixed-<seed>" when a match starts (rollStage), and
// everyone builds the same layout from that id (getStage).
export const MIXED = 'mixed';
const mixedCache = new Map();

// Random stages in the painted themes (see themed.js): the menu choice "random-<prefix>" becomes
// "<prefix>-<seed>" the same way (prefixes: THEME_IDS).
export const RANDOM_THEMES = Object.keys(THEME_IDS).map((prefix) => `random-${prefix}`);

export function getStage(id) {
  if (Object.hasOwn(STAGES, id)) return STAGES[id];
  const m = typeof id === 'string' && /^(mixed|pines|castle|swamp|res)-(\d{1,10})$/.exec(id);
  if (!m) return null;
  if (!mixedCache.has(id)) {
    if (mixedCache.size > 8) mixedCache.clear();
    const seed = Number(m[2]) >>> 0;
    mixedCache.set(id, m[1] === 'mixed' ? buildMixedStage(seed) : buildThemedStage(m[1], seed));
  }
  return mixedCache.get(id);
}

export const isStageId = (id) => getStage(id) !== null;

// What a menu may offer: a stage, a random dungeon (MIXED), or a random painted stage.
export const isStageChoice = (choice) => choice === MIXED || RANDOM_THEMES.includes(choice) || Object.hasOwn(STAGES, choice);

// A menu choice to the id a match is played on (a random one rolled afresh).
export function rollStage(choice) {
  const seed = Math.floor(Math.random() * 2 ** 32);
  if (choice === MIXED) return `mixed-${seed}`;
  if (RANDOM_THEMES.includes(choice)) return `${choice.slice('random-'.length)}-${seed}`;
  return choice;
}
