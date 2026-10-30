// Words for every gun, melee weapon and grenade, straight from the numbers in constants.js: a
// one-line blurb, the stats, and the quirks. Used by the Training menu (to show what you're about
// to spawn) and by tools/items_md.mjs (ITEMS.md), so both always match the game.
import { GUNS, MELEE, GRENADES, SLEEP, DROWSY, CAT, ITEMS, LEGENDARY, WISH, CARRY, HAVEN, RADIATION, LIGHT_THROW, CASH, LOOT, SLIME, FOOTHOLD } from './constants.js';
import { throwOf } from './world.js';

export const n = (v, d = 1) => (Number.isInteger(v) ? String(v) : v.toFixed(d).replace(/\.0+$/, ''));
export const push = (kb, growth) => (kb || growth ? `${n(kb)} + ${n(growth)}×%` : 'none');
export const speed = (m) => `${n(m.startup, 2)} / ${n(m.active, 2)} / ${n(m.recovery, 2)}`;

// What each one is about, in a line.
export const BLURBS = {
  pistol: 'Your trusty sidearm: everyone starts with one.',
  revolver: 'Six heavy rounds that push and stun.',
  smg: 'Sprays fast and chips away. Hold the trigger.',
  rifle: 'Accurate automatic fire that piles the damage on.',
  minigun: "A wall of lead, if you don't mind slowing down.",
  shotgun: 'Seven pellets of up-close persuasion.',
  sniper: 'One shot, one launch. Crouch for a steady aim.',
  rocket: 'Blows up wherever it lands.',
  blaster: 'Bolts that grow every time they bounce.',
  bow: 'Draw, aim, loose. Arrows in walls become footholds.',
  cards: 'Deal everyone in a line a bad hand.',
  golden: 'Three bullets, ever. Make them count.',
  snoozer: 'One round. Whoever it hits takes a nap.',
  railgun: 'Charge it up and erase a line through the stage, walls and all.',
  firestaff: 'A short cone of magical fire.',
  money: 'Make it rain: coins, bills and the odd diamond.',
  jackpot: 'A bag of money that bursts into cash anyone can grab to heal.',
  slimer: 'Lobs slime that glues the floor wherever it lands.',
  spores: 'Sprays spores that leave little poison patches.',
  katana: 'Swings the instant you click: slash bullets right back.',
  bolivar: "A liberator's heavy blade.",
  chola: 'A sandal of legendary heft. You only get to throw it once.',
  knife: 'Quick, quiet, and nasty from behind.',
  machete: 'Every third hit in a row sends them flying.',
  nodachi: 'Hold for a dashing, launching slash.',
  trident: 'Thrust, or hook them on its chain and reel them in.',
  shovel: 'Scoops people straight up.',
  club: 'Wind it up. Bonk.',
  warning: 'Radioactive zone ahead. Charge it up and weird things happen to everyone nearby.',
  cleaver: 'Big chops that leave them bleeding.',
  hammer: 'Slow. Devastating.',
  axe: 'Goes right through blocks.',
  keyboard: 'Every hit types a word. Pray for the long one.',
  pan: 'Bonk. Also a bulletproof shield.',
  ham: 'Hit them with it, take a bite, feel better.',
  fish: 'A wet slap that turns their floor to ice.',
  pliers: 'Yoink their weapon right out of their hand.',
  anvil: "Too heavy to swing. Throw it on someone's head.",
  halberd: 'Poke, then sweep around.',
  morningstar: 'Hold to spin a spiked ball around you.',
  scythe: 'Reaps all the way around.',
  carrot: 'A stab, or a snack that makes you fast.',
  roller: 'Paints the floor; everyone else slows down on it.',
  frag: 'The classic. Big boom.',
  fire: 'Burns everyone caught in it.',
  smoke: 'A cloud nobody can see into.',
  poison: 'A cloud that slowly hurts.',
  drowsy: 'A pink cloud that makes you sleepy. Keep moving.',
  warp: 'Teleports you where it lands, or swaps you with whoever it hits.',
  polymorph: 'Turns everyone it splashes into a random animal.',
  soda: 'Shake it. The longer you shake, the bigger the burst.',
  c4: 'Stick it anywhere, then set it off when you like.',
  cashnade: 'A real grenade that leaves money everywhere. Grab it to heal.',
  blackhole: 'No damage: it just pulls everyone in.',
  apple: 'A small snack.',
  drumstick: 'A proper bite.',
  medkit: 'A long spray of feeling better.',
  key: 'Carry it to the locked chest for a legendary weapon. Everyone can see you have it.',
  banner: 'Throw it to plant it: its stretch of the stage becomes melee only. Hold your ground there for a life.',
  haste: 'Run faster for a while.',
  iron: 'Shrug pushes off for a while.',
  feather: 'Extra air jumps for a while.',
  mirror: 'Bullets that hit you fly straight back, for a while.',
  lamp: 'Rub it and make a wish. Not every wish goes well.',
  crystal: 'Your shots seek out the nearest enemy, but hit softer.',
  catring: 'Become a cat. Seven times.',
};

