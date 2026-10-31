// The cast (Pixel Crawler by Anokolisa; Bugbicho, three looks, is the rogue repainted as a beetle
// knight: tools/bugbicho_art.py; Betowing is the skeleton knight repainted as a pilot:
// tools/betowing_art.py; the turtle knight is the knight repainted: tools/turtle_art.py; Saopato
// is the knight as a duck, three looks: tools/saopato_art.py; Frampersand (and Frampersand.dev)
// is the rogue as a fox: tools/fox_art.py; Dj Cuirox is the orc warrior as a DJ:
// tools/dj_art.py; The Doctor is the orc rogue as a field medic: tools/medic_art.py; the Legendary
// Fisherman (and his Oxa Mode) is the orc warrior shirtless, with fish on his back:
// tools/fisher_art.py; Minion Chamolon is the rogue as a red minion: tools/chamolon_art.py;
// JRazor is the skeleton rogue as a terminator: tools/jrazor_art.py):
// public/art/chars/<name>-idle|run|stun|fall|sleep.png. Each match deals everyone a different
// character at random (pickCast); the host sends the picks to guests.
export const CHARACTERS = [
  'knight', 'rogue', 'wizard',
  'orc', 'orc-rogue', 'orc-warrior',
  'skeleton', 'skeleton-mage', 'skeleton-rogue', 'skeleton-warrior',
  'bugbicho-rhino', 'bugbicho-stag', 'bugbicho-lady',
  'betowing',
  'turtle',
  'saopato', 'caballero-pato-real', 'caballero-pato-falso',
  'frampersand', 'frampersand.dev',
  'dj-cuirox',
  'the-doctor',
  'legendary-fisherman', 'legendary-fisherman-oxa',
  'minion-chamolon',
  'jrazor',
];

// Names that can't be read off the id (which is the name, words capitalised: see charLabel in
// main.js).
export const CHAR_NAMES = { 'legendary-fisherman-oxa': 'Legendary Fisherman (Oxa Mode)', jrazor: 'JRazor' };

// The characters with hands of their own (public/art/hand-<name>.png, in their skin or gloves);
// the rest: the skeletons' and orcs' (by name), else the usual. (Bugbicho's three share one.)
export const OWN_HANDS = ['bugbicho', 'betowing', 'dj-cuirox', 'the-doctor', 'legendary-fisherman', 'jrazor'];
// And those borrowing someone else's: Minion Chamolon wears Betowing's white gloves.
export const BORROWED_HANDS = { 'minion-chamolon': 'betowing' };

// Saopato's three looks.
const DUCKS = ['saopato', 'caballero-pato-real', 'caballero-pato-falso'];

// Idle frames are usually 32 px tall; taller ones have headroom for something on top
// (Bugbicho's horn and antennae, Saopato's tuft, Minion Chamolon's crest). Drawn from the feet up,
// so only the picture grows, never the body.
export const IDLE_H = (c) => (c.startsWith('bugbicho') || DUCKS.includes(c) || c === 'minion-chamolon' ? 40 : 32);
// And usually 32 wide; wider ones have room at the sides for something sticking out (Frampersand's
// tail). Centred on the feet, so again only the picture grows.
export const IDLE_W = (c) => (c.startsWith('frampersand') ? 48 : 32);

// The stun, fall and sleep art isn't always centred on the feet like idle and run are: where the
// feet are instead (x, px from the frame's left), and the fall strip's own frame width and feet
// where they differ from the stun pose's. Anything not listed: centred, fall frames as wide as stun.
export const POSES = {
  knight: { x: 14.5 },
  betowing: { x: 14.5 }, // (traced on the knight's)
  turtle: { x: 14.5 }, // (the knight's, repainted)
  ...Object.fromEntries(DUCKS.map((c) => [c, { x: 14.5 }])),
  wizard: { x: 16.5 },
  skeleton: { x: 13.5, fallW: 96, fallX: 46 },
};

export function pickCast(count, rnd = Math.random) {
  const deck = [...CHARACTERS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return Array.from({ length: count }, (_, i) => deck[i % deck.length]);
}
