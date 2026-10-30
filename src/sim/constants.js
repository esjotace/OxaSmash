import { GUN_POINTS } from './gunPoints.js';
import { MELEE_POINTS } from './meleePoints.js';

// Game rules, matching the Godot build. Distances are pixels, speeds px/s, times in seconds.
// Nothing in src/sim imports Phaser: the host, the bots and the tests all run these rules directly.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
// Pixel-art resolution: 640×360, scaled up to fit the screen.
export const VIEW_W = 640;
export const VIEW_H = 360;
export const TILE = 16;

export const FIGHTER = {
  w: 12,
  h: 30, // the body box, the same for every character (sized to the cast's art)
  // Crouching makes you a smaller target: bullets at standing height pass over.
  crouchH: 18,
  // Crouching right next to low cover tucks you lower still, fully behind it (only beside cover,
  // so a far-off box can't be used to dodge).
  tuckH: 11,
  // Turned into a cat or an animal (see CAT, ANIMALS): as small as the art.
  morphH: 12,
  tuckReach: 8, // how close (px) your side must be to the cover
  runSpeed: 140,
  groundAccel: 1400,
  groundFriction: 1600,
  airAccel: 800,
  airFriction: 300,
  // Jump feel is set by outcome (height, time to apex); gravity and speeds are derived below.
  jumpHeight: 64,
  timeToApex: 0.36,
  airJumpHeight: 64, // the air jump goes as high as the first
  airJumps: 1,
  fallGravityMul: 1.7,
  maxFall: 420,
  fastFall: 520,
  coyote: 0.1,
  jumpBuffer: 0.12,
  jumpCut: 0.45,
  dropTime: 0.2,
  doubleTap: 0.3, // the second tap of down must come this soon to drop through a thin platform
  // Getting hit
  hitstunPerSpeed: 0.0011,
  // Longest you can lose control for, so nobody gets juggled forever under a ceiling.
  maxHitstun: 1,
  stepUp: 8, // walking into a ledge this low steps up onto it
  hitstunAirDrag: 60,
  hitstunMaxFall: 700,
  respawnTime: 2,
  respawnInvincible: 2,
};

export const GRAVITY = (2 * FIGHTER.jumpHeight) / FIGHTER.timeToApex ** 2;
export const JUMP_SPEED = (2 * FIGHTER.jumpHeight) / FIGHTER.timeToApex;
export const AIR_JUMP_SPEED = Math.sqrt(2 * GRAVITY * FIGHTER.airJumpHeight);