export function gunNotes(g) {
  const out = [];
  if (g.pellets > 1) out.push(`${g.pellets} pellets per shot`);
  if (g.explode) out.push(`explodes: radius ${g.explode.radius}, ${g.explode.damage} damage, push ${push(g.explode.knockback, g.explode.knockbackGrowth)}`);
  if (g.bounces) out.push(`glances off walls ${g.bounces}×${g.bounceGrowth ? `, each bounce ×${g.bounceGrowth} speed, size, damage and push` : ''}`);
  if (g.steadySpread) out.push('the same spread however you stand');
  if (g.knockbackShare) out.push(`pushes only when more than ${Math.round(g.knockbackShare * 100)}% of a shot's pellets hit the same person`);
  if (g.slowWhileFiring) out.push(`you move at ${Math.round(g.slowWhileFiring * 100)}% speed while firing`);
  if (g.charge?.full) out.push(`hold ${g.charge.time} s to charge; only a full charge fires: a beam through walls and everyone in its path`);
  else if (g.charge) out.push(`hold to draw (full in ${g.charge.time} s): a longer draw flies faster and hits harder; drawn past ${Math.round(g.charge.heavyAt * 100)}% it pushes`);
  if (g.stick) out.push(`arrows that hit a wall stick in it: a foothold for ${FOOTHOLD.time} s`);
  if (g.pierce) out.push('goes through people');
  if (g.burn) out.push(`sets you on fire for ${g.burn} s`);
  if (g.cash) out.push(`each shot is money: ${CASH.map((c) => `${c.look} ${Math.round(c.chance * 100)}% (${c.damage}${c.knockback ? `, push ${push(c.knockback, c.knockbackGrowth)}` : ''})`).join(', ')}`);
  if (g.jackpot) out.push(`a money bag that bursts (radius ${g.jackpot.radius}, push ${push(g.jackpot.knockback, g.jackpot.knockbackGrowth)}, no damage) into ${g.jackpot.pieces} pieces of money; they lie around ${LOOT.lie + LOOT.blink} s and heal whoever grabs them by their shot damage`);
  if (g.hops) out.push(`lobbed slime hops ${g.hops} times; each landing leaves glue (${SLIME.width} px, ${SLIME.time} s)`);
  if (g.spore) out.push(`about 1 spore in ${g.spore.every} leaves a poison patch (radius ${g.spore.radius}, ${g.spore.time} s, ${g.spore.perSecond}%/s)`);
  if (g.sleep) out.push(`puts whoever it hits to sleep for ${SLEEP.time} s (mashing moves wakes them after ${SLEEP.min} s; any hit wakes them)`);
  if (g.magazines === 1) out.push('no spare magazine');
  if (g.heavyThrow) out.push("thrown, it doesn't come back");
  if (g.noCover) out.push("too big to fire from behind cover");
  if (g.weight === 'special') out.push("special: the style meter doesn't reload it; ammo chests do");
  return out;
}

