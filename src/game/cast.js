// The cast (Pixel Crawler by Anokolisa): public/art/chars/<name>-idle|run|stun.png. Each match
// deals everyone a different character at random (pickCast); the host sends the picks to guests.
export const CHARACTERS = [
  'knight', 'rogue', 'wizard',
  'orc', 'orc-rogue', 'orc-warrior',
  'skeleton', 'skeleton-mage', 'skeleton-rogue', 'skeleton-warrior',
];

export function pickCast(count, rnd = Math.random) {
  const deck = [...CHARACTERS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return Array.from({ length: count }, (_, i) => deck[i % deck.length]);
}