// Knockback (launch speed) = knockback + knockbackGrowth × the victim's damage %.
//
// Guns, in the gun slot. Light guns only chip damage in: no push, no hitstun (except headshots).
// Heavy guns push and stun. Special guns hit like heavy ones but are kept in check by their small
// ammo. Everyone starts with the pistol; the rest are pickups.
// Where a gun is held (HOLD, a share of the body's height from the feet): light guns at the chest,
// heavy ones at the waist, special ones at the shoulder, sighted along, so a level shot from a
// special gun lands in the head. (holdAt: held where another weight is, e.g. the revolver: heavy,
// but held up at the chest like the 9mm.)
//   holdDistance: how far the gun's grip floats from where it's held toward the pointer. Where
//   shots leave (muzzle: px along the aim; muzzleDrop: px below the aim line) comes from the
//   sprite (gunPoints.js, made by tools/gun_points.py).
//   spreadDegrees: the random spread standing still is a share of this; moving makes it worse
//   (see ACCURACY).
//   explode: the shot blows up where it lands (see BLAST). bounces: times a shot glances off walls;
//   bounceGrowth: each bounce multiplies its speed, size, damage and push by this.
//   slowWhileFiring: you move at this share of your speed while firing it.
const gun = (g) => ({ automatic: false, pellets: 1, spreadDegrees: 2, recoil: 40, holdDistance: 8, muzzle: 20, muzzleDrop: 0, knockback: 0, knockbackGrowth: 0, ...g });
export const GUNS = {
  pistol: gun({ name: '9mm', weight: 'light', magazineSize: 12, magazines: 2, reloadTime: 1.1, fireInterval: 0.16, bulletSpeed: 900, bulletRange: 600, damage: 3 }),
  revolver: gun({ name: 'Revolver', weight: 'heavy', holdAt: 'light', magazineSize: 6, magazines: 2, reloadTime: 1.4, fireInterval: 0.45, bulletSpeed: 1000, bulletRange: 700, damage: 8, knockback: 150, knockbackGrowth: 1.6, recoil: 90 }),
  smg: gun({ name: 'SMG', weight: 'light', magazineSize: 30, magazines: 2, reloadTime: 1.3, automatic: true, fireInterval: 0.07, spreadDegrees: 6, bulletSpeed: 850, bulletRange: 450, damage: 1.5, recoil: 15 }),
  rifle: gun({ name: 'Assault Rifle', weight: 'light', magazineSize: 24, magazines: 2, reloadTime: 1.5, automatic: true, fireInterval: 0.11, spreadDegrees: 2.5, bulletSpeed: 1000, bulletRange: 750, damage: 2.5, recoil: 20 }),
  minigun: gun({ noCover: true, heavyThrow: true, name: 'Minigun', weight: 'light', magazineSize: 80, magazines: 2, reloadTime: 2.5, automatic: true, fireInterval: 0.05, spreadDegrees: 7, bulletSpeed: 900, bulletRange: 550, damage: 1.4, recoil: 12, slowWhileFiring: 0.45 }),
  // Pellets only push and stun once more than half of one shot's pellets hit the same person
  // (knockbackShare); fewer just add damage. Its spread is always the standing one (steadySpread),
  // so crouching doesn't tighten it into a rifle.
  shotgun: gun({ name: 'Shotgun', weight: 'heavy', knockbackShare: 0.5, steadySpread: true, magazineSize: 6, magazines: 2, reloadTime: 1.6, fireInterval: 0.7, pellets: 7, spreadDegrees: 14, bulletSpeed: 800, bulletRange: 220, damage: 2.2, knockback: 220, knockbackGrowth: 1.2, recoil: 260 }),
  // One round, no spares: whoever it hits falls asleep (see SLEEP); it barely hurts.
  snoozer: gun({ noCover: true, name: 'The Snoozer', weight: 'special', magazineSize: 1, magazines: 1, reloadTime: 2, fireInterval: 1.1, spreadDegrees: 0, bulletSpeed: 1800, bulletRange: 1400, damage: 4, knockback: 0, knockbackGrowth: 0, recoil: 160, sleep: true }),
  sniper: gun({ noCover: true, name: 'Sniper', weight: 'special', magazineSize: 4, magazines: 2, reloadTime: 2, fireInterval: 1.1, spreadDegrees: 0, bulletSpeed: 1800, bulletRange: 1400, damage: 20, knockback: 260, knockbackGrowth: 2.5, recoil: 160 }),
  rocket: gun({ noCover: true, name: 'Rocket Launcher', weight: 'special', magazineSize: 1, magazines: 2, reloadTime: 1.8, fireInterval: 1, spreadDegrees: 0, bulletSpeed: 420, bulletRange: 900, damage: 0, recoil: 200, explode: { radius: 72, damage: 14, knockback: 360, knockbackGrowth: 4 } }),
  blaster: gun({ name: 'Star Blaster', weight: 'heavy', magazineSize: 10, magazines: 2, reloadTime: 1.5, fireInterval: 0.35, spreadDegrees: 1, bulletSpeed: 520, bulletRange: 900, damage: 6, knockback: 200, knockbackGrowth: 2, bounces: 2, bounceGrowth: 2 }),
  // Hold to draw (`charge.time` s for a full draw), let go to loose: the longer the draw, the
  // faster and harder (from `charge.min` of it); drawn past `charge.heavyAt` it pushes and stuns.
  // Arrows fall a little, and one hitting a wall sticks in it as a foothold (see FOOTHOLD).
  bow: gun({ name: 'Bow', weight: 'light', magazineSize: 6, magazines: 2, reloadTime: 1.2, fireInterval: 0.25, spreadDegrees: 0.5, bulletSpeed: 760, bulletRange: 900, damage: 9, knockback: 230, knockbackGrowth: 2.6, recoil: 0, holdDistance: 6, gravity: 420, charge: { time: 0.7, min: 0.25, heavyAt: 0.8 }, stick: true }),
  // Cards fly through everyone in a line.
  cards: gun({ name: 'Card Thrower', weight: 'light', magazineSize: 13, magazines: 2, reloadTime: 1.2, fireInterval: 0.12, spreadDegrees: 3, bulletSpeed: 650, bulletRange: 500, damage: 2, recoil: 0, pierce: true }),
  // Three bullets, ever; each one a huge launch.
  golden: gun({ name: 'Golden Gun', weight: 'special', magazineSize: 3, magazines: 1, reloadTime: 1, fireInterval: 0.8, spreadDegrees: 0, bulletSpeed: 1400, bulletRange: 1000, damage: 18, knockback: 460, knockbackGrowth: 6, recoil: 160 }),
  // Hold to charge; only a full charge fires: a beam through walls and everyone in its path.
  railgun: gun({ noCover: true, name: 'Railgun', weight: 'special', magazineSize: 2, magazines: 2, reloadTime: 2.2, fireInterval: 0.6, spreadDegrees: 0, bulletSpeed: 1, bulletRange: 1200, damage: 16, knockback: 300, knockbackGrowth: 3.2, recoil: 220, charge: { time: 0.8, full: true }, beam: true }),
  // A short cone of flames that go through people and set them on fire (`burn` s; the fire
  // grenade's burn). Drawn tilted: see TILTED_GUNS.
  firestaff: gun({ name: 'Fire Staff', weight: 'light', magazineSize: 60, magazines: 2, reloadTime: 2, automatic: true, fireInterval: 0.05, pellets: 2, spreadDegrees: 14, steadySpread: true, bulletSpeed: 260, bulletRange: 95, damage: 0.4, recoil: 0, pierce: true, burn: 2 }),
  // Sprays money: each shot is one of CASH (coins and bills chip, gold coins hit hard, a rare
  // diamond pushes).
  money: gun({ heavyThrow: true, name: 'Make It Rain', weight: 'light', magazineSize: 40, magazines: 2, reloadTime: 2, automatic: true, fireInterval: 0.08, spreadDegrees: 6, bulletSpeed: 700, bulletRange: 550, damage: 1.5, recoil: 12, cash: true }),
  // Lobs a money bag that bursts into a shower of CASH: everyone near is pushed away, and the
  // money lands and lies around (see LOOT) for anyone to grab and heal.
  jackpot: gun({ noCover: true, name: 'Jackpot', weight: 'special', magazineSize: 1, magazines: 2, reloadTime: 1.8, fireInterval: 1, spreadDegrees: 0, bulletSpeed: 380, bulletRange: 900, damage: 0, recoil: 120, gravity: 350, lift: 80, jackpot: { radius: 64, knockback: 240, knockbackGrowth: 1.5, pieces: 14 } }),
  // Lobs slime that hops `hops` times; wherever it lands it leaves a puddle of glue (see SLIME).
  slimer: gun({ noCover: true, name: 'Slime Launcher', weight: 'heavy', magazineSize: 4, magazines: 2, reloadTime: 1.6, fireInterval: 0.5, spreadDegrees: 2, bulletSpeed: 380, bulletRange: 1500, damage: 3, knockback: 140, knockbackGrowth: 1.2, recoil: 60, gravity: 650, lift: 120, hops: 2 }),
  // A short spray of spores; about one in `spore.every` leaves a small poison patch where it stops.
  spores: gun({ noCover: true, heavyThrow: true, name: 'Spore Sprayer', weight: 'light', magazineSize: 40, magazines: 2, reloadTime: 1.8, automatic: true, fireInterval: 0.09, spreadDegrees: 10, steadySpread: true, bulletSpeed: 230, bulletRange: 140, damage: 0.5, recoil: 0, spore: { every: 3, radius: 40, time: 4, perSecond: 3, max: 12 } }),
};
// Guns drawn tilted 45° (tip up and right), held at (ox, oy) of the sprite; `tip`: px from the
// hand to where shots leave.
export const TILTED_GUNS = { firestaff: { ox: 0.25, oy: 0.75, tip: 23 }, blaster: { ox: 0.25, oy: 0.75, tip: 22 } };
for (const [key, g] of Object.entries(GUNS)) {
  const p = GUN_POINTS[key];
  if (TILTED_GUNS[key]) g.muzzle = g.holdDistance + TILTED_GUNS[key].tip;
  if (!p) continue;
  g.muzzle = g.holdDistance + p.muzzle[0] - p.grip[0];
  g.muzzleDrop = p.muzzle[1] - p.grip[1];
}
export const PISTOL = GUNS.pistol;