export function meleeQuirks(m) {
  const out = [];
  if (m.replacesGun) out.push('goes in the gun slot (it counts as your gun)');
  if (m.thrust) out.push('a straight thrust, no arc');
  if (m.rising) out.push('swings from below to above');
  if (m.deflect) out.push(`swing into bullets to send them back (×${m.deflect.damageMul} damage)`);
  if (m.pushes) out.push('its heavy pushes moderately (a light weapon: quick, and light on stamina)');
  if (m.arc >= 180) out.push('a full circle: it hits behind you too');
  const t = throwOf(m);
  if (m.throwOnly) out.push(`too heavy to swing: attacking throws it in a high arc (it lands as a pickup): ${t.damage} damage, push ${push(t.knockback, t.knockbackGrowth)}; you move at ${Math.round(m.carrySlow * 100)}% speed carrying it`);
  else if (t?.keep) out.push(`hold ${t.holdToThrow} s to throw one in an arc (you keep yours; the next throw is ready ${t.cooldown} s later): ${t.damage} damage, push ${push(t.knockback, t.knockbackGrowth)}`);
  else if (t) out.push(`hold ${t.holdToThrow} s to wind up, let go to throw it (${t.recover === false ? 'gone for good' : 'it lands as a pickup to go get back'}): ${t.damage} damage, push ${push(t.knockback, t.knockbackGrowth)}${t.speed > LIGHT_THROW.speed ? ', fast and flat' : ''}`);
  if (m.combo) out.push(`every ${m.combo.hits}rd hit in a row (each within ${m.combo.window} s) launches: push ${push(m.combo.launch.knockback, m.combo.launch.knockbackGrowth)}`);
  if (m.charge) out.push(`hold ${m.charge.time} s to charge, let go to dash forward and slash: launches with push ${push(m.charge.launch.knockback, m.charge.launch.knockbackGrowth)} (it can't be thrown)`);
  if (m.chain) {
    const c = m.chain;
    out.push(`hold to throw it on its chain (reach ${c.length}): a catch takes ${c.damage}, is stunned and reeled to melee range (stunned ${c.stun} s more); a miss roots you until it's reeled back`);
  }
  if (m.words) out.push('each hit is a word; the word sets the share of damage and launch (5%: the full phrase freezes them, then the full launch); thrown, it types a keyboard smash');
  if (m.backstab) out.push(`from behind: ×${m.backstab.damageMul} damage and a push of ${push(m.backstab.knockback, m.backstab.knockbackGrowth)} (thrown too)`);
  if (m.bleed) out.push(`leaves them bleeding: ${m.bleed.damage} more over ${m.bleed.time} s (a new cut starts it over; thrown too)`);
  if (m.instant) out.push('swings the instant you click; keep holding through the swing to throw it after');
  if (m.power) {
    const p = m.power;
    out.push(
      p.graded
        ? `hold to wind up (full in ${p.time} s): the longer, the harder (90%: ${p.damage} damage, push ${push(p.knockback, p.knockbackGrowth)}; full: ${p.full.damage}, push ${push(p.full.knockback, p.full.knockbackGrowth)} at 45°, a critical); you walk slower as it winds up (${Math.round(p.slow * 100)}% when full)`
        : `hold ${p.time} s for a powered swing: ${p.damage} damage, push ${push(p.knockback, p.knockbackGrowth)}${p.bonk ? `, stuns ${p.bonk} s longer` : ''}${p.bites ? `, and you take a bite (heals ${p.bites.heal}%; eaten after ${p.bites.count})` : ''}${p.radiation ? `, and everyone within ${p.radiation.radius} px of where it lands (you too) gets a random effect for ${p.radiation.time} s: ${RADIATION.join(', ')}` : ''}`,
    );
  }
  if (m.uppercut) out.push('launches straight up');
  if (m.flat) out.push('launches flat and far');
  if (m.unblockable) out.push('goes through blocks');
  if (m.blocksBullets) out.push('blocking with it also stops bullets from the front');
  if (m.bonk) out.push(`its hits stun ${m.bonk} s longer`);
  if (m.bites) out.push(`each hit is a bite: heals you ${m.bites.heal}%; eaten after ${m.bites.count} hits`);
  if (m.slippery) out.push(`their floor is ice for ${m.slippery} s (thrown too)`);
  if (m.yoink) out.push('a hit takes their weapon (the one in hand first) and drops it behind you');
  if (m.spin) out.push(`hold ${m.spin.after} s to spin it round you: the ball hits for ${m.spin.damage}, push ${push(m.spin.knockback, m.spin.knockbackGrowth)} (each person every ${m.spin.every} s); you move at ${Math.round(m.spin.slow * 100)}% speed`);
  if (m.eat) out.push(`hold ${m.eat.hold} s to take a bite: you run ${Math.round((m.eat.speed - 1) * 100)}% faster for ${m.eat.time} s; ${m.eat.bites} bites (the first leaves it rotten)`);
  if (m.paint) out.push(`a swing on the ground paints ${m.paint.length} px of floor in front of you for ${m.paint.time} s: anyone else on it moves at ${Math.round(m.paint.slow * 100)}% speed`);
  return out;
}

