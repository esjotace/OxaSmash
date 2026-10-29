// The knockout lines at the top left: who knocked out whom, and with what. Three per weapon (or
// grenade, item, hazard), one picked at random. {A}: whoever did it; {B}: whoever went out.
// Frag and C4 share the explosion lines; anything with no lines of its own gets the catch-all;
// going out with nobody to blame (or long after the last hit) gets a self-inflicted one.
export const KO_LINES = {
  // ---- Fists and melee ----
  fists: ['{A} punched {B} into next week', '{A} gave {B} the knuckle sandwich special', '{A} slapped {B} clean off the map'],
  katana: ['{A} sliced {B} into sushi', '{A} unsheathed {B} from this mortal stage', "{A}'s katana was faster than {B}'s regrets"],
  bolivar: ['{A} liberated {B} from the stage', '{A} fought for {B}’s independence (from the ground)', '{A} gave {B} a history lesson'],
  chola: ['{A} gave {B} the Chola treatment', '{A} sent {B} home with La Chola', "{B} didn't respect La Chola. {A} did."],
  knife: ['{A} stabbed {B} out of the stage', '{A} shanked {B} into orbit', '{A} knifed {B}. Rude.'],
  machete: ['{A} cleared a path through {B}', '{A} machete’d {B} like overgrown weeds', '{A} went full jungle on {B}'],
  nodachi: ['{A} brought a sword taller than {B}', '{A} dashed through {B} like a samurai movie', '{A} measured {B} with a nodachi. Too short.'],
  trident: ['{A} forked {B} out of the stage', '{A} speared {B} like a fish', '{A} hooked {B} and threw them back'],
  shovel: ['{A} dug {B} a grave, then missed it', '{A} buried {B} in the sky', '{A} shoveled {B} off the stage'],
  bat: ['{A} hit a home run with {B}', '{A} batted {B} out of the park', '{B} was a curveball. {A} swung anyway.'],
  cleaver: ['{A} chopped {B} like a weeknight dinner', '{A} cleaved {B} in two (emotionally)', '{A} tenderized {B}'],
  hammer: ['{A} nailed {B}', '{A} hammered {B} into the next zip code', '{A} found a nail. It was {B}.'],
  axe: ['{A} axed {B} from the roster', '{A} chopped {B} like firewood', '{A} gave {B} the axe'],
  keyboard: ['{A} typed {B} out of existence', '{A} hit Ctrl+Alt+Delete on {B}', '{A} rage-quit on {B}’s face'],
  warning: ['{A} warned {B}. {B} did not listen.', '{A} put up a sign: {B} OUT', '{A} gave {B} a very serious WARNING'],
  pan: ['{A} cooked {B}', '{A} flipped {B} like a pancake', '*BONK* {A} panned {B}'],
  ham: ['{A} hammed {B} off the stage', '{A} fed {B} a knuckle of ham', '{A} brought {B} the meat'],
  fish: ['{A} slapped {B} with a wet fish', '{A} gave {B} the old trout', "{B} smells like fish now. Thanks, {A}."],
  pliers: ['{A} yanked {B} right off the stage', '{A} pulled {B} out like a bad tooth', '{A} plied {B} with violence'],
  anvil: ['{A} dropped an anvil on {B}. Classic.', '{A} anviled {B} cartoon-style', '{A} gave {B} a very heavy hug'],
  halberd: ['{A} swept {B} away with a halberd', '{A} poked {B} from a safe distance', '{A} went full medieval on {B}'],
  morningstar: ['{A} gave {B} a morning they won’t forget', "{A} spun {B} right round", '{A} wished {B} good morning, violently'],
  scythe: ['{A} reaped {B}', '{A} harvested {B}', '{A} told {B} their time was up'],
  carrot: ['{A} vegetabled {B} into oblivion', '{A} carrot-and-sticked {B}', '{A} gave {B} their five a day'],
  roller: ['{A} painted {B} off the wall', '{A} gave {B} a fresh coat of KO', '{A} rolled right over {B}'],

  // ---- Guns ----
  pistol: ['{A} popped {B} with the 9mm', '{A} put {B} down with a pea shooter', '{A} 9mm’d {B} off the stage'],
  revolver: ['{A} fanned the hammer on {B}', "{A} told {B} this town ain't big enough", '{A} revolved {B} out of here'],
  smg: ['{A} sprayed and prayed. {B} got prayed on.', '{A} SMG’d {B} into Swiss cheese', '{A} held the trigger on {B}'],
  rifle: ['{A} rifled through {B}', '{A} picked {B} off', '{A} put {B} on burst mode'],
  minigun: ['{A} spun up and {B} spun out', '{A} brrrrrt’d {B}', '{A} gave {B} 300 bullets of attention'],
  shotgun: ['{A} shotgunned {B} into confetti', '{A} called shotgun on {B}', '{A} gave {B} the boomstick'],
  sniper: ['{A} no-scoped {B}', '{A} sniped {B} from a postcode away', '{B} never saw {A} coming'],
  rocket: ['{A} gave {B} a free flight', '{A} rocketed {B} to the moon', '{A} launched {B}. Literally.'],
  blaster: ['{A} star-blasted {B} into the cosmos', '{A} made {B} see stars', '{A} bounced a star off {B}’s face'],
  bow: ['{A} shot an arrow into {B}’s plans', '{A} put an arrow in {B}’s knee', '{A} Robin Hood’d {B}'],
  cards: ['{A} dealt {B} a losing hand', '{A} played the {B} card', "{A} 52-pickup’d {B}"],
  golden: ['{A} used the Golden Gun on {B}. Legendary.', '{A} goldened {B}', '{B} got the gold treatment from {A}'],
  railgun: ['{A} railed {B} through the wall', '{A} charged up and erased {B}', '{A} put a line through {B}'],
  firestaff: ['{A} roasted {B}', '{A} set {B} on fire, then off the stage', '{A} toasted {B} like a marshmallow'],
  money: ['{A} made it rain on {B}', '{A} paid {B} to leave', '{A} threw money at the {B} problem'],
  jackpot: ['{A} hit the jackpot. {B} was the jackpot.', '{A} cashed {B} out', '{B} lost the lottery to {A}'],
  slimer: ['{A} slimed {B}', '{A} gooed {B} off the stage', '{B} slipped on {A}’s slime and kept going'],
  spores: ['{A} spored {B}', '{A} gave {B} a fungal infection', '{A} composted {B}'],

  // ---- Grenades and blasts ----
  explosion: ['{A} blew {B} sky-high', '{A} turned {B} into fireworks', '{A} grenaded {B} into the next round'],
  fire: ['{A} firebombed {B}', '{A} served {B} well done', '{A} lit {B} up'],
  cashnade: ['{A} made {B} filthy rich and very dead', '{A} bribed {B} out of the stage', '{A} blew up {B}’s bank account'],
  barrel: ['{A} barrel-bombed {B}', '{A} let a barrel do the talking to {B}', '{A} rolled out the barrel on {B}'],

  // ---- Items ----
  lamp: ['{B} rubbed the lamp and wished for doom. Granted.', 'The genie took {B} literally', '{B} learned to read the fine print on wishes'],

  // ---- Hazards (nobody to blame) ----
  spikes: ['{B} found the spikes. Pointy.', '{B} sat on a spike', '{B} hugged the spike wall'],
  crusher: ['{B} got crushed. Flat.', '{B} became a pancake', '{B} stood under the crusher. Brave.'],
  storm: ['{B} got swallowed by the storm', '{B} went for a walk in the storm', '{B} was eaten by weather'],
  // (The same, with someone to blame: they'd hit them just before.)
  'spikes+': ['{A} introduced {B} to the spikes', '{A} pinned {B} to the spike wall like a poster', '{A} sent {B} to acupuncture'],
  'crusher+': ['{A} held {B} still for the crusher', '{A} and the crusher teamed up on {B}', '{A} pancaked {B} with help from the ceiling'],
  'storm+': ['{A} fed {B} to the storm', '{A} threw {B} into the weather', '{A} gave {B} a one-way ticket into the storm'],

  // ---- Catch-alls ----
  // Someone did it, with something that has no lines of its own.
  unknown: ['{A} did something unspeakable to {B}', '{A} eliminated {B} in mysterious ways', 'Nobody knows what {A} did to {B}. It worked.'],
  // Nobody did it.
  self: ['{B} tripped on nothing and left the stage', '{B} took the scenic route off the map', '{B} defeated themselves. Impressive.'],
};

// Grenades that share the explosion lines.
const BLASTS = new Set(['frag', 'c4']);
// Hazards: they did it (with whoever hit the victim just before to blame, if anyone).
const HAZARDS = new Set(['spikes', 'crusher', 'lamp']);

// The line for a knockout event ({ id, by, with, how }); names: everyone's name by fighter index.
export function koLine(e, names, rnd = Math.random) {
  const victim = names[e.id] ?? '?';
  const killer = e.by >= 0 && e.by !== e.id ? names[e.by] : null;
  const what = BLASTS.has(e.with) ? 'explosion' : e.with;
  let key;
  if (what === 'lamp') key = 'lamp';
  else if (HAZARDS.has(what)) key = killer ? `${what}+` : what;
  else if (e.how === 'storm') key = killer && what ? 'storm+' : 'storm';
  else if (!what || !killer) key = 'self';
  else key = KO_LINES[what] ? what : 'unknown';
  const lines = KO_LINES[key];
  return lines[Math.floor(rnd() * lines.length)].replaceAll('{A}', killer ?? '?').replaceAll('{B}', victim);
}