// Money (Make It Rain's shots, the Jackpot's shower): what each piece is, how likely, what it does
// as a shot (damage; only diamonds push), and what it heals picked up off the floor (its damage).
export const CASH = [
  { look: 'coin', chance: 0.45, damage: 1.5 },
  { look: 'bill', chance: 0.35, damage: 1, speedMul: 0.75 },
  { look: 'goldcoin', chance: 0.15, damage: 4 },
  // (A diamond stuns with a light push, like a headshot from a light gun.)
  { look: 'diamond', chance: 0.05, damage: 6, knockback: 150, knockbackGrowth: 1.2 },
];
// Money on the floor: it lies there `lie` s, blinks for `blink` s more, then it's gone. Touch it to
// heal `heal` of what that piece does as a shot.
export const LOOT = { lie: 3, blink: 5, gravity: 600, heal: 0.5 };
// The style meter (0..1): mixing it up fills it, and full, it reloads your gun for free (a full
// magazine; not special guns, which refill at ammo chests). What fills it:
//   melee: a melee hit that lands; gunToMelee instead, if it lands within `comboWindow` s of one of
//     your shots hitting someone; parry: a parry; evade: dodging a hit (at most every `evadeEvery` s);
//   headshot: a headshot, then not again for `headshotCooldown` s; catch: catching your thrown gun.
export const STYLE = { melee: 0.12, gunToMelee: 0.3, comboWindow: 0.75, parry: 0.3, evade: 0.2, evadeEvery: 0.5, headshot: 0.25, headshotCooldown: 5, catch: 0.3 };
// Ammo chests: on the stage's outermost spawn points. Press pick up beside one: it fills your gun
// (any gun, specials too; no gun: a pistol), then stays shut for `cooldown` s.
export const AMMO_CHEST = { cooldown: 25, reach: 16 };
// Slime puddles: glue (see GLUE), `width` px of floor for `time` s.
export const SLIME = { width: 40, time: 6 };
// Arrows stuck in walls: thin footholds `width` px long, for `time` s (at most `max` at once).
export const FOOTHOLD = { width: 10, time: 8, max: 8 };
export const HOLD = { light: 0.56, heavy: 0.38, special: 0.68 };

// Accuracy: the spread is multiplied by `crouch` crouching, `still` standing still, `moving`
// while walking or running, `air` in the air, plus some degrees more when moving or in the air.
export const ACCURACY = { crouch: 0.15, still: 0.4, moving: 1.5, air: 1.8, movingExtra: 2, airExtra: 3 };
// An empty gun with no magazines left is thrown (any gun): it tumbles and hits like a brick.
// (Hold the trigger `hold` s to wind up the throw, then let go; a tap just clicks, so you can keep
// the empty gun.) A light gun (not one marked heavyThrow: the big ones) that hits an enemy bounces
// back, arcing to you (`back` s to reach you): press pick up as it gets there (`catchReach` px) to
// catch it, for style. Uncaught, or thrown and missing, a gun falls and lies on the floor; an empty
// one there vanishes after `emptyLife` s (blinking for the last `emptyBlink`).
export const GUN_THROW = { hold: 0.4, speed: 420, damage: 6, knockback: 180, knockbackGrowth: 1.6, back: 0.5, gravity: 500, catchReach: 24, emptyLife: 10, emptyBlink: 2 };

// A shot in the head (the top `height` px of a standing body; less crouched) stuns, even from a
// light gun, and hurts more.
export const HEADSHOT = { height: 8, damageMul: 1.5, knockback: 150, knockbackGrowth: 1.2 };

// Explosions push everyone in range away from the centre (and set off barrels).
export const BLAST = { lift: 0.5, falloff: 0.5 };

// Grenades: picked up (you carry at most `max`, used in the order you got them) and thrown with
// the grenade button. Hold it to cook (the fuse runs in your hand; hold too long and it goes off
// there) and to aim; let go to throw. They bounce, then go off when the fuse runs out.
export const GRENADE = { max: 2, throwSpeed: 380, lift: 90, gravity: 700, bounce: 0.45, friction: 0.6, size: 6 };
export const GRENADES = {
  frag: { name: 'Frag', fuse: 2.2, explode: { radius: 84, damage: 12, knockback: 440, knockbackGrowth: 4.5 } },
  // Big damage, less push, and sets you on fire (damage over time, no stun).
  fire: { name: 'Fire', fuse: 1.8, explode: { radius: 64, damage: 16, knockback: 200, knockbackGrowth: 2 }, burn: { time: 3, perSecond: 4 } },
  // A thick cloud nobody can see into.
  smoke: { name: 'Smoke', fuse: 1.6, cloud: { radius: 80, time: 9 } },
  // A cloud like smoke, thinner, that slowly hurts anyone inside.
  poison: { name: 'Poison', fuse: 1.6, cloud: { radius: 70, time: 8, perSecond: 3 } },
  // A light pink gas: whoever walks into it goes drowsy (see DROWSY). It doesn't hurt.
  drowsy: { name: 'Drowsy Gas', fuse: 1.6, cloud: { radius: 70, time: 6, perSecond: 0, drowsy: true } },
  // A thrown potion: everyone within `radius` (the thrower too) turns into a random animal (see
  // ANIMALS) for up to `time` s: they can walk and jump, nothing else. Any damage, any status or
  // a KO turns them back.
  polymorph: { name: 'Polymorph Potion', fuse: 1.4, polymorph: { radius: 64, time: 3 } },
  // Teleports you to where it goes off; if it hits someone first, you swap places with them.
  warp: { name: 'Warp', fuse: 1.4, warp: true },
  // Sticks to whatever it touches first (a wall, the floor, a person). Press the grenade button
  // again to set it off. (No fuse: `fuse` just means "never".)
  c4: { name: 'Sticky C4', fuse: 999, remote: true, explode: { radius: 76, damage: 14, knockback: 420, knockbackGrowth: 4.5 } },
  // Explodes like a grenade, and showers `cash` pieces of money (see CASH, LOOT) anyone can grab
  // to heal.
  cashnade: { name: 'Money Grenade', fuse: 2, explode: { radius: 76, damage: 10, knockback: 380, knockbackGrowth: 4 }, cash: 10 },
  // No damage: for `hole.time` s it pulls everyone within `hole.radius` toward its middle (`pull`:
  // px/s², stronger near the middle). Inside it there's no gravity, so it lifts you off the floor
  // and catches you falling; someone launched fast enough can still fly through.
  blackhole: { name: 'Black Hole', fuse: 1.6, hole: { radius: 110, time: 3.5, pull: 1900 } },
  // Thrown like a grenade, it plants itself where it first lands on a floor: its stretch of the
  // stage (see HAVEN) becomes a melee-only zone, and if its thrower spends `plant.hold` s in there,
  // they gain a life. (It never goes off: `fuse` is how long it flies before it's lost.)
  banner: { name: 'Banner', fuse: 6, plant: { hold: 30 } },
};


export const STRIKE = {
  name: 'Strike',
  hitSound: 'blunt',
  damage: 8,
  knockback: 200,
  knockbackGrowth: 4,
  reach: 14,
  radius: 12,
  startup: 0.06,
  active: 0.1,
  recovery: 0.22,
  lunge: 90,
};