export function grenadeEffect(k) {
  if (k.explode && !k.remote) {
    const e = k.explode;
    let s = `explodes: radius ${e.radius}, ${e.damage} damage, push ${push(e.knockback, e.knockbackGrowth)}`;
    if (k.burn) s += `; sets you on fire for ${k.burn.time} s (${k.burn.perSecond}%/s, no stun)`;
    if (k.cash) s += `; showers ${k.cash} pieces of money that lie around ${LOOT.lie + LOOT.blink} s and heal whoever grabs them`;
    return s;
  }
  if (k.hole) return `no damage: for ${k.hole.time} s it pulls everyone within ${k.hole.radius} px toward its middle (up to ${k.hole.pull} px/s), where you float`;
  if (k.cloud?.drowsy) return `a cloud, radius ${k.cloud.radius}, for ${k.cloud.time} s: anyone inside goes drowsy (${n(DROWSY.slow * 100)}% slower; asleep after ${DROWSY.time} s unless they take damage or shake it off with jerky moves: turns, jumps, dashes, taps down; the same move again in a row counts for less)`;
  if (k.cloud) return `a cloud, radius ${k.cloud.radius}, for ${k.cloud.time} s${k.cloud.perSecond ? `: ${k.cloud.perSecond}%/s to anyone inside, no stun` : ': nobody sees into it'}`;
  if (k.remote) {
    const e = k.explode;
    return `sticks to the first wall, floor or person it touches; press the grenade button again to set it off: radius ${e.radius}, ${e.damage} damage, push ${push(e.knockback, e.knockbackGrowth)}`;
  }
  if (k.warp) return 'teleports you to where it goes off; hit someone on the way and you swap places';
  if (k.soda) return `shake it (hold) up to ${k.fuse} s: it bursts on the first thing it touches, from radius ${k.soda.min.radius}, ${k.soda.min.damage} damage, push ${k.soda.min.knockback} + ${k.soda.min.knockbackGrowth}×% (no shaking) to radius ${k.soda.max.radius}, ${k.soda.max.damage} damage, push ${k.soda.max.knockback} + ${k.soda.max.knockbackGrowth}×% (fully shaken, which is also when it bursts in your hand)`;
  if (k.polymorph) return `everyone within ${k.polymorph.radius} px (you too) turns into a random animal for up to ${k.polymorph.time} s: they can walk and jump, nothing else; any damage, any status or a KO turns them back`;
  if (k.plant) return `plants itself where it first lands on a floor: that stretch of the stage (its section on a random stage, or ${HAVEN.width} px) turns melee only, in your colour: shots and thrown things (not thrown melee weapons) vanish entering it, and guns don't fire inside it. Spend ${k.plant.hold} s in there and you gain a life; step out of it for more than ${HAVEN.away} s and it fades away. A new banner replaces it`;
  return '—';
}

