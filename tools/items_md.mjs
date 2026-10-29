// Writes docs/ITEMS.md: every gun, melee weapon and grenade with its stats and quirks, straight from
// src/sim/constants.js, so the list always matches the game. Run after changing any of them:
//   npm run items
import { writeFileSync } from 'node:fs';
import { STYLE, COMBO, BUMP, COVER, DI, BREAKER, AMMO_CHEST, GUNS, MELEE, STRIKE, GRENADES, ITEMS, GRENADE, HEADSHOT, ACCURACY, LIGHT_MAX_PUSH, HOLD, BARREL, GUN_THROW, DASH, GLUE, STAMINA } from '../src/sim/constants.js';
import { n, push, speed, gunNotes, meleeQuirks, grenadeEffect, itemEffect, jabLine } from '../src/sim/describe.js';

const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const held = { light: 'chest', heavy: 'waist', special: 'shoulder' };
const list = (xs) => xs.join('; ') || '—';

const md = `# Items

Generated from \`src/sim/constants.js\` (worded in \`src/sim/describe.js\`) by \`tools/items_md.mjs\` (\`npm run items\`); don't edit by hand.

Push is the launch speed: base + growth × the victim's damage %. Times are in seconds, distances
in pixels (a tile is 16).

## Rules

- **Light guns** only add damage: no push, no stun. **Heavy guns** push and stun. **Special guns** hit like heavy ones, with little ammo.
- Guns are held at the ${held.light} (light), ${held.heavy} (heavy) or ${held.special} (special): ${HOLD.light}, ${HOLD.heavy} and ${HOLD.special} of the body's height.
- **Headshot**: the top ${HEADSHOT.height} px of the body (less crouched). ×${HEADSHOT.damageMul} damage, and it always stuns (push ${push(HEADSHOT.knockback, HEADSHOT.knockbackGrowth)} for light guns).
- **Accuracy** (spread × this): crouched ${ACCURACY.crouch}, standing still ${ACCURACY.still}, moving ${ACCURACY.moving} (+${ACCURACY.movingExtra}°), in the air ${ACCURACY.air} (+${ACCURACY.airExtra}°).
- **Light melee** never launches (push capped at ${LIGHT_MAX_PUSH}); **heavy melee** launches. Light weapons finish people off another way: thrown (hold the melee button), or with their quirk.
- Out of ammo for good, a tap of the trigger just clicks (keep the gun if you like); hold it ${GUN_THROW.hold} s and let go to throw the gun: ${GUN_THROW.damage} damage, push ${push(GUN_THROW.knockback, GUN_THROW.knockbackGrowth)}.
- **Cover**: crouched right beside low cover you hold your gun up over it and fire from there (not the big guns: see below). Cover has ${COVER.hpPerTile} health per tile of width; bullets, thrown things and melee hits wear it down, explosions ${COVER.blast}× as much. Broken, it's gone for the match.
- **Bodies bump**: you can't walk through someone, unless you keep walking into them for ${BUMP.passAfter} s (then you slip past); a dash goes straight through.
- **Combos**: a jab, heavy or shot pressed mid-swing is remembered for ${COMBO.buffer} s and comes out as soon as it can; a heavy or a shot cuts a jab's recovery short (a shot also a heavy's that hit). a melee hit that lands lets you cut that swing short with a jump or a dash, gives back your air jump, and makes your next dash free (within ${COMBO.freeDash} s); a swing that hits recovers in ${Math.round(COMBO.recoveryOnHit * 100)}% of the time. Within one combo, the same attack again pushes and stuns ${Math.round(COMBO.stale * 100)}% less each time (down to ${Math.round(COMBO.staleMin * 100)}%).
- **DI**: launched (push ${DI.minPower} or more), the direction you hold (crouch for down, up for up) bends your flight by up to ${DI.degrees}°.
- **Breaker**: frozen by a special stun (the keyboard's big phrase, the lamp's doom), press block to break free before the launch, for ${Math.round(BREAKER.cost * 100)}% of the stamina bar; anyone close is pushed back.
- **Style meter** (under your damage %): full, it reloads your gun for free (a full magazine; not special guns). It fills ${Math.round(STYLE.melee * 100)}% for a melee hit (${Math.round(STYLE.gunToMelee * 100)}% if it lands within ${STYLE.comboWindow} s of one of your shots hitting), ${Math.round(STYLE.parry * 100)}% for a parry, ${Math.round(STYLE.evade * 100)}% for dodging a hit, ${Math.round(STYLE.headshot * 100)}% for a headshot (then not again for ${STYLE.headshotCooldown} s: the bar's outline greys and fills back in white), ${Math.round(STYLE.catch * 100)}% for catching your thrown gun.
- **Thrown light guns** that hit an enemy bounce back to you: press pick up as one reaches you to catch it (empty) for style. Otherwise thrown guns fall to the floor; an empty gun there vanishes after ${GUN_THROW.emptyLife} s.
- **Spare magazines are yours**, kept from gun to gun; a gun brings only the rounds in its magazine (one picked up off the floor has what it was dropped with).
- **Ammo chests** (on the outermost spawn points): press pick up beside one to fill your gun, specials too (no gun: a pistol); then it's shut for ${AMMO_CHEST.cooldown} s.
- **Grenades**: carry ${GRENADE.max}, thrown in the order you got them. Hold to cook and aim; let go to throw. Picking one up with both slots full replaces the next one; the mouse wheel (or pick up with nothing in reach) swaps their order.
- **Dodge**: F, for ${Math.round(DASH.cost * 100)}% of the stamina bar (it refills from empty in ${DASH.recharge} s): a ${DASH.speed} px/s shove the way you hold (backwards if nothing), for the first ${DASH.iframes} s bullets, melee and explosions miss you (not spikes, crushers or the storm).
- **Controls**: left click shoots (the gun slot: a gun or the trident; fists with nothing there), right click swings the melee weapon, F dodges, the mouse wheel picks the next grenade. The weapon used last is in your hand, the other on your back.
- **Stamina** also pays for each shot fired crouched (${STAMINA.crouchShot} of the bar; with less, crouching stops steadying your aim) and for attacking on the run (fists ${STAMINA.swing.fists}, light ${STAMINA.swing.light}, heavy ${STAMINA.swing.heavy}; with less, you stop to attack).
- **Glue** floors: you move at ${Math.round(GLUE.slow * 100)}% speed and can't jump or dash off them; walk off.
- **Barrels** explode: radius ${BARREL.blastRadius}, ${BARREL.blastDamage} damage, push ${push(BARREL.knockback, BARREL.knockbackGrowth)}.

## Guns

${table(
  ['Gun', 'Class', 'Damage', 'Push', 'Shots/s', 'Auto', 'Ammo', 'Reload', 'Spread', 'Range', 'Notes'],
  Object.values(GUNS).map((g) => [
    `**${g.name}**`,
    g.weight,
    n(g.damage),
    push(g.knockback, g.knockbackGrowth),
    n(1 / g.fireInterval),
    g.automatic ? 'yes' : 'no',
    `${g.magazineSize} × ${g.magazines}`,
    n(g.reloadTime),
    `${n(g.spreadDegrees)}°`,
    String(g.bulletRange),
    list(gunNotes(g)),
  ]),
)}

## Melee

Each weapon has a **heavy** (the melee button: these numbers) and a **jab** (its own button: L, or C), a quick straight poke that never launches. Holding the melee button is the weapon's special. Speed is wind-up / hitting / recovery. Arc is degrees each side of the aim.

${table(
  ['Weapon', 'Class', 'Damage', 'Push', 'Reach', 'Arc', 'Speed', 'Jab', 'Quirks'],
  [['**Fists**', '—', n(STRIKE.damage), push(STRIKE.knockback, STRIKE.knockbackGrowth), String(STRIKE.reach), '—', speed(STRIKE), jabLine(STRIKE.jabStats), 'always there']].concat(
    Object.values(MELEE).map((w) => {
      const m = w.heavyStats;
      return [`**${m.name}**`, m.weight, n(m.damage), push(m.knockback, m.knockbackGrowth), n(m.reach), m.arc ? `${m.arc}°` : 'thrust', speed(m), jabLine(w.jabStats), list(meleeQuirks(m))];
    }),
  ),
)}

## Grenades

${table(
  ['Grenade', 'Fuse', 'Effect'],
  Object.values(GRENADES).map((k) => [`**${k.name}**`, k.remote ? 'you choose' : k.plant ? 'plants on landing' : n(k.fuse), grenadeEffect(k)]),
)}

## Items

Picked up like weapons; they turn up among the pickups.

${table(
  ['Item', 'Effect'],
  Object.values(ITEMS).map((it) => [`**${it.name}**`, itemEffect(it)]),
)}
`;

writeFileSync(new URL('../docs/ITEMS.md', import.meta.url), md);
console.log('docs/ITEMS.md written');