// Melee weapons, found as pickups (press pick up while touching one). A swing sweeps the hit
// area along an arc of `arc` degrees each side of the aim, from `startup` to `startup + active`.
// Light weapons never launch: their push is capped at LIGHT_MAX_PUSH. Heavy ones launch.
// Quirks: backstab (from behind: damage × damageMul, and a push even from a light weapon), uppercut (launches straight up), flat
// (launches flat and far), unblockable (goes through blocks). rising: the swing goes from below
// to above (the rest go from above to below). thrust: a straight jab along the aim instead of a
// swing (no arc): drawn back in the wind-up, then shot out `travel` px to `reach` while it hits
// (by default from 40% of the reach).
// hitSound: what a landed hit sounds like: cut, stab or blunt.
// replacesGun: it goes in the gun slot (dropping your gun) and the shoot button swings it; the
// melee button still punches, or swings your melee weapon.
// Light weapons in the melee slot can be thrown (LIGHT_THROW, or the weapon's own `throw`): hold
// the melee button. The throw pushes (their way to finish someone off); the weapon lands where it
// stops and lies there as a pickup to go get back. `recover: false` throws are gone for good.
// combo: the `hits`-th hit in a row (each within `window` s of the last) launches with `launch`.
// charge: the hold charges a dash slash instead of a throw: held at least `time`, letting go
// dashes forward at `dash` px/s and the slash launches with `launch`.
export const LIGHT_MAX_PUSH = 160;
export const LIGHT_THROW = { holdToThrow: 0.3, speed: 420, lift: 80, gravity: 600, damage: 5, knockback: 250, knockbackGrowth: 3 };
export const MELEE = {
  katana: {
    // Swings the instant you click, to time deflecting bullets; keep holding to throw it after.
    name: 'Otaku Katana', weight: 'light', hitSound: 'cut', instant: true,
    damage: 5, knockback: 90, knockbackGrowth: 0.5,
    reach: 16, radius: 9, arc: 75, startup: 0.03, active: 0.08, recovery: 0.1, lunge: 60,
    // Bullets touching the blade mid-swing fly off toward the pointer, as yours, and hit harder.
    deflect: { damageMul: 1.5, knockbackMul: 1.4, speedMul: 1.1 },
    heavy: { pushes: true, damage: 7, knockback: 200, knockbackGrowth: 2.5, arc: 90, startup: 0.05, active: 0.1, recovery: 0.16 },
  },
  bolivar: {
    name: "Bolívar's Sword", weight: 'heavy', hitSound: 'cut',
    damage: 10, knockback: 220, knockbackGrowth: 4.2,
    reach: 16, radius: 10, arc: 70, startup: 0.08, active: 0.1, recovery: 0.24, lunge: 80,
  },
  chola: {
    name: 'La Chola', weight: 'heavy', hitSound: 'blunt',
    damage: 13, knockback: 320, knockbackGrowth: 5,
    reach: 14, radius: 12, arc: 80, startup: 0.16, active: 0.12, recovery: 0.34, lunge: 40,
    // Tap to swing, as often as you like. Hold the attack to throw it in an arc; once thrown it's gone.
    throw: { holdToThrow: 0.25, recover: false, speed: 360, lift: 140, gravity: 600, damage: 9, knockback: 220, knockbackGrowth: 3 },
  },
  knife: {
    name: 'Knife', weight: 'light', hitSound: 'stab',
    damage: 4, knockback: 70, knockbackGrowth: 0.4,
    reach: 12, radius: 8, arc: 50, startup: 0.02, active: 0.06, recovery: 0.08, lunge: 70,
    // From behind: double damage, and it pushes (light weapons otherwise don't).
    backstab: { damageMul: 2, knockback: 220, knockbackGrowth: 2.5 },
    // Made for throwing: faster and flatter than other light weapons.
    throw: { ...LIGHT_THROW, holdToThrow: 0.2, speed: 600, lift: 20, gravity: 300, damage: 6 },
    heavy: { pushes: true, damage: 6, knockback: 190, knockbackGrowth: 2.3, arc: 70, startup: 0.05, active: 0.08, recovery: 0.14 },
  },
  machete: {
    name: 'Machete', weight: 'light', hitSound: 'cut',
    damage: 6, knockback: 90, knockbackGrowth: 0.5,
    reach: 15, radius: 10, arc: 90, startup: 0.04, active: 0.09, recovery: 0.12, lunge: 60,
    heavy: { pushes: true, damage: 8, knockback: 200, knockbackGrowth: 2.5, arc: 100, startup: 0.06, active: 0.1, recovery: 0.16, combo: { hits: 3, window: 0.8, launch: { knockback: 280, knockbackGrowth: 4 } } },
  },
  nodachi: {
    name: 'Nodachi', weight: 'light', hitSound: 'cut',
    damage: 7, knockback: 100, knockbackGrowth: 0.5,
    reach: 22, radius: 9, arc: 60, startup: 0.07, active: 0.1, recovery: 0.18, lunge: 50,
    charge: { time: 0.4, dash: 520, launch: { knockback: 300, knockbackGrowth: 4.2 } },
    heavy: { pushes: true, damage: 9, knockback: 210, knockbackGrowth: 2.6, arc: 75, startup: 0.09, active: 0.12, recovery: 0.2 },
  },
  // In the gun slot. Tap: a long thrust with a moderate push. Hold: throw it on its chain, in an
  // arc. Hit someone and they're stunned and reeled in to melee range; miss and it's reeled back
  // to you. Until it's back you stand there holding the chain: no moving, attacking or blocking.
  trident: {
    name: 'Trident', weight: 'heavy', replacesGun: true, hitSound: 'stab',
    // A long, narrow jab that's hard to land, so it pushes hard.
    damage: 8, knockback: 250, knockbackGrowth: 3.6,
    reach: 40, radius: 8, arc: 0, thrust: true, startup: 0.08, active: 0.1, recovery: 0.22, lunge: 40,
    holdToThrow: 0.25,
    // length: how far the chain reaches; stun: how long the catch keeps them stunned once
    // they're reeled in; meleeRange: how close they're reeled.
    chain: { speed: 430, lift: 50, gravity: 500, length: 230, damage: 6, reelSpeed: 520, pullSpeed: 380, meleeRange: 22, stun: 0.45 },
  },
  shovel: {
    name: 'Shovel', weight: 'heavy', hitSound: 'blunt',
    damage: 9, knockback: 240, knockbackGrowth: 4,
    reach: 18, radius: 11, arc: 70, startup: 0.1, active: 0.1, recovery: 0.28, lunge: 50,
    uppercut: true,
    rising: true,
  },
  // A caveman's club. A tap is a light poke. Hold to wind up: the longer, the harder it launches
  // (and the slower you walk: `power.slow` of your speed when full). Most of the way there it
  // launches flat; full, a bit more, at 45°, with a crack.
  club: {
    name: 'Oooga Booga', weight: 'heavy', hitSound: 'blunt',
    damage: 5, knockback: 120, knockbackGrowth: 1,
    reach: 17, radius: 11, arc: 80, startup: 0.14, active: 0.1, recovery: 0.3, lunge: 50,
    flat: true,
    power: { time: 1.2, graded: true, slow: 0.1, damage: 9, knockback: 300, knockbackGrowth: 5, full: { damage: 11, knockback: 340, knockbackGrowth: 5.8 } },
    heavy: { damage: 7, knockback: 200, knockbackGrowth: 3 },
  },
  cleaver: {
    name: 'Cleaver', weight: 'heavy', hitSound: 'cut',
    // Leaves them bleeding: `damage` more over `time` s (a new cut starts the bleed over), thrown too.
    bleed: { damage: 10, time: 5 },
    damage: 15, knockback: 200, knockbackGrowth: 3.2,
    reach: 12, radius: 7, arc: 70, startup: 0.1, active: 0.08, recovery: 0.3, lunge: 60,
    // Hold to throw a cleaver in an arc. You keep yours (keep), but can only throw again once
    // `cooldown` s have passed; the thrown one is gone where it lands.
    throw: { holdToThrow: 0.35, keep: true, cooldown: 2.5, recover: false, speed: 380, lift: 170, gravity: 700, damage: 9, knockback: 200, knockbackGrowth: 2.5 },
  },
  hammer: {
    name: 'War Hammer', weight: 'heavy', hitSound: 'blunt',
    damage: 14, knockback: 340, knockbackGrowth: 5.5,
    reach: 15, radius: 13, arc: 90, startup: 0.22, active: 0.12, recovery: 0.4, lunge: 30,
  },
  axe: {
    name: 'Bone Axe', weight: 'heavy', hitSound: 'cut',
    damage: 11, knockback: 260, knockbackGrowth: 4.5,
    reach: 15, radius: 11, arc: 75, startup: 0.12, active: 0.1, recovery: 0.3, lunge: 60,
    unblockable: true,
  },
  keyboard: {
    name: 'Keyboard', weight: 'light', hitSound: 'blunt',
    // Each hit rolls a word whose `scale` sets the share of `damage` and of the launch below.
    damage: 20,
    launch: { knockback: 380, knockbackGrowth: 5 }, // the full (100%) launch; other words get their share
    reach: 15, radius: 10, arc: 65, startup: 0.05, active: 0.08, recovery: 0.16, lunge: 50,
    // Thrown, it types a keyboard smash: a few letters in a row off one row of keys.
    smash: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
    // Letters typed per second when a word pops up (small words, and the big 100% phrase).
    typeSpeed: 40,
    bigTypeSpeed: 26,
    // chance: share of hits; scale: share of damage and push. Words are drawn in-game as text.
    words: [
      // The 100% word: the victim freezes while the phrase is typed out, then the full launch
      // lands with the last letter. Other words launch right away, at their share.
      { scale: 1.0, chance: 0.05, pool: ['QUIERO DEDICAR UNAS PALABRAS'], freeze: true },
      { scale: 0.6, chance: 0.25, pool: ['PRENDE EL SERVIDOR', 'Y QUE DIJE YO', 'PATO FALSO'] },
      { scale: 0.45, chance: 0.25, pool: ['QUE SE JUEGA', 'QUE LOCURA', 'TA BIEN'] },
      { scale: 0.25, chance: 0.3, pool: ['PATO', 'BICHO', 'FARISEO', 'DISCORD', 'BUENAS'] },
      { scale: 0.1, chance: 0.15, pool: ['SI ON', 'LOL', 'XD', 'LMAO'] },
    ],
    jab: { damage: 4 },
  },
  // Blocking with the pan also stops bullets from the front (they ring off it). Its hits bonk:
  // stunned a little longer.
  // A heavy, slow swing with a road sign. Held `power.time` s, the swing pushes harder, and
  // everyone near where it lands (`radiation.radius` px round them, so the swinger too) gets a
  // random effect for `radiation.time` s: something good or something bad (RADIATION).
  warning: {
    name: 'THE WARNING', weight: 'heavy', hitSound: 'blunt',
    damage: 10, knockback: 240, knockbackGrowth: 4,
    reach: 15, radius: 11, arc: 75, startup: 0.14, active: 0.12, recovery: 0.34, lunge: 40,
    power: { time: 0.5, damage: 12, knockback: 340, knockbackGrowth: 5.2, hitSound: 'bonk', radiation: { radius: 64, time: 8 } },
  },
  // A tap is a small push; held `power.time` s, the swing bonks for real.
  pan: {
    name: 'Frying Pan', weight: 'heavy', hitSound: 'bonk',
    damage: 6, knockback: 120, knockbackGrowth: 1,
    reach: 14, radius: 11, arc: 80, startup: 0.1, active: 0.1, recovery: 0.26, lunge: 50,
    blocksBullets: true,
    power: { time: 0.45, damage: 9, knockback: 220, knockbackGrowth: 3.6, bonk: 0.25, hitSound: 'crit-high' },
    heavy: { damage: 8, knockback: 170, knockbackGrowth: 2.4 },
  },
  // A tap is a moderate push. Held `power.time` s, the swing hits harder and you take a bite (it
  // heals you); after the last bite it's gone.
  ham: {
    name: 'Ham Leg', weight: 'heavy', hitSound: 'blunt',
    damage: 7, knockback: 170, knockbackGrowth: 2.4,
    reach: 14, radius: 12, arc: 75, startup: 0.12, active: 0.1, recovery: 0.3, lunge: 50,
    power: { time: 0.5, damage: 10, knockback: 250, knockbackGrowth: 4.2, bites: { heal: 5, count: 5 } },
    heavy: { damage: 9, knockback: 210, knockbackGrowth: 3.3 },
  },
  // A slap with it leaves the floor feeling like ice to them for `slippery` s.
  fish: {
    name: 'Wet Fish', weight: 'light', hitSound: 'slap',
    damage: 4, knockback: 110, knockbackGrowth: 0.6,
    reach: 14, radius: 9, arc: 70, startup: 0.03, active: 0.08, recovery: 0.1, lunge: 60,
    slippery: 2.5,
    heavy: { pushes: true, damage: 6, knockback: 200, knockbackGrowth: 2.4, arc: 90, startup: 0.05, active: 0.1, recovery: 0.14 },
  },
  // A hit takes their weapon (the one in hand first, then the other) and drops it behind you.
  pliers: {
    name: 'Yoink Pliers', weight: 'light', hitSound: 'stab',
    damage: 3, knockback: 80, knockbackGrowth: 0.4,
    reach: 12, radius: 9, arc: 50, startup: 0.04, active: 0.08, recovery: 0.14, lunge: 70,
    yoink: true,
    heavy: { pushes: true, damage: 5, knockback: 180, knockbackGrowth: 2.2, arc: 70, startup: 0.06, active: 0.1, recovery: 0.16 },
  },
  // Too heavy to swing: the attack only throws it, in a high arc (it lands as a pickup). You move
  // at `carrySlow` of your speed carrying it.
  anvil: {
    name: 'Anvil', weight: 'heavy', hitSound: 'clonk', throwOnly: true, carrySlow: 0.7,
    damage: 0, knockback: 0, knockbackGrowth: 0,
    reach: 10, radius: 10, arc: 0, startup: 0, active: 0, recovery: 0, lunge: 0,
    throw: { holdToThrow: 0, speed: 300, lift: 230, gravity: 900, damage: 16, knockback: 380, knockbackGrowth: 5 },
    jab: { damage: 6, knockback: 140, knockbackGrowth: 1 },
  },
  // The jab is its long thrust; the heavy a wide sweep from behind you round to the front.
  halberd: {
    name: 'Halberd', weight: 'heavy', hitSound: 'stab',
    // (The thrust is a light poke that sets up the sweep, which is slower and hits hard.)
    damage: 6, knockback: 120, knockbackGrowth: 1,
    reach: 46, radius: 8, arc: 0, thrust: true, startup: 0.1, active: 0.1, recovery: 0.22, lunge: 40,
    heavy: { thrust: false, hitSound: 'cut', damage: 11, knockback: 300, knockbackGrowth: 4.6, radius: 11, arc: 110, startup: 0.14, active: 0.2, recovery: 0.4, lunge: 30 },
  },
  // Tap to swing. Hold to spin it round you: the ball knocks away anyone it touches (each at most
  // every `every` s) and you move at `slow` of your speed.
  morningstar: {
    name: 'Morning Star', weight: 'heavy', hitSound: 'blunt',
    damage: 11, knockback: 280, knockbackGrowth: 4.6,
    reach: 15, radius: 11, arc: 85, startup: 0.16, active: 0.12, recovery: 0.34, lunge: 40,
    spin: { after: 0.3, radius: 24, ball: 9, speed: 11, every: 0.4, damage: 6, knockback: 240, knockbackGrowth: 3.4, slow: 0.5 },
  },
  // A full circle: it reaps behind you too.
  scythe: {
    name: 'Bone Scythe', weight: 'heavy', hitSound: 'cut',
    damage: 11, knockback: 260, knockbackGrowth: 4.4,
    reach: 15, radius: 11, arc: 180, startup: 0.16, active: 0.18, recovery: 0.34, lunge: 30,
  },
  // A stab with a moderate push. Hold to take a bite: you run `eat.speed` times faster for
  // `eat.time` s. The first bite leaves it rotten, the second finishes it.
  carrot: {
    name: 'Carrot', weight: 'heavy', hitSound: 'stab',
    damage: 8, knockback: 200, knockbackGrowth: 3,
    reach: 26, radius: 8, arc: 0, thrust: true, startup: 0.07, active: 0.1, recovery: 0.22, lunge: 60,
    eat: { hold: 0.5, bites: 2, speed: 1.35, time: 6 },
  },
  // A swing on the ground rolls paint along the floor in front of you (`paint.length` px, for
  // `paint.time` s): anyone else on it moves at `paint.slow` of their speed. It holds paint for
  // `paint.ammo` swings; dry, it's just a light weapon.
  roller: {
    name: 'Paint Roller', weight: 'light', hitSound: 'blunt',
    damage: 3, knockback: 80, knockbackGrowth: 0.4,
    reach: 14, radius: 10, arc: 60, startup: 0.05, active: 0.1, recovery: 0.14, lunge: 60,
    rising: true,
    heavy: { pushes: true, damage: 5, knockback: 190, knockbackGrowth: 2.3, arc: 80, startup: 0.07, active: 0.12, recovery: 0.16, paint: { length: 56, time: 10, slow: 0.55, ammo: 6 } },
  },
};