// What an item does, in a line.
export function itemEffect(it) {
  if (it.heal) return `eaten on the spot: heals ${it.heal}%`;
  if (it.carry) return `held up for everyone to see; touch the locked chest with it to open it: one of ${LEGENDARY.map((k) => GUNS[k]?.name ?? MELEE[k]?.name ?? GRENADES[k]?.name).join(', ')}; a big hit (push over ${CARRY.dropPush}) or a KO makes you drop it`;
  if (it.rune) {
    const r = it.rune;
    const what = r.speed ? `you run ${Math.round((r.speed - 1) * 100)}% faster` : r.push ? `you take ${Math.round(r.push * 100)}% of the push` : r.airJumps ? `${r.airJumps} more air jumps` : `bullets that hit you fly back at the shooter, until they add up to ${r.reflect}% damage (the one that goes past it too)`;
    return `for ${r.time} s: ${what} (one rune at a time)`;
  }
  if (it.wish) return `rubbed for ${it.wish.rub} s, then a wish: a legendary weapon (${Math.round(WISH.legendary * 100)}%), a full heal (${Math.round(WISH.heal * 100)}%), a jinx (${Math.round((1 - WISH.legendary - WISH.heal - WISH.death) * 100)}%: ${WISH.jinx.time} s shrunk, taking ×${WISH.jinx.push} the push), or doom (${Math.round(WISH.death * 100)}%: frozen, shaking, then launched off the stage)`;
  if (it.ring) return `takes both grenade slots (a grenade picked up replaces it): ${CAT.uses} times, the grenade button turns you into a random cat, and back; a cat runs ${CAT.speed}× as fast, jumps and dashes; any attack, ${CAT.breakAt}% of damage, any status (drowsy and asleep: it lies down) or a KO turns you back`;
  if (it.homing) return `for ${it.homing.time} s your shots and thrown weapons home in on the nearest enemy, but hit for ${Math.round(it.homing.damage * 100)}% of their damage`;
  return '—';
}

// A jab in a few words: damage, push (it never launches), speed.
export const jabLine = (j) => `${n(j.damage)} dmg, push ${push(j.knockback, j.knockbackGrowth)}, ${speed(j)}`;

// Which kind of thing a key is: 'gun', 'melee', 'thrown' (grenades) or 'item'.
export const kindOf = (key) => (GUNS[key] ? 'gun' : MELEE[key] ? 'melee' : GRENADES[key] ? 'thrown' : ITEMS[key] ? 'item' : null);

// Everything to show about one: { key, kind, name, blurb, stats: [[label, value]], quirks: [] }.
export function describe(key) {
  const kind = kindOf(key);
  const base = { key, kind, blurb: BLURBS[key] ?? '' };
  if (kind === 'gun') {
    const g = GUNS[key];
    return {
      ...base,
      name: g.name,
      stats: [
        ['Class', g.weight],
        ['Damage', n(g.damage)],
        ['Push', push(g.knockback, g.knockbackGrowth)],
        ['Shots/s', `${n(1 / g.fireInterval)}${g.automatic ? ' (auto)' : ''}`],
        ['Ammo', `${g.magazineSize} × ${g.magazines}`],
        ['Reload', `${n(g.reloadTime)} s`],
        ['Spread', `${n(g.spreadDegrees)}°`],
        ['Range', String(g.bulletRange)],
      ],
      quirks: gunNotes(g),
    };
  }
  if (kind === 'melee') {
    // (The heavy's numbers, with the jab's beside them.)
    const m = MELEE[key].heavyStats;
    return {
      ...base,
      name: m.name,
      stats: [
        ['Class', m.weight],
        ['Damage', n(m.damage)],
        ['Push', push(m.knockback, m.knockbackGrowth)],
        ['Reach', n(m.reach)],
        ['Arc', m.arc ? `${m.arc}°` : 'thrust'],
        ['Speed', speed(m)],
        ['Jab', jabLine(MELEE[key].jabStats)],
      ],
      quirks: meleeQuirks(m),
    };
  }
  if (kind === 'thrown') {
    const k = GRENADES[key];
    return { ...base, name: k.name, stats: [['Fuse', k.remote ? 'you choose' : k.plant ? 'plants on landing' : `${n(k.fuse)} s`]], quirks: [grenadeEffect(k)] };
  }
  if (kind === 'item') {
    const it = ITEMS[key];
    const type = it.heal ? 'snack' : it.carry ? 'held up' : it.rune ? 'rune' : 'magic';
    return { ...base, name: it.name, stats: [['Type', type]], quirks: [itemEffect(it)] };
  }
  return null;
}