// Melee hit areas follow the art: a swung weapon is held SWING_HAND px out from the shoulder, and
// with a measured sprite (meleePoints.js, made by tools/melee_points.py) its hit area runs along
// the blade, from 30% of the way out to the tip; `reach` becomes the tip's (see swingPoints in
// world.js). Thrusts (the trident) keep their own reach.
export const SWING_HAND = 4;
for (const [key, m] of Object.entries(MELEE)) {
  const p = MELEE_POINTS[key];
  if (!p) continue;
  // (A thrust whose heavy is a swing, the halberd's sweep, follows the art like any swing.)
  if (m.heavy?.thrust === false) Object.assign(m.heavy, { length: p.length, reach: SWING_HAND + p.length - (m.heavy.radius ?? m.radius) * 0.5 });
  if (m.thrust) continue;
  m.length = p.length;
  m.reach = SWING_HAND + p.length - m.radius * 0.5;
}
// Jab and heavy. Every weapon (and the fists) has two attacks: the jab (its own button: L, or C)
// is a quick straight poke along the aim that never launches (JAB), to start and carry combos; the
// heavy (the melee button) is the full swing. A weapon with a `heavy` block has light stats of its
// own (they set its jab) and the heavy on top; any other's own stats are its heavy, and its jab is
// made from them. `jab` blocks adjust a jab. Holding the melee button is the weapon's special.
// The jab: damage (a share of the weapon's, unless it has a `heavy`), push at most this, speeds.
// A weapon's jab is drawn back `pull` px, then poked out to `poke` px past where its tip rests; the
// whole weapon hits, not just the tip. (Fists: `reachShare` of the punch's reach.)
export const JAB = { damageShare: 0.5, knockback: 120, knockbackGrowth: 1, startup: 0.04, active: 0.07, recovery: 0.1, heavyRecovery: 0.14, reachShare: 0.85, radius: 9, lunge: 40, poke: 5, pull: 6 };
// (What a jab keeps of its weapon: on-hit quirks that suit a poke.)
const JAB_KEEPS = ['name', 'weight', 'hitSound', 'backstab', 'slippery', 'yoink', 'bleed', 'deflect'];
function makeJab(m, length) {
  const base = Object.fromEntries(JAB_KEEPS.filter((k) => m[k] !== undefined).map((k) => [k, m[k]]));
  const radius = Math.min(m.radius || JAB.radius, JAB.radius);
  // (A weapon pokes out past its tip; a thrust weapon's jab never outreaches its own thrust.)
  const poke = length && Math.min(m.thrust ? m.reach : Infinity, SWING_HAND + length - radius * 0.5 + JAB.poke);
  return {
    ...base,
    jab: true,
    thrust: true,
    arc: 0,
    damage: m.heavy ? m.damage : Math.round(m.damage * JAB.damageShare * 10) / 10,
    knockback: Math.min(m.knockback || JAB.knockback, JAB.knockback),
    knockbackGrowth: Math.min(m.knockbackGrowth || JAB.knockbackGrowth, JAB.knockbackGrowth),
    startup: JAB.startup,
    active: JAB.active,
    recovery: m.weight === 'heavy' ? JAB.heavyRecovery : JAB.recovery,
    reach: poke || Math.max(12, (m.reach || 14) * JAB.reachShare),
    ...(poke ? { length, travel: JAB.poke + JAB.pull } : {}),
    radius,
    lunge: JAB.lunge,
    ...m.jab,
  };
}
for (const [key, m] of [['fists', STRIKE], ...Object.entries(MELEE)]) {
  m.heavyStats = m.heavy ? { ...m, ...m.heavy, heavy: null } : m;
  m.jabStats = makeJab(m, MELEE_POINTS[key]?.length);
}

// Pickups (melee weapons, guns, grenades) inside the storm's deep-red wall are destroyed (freeing
// their slot).
export const PICKUPS = {
  every: 8, // seconds between new pickups
  max: 4, // at most this many lying around at once
  firstAfter: 4,
  shrineEvery: 6, // a weapon shrine gets a new weapon this long after its last one is taken
  // What appears: the share of melee weapons, guns (never the pistol) and grenades.
  mix: { melee: 4, gun: 4, grenade: 3, item: 3 },
  reach: 16, // how close you need to be to grab one
};

// Items: pickups that aren't weapons.
//   heal: eaten on the spot, takes that much off your damage %.
//   carry: held up for all to see (no slot); a hit that launches you faster than CARRY.dropPush,
//     or a KO, makes you drop it. The key opens the stage's chest (a LEGENDARY weapon).
//   rune: a boon for `time` s: speed ×speed, push taken ×push, airJumps more air jumps, or
//     reflect: bullets that hit you fly back at whoever shot them, until they add up to that much
//     damage (the one that goes past it too; then the rune's done).
//   wish: the genie lamp, rubbed for `rub` s, then a WISH.
//   homing: the crystal ball: for `time` s your shots home in on the nearest enemy (turning up to
//     `turn` rad/s) but hit for `damage` of their damage.
export const ITEMS = {
  apple: { name: 'Apple', heal: 10 },
  drumstick: { name: 'Drumstick', heal: 25 },
  medkit: { name: 'Health Spray', heal: 50 },
  key: { name: 'Key', carry: true },
  haste: { name: 'Haste Rune', rune: { time: 15, speed: 1.4 } },
  iron: { name: 'Iron Rune', rune: { time: 15, push: 0.6 } },
  feather: { name: 'Feather Rune', rune: { time: 15, airJumps: 2 } },
  mirror: { name: 'Mirror Rune', rune: { time: 15, reflect: 50 } },
  lamp: { name: 'Genie Lamp', wish: { rub: 1.5 } },
  crystal: { name: 'Crystal Ball', homing: { time: 8, turn: 7, damage: 0.5 } },
  catring: { name: 'Ring of Cat', ring: true },
};
// The Ring of Cat: takes both grenade slots (a grenade picked up replaces it). `uses` times, the
// grenade button turns you into one of `kinds` cats; pressing it again turns you back. A cat runs `speed` × as
// fast, jumps and dashes, and can't attack, block, hide or pick things up. It turns back on any
// attack (which still comes out), `breakAt` % of damage taken as a cat, any status but drowsiness
// and sleep (the cat lies down, then sleeps), or a KO.
export const CAT = { uses: 7, kinds: 6, speed: 2, breakAt: 10 };
// The polymorph potion's animals (see tools/critter_art.py for their art).
export const ANIMALS = ['snake', 'cobra', 'hamster', 'rat', 'pigeon', 'seagull', 'bear', 'blackbear', 'badger', 'wolf', 'fox', 'shiba', 'blackdog'];
export const CARRY = { dropPush: 260, reach: 14 };
// The banner's melee-only zone: the stage section it's planted in (random stages), or `width` px
// around it. Shots and thrown things (not thrown melee weapons) vanish entering it, and guns don't
// fire inside it. If its thrower is out of it (or knocked out) for more than `away` s, it's gone.
export const HAVEN = { width: 288, away: 3 };
// What the chest gives, at random.
export const LEGENDARY = ['golden', 'railgun', 'jackpot', 'rocket', 'shotgun', 'money', 'hammer', 'pan', 'halberd'];
// The genie lamp's wish, by chance: death (frozen, shaking, then launched off the stage: `freeze`
// s, push `knockback`), a legendary weapon at your feet, a full heal, or (the rest) a jinx (`time`
// s of taking `push` × the push, and you shrink).
export const WISH = { death: 0.01, legendary: 0.33, heal: 0.33, doom: { freeze: 2, knockback: 2500 }, jinx: { time: 10, push: 1.3 } };
// What THE WARNING's radiation can do to you (each one at random): the haste, iron and feather
// runes, the lamp's jinx, the fish's ice, the fire grenade's burn, the crystal ball's homing.
export const RADIATION = ['haste', 'iron', 'feather', 'jinx', 'slip', 'burn', 'homing'];

// The crown (on last round's winner) and the rules about it: 'show' (just the hat), 'bounty' (KO
// the champion to take the crown, and `bountyHeal` off your damage %), 'weight' (the champion
// takes `weight` × the push).
export const CROWN = { bountyHeal: 20, weight: 1.15 };

// Holding block stops melee (not bullets). Letting go plays the "block drop" animation; a melee
// hit that lands during the first half of it, from the matching stance (standing hit vs standing
// block, crouching hit vs crouching block), is a parry: no damage, and the attacker is stunned.
export const BLOCK = {
  dropFrames: 2,
  dropFps: 8, // 2 frames at 8 fps: the drop lasts 0.25 s, the parry window 0.125 s
  parryStun: 0.6,
  blockPush: 60, // both fighters slide apart a little on a blocked hit
};

// Doorways: stand in one and press hide to duck in. Hidden, you can't move, shoot or hit, and
// bullets fly past you, but melee (and explosions) still land. Hide again, jump or move to come out.
export const DOOR = {
  w: 20,
  h: 40,
  reach: 8, // how close to the doorway's center you need to be
};

// Low cover. Tucked behind it you hold your gun up over it and fire from there, but not the big
// guns (marked noCover: too big to aim over cover). It can be shot to pieces: `hpPerTile` health
// for each tile of width; bullets, thrown things and melee hits take their damage off it,
// explosions `blast` times theirs. Broken, it's gone for the rest of the match.
export const COVER = { hpPerTile: 40, blast: 2, gunOver: 3 };

// Props (planned, not in the game yet: see docs/props.md): stage objects that are low cover where
// they stand and a weapon once picked up. `on: false` keeps a prop out of the game until it's built.
//   w, h: its size (px); hp: health as cover (like COVER: shots, hits and blasts wear it down);
//   carrySlow: your speed while carrying it; throw: thrown like a heavy weapon (see LIGHT_THROW for
//   the fields), breaking where it lands (`breaks`); swing: hit with it held, if at all.
export const PROPS = {
  chair: {
    on: false,
    name: 'Chair',
    w: 16,
    h: 16,
    hp: 30,
    carrySlow: 0.85,
    throw: { holdToThrow: 0.3, speed: 360, lift: 140, gravity: 700, damage: 9, knockback: 260, knockbackGrowth: 3.2, breaks: true },
    swing: null,
  },
};

export const BARREL = {
  w: 18,
  h: 24,
  health: 8,
  blastRadius: 72,
  blastDamage: 15,
  knockback: 300,
  knockbackGrowth: 4.5,
  respawnTime: 25,
  chainDelay: 0.15,
};

export const SPIKES = {
  depth: 6,
  damage: 8,
  knockback: 240,
  knockbackGrowth: 3,
  cooldown: 0.5,
};

// Stage pieces that move or change (random stages). Times in seconds.
export const MOVERS = {
  // Drawbridge over a pitfall: down (a bridge) for `up`, flickers for `warn`, then gone for `open`.
  bridge: { up: 7, warn: 1.5, open: 4 },
  // Crusher: waits up high, shakes as a warning, slams to the floor, holds, and rises again.
  // Anyone it lands on is hit hard and thrown out sideways; touching its spiked underside while it
  // isn't falling hurts like any spikes (SPIKES).
  crusher: { wait: 3.5, warn: 0.8, slam: 0.2, hold: 0.8, rise: 1.6, damage: 14, knockback: 520, knockbackGrowth: 6 },
  // Cage lift: waits at each end, travelling between them.
  lift: { wait: 1.2, travel: 2.6 },
  // Crumbling floor: a tile shakes once stood on, falls away, and comes back later.
  crumble: { shake: 0.5, gone: 3.5 },
};

// Dash (the dodge key, F): costs `cost` of the stamina bar (it refills from empty in `recharge` s),
// so a full bar is two dashes. A quick shove in the direction you hold (backwards if you hold
// nothing). For the first `iframes` s you can't be hit
// by bullets, melee or explosions (spikes, crushers and the storm still get you).
// di: holding up or down tilts the dash by this many degrees (on the ground, only up).
export const DASH = { speed: 380, time: 0.2, iframes: 0.14, recharge: 2.5, cost: 0.5, di: 45 };

// Combos. A melee hit that lands lets you cut the rest of that swing short with a jump or a dash
// (cancel), gives back your air jump, and makes your next dash free (within `freeDash` s); a swing
// that hits recovers in `recoveryOnHit` of its recovery. Staleness: within one combo (until the
// victim gets out of hitstun), each repeat of the same attack on them pushes and stuns `stale`
// less, down to `staleMin` of the full amount.
// A jab, heavy or shot pressed mid-swing is remembered for `buffer` s and comes out as soon as it
// can; a heavy cuts a jab's recovery short (so jab, heavy flows about as fast as jab, jab), and so
// does a shot (a jab's, or a heavy's that hit).
export const COMBO = { recoveryOnHit: 0.5, freeDash: 1.5, stale: 0.15, staleMin: 0.4, buffer: 0.2 };

// Bodies bump: you can't walk through someone, unless you keep walking into them for `passAfter` s
// (then you slip past), or dash (dashes go straight through). Two people standing in each other
// (landing on someone) drift apart at `settle` px/s. Not while hidden or knocked flying.
export const BUMP = { passAfter: 0.4, settle: 120 };
// Asleep (hit by The Snoozer, or drowsy too long): lying there for `time` s, no control at all,
// but mashing moves fills a meter the way shaking off drowsiness does (see DROWSY): full, you
// wake up, though not before `min` s. Any hit wakes you (and lands in full: a sleeper is a free
// shot). Once awake you can't go drowsy again for `rested` s.
export const SLEEP = { time: 3, min: 2, rested: 2 };
// Drowsy (the drowsy gas): `slow` slower, and after `time` s you fall asleep, unless you take
// damage first (that wakes you up) or shake it off, filling a meter with jerky moves: each turn
// (pressing a new direction), jump, dash or tap down adds its `shake` share, but the same move
// again in a row adds `shake.repeat` × what it added last time (walking straight adds nothing).
export const DROWSY = { time: 3, slow: 0.3, shake: { turn: 0.06, jump: 0.07, dash: 0.1, drop: 0.05, repeat: 0.5 } };
// DI: when you're launched, the direction you hold (left/right; crouch for down, up for up)
// bends your flight by up to `degrees`, the most when it's at right angles to the launch. Only for
// real launches (push of at least `minPower`).
export const DI = { degrees: 15, minPower: 150 };
// Breaker: frozen by a special stun (the keyboard's big phrase, the lamp's doom), press block to
// break free before the launch: it costs `cost` of the stamina bar, and pushes anyone within
// `radius` px back (`push` px/s).
export const BREAKER = { cost: 0.5, radius: 48, push: 220 };

// Glue: floors coated in super glue. Standing on one you move at `slow` of your speed and can't
// jump or dash: walk off it.
export const GLUE = { slow: 0.4 };

// Stamina (the dash's bar) also pays for: each shot fired crouched (`crouchShot`; with too little
// left, crouching stops steadying your aim), and attacking on the run (`swing`, by weapon: with
// too little left, you stop to attack like a standing swing).
export const STAMINA = { crouchShot: 0.1, swing: { fists: 0.15, light: 0.25, heavy: 0.5 } };

// Ice: on an icy floor you speed up and slow down much more slowly.
export const ICE = { accel: 0.3, friction: 0.08 };

// Storm timing presets for a match (Same screen rules): overrides for STORM below.
export const STORM_PACE = {
  off: { startDelay: 1e9 },
  slow: { startDelay: 75, firstShrink: 40, hold: 40, finalShrink: 30 },
  normal: {},
  fast: { startDelay: 25, firstShrink: 20, hold: 12, finalShrink: 15 },
};

export const STORM = {
  startDelay: 45,
  firstShrink: 30,
  hold: 25,
  finalShrink: 20,
  firstWidth: 800,
  finalWidth: 288,
  // The storm next to the safe zone is a pale band that hurts; past it is a deep-red wall.
  dangerBand: 0.15, // share of each storm side that is the damaging band
  damagePerSecond: 6,
  // Launched into the wall this fast (px/s) and you lose a life; slower, it just stops you.
  wallKoSpeed: 150,
};

// Who gets a knockout (the KO point and the line at the top of the screen): whoever last hit you,
// if it was within `credit` s; later than that, you did it yourself. Finished off by a hazard
// (spikes, the crusher, the lamp's doom), they only get it if they hit you within `hazard` s of it.
export const KO_CREDIT = { credit: 2, hazard: 1 };

export const RULES = {
  stocks: 3,
  maxPlayers: 4, // on one screen (and solo)
  maxOnline: 6, // in an online room
  maxWatching: 6, // people watching an online room (waiting for a seat)
  countdown: 3,
  endDelay: 2,
};
