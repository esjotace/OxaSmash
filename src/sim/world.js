// The match rules, ported from the Godot build: movement, the 9mm (two magazines, auto-reload,
// throw when empty), melee, cover, barrels, spike walls, the storm, lives. Plain JS, fixed ticks.
import { VENT, WIND, PORTAL, CAT, ANIMALS, SLEEP, DROWSY, KO_CREDIT, CASH, LOOT, STYLE, COMBO, BUMP, COVER, DI, BREAKER, AMMO_CHEST, SLIME, FOOTHOLD, ITEMS, CARRY, HAVEN, LEGENDARY, WISH, CROWN, RADIATION, DT, FIGHTER as F, GRAVITY, JUMP_SPEED, AIR_JUMP_SPEED, GUNS, GUN_THROW, HOLD, ACCURACY, HEADSHOT, BLAST, GRENADE, GRENADES, DASH, GLUE, STAMINA, SWING_HAND, STRIKE, MELEE, LIGHT_MAX_PUSH, LIGHT_THROW, PICKUPS, DROPS, BLOCK, DOOR, BARREL, SPIKES, STORM, RULES, TILE, MOVERS, ICE, RUN } from './constants.js';
import { getStage, DEFAULT_STAGE } from './stage.js';
import { NEUTRAL } from './input.js';

// What the hit about to land is (a weapon, a grenade, a hazard...): set just before each hit, and
// recorded on whoever it lands on (lastHitWith), so a knockout can say what did it.
let cause = null;
const using = (what) => (cause = what);

// training: lives never run out, guns never run dry, grenades are never used up, no storm, and
// nothing turns up by itself: weapons are spawned from the Training menu (see spawnWeapon).
// rules: what's in play: { melee, ranged, thrown, items } (all on unless false). With ranged off,
// nobody starts with a gun and none turn up; with melee off, no melee weapons turn up (fists stay);
// thrown off, no grenades; items off, no items. startGun: everyone (re)spawns with the 9mm (by
// default, when ranged is on); startGrenades: and with this many frag grenades (0).
// crown: who wears the crown (last round's winner), or -1; crownRule: 'show', 'bounty' or 'weight'.
export function createWorld({ players, stage = DEFAULT_STAGE, stocks = RULES.stocks, seed = 1, countdown = RULES.countdown, storm = {}, training = false, rules = {}, crown = -1, crownRule = 'show' }) {
  const st = getStage(stage);
  const world = {
    tick: 0,
    stage,
    training,
    rules: { melee: rules.melee !== false, ranged: rules.ranged !== false, thrown: rules.thrown !== false, items: rules.items !== false, startGun: rules.startGun ?? rules.ranged !== false, startGrenades: Math.max(0, Math.min(GRENADE.max, rules.startGrenades | 0)) },
    phase: countdown > 0 ? 'countdown' : 'play',
    timer: countdown,
    winner: null,
    rngState: seed >>> 0, // where the world's random numbers are up to (see attachRng)
    fighters: [],
    bullets: [],
    nextBullet: 1,
    barrels: st.barrels.map((b) => ({ x: b.x, y: b.y, hp: BARREL.health, gone: false, fuse: -1, respawn: 0, lastBy: -1, flash: 0 })),
    spikeCooldown: {},
    // Moving and changing stage pieces (see updateMovers): y, whether they're there (on), and
    // whether they're about to change (warn).
    movers: (st.movers ?? []).map((m) => ({ x: m.x, y: m.kind === 'lift' ? m.bottom : m.kind === 'crusher' ? m.top : m.y, on: true, warn: false, t: -1 })),
    // The stage's weather and gadgets, for the renderer: the wind ({ dir, warn, on }) and which
    // vents are about to puff.
    wind: null,
    vents: (st.vents ?? []).map(() => 0),
    // The portals, where they are now (they move when the storm reaches one), or null.
    portalsAt: st.portals ? st.portals.map((p) => ({ x: p.x, y: p.y })) : null,
    // Low cover: the stage's, each with its own health (see COVER); standing: the stage's blocks
    // with broken cover taken out.
    covers: [],
    standing: st.blocks,
    live: st.blocks, // every block that's there right now: the stage's, plus movers that are on
    shrineTimer: PICKUPS.firstAfter,
    pickups: [], // melee weapons lying around: { id, x, y, weapon }
    pickupTimer: PICKUPS.firstAfter,
    nextPickup: 1,
    storm: null, // (made below, with the world's random numbers)
    grenades: [], // thrown grenades: { id, owner, kind, x, y, vx, vy, fuse }
    nextGrenade: 1,
    clouds: [], // smoke, poison and spore patches: { id, kind, x, y, r, t, by, perSecond? }
    nextCloud: 1,
    paints: [], // paint rolled on floors (the paint roller): { x1, x2, y, owner, t }
    holes: [], // black holes pulling everyone in: { id, x, y, r, t, pull }
    chest: null, // the locked chest the key opens: { x, y }
    infiniteAmmo: training, // guns never run dry, grenades are never used up (training; switchable there)
    haven: null, // the banner's melee-only zone: { x, y, left, right, owner, held }
    ammoChests: placeAmmoChests(st), // { x, y, cd }: seconds until each can be used again
    crown,
    crownRule,
    puddles: [], // slime glue on floors (the slime launcher): { x1, x2, y, t }
    footholds: [], // arrows stuck in walls, to stand on: { x, y, dir, t }
    loot: [], // money lying around (the jackpot): { id, x, y, vx, vy, look, value, t, landed }
    nextLoot: 1,
    events: [], // what happened during the last step, for effects and sound
  };
  attachRng(world);
  world.storm = createStorm(st, { ...STORM, ...storm, ...(training ? { startDelay: 1e9 } : {}) }, world.rng);
  // (Each low cover a copy with its own health, standing in for the stage's.)
  const copies = new Map(st.blocks.filter((b) => b.cover).map((b, id) => [b, { ...b, id, hp: (COVER.hpPerTile * b.w) / TILE, max: (COVER.hpPerTile * b.w) / TILE, gone: false, flash: 0 }]));
  world.covers = [...copies.values()];
  world.standing = st.blocks.map((b) => copies.get(b) ?? b);
  world.live = world.standing;

  for (let id = 0; id < players; id++) {
    // (More players than starting spots: the extra ones start a little to the side of one.)
    const spot = st.spawns[id % st.spawns.length];
    const extra = Math.floor(id / st.spawns.length);
    const spawn = extra ? { x: spot.x + (extra % 2 ? 28 : -28) * Math.ceil(extra / 2), y: spot.y } : spot;
    world.fighters.push(createFighter(id, spawn, stocks, world.rules.startGun, world.rules.startGrenades));
  }
  return world;
}

// armed: starts (and respawns) with the pistol.
function createFighter(id, spawn, stocks, armed = true, startGrenades = 0) {
  const f = {
    id,
    armed,
    startGrenades, // frag grenades to (re)spawn with
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    facing: spawn.x < 896 ? 1 : -1,
    aimX: 1,
    aimY: 0,
    grounded: false,
    onThin: false,
    jumpsLeft: F.airJumps,
    coyote: 0,
    buffer: 0,
    cutting: false,
    fastFall: false,
    drop: 0,
    downTap: 0, // time left to tap down a second time and drop through a thin platform
    damage: 0,
    stocks,
    state: 'ok', // ok | dead (waiting to respawn) | out
    respawn: 0,
    hitstun: 0,
    invincible: 0,
    flash: 0,
    lastHitBy: -1,
    lastHitWith: null, // what last pushed this fighter (see cause), and when (tick)
    lastHitAt: -1,
    lastPlayerHitAt: -1, // when another player last hit them (tick)
    kos: 0,
    crouching: false,
    tucked: false, // crouched right beside low cover: lower still
    blocking: null, // 'stand' | 'crouch' while the block button is held
    blockDrop: -1, // seconds since block was let go, during the drop animation; -1 otherwise
    dropStance: null,
    stunned: false, // stunned by a parry
    swing: -1,
    swingStance: 'stand',
    swingX: 1,
    swingY: 0,
    swingHit: [],
    seen: { jp: 0, sp: 0, mp: 0, dp: 0, rp: 0, hp: 0, ep: 0, gp: 0, xp: 0, cp: 0, kp: 0 },
    stamina: 1, // 0..1; a dash needs it full
    dash: 0, // seconds left in a dash
    runFrom: 0, // the way a dash on the ground went (it turns into a run as it ends), or 0
    run: -1, // seconds into a run (see RUN), or -1
    runDir: 0, // the way the run goes
    dodge: 0, // seconds left invincible from a dash
    bleed: 0, // seconds left bleeding (the cleaver)
    bleedRate: 0,
    bleedBy: -1,
    onGlue: false, // standing on a glued floor
    burn: 0, // seconds left on fire
    burnBy: -1,
    poison: 0, // seconds left poisoned (a gas vent)
    slip: 0, // seconds left slipping as if on ice (slapped with the fish)
    sleep: 0, // seconds left asleep (see SLEEP)
    drowsy: 0, // seconds left drowsy before falling asleep (see DROWSY)
    shake: 0, // how far a drowsy fighter has shaken it off (0..1)
    shakeLast: null, // the last move that shook it (see DROWSY), how many times in a row, and the
    shakeRun: 0, //   direction held last tick
    shakeHeld: 0,
    rested: 0, // seconds left that the drowsy gas can't get you (just woke up)
    ring: 0, // uses left on the Ring of Cat (see CAT)
    cat: 0, // which cat you are (1..CAT.kinds), or 0
    catHurt: 0, // damage taken as a cat
    animal: -1, // which animal you've been turned into (an index into ANIMALS), or -1
    animalT: 0, // seconds left as one
    haste: 0, // seconds left running faster (ate a carrot)
    carry: null, // an item held up (the key)
    carryT: 0,
    rune: null, // the rune boon on you (an ITEMS key)
    runeT: 0,
    reflects: 0, // damage the mirror rune still sends back
    wish: -1, // seconds left rubbing the genie lamp, or -1
    jinx: 0, // seconds left jinxed (the lamp's bad wish)
    homing: 0, // seconds left of shots homing in (the crystal ball)
    healthRule: null, // training dummies: { mode: 'set' | 'banded', value } (see updateItems)
    bandT: 0,
    hidden: -1, // index of the doorway this fighter is hiding in, or -1
    pendingLaunch: null, // a delayed launch (100% keyboard word): { left, dx, dy, base, growth, by }
    muzzle: 0,
    walk: 0,
  };
  rearm(f);
  return f;
}

function rearm(f) {
  f.melee = null; // the melee slot: a picked-up weapon (MELEE key), or null for fists
  f.active = 'gun'; // the slot used last ('gun' or 'melee'): that weapon is drawn in hand, the other on the back
  f.swingWeapon = null; // which weapon the current swing uses (null = fists)
  f.holding = -1; // seconds the melee button has been held (to throw or charge), or -1
  f.comboN = 0; // machete: hits in a row so far
  f.comboT = 0; // machete: seconds left to land the next one
  f.chain = null; // the trident out on its chain: { phase: out | back | pull, x, y, vx, vy, victim }
  f.uses = 0; // bites taken out of the melee weapon (the ham, the carrot)
  f.throwCd = 0; // seconds until a weapon you keep when throwing (the cleaver) can be thrown again
  f.style = 0; // the style meter, 0..1 (see STYLE)
  f.styleHeadCd = 0; // seconds until a headshot fills it again
  f.styleEvadeCd = 0;
  f.gunHitT = 0; // seconds left for a melee hit to count as following up your shot
  f.freeDash = 0; // seconds left for a free dash (earned by landing a hit)
  f.queued = null; // a jab ('kp'), heavy ('mp') or shot ('sp') pressed mid-swing, waiting to come out
  f.queuedT = 0;
  f.pushT = 0; // seconds spent walking into someone (long enough, and you slip past; see BUMP)
  f.ghost = false; // slipping past (or dashing through) someone: no bumping until clear of everyone
  f.combo = []; // the attacks that have hit this fighter in the combo they're in (for staleness)
  f.spinHit = {}; // morning star: fighter id -> seconds until the spinning ball can hit them again
  if (f.armed) giveGun(f, 'pistol', null, true);
  else Object.assign(f, { gun: null, hasGun: false, ammo: 0, spareMags: 0, reload: 0, fireCd: 0, active: 'melee' });
  f.grenades = Array(f.startGrenades ?? 0).fill('frag'); // grenade kinds carried, first picked up first thrown
  f.cook = -1; // seconds the grenade in hand has been cooking, or -1
  f.cooking = null; // the kind of grenade in hand
}

// ammo: the rounds the gun brings in its magazine (null: a full one). Spare magazines are the
// player's, kept from gun to gun; fresh: starting out (or a chest's pistol), with the gun's spares.
function giveGun(f, key, ammo = null, fresh = false) {
  const g = GUNS[key];
  f.gun = key;
  f.hasGun = true;
  f.ammo = ammo ?? g.magazineSize;
  if (fresh) f.spareMags = g.magazines - 1;
  f.reload = 0;
  f.fireCd = 0;
  f.gunHold = -1; // seconds the shoot button has been held drawing the bow / charging the railgun
}

// The breaker: out of a special freeze (the keyboard's phrase, the lamp's doom) with no launch,
// for half the stamina bar; anyone close is pushed back a little.
function breakFree(world, f) {
  Object.assign(f, { pendingLaunch: null, hitstun: 0, stunned: false, stamina: f.stamina - BREAKER.cost });
  for (const v of world.fighters) {
    if (v === f || v.state !== 'ok' || Math.hypot(v.x - f.x, v.y - f.y) > BREAKER.radius) continue;
    v.vx = (Math.sign(v.x - f.x) || 1) * BREAKER.push;
    v.vy = Math.min(v.vy, -60);
  }
  world.events.push({ type: 'break', id: f.id, x: f.x, y: f.y - F.h / 2 });
}

// Advance one tick. inputs[i] is fighter i's input (see input.js).
export function step(world, inputs) {
  cause = null; // (nothing carries over from another world's tick)
  const st = getStage(world.stage);
  world.events = [];
  world.tick++;
  if (world.phase === 'countdown') {
    world.timer -= DT;
    if (world.timer <= 0) {
      world.phase = 'play';
      world.events.push({ type: 'go' });
    }
  } else if (world.phase === 'over') {
    world.timer -= DT;
  }
  const canAct = world.phase === 'play';
  updateMovers(world, st);
  updateWind(world, st, canAct);
  updateFootholds(world, st);
  if (canAct) updateChains(world, st);
  for (const f of world.fighters) updateFighter(world, st, f, (canAct && inputs[f.id]) || NEUTRAL, canAct);
  bumpFighters(world, st);
  for (const c of world.covers) c.flash = Math.max(0, c.flash - DT);
  updateBullets(world, st);
  updateBarrels(world, st);
  if (canAct) {
    updateSpikes(world, st);
    updateGrenades(world, st);
    updateAilments(world);
    updateVents(world, st);
    updatePortals(world, st);
    world.paints = world.paints.filter((p) => (p.t -= DT) > 0);
    world.puddles = world.puddles.filter((p) => (p.t -= DT) > 0);
    world.holes = world.holes.filter((h) => (h.t -= DT) > 0);
    // Empty guns lying around vanish after a while.
    world.pickups = world.pickups.filter((p) => {
      if (p.ammo !== 0 || (p.t += DT) < GUN_THROW.emptyLife) return true;
      world.events.push({ type: 'destroyed', x: p.x, y: p.y });
      return false;
    });
    for (const c of world.ammoChests) c.cd = Math.max(0, c.cd - DT);
    updateItems(world, st);
    updateLoot(world, st);
    updatePickups(world, st);
    updateStorm(world);
    enforceStormWall(world, st);
  }
  for (const f of world.fighters) checkBlastZone(world, st, f);
  checkGameOver(world);
  return world;
}

// Bodies bump (see BUMP): walking into someone stops you, until you've pushed long enough to slip
// past; a dash goes through; people standing in each other drift apart.
function bumpFighters(world, st) {
  const solid = (f) => f.state === 'ok' && f.hidden < 0 && f.hitstun <= 0;
  const touching = new Set();
  const fs = world.fighters.filter(solid);
  for (const f of fs) if (f.dash > 0) f.ghost = true;
  for (let i = 0; i < fs.length; i++) {
    for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i];
      const b = fs[j];
      const dx = b.x - a.x;
      const overlap = F.w - Math.abs(dx);
      if (overlap <= 0 || a.y - bodyHeight(a) >= b.y || b.y - bodyHeight(b) >= a.y) continue;
      touching.add(a).add(b);
      if (a.ghost || b.ghost) continue;
      const side = Math.sign(dx) || (a.id < b.id ? 1 : -1); // where b is, from a
      const aPush = a.heldX === side;
      const bPush = b.heldX === -side;
      if (aPush !== bPush) {
        // One walks into the other: they're stopped (and, pushing long enough, slip past).
        const [p, dir] = aPush ? [a, side] : [b, -side];
        p.pushT += DT;
        p.bumped = true;
        if (p.pushT >= BUMP.passAfter) {
          p.ghost = true;
          continue;
        }
        moveX(world, st, p, -dir * overlap);
        if (Math.sign(p.vx) === dir) p.vx = 0;
      } else {
        // Both (or neither) pushing: they ease apart.
        const d = Math.min(overlap / 2, aPush ? overlap / 2 : BUMP.settle * DT);
        moveX(world, st, a, -side * d);
        moveX(world, st, b, side * d);
      }
    }
  }
  for (const f of world.fighters) {
    if (!f.bumped) f.pushT = 0;
    f.bumped = false;
    if (!touching.has(f) && f.dash <= 0) f.ghost = false;
  }
}

// A player who disconnects mid-match is out; the match carries on without them.
export function removeFighter(world, id) {
  const f = world.fighters[id];
  if (!f) return;
  f.stocks = 0;
  f.state = 'out';
}

export const center = (f) => ({ x: f.x, y: f.y - F.h / 2 });
const low = (f) => f.crouching || f.blocking === 'crouch';
export const aimOrigin = (f) => ({ x: f.x, y: f.y - (low(f) ? (f.tucked ? 8 : 14) : 22) });
// (A view's fighter has the animal's name instead of its index, and null for none.)
export const morphed = (f) => f.cat > 0 || (f.animal ?? -1) !== -1;
export const bodyHeight = (f) => (morphed(f) ? F.morphH : low(f) ? (f.tucked ? F.tuckH : F.crouchH) : F.h);
// Where the gun is held: chest, waist or shoulder by its weight (see HOLD), lower when crouched.
// Tucked behind cover, the gun is held up over it (a big gun can't be; see COVER).
export const gunOrigin = (f) => ({ x: f.x, y: f.tucked && !GUNS[f.gun]?.noCover ? f.y - TILE - COVER.gunOver : f.y - bodyHeight(f) * HOLD[GUNS[f.gun]?.holdAt ?? GUNS[f.gun]?.weight ?? 'light'] });
// The head: the top of the body, as tall as HEADSHOT.height standing, shorter when crouched.
const headBottom = (v) => bodyRect(v).y + (HEADSHOT.height * bodyHeight(v)) / F.h;

// Is low cover right beside this fighter, on the same floor?
function besideCover(world, f) {
  const half = F.w / 2;
  return world.standing.some((b) => {
    if (!(b.cover || b.lowCover) || Math.abs(b.y + b.h - f.y) > 1) return false;
    const gapRight = b.x - (f.x + half);
    const gapLeft = f.x - half - (b.x + b.w);
    return (gapRight >= 0 && gapRight <= F.tuckReach) || (gapLeft >= 0 && gapLeft <= F.tuckReach);
  });
}

// --- Collision helpers ------------------------------------------------------------------------

// Everything solid right now: blocks, spike walls, standing barrels.
export function solids(world, st = getStage(world.stage)) {
  const out = [];
  for (const b of world.live ?? st.blocks) if (!b.oneWay) out.push(b);
  for (const s of st.spikes) out.push(spikeBase(s));
  for (const b of world.barrels) if (!b.gone) out.push(barrelRect(b));
  return out;
}

// A spike wall is a solid column with spikes on its `face` side; a spike floor (`up`) is a solid
// row with the spikes standing on top of it.
const spikeBase = (s) => (s.up ? { x: s.x, y: s.y + TILE, w: s.width * TILE, h: TILE } : { x: s.x, y: s.y, w: TILE, h: s.height * TILE });
const spikeZone = (s) =>
  s.up ? { x: s.x, y: s.y, w: s.width * TILE, h: TILE + 2 } : { x: s.face > 0 ? s.x + TILE : s.x - SPIKES.depth, y: s.y, w: SPIKES.depth + 2, h: s.height * TILE };

const barrelRect = (b) => ({ x: b.x - BARREL.w / 2, y: b.y - BARREL.h, w: BARREL.w, h: BARREL.h, barrel: b });
// The hurtbox: same for every animation, shorter while crouching.
const bodyRect = (f) => ({ x: f.x - F.w / 2, y: f.y - bodyHeight(f), w: F.w, h: bodyHeight(f) });

// First thing a segment from a to b hits, as a fraction t of the way (0..1), or null.
export function segmentHitsRect(ax, ay, bx, by, r) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [
    [-dx, ax - r.x],
    [dx, r.x + r.w - ax],
    [-dy, ay - r.y],
    [dy, r.y + r.h - ay],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return null;
    }
  }
  return t0;
}

// throughCover: low cover doesn't count (shots wear it down, so it's worth shooting through).
export function lineOfSight(world, ax, ay, bx, by, throughCover = false) {
  if (inCloud(world, bx, by) || inCloud(world, ax, ay)) return false;
  return !solids(world).some((r) => !(throughCover && (r.cover || r.lowCover)) && segmentHitsRect(ax, ay, bx, by, r) !== null);
}

// Is there floor (solid or thin, or a standing barrel) below this point within `depth`? Spikes
// don't count.
export function groundBelow(world, x, y, depth) {
  const st = getStage(world.stage);
  for (const r of [...(world.live ?? st.blocks), ...world.barrels.filter((b) => !b.gone).map(barrelRect)]) {
    if (x >= r.x && x <= r.x + r.w && r.y >= y && r.y <= y + depth) return true;
  }
  return false;
}

// --- Fighters ---------------------------------------------------------------------------------

function takePresses(f, input) {
  const press = {};
  for (const k of ['jp', 'sp', 'mp', 'dp', 'rp', 'hp', 'ep', 'gp', 'xp', 'cp', 'kp']) {
    press[k] = (input[k] ?? 0) !== f.seen[k];
    f.seen[k] = input[k] ?? 0;
  }
  return press;
}

function updateFighter(world, st, f, input, canAct) {
  const press = takePresses(f, input);
  // (The direction held, even while stunned: what bends a launch; see DI in hit.)
  f.heldX = Math.sign(input.mx ?? 0);
  f.heldY = input.down ? 1 : input.up ? -1 : 0;
  const blockPressed = !!input.block && !f.blockHeldRaw;
  f.blockHeldRaw = !!input.block;
  if (f.state === 'dead') {
    f.respawn -= DT;
    if (f.respawn <= 0) respawn(world, st, f);
    return;
  }
  if (f.state !== 'ok') return;

  f.hitstun = Math.max(0, f.hitstun - DT);
  f.invincible = Math.max(0, f.invincible - DT);
  // (No refilling while running.)
  if (f.run < 0) f.stamina = Math.min(1, f.stamina + DT / DASH.recharge);
  f.dash = Math.max(0, f.dash - DT);
  f.dodge = Math.max(0, f.dodge - DT);
  f.fireCd = Math.max(0, f.fireCd - DT);
  f.flash = Math.max(0, f.flash - DT);
  f.muzzle = Math.max(0, f.muzzle - DT);
  f.slip = Math.max(0, f.slip - DT);
  f.haste = Math.max(0, f.haste - DT);
  f.rested = Math.max(0, f.rested - DT);
  if (f.sleep > 0) {
    // Asleep: mashing moves wakes you early (see SLEEP).
    if (canAct) shakeMoves(f, input, press);
    if ((f.sleep -= DT) <= 0 || (f.shake >= 1 && SLEEP.time - f.sleep >= SLEEP.min)) wake(world, f);
  }
  if (morphed(f)) morphTick(world, f);
  if (f.drowsy > 0) drowsyTick(world, f, canAct && f.hitstun <= 0 ? input : NEUTRAL, canAct && f.hitstun <= 0 ? press : {});
  if (f.drop > 0) f.drop -= DT;
  if (f.hitstun <= 0) f.stunned = false;
  if (f.blockDrop >= 0) {
    f.blockDrop += DT;
    if (f.blockDrop >= BLOCK.dropFrames / BLOCK.dropFps) f.blockDrop = -1;
  }
  if (f.reload > 0) {
    f.reload -= DT;
    if (f.reload <= 0) {
      f.reload = 0;
      f.ammo = GUNS[f.gun].magazineSize;
      f.spareMags--;
    }
  }
  if (f.pendingLaunch) {
    // Frozen in place by a 100% keyboard word... then launched.
    const pl = f.pendingLaunch;
    pl.left -= DT;
    f.vx = 0;
    f.vy = 0;
    f.stunned = true;
    f.hitstun = Math.max(f.hitstun, pl.left + DT);
    // The breaker: block, with half a stamina bar, breaks the freeze before the launch.
    if (blockPressed && f.stamina >= BREAKER.cost) return breakFree(world, f);
    if (pl.left > 0) return;
    f.pendingLaunch = null;
    using(pl.with ?? null);
    hit(world, f, 0, pl.dx, pl.dy, pl.base, pl.growth, pl.by);
    world.events.push({ type: 'launch', id: f.id, x: f.x, y: f.y - F.h / 2 });
  }
  const control = canAct && f.hitstun <= 0 && f.sleep <= 0;
  const p = control ? press : {};
  const inp = control ? input : NEUTRAL;

  if (f.hidden >= 0) {
    // Hidden in a doorway: the only option is to come out (hide again, jump or move).
    if (!(control && (p.hp || p.jp || p.dp || inp.mx !== 0))) {
      f.vx = 0;
      f.vy = 0;
      return;
    }
    f.hidden = -1;
    world.events.push({ type: 'unhide', id: f.id, x: f.x, y: f.y });
  } else if (control && p.hp && !inp.crouch && !morphed(f)) {
    hide(world, st, f);
  }
  let ip = inp;
  let pp = p;
  if (f.animal >= 0) {
    // An animal: walks and jumps (and drops through thin floors), nothing else.
    ip = { ...NEUTRAL, mx: inp.mx, jump: inp.jump, down: inp.down, ax: inp.ax, ay: inp.ay };
    pp = { jp: p.jp, dp: p.dp };
  } else if (f.cat) {
    if (p.gp) {
      // The grenade button (the ring's): back to yourself.
      unmorph(world, f);
      pp = { ...p, gp: false };
    } else if (p.sp || p.mp || p.kp) unmorph(world, f); // (an attack: back to yourself, and it comes out)
    else {
      // A cat runs, jumps and dashes (and drops through thin floors).
      ip = { ...inp, shoot: false, meleeHeld: false, grenadeHeld: false, block: false, crouch: false };
      pp = { jp: p.jp, dp: p.dp, xp: p.xp };
    }
  }
  if (control && pp.ep) pickUp(world, f, inp.touch);
  // The Ring of Cat (in the grenade slots): the grenade button turns you into a cat.
  if (control && pp.gp && f.ring > 0 && !morphed(f) && !f.grenades.length && f.cook < 0) {
    becomeCat(world, f);
    pp = { ...pp, gp: false };
  }
  // (The trigger catches a returning gun too, instead of firing.)
  if (control && pp.sp && catchGun(world, f)) pp.sp = false;
  // Cycle grenades: the next one to throw goes to the back.
  if (control && pp.cp && f.grenades.length > 1) {
    f.grenades.push(f.grenades.shift());
    world.events.push({ type: 'swap', id: f.id, x: f.x, y: f.y - F.h });
  }
  if (f.active === 'gun' && !f.hasGun) f.active = 'melee';

  move(world, f, ip, pp, control);
  useGun(world, f, ip, pp);
  useMelee(world, f, ip, pp);
  useGrenade(world, f, ip, pp, control);

  const preVx = f.vx;
  const preVy = f.vy;
  const wasGrounded = f.grounded;
  // A black hole drags you in.
  holePull(world, f);
  moveX(world, st, f, f.vx * DT);
  moveY(world, st, f, f.vy * DT);
  if (f.hitstun > 0) {
    // Slammed into the floor or a wall while tumbling: bounce instead of stopping dead.
    if (f.grounded && preVy > 300) {
      f.vy = -preVy * 0.45;
      f.grounded = false;
      world.events.push({ type: 'dust', x: f.x, y: f.y });
    }
    if (f.vx === 0 && Math.abs(preVx) > 200) f.vx = -preVx * 0.5;
  }
  if (f.grounded && !wasGrounded) world.events.push({ type: 'dust', x: f.x, y: f.y });
  f.walk = f.grounded && Math.abs(f.vx) > 10 ? f.walk + (DT * Math.abs(f.vx)) / 12 : 0;
}

function move(world, f, input, press, control) {
  // A swing that hit can be cut short with a jump or a dash (a combo cancel).
  if (control && f.swing >= 0 && f.swingLanded && (press.jp || press.xp)) f.swing = -1;
  f.freeDash = Math.max(0, f.freeDash - DT);
  f.slimed = f.grounded && inSlime(world, f);
  const glued = f.grounded && (f.onGlue || f.slimed);
  if (glued) {
    // Stuck to a glued floor: no jumping off it (only walking off).
    f.coyote = 0;
    f.jumpsLeft = 0;
  }
  if (f.grounded && !glued) {
    f.coyote = F.coyote;
    f.jumpsLeft = F.airJumps + (f.rune ? ITEMS[f.rune].rune.airJumps ?? 0 : 0);
    f.fastFall = false;
  } else {
    f.coyote = Math.max(0, f.coyote - DT);
  }
  // Down twice quickly on a thin platform drops through it; down in the air falls fast (further below).
  f.downTap = Math.max(0, f.downTap - DT);
  if (control && press.dp) {
    if (f.downTap > 0 && f.grounded && f.onThin) {
      f.drop = F.dropTime;
      f.grounded = false;
      f.downTap = 0;
    } else {
      f.downTap = F.doubleTap;
    }
  }
  // Down held and jump, on a thin platform: drop through it too, instead of jumping.
  const downJump = control && press.jp && input.down && f.grounded && f.onThin;
  if (downJump) Object.assign(f, { drop: F.dropTime, grounded: false, downTap: 0 });
  f.buffer = press.jp && !downJump ? F.jumpBuffer : Math.max(0, f.buffer - DT);

  // Dash: the dodge button, paid for from the stamina bar (half of it). A shove the way you hold (backwards if you
  // hold nothing), untouchable at the start. DI: holding up or down tilts it by `DASH.di` degrees
  // (on the ground, only up: a hop; down there is crouching).
  if (control && press.xp && (f.stamina >= DASH.cost || f.freeDash > 0) && f.dash <= 0 && f.swing < 0 && !f.chain && !glued) {
    const dir = Math.sign(input.mx) || -f.facing;
    const tilt = f.heldY < 0 || (f.heldY > 0 && !f.grounded) ? (f.heldY * DASH.di * Math.PI) / 180 : 0;
    f.vx = dir * DASH.speed * Math.cos(tilt);
    if (tilt) {
      f.vy = DASH.speed * Math.sin(tilt);
      if (f.vy < 0) f.grounded = false;
    } else if (!f.grounded) f.vy = Math.min(f.vy, 0) * 0.3;
    // (A free dash, earned by landing a hit, costs no stamina.) On the ground, it can turn into a run.
    Object.assign(f, { dash: DASH.time, dodge: DASH.iframes, stamina: f.freeDash > 0 ? f.stamina : f.stamina - DASH.cost, freeDash: 0, run: -1, runFrom: f.grounded ? dir : 0 });
    world.events.push({ type: 'dodge', id: f.id, x: f.x, y: f.y, dir });
  }

  // Crouch: hold crouch on the ground. Block: hold block on the ground (crouched or standing).
  // Neither lets you walk; letting go of block starts the drop, when parries happen.
  const wasBlocking = f.blocking;
  f.crouching = control && f.grounded && input.crouch && f.dash <= 0 && (f.swing < 0 || f.swingStance === 'crouch');
  // (Holding the trident's chain, or mid-dash, you can't block.)
  f.blocking = control && f.grounded && input.block && f.swing < 0 && !f.chain && f.dash <= 0 ? (f.crouching ? 'crouch' : 'stand') : null;
  f.tucked = low(f) && besideCover(world, f);
  if (wasBlocking && !f.blocking && control) {
    f.blockDrop = 0;
    f.dropStance = wasBlocking;
  }
  if (f.blocking) f.blockDrop = -1;

  // Ground swings root you in place; air swings keep your drift. Holding the trident's chain
  // roots you too.
  const rooted = (f.swing >= 0 && f.grounded && !f.swingRunning) || f.crouching || f.blocking !== null || !!f.chain;
  // (Slapped with the fish: any floor is ice for a while.)
  const icy = f.onIce || f.slip > 0;
  const dir = rooted ? 0 : Math.sign(input.mx);
  // Running (RUN): starts as a dash on the ground ends with that way still held; ends on letting
  // go, turning, crouching, blocking, a rooted swing or a hit, or with the stamina bar, which it
  // drains once its free time's up.
  if (f.dash <= 0 && f.runFrom) {
    if (control && dir === f.runFrom) {
      Object.assign(f, { run: 0, runDir: dir });
      world.events.push({ type: 'run', id: f.id, x: f.x, y: f.y, dir });
    }
    f.runFrom = 0;
  }
  if (f.run >= 0) {
    // (Stopped dead by a wall on the ground: over too.)
    const blocked = f.grounded && f.run > 0.15 && Math.abs(f.vx) < 30;
    if (!control || dir !== f.runDir || f.crouching || f.blocking || f.hitstun > 0 || blocked) f.run = -1;
    else {
      f.run += DT;
      if (f.run > RUN.free) f.stamina -= RUN.drain * DT;
      if (f.stamina <= 0) Object.assign(f, { stamina: 0, run: -1 });
    }
  }
  if (f.dash > 0) {
    // Mid-dash: carried by the shove.
  } else if (dir !== 0) {
    const accel = f.grounded ? F.groundAccel * (icy ? ICE.accel : 1) : F.airAccel;
    const speed = f.run >= 0 ? RUN.speed : F.runSpeed;
    f.vx = approach(f.vx, dir * speed * speedOf(world, f, glued) + windDrift(world, f), accel * DT);
  } else {
    const drag = f.inHole ? 0 : f.grounded ? F.groundFriction * (icy ? ICE.friction : 1) : f.hitstun > 0 ? F.hitstunAirDrag : F.airFriction;
    f.vx = approach(f.vx, windDrift(world, f), drag * DT);
  }

  // Face where you aim; with no aim, face where you walk.
  if (control) {
    const len = Math.hypot(input.ax, input.ay);
    if (len > 0.1) {
      f.aimX = input.ax / len;
      f.aimY = input.ay / len;
    } else {
      f.aimX = f.facing;
      f.aimY = 0;
    }
    if (Math.abs(f.aimX) > 0.1) f.facing = f.aimX > 0 ? 1 : -1;
    else if (dir !== 0) f.facing = dir;
  }

  if (control && f.buffer > 0 && !rooted) {
    if (f.coyote > 0) {
      f.vy = -JUMP_SPEED;
      f.grounded = false;
      f.coyote = 0;
      f.buffer = 0;
      f.cutting = true;
      world.events.push({ type: 'dust', x: f.x, y: f.y });
    } else if (f.jumpsLeft > 0) {
      f.vy = -AIR_JUMP_SPEED;
      f.jumpsLeft--;
      f.buffer = 0;
      f.cutting = true;
      f.fastFall = false;
      world.events.push({ type: 'airjump', x: f.x, y: f.y });
    }
  }
  if (f.cutting && (f.vy >= 0 || !control)) f.cutting = false;
  if (f.cutting && !input.jump) {
    f.vy *= F.jumpCut;
    f.cutting = false;
  }

  // Down in the air: fall fast.
  if (control && press.dp && !f.grounded && f.vy > -100) f.fastFall = true;

  // Launched fighters use the lighter rising gravity, so big hits carry them far.
  const g = f.inHole ? 0 : GRAVITY * (f.vy > 0 && f.hitstun <= 0 ? F.fallGravityMul : 1);
  const cap = f.hitstun > 0 ? F.hitstunMaxFall : F.maxFall;
  if (f.fastFall) f.vy = Math.max(f.vy, F.fastFall);
  else f.vy = Math.min(f.vy + g * DT, Math.max(cap, f.vy));
}

// How fast you can run right now, as a share of the normal speed: some big guns slow you while you
// fire them; glue slows everyone; so do carrying the anvil, spinning the morning star and walking
// on someone else's paint. A bite of carrot speeds you up.
function speedOf(world, f, glued) {
  const m = f.melee ? MELEE[f.melee] : null;
  let k = f.hasGun && f.fireCd > 0 ? GUNS[f.gun].slowWhileFiring ?? 1 : 1;
  if (glued) k *= GLUE.slow;
  if (f.drowsy > 0) k *= 1 - DROWSY.slow;
  if (f.cat) k *= CAT.speed;
  if (m?.carrySlow) k *= m.carrySlow;
  if (m?.spin && f.holding >= m.spin.after) k *= m.spin.slow;
  // (Winding up the club: slower and slower, down to `power.slow` when it's full.)
  if (m?.power?.slow && f.holding >= 0) k *= 1 - (1 - m.power.slow) * Math.min(1, f.holding / m.power.time);
  if (f.haste > 0) k *= MELEE.carrot.eat.speed;
  if (f.rune) k *= ITEMS[f.rune].rune.speed ?? 1;
  if (f.grounded && onPaint(world, f)) k *= MELEE.roller.heavyStats.paint.slow;
  return k;
}

// Is this fighter standing on paint someone else rolled?
const onPaint = (world, f) => (world.paints ?? []).some((p) => p.owner !== f.id && Math.abs(p.y - f.y) < 1 && f.x >= p.x1 && f.x <= p.x2);

function moveX(world, st, f, dx) {
  f.x += dx;
  const half = F.w / 2;
  for (const r of solids(world, st)) {
    if (f.y <= r.y || f.y - F.h >= r.y + r.h) continue;
    if (f.x + half <= r.x || f.x - half >= r.x + r.w) continue;
    // A low ledge is stepped up onto instead of walked into.
    const rise = f.y - r.y;
    if (rise > 0 && rise <= (f.grounded ? F.stepUp : 0) && !r.barrel) {
      f.y = r.y;
      continue;
    }
    f.x = dx > 0 || (dx === 0 && f.x < r.x + r.w / 2) ? r.x - half : r.x + r.w + half;
    f.vx = 0;
  }
}

function moveY(world, st, f, dy) {
  const prevBottom = f.y;
  const prevTop = f.y - F.h;
  const half = F.w / 2;
  f.y += dy;
  f.grounded = false;
  f.onThin = false;
  f.onIce = false;
  f.onGlue = false;
  const thins = (world.live ?? st.blocks).filter((b) => b.oneWay);
  // (slack: how far a moving platform rose this tick, so it still catches feet it rose past.)
  for (const r of solids(world, st)) {
    if (f.x + half <= r.x || f.x - half >= r.x + r.w) continue;
    if (dy >= 0 && prevBottom <= r.y + 0.01 + (r.slack ?? 0) && f.y >= r.y) {
      f.y = r.y;
      f.vy = Math.min(f.vy, 0);
      f.grounded = true;
      f.onIce = !!r.ice;
      f.onGlue = !!r.glue;
    } else if (dy < 0 && prevTop >= r.y + r.h - 0.01 && f.y - F.h < r.y + r.h) {
      f.y = r.y + r.h + F.h;
      f.vy = 0;
    }
  }
  if (f.drop > 0 || f.grounded) return;
  for (const r of thins) {
    if (f.x + half <= r.x || f.x - half >= r.x + r.w) continue;
    if (dy >= 0 && prevBottom <= r.y + 0.01 + (r.slack ?? 0) && f.y >= r.y) {
      f.y = r.y;
      f.vy = Math.min(f.vy, 0);
      f.grounded = true;
      f.onThin = true;
      f.onIce = !!r.ice;
      f.onGlue = !!r.glue;
    }
  }
}

// --- Gun --------------------------------------------------------------------------------------

function useGun(world, f, input, press) {
  if (f.blocking || f.chain) return; // (the trident out on its chain: holding it)
  // (A shot pressed mid-swing comes out once the swing is over, or cut short: see useMelee.)
  if (f.hasGun && f.swing >= 0 && press.sp) Object.assign(f, { queued: 'sp', queuedT: COMBO.buffer });
  if (f.hasGun && f.swing < 0 && f.queued === 'sp') {
    press = { ...press, sp: true };
    f.queued = null;
  }
  if (!f.hasGun || f.swing >= 0) {
    // Nothing in the gun slot: the shoot button punches (or swings the melee weapon).
    if (!f.hasGun && press.sp) press.mp = true;
    return;
  }
  const g = GUNS[f.gun];
  const empty = f.ammo === 0 && f.reload <= 0 && sparesOf(f) > 0;
  // An empty gun reloads by itself, including after a swing or a hit interrupted the reload.
  if ((press.rp || empty) && f.reload <= 0 && sparesOf(f) > 0 && f.ammo < g.magazineSize) {
    f.reload = g.reloadTime;
    world.events.push({ type: 'reload', id: f.id, x: f.x, y: f.y });
  }
  // (In the banner's melee-only zone guns don't fire.)
  if (inHaven(world, f.x)) {
    if (press.sp) world.events.push({ type: 'jam', id: f.id, x: f.x, y: f.y - 20 });
    f.gunHold = -1;
    return;
  }
  if (f.ammo === 0 && sparesOf(f) === 0) return windUpGunThrow(world, f, input, press);
  // (Too big to fire from behind cover.)
  if (f.tucked && g.noCover) {
    if (press.sp) world.events.push({ type: 'toobig', id: f.id, x: f.x, y: f.y - 20 });
    f.gunHold = -1;
    return;
  }
  if (g.charge) return chargeGun(world, f, g, input, press);
  const pull = press.sp || (g.automatic && input.shoot);
  if (!pull || f.reload > 0 || f.fireCd > 0) return;
  if (f.ammo > 0) fire(world, f, g);
}

// The spare magazines this fighter can use with the gun in hand: their own, unless the gun takes
// no spares (a single-magazine gun: the Golden Gun).
export const sparesOf = (f) => (f.gun && GUNS[f.gun].magazines > 1 ? f.spareMags : 0);

// Out of ammo for good: a tap just clicks (you can keep the empty gun); holding the trigger winds up
// a throw (GUN_THROW.hold s), and letting go once it's ready throws it. A hit loses the wind-up.
function windUpGunThrow(world, f, input, press) {
  if (f.hitstun > 0) f.gunHold = -1;
  if (press.sp) {
    Object.assign(f, { gunHold: 0, active: 'gun' });
    world.events.push({ type: 'dry', id: f.id, x: f.x, y: f.y - 20 });
  }
  if (f.gunHold < 0) return;
  if (input.shoot) {
    f.gunHold += DT;
    return;
  }
  const ready = f.gunHold >= GUN_THROW.hold;
  f.gunHold = -1;
  if (ready) throwGun(world, f);
}

// Guns you hold to charge (the bow's draw, the railgun): press to start, let go to fire. The bow
// fires at whatever draw it has (at least `charge.min`); the railgun only fully charged. A hit
// loses the charge.
function chargeGun(world, f, g, input, press) {
  if (f.hitstun > 0) f.gunHold = -1;
  // (Starting to charge puts the gun in hand, so it's seen charging: not just once it fires.)
  if (press.sp) {
    if (f.reload <= 0 && f.fireCd <= 0 && f.ammo > 0) Object.assign(f, { gunHold: 0, active: 'gun' });
  }
  if (f.gunHold < 0) return;
  if (input.shoot) {
    f.gunHold += DT;
    return;
  }
  const power = Math.min(1, f.gunHold / g.charge.time);
  f.gunHold = -1;
  if (g.charge.full && power < 1) return;
  fire(world, f, g, Math.max(g.charge.min ?? 0, power));
}

// power: how charged the shot is (the bow's draw), 0..1.
function fire(world, f, g, power = 1) {
  f.active = 'gun';
  if (!world.infiniteAmmo) f.ammo--;
  f.fireCd = g.fireInterval;
  f.muzzle = 0.05;
  const o = gunOrigin(f);
  // The muzzle: along the aim, then off the aim line by the gun's drop (mirrored aiming left,
  // where the sprite is flipped).
  const side = f.aimX < 0 ? -1 : 1;
  const mx = o.x + f.aimX * g.muzzle - f.aimY * g.muzzleDrop * side;
  const my = o.y + f.aimY * g.muzzle + f.aimX * g.muzzleDrop * side;
  world.events.push({ type: 'shoot', id: f.id, x: mx, y: my, dir: -f.facing, gun: f.gun });
  if (!f.grounded) {
    f.vx -= f.aimX * g.recoil;
    f.vy -= f.aimY * g.recoil;
  }
  if (f.ammo === 0 && sparesOf(f) > 0) {
    f.reload = g.reloadTime;
    world.events.push({ type: 'reload', id: f.id, x: f.x, y: f.y });
  }
  // Muzzle jammed into a wall: the shot stops there. (Into a barrel or cover: like someone right up
  // against you, it starts from your shoulder, so it hits them.)
  let blocked = null;
  let against = false;
  for (const r of solids(world)) {
    const t = segmentHitsRect(o.x, o.y, mx, my, r);
    if (t === null) continue;
    if (r.barrel || r.cover || r.lowCover) against = true;
    else if (!blocked || t < blocked) blocked = t;
  }
  if (g.beam) return railBeam(world, f, g, o.x, o.y);
  if (blocked !== null) {
    const at = { x: o.x + (mx - o.x) * blocked, y: o.y + (my - o.y) * blocked };
    if (g.jackpot) return cashBurst(world, at, g.jackpot, f.id);
    if (g.explode) {
      using(f.gun);
      blast(world, at, g.explode, f.id);
    }
    else world.events.push({ type: 'spark', x: at.x, y: at.y, dx: -f.aimX, dy: -f.aimY });
    return;
  }
  // Someone right up against you, inside the barrel's reach: the shot starts from your shoulder,
  // so point-blank shots land instead of starting past them.
  const pointBlank = against || world.fighters.some((v) => v !== f && v.state === 'ok' && v.hidden < 0 && segmentHitsRect(o.x, o.y, mx, my, bodyRect(v)) !== null);
  const sx = pointBlank ? o.x : mx;
  const sy = pointBlank ? o.y : my;
  const spreadDegrees = spreadOf(f, g);
  // Every shot fired crouched drains stamina, paid for or not: hold the trigger and the bar stays
  // empty (and the aim loose); let it refill to get the steady aim back.
  if (f.grounded && low(f) && !g.steadySpread) f.stamina = Math.max(0, f.stamina - STAMINA.crouchShot);
  // Shotgun: its pellets share a count of hits on each person (see shotHits).
  const volley = g.knockbackShare ? { need: Math.floor(g.pellets * g.knockbackShare) + 1, hits: {} } : null;
  for (let n = 0; n < g.pellets; n++) {
    const spread = ((world.rng() * 2 - 1) * spreadDegrees * Math.PI) / 180;
    const c = Math.cos(spread);
    const s = Math.sin(spread);
    const dx = f.aimX * c - f.aimY * s;
    const dy = f.aimX * s + f.aimY * c;
    let [speed, damage, kb, growth, light, look] = [g.bulletSpeed, g.damage, g.knockback, g.knockbackGrowth, g.weight === 'light', f.gun];
    if (g.cash) {
      // Make It Rain: each shot is a coin, a bill, a gold coin or (rarely) a diamond.
      const cash = pickCash(world);
      [speed, damage, kb, growth, light, look] = [speed * (cash.speedMul ?? 1), cash.damage, cash.knockback ?? 0, cash.knockbackGrowth ?? 0, !cash.knockback, cash.look];
    }
    if (g.charge) {
      // The bow: a short draw is slower and weaker, and only a long one pushes.
      [speed, damage, light] = [speed * (0.4 + 0.6 * power), damage * power, power < g.charge.heavyAt];
    }
    // (The crystal ball: shots home in, but hit for less.)
    if (f.homing > 0) damage *= ITEMS.crystal.homing.damage;
    world.bullets.push({
      id: world.nextBullet++, owner: f.id, gun: f.gun, x: sx, y: sy, x0: sx, y0: sy, born: world.tick, vx: dx * speed, vy: dy * speed - (g.lift ?? 0), gravity: g.gravity ?? 0, life: g.bulletRange / speed, thrown: false,
      damage, kb, growth, light, explode: g.explode ?? null, bounces: g.bounces ?? 0, grow: g.bounceGrowth ?? 0, size: 1, look, volley,
      pierce: g.pierce ? [] : null, sleep: !!g.sleep, burn: g.burn ?? 0, stick: !!g.stick, hops: g.hops ?? 0, spore: g.spore ?? null, jackpot: g.jackpot ?? null, homing: f.homing > 0,
    });
  }
}

// How wide a gun sprays right now (degrees each side): steadiest crouched, then standing still,
// shakier on the move, worst in the air. Works on a view's fighter too (for the crosshair), where
// `walk` says whether they're moving.
export function spreadOf(f, g = GUNS[f.gun]) {
  const a = ACCURACY;
  if (!g) return 0;
  if (g.steadySpread) return g.spreadDegrees * a.still;
  if (!f.grounded) return g.spreadDegrees * a.air + a.airExtra;
  // (Running: as shaky as in the air. f.running: the same, for a fighter as drawn.)
  if (f.run >= 0 || f.running) return g.spreadDegrees * a.run + a.runExtra;
  // Crouched: steadiest, as long as there's stamina to pay for the shot (see fire).
  if (low(f)) return f.stamina >= STAMINA.crouchShot ? g.spreadDegrees * a.crouch : g.spreadDegrees * a.still;
  const moving = f.vx !== undefined ? Math.abs(f.vx) >= 10 : f.walk > 0;
  return moving ? g.spreadDegrees * a.moving + a.movingExtra : g.spreadDegrees * a.still;
}

// Out of ammo for good: the gun itself is thrown, tumbling (drawn as that gun).
function throwGun(world, f) {
  const t = GUN_THROW;
  const o = gunOrigin(f);
  f.hasGun = false;
  // (A light gun comes back to you, boomerang-style; see comeBack.)
  const back = GUNS[f.gun].weight === 'light' && !GUNS[f.gun].heavyThrow ? { phase: 'out', t: 0 } : null;
  // (recover: where it stops, it lands on the floor as a pickup: an empty gun.)
  world.bullets.push({ id: world.nextBullet++, owner: f.id, kind: f.gun, x: o.x, y: o.y, x0: o.x, y0: o.y, born: world.tick, vx: f.aimX * t.speed, vy: f.aimY * t.speed - 60, gravity: t.gravity, life: 1.5, thrown: true, recover: true, ammo: 0, damage: t.damage, kb: t.knockback, growth: t.knockbackGrowth, back });
  f.gun = null;
}

// A thrown light gun bouncing back off an enemy: it arcs toward its thrower, aimed afresh each tick
// to reach them `GUN_THROW.back` s after it turned round, for them to catch (pick up; see pickUp).
// Not caught, it falls on past them and lands on the floor. Coming back it can't hurt anyone.
function comeBack(world, b, walls) {
  const t = GUN_THROW;
  const f = world.fighters[b.owner];
  b.back.t += DT;
  const left = t.back - b.back.t;
  if (f?.state === 'ok') {
    const c = center(f);
    if (left > 0.05) {
      // The arc that lands on them in the time left.
      b.vx = (c.x - b.x) / left;
      b.vy = (c.y - b.y) / left - 0.5 * t.gravity * left;
    }
  }
  b.vy += t.gravity * DT;
  const nx = b.x + b.vx * DT;
  const ny = b.y + b.vy * DT;
  if (walls.some((r) => segmentHitsRect(b.x, b.y, nx, ny, r) !== null) || (b.life -= DT) < -1) {
    dropWeapon(world, b.kind, b.x, b.y, 0);
    return false;
  }
  b.x = nx;
  b.y = ny;
  return true;
}

// Catch your thrown gun as it comes back (the pick-up button): it's yours again, empty, in the gun
// slot (replacing whatever's there now), and it fills your style meter.
function catchGun(world, f) {
  const c = center(f);
  const b = world.bullets.find((x) => x.back?.phase === 'back' && x.owner === f.id && Math.hypot(c.x - x.x, c.y - x.y) <= GUN_THROW.catchReach);
  if (!b) return false;
  world.bullets.splice(world.bullets.indexOf(b), 1);
  Object.assign(f, { gun: b.kind, hasGun: true, ammo: 0, reload: 0, fireCd: 0, gunHold: -1, active: 'gun' });
  addStyle(world, f, STYLE.catch);
  world.events.push({ type: 'catch', id: f.id, x: b.x, y: b.y });
  return true;
}

// Style: add to the meter (it tops out at full).
function addStyle(world, f, amount) {
  if (f.state !== 'ok') return;
  const was = f.style;
  f.style = Math.min(1, f.style + amount);
  if (f.style >= 1 && was < 1) world.events.push({ type: 'stylefull', id: f.id, x: f.x, y: f.y - F.h });
}

// A full style meter reloads your gun on the spot (a full magazine, even an empty-for-good one),
// as soon as there's something to reload: not a special gun, nor a full one.
function styleReload(world, f) {
  const g = f.hasGun && f.gun ? GUNS[f.gun] : null;
  if (!g || g.weight === 'special' || f.ammo >= g.magazineSize) return;
  Object.assign(f, { ammo: g.magazineSize, reload: 0, gunHold: -1, style: 0 });
  world.events.push({ type: 'stylereload', id: f.id, x: f.x, y: f.y - F.h });
}

// Each bullet checks the whole stretch it travels this tick, so fast shots never skip through
// a fighter or a thin wall. Solid cover stops it (or it glances off, if it bounces); thin
// platforms don't. Shots that explode go off where they stop.
function updateBullets(world, st) {
  const walls = solids(world, st);
  world.bullets = world.bullets.filter((b) => {
    if (b.back?.phase === 'back') return comeBack(world, b, walls);
    // The banner's zone: shots and thrown things vanish into it (thrown melee weapons don't).
    if (world.haven && inHaven(world, b.x) && !(b.thrown && MELEE[b.kind])) {
      world.events.push({ type: 'fizzle', x: b.x, y: b.y });
      return false;
    }
    if (b.homing) homeIn(world, b);
    b.vy += b.gravity * DT;
    const nx = b.x + b.vx * DT;
    const ny = b.y + b.vy * DT;
    let best = null;
    let bestT = Infinity;
    for (const r of walls) {
      const t = segmentHitsRect(b.x, b.y, nx, ny, r);
      if (t !== null && t < bestT) [best, bestT] = [r, t];
    }
    for (const v of world.fighters) {
      if (v.id === b.owner || v.state !== 'ok' || v.hidden >= 0 || v.dodge > 0) continue; // bullets fly past hidden and dodging fighters
      if (b.pierce?.includes(v.id)) continue; // (cards and flames go through: once each)
      // (Big shots, the grown star bolts, are easier to hit with.)
      const pad = ((b.size ?? 1) - 1) * 2;
      const body = bodyRect(v);
      const t = segmentHitsRect(b.x, b.y, nx, ny, { x: body.x - pad, y: body.y - pad, w: body.w + pad * 2, h: body.h + pad * 2 });
      // Blocking with the pan: shots from the front ring off it.
      const pan = !!v.blocking && !!v.melee && !!MELEE[v.melee].blocksBullets && !b.thrown && Math.sign(b.vx) === -v.facing;
      const mirror = v.reflects > 0 && !b.thrown;
      if (t !== null && t < bestT) [best, bestT] = [{ fighter: v, pan, mirror }, t];
    }
    // Grenades flying or lying around (never one still in a hand) can be shot to set them off now.
    for (const g of world.grenades) {
      if (!shootable(world, g, b.owner)) continue;
      const r = GRENADE.shotBox;
      const t = segmentHitsRect(b.x, b.y, nx, ny, { x: g.x - r / 2, y: g.y - r / 2, w: r, h: r });
      if (t !== null && t < bestT) [best, bestT] = [{ grenade: g }, t];
    }
    if (best?.grenade) {
      // (The shot stops there; the grenade goes off this tick: see updateGrenades.)
      best.grenade.fuse = 0;
      best.grenade.shotBy = b.owner;
      world.events.push({ type: 'spark', x: best.grenade.x, y: best.grenade.y, dx: -Math.sign(b.vx) || 1, dy: 0 });
      return false;
    }
    if (best) {
      const px = b.x;
      const py = b.y;
      b.x += (nx - b.x) * bestT;
      b.y += (ny - b.y) * bestT;
      const len = Math.hypot(b.vx, b.vy) || 1;
      if (best.cover) damageCover(world, best, b.damage);
      if (b.bounces > 0 && !best.fighter && !best.barrel) {
        // Glance off: flip whichever way it came in through the wall's side.
        b.bounces--;
        const fromSide = px <= best.x || px >= best.x + best.w;
        if (fromSide) b.vx = -b.vx;
        else b.vy = -b.vy;
        if (b.grow) {
          // The star bolt grows with each bounce: faster, bigger, harder.
          b.vx *= b.grow;
          b.vy *= b.grow;
          b.damage *= b.grow;
          b.kb *= b.grow;
          b.growth *= b.grow;
          b.size = (b.size ?? 1) * b.grow;
        }
        b.x -= (nx - px) * 0.01;
        b.y -= (ny - py) * 0.01;
        world.events.push({ type: 'spark', x: b.x, y: b.y, dx: b.vx / len, dy: b.vy / len });
        return true;
      }
      if (best.mirror) {
        // The mirror rune: the shot flies straight back, now the victim's.
        const v = best.fighter;
        v.reflects -= b.damage;
        if (v.reflects <= 0) Object.assign(v, { rune: null, reflects: 0 });
        Object.assign(b, { vx: -b.vx, vy: -b.vy, owner: v.id, life: Math.max(b.life, 0.6), deflected: true });
        b.x += b.vx * DT;
        b.y += b.vy * DT;
        if (b.pierce) b.pierce = [];
        world.events.push({ type: 'ting', id: v.id, x: b.x, y: b.y });
        return true;
      }
      if (best.pan) {
        world.events.push({ type: 'ting', id: best.fighter.id, x: b.x, y: b.y }, { type: 'spark', x: b.x, y: b.y, dx: -b.vx / len, dy: -b.vy / len });
        if (b.explode) blast(world, { x: b.x, y: b.y }, b.explode, b.owner, null, 'explosion', b.gun ?? b.kind);
        return false;
      }
      if (b.explode) {
        blast(world, { x: b.x, y: b.y }, b.explode, b.owner, null, 'explosion', b.gun ?? b.kind);
        return false;
      }
      if (b.jackpot) {
        cashBurst(world, { x: b.x, y: b.y }, b.jackpot, b.owner);
        return false;
      }
      if (b.look === 'slimer' && !best.fighter && !best.barrel) return slimeBounce(world, b, best, px, py);
      if (best.fighter && b.pierce) {
        // Cards and flames: hit them and keep going.
        shotHits(world, best.fighter, b, b.vx / len, b.vy / len);
        b.pierce.push(best.fighter.id);
        world.events.push({ type: 'impact', x: b.x, y: b.y, on: 'body', thrown: false });
        b.x = nx;
        b.y = ny;
        b.life -= DT;
        return b.life > 0;
      }
      if (best.fighter) shotHits(world, best.fighter, b, b.vx / len, b.vy / len);
      else if (best.barrel) damageBarrel(best.barrel, b.damage, b.owner);
      if (b.back && best.fighter) {
        // A thrown light gun that hits an enemy: it bounces off and heads back to its thrower.
        world.events.push({ type: 'impact', x: b.x, y: b.y, on: best.fighter ? 'body' : 'wall', thrown: true, kind: b.kind });
        Object.assign(b.back, { phase: 'back', t: 0 });
        b.x -= (b.vx / len) * 2;
        b.y -= (b.vy / len) * 2;
        return true;
      }
      // An arrow hitting the side of a wall sticks in it: a foothold.
      if (b.stick && !best.fighter && !best.barrel && (px <= best.x || px >= best.x + best.w)) addFoothold(world, b.x, b.y, Math.sign(b.vx));
      if (b.spore) sporePatch(world, b);
      world.events.push({ type: 'impact', x: b.x, y: b.y, on: best.fighter ? 'body' : 'wall', thrown: b.thrown, kind: b.kind ?? null });
      world.events.push({ type: 'spark', x: b.x, y: b.y, dx: -b.vx / len, dy: -b.vy / len });
      if (b.recover) dropWeapon(world, b.kind, b.x - b.vx / len, b.y, b.ammo);
      return false;
    }
    b.x = nx;
    b.y = ny;
    b.life -= DT;
    if (b.life <= 0 && b.explode) blast(world, { x: b.x, y: b.y }, b.explode, b.owner, null, 'explosion', b.gun ?? b.kind);
    if (b.life <= 0 && b.jackpot) cashBurst(world, { x: b.x, y: b.y }, b.jackpot, b.owner);
    if (b.life <= 0 && b.spore) sporePatch(world, b);
    if (b.life <= 0 && b.recover) dropWeapon(world, b.kind, b.x, b.y, b.ammo);
    return b.life > 0;
  });
}

// --- Special shots -----------------------------------------------------------------------------

// The railgun: a beam straight through walls, hitting everyone along it.
function railBeam(world, f, g, sx, sy) {
  const ex = sx + f.aimX * g.bulletRange;
  const ey = sy + f.aimY * g.bulletRange;
  for (const v of world.fighters) {
    if (v === f || v.state !== 'ok' || v.hidden >= 0) continue;
    if (segmentHitsRect(sx, sy, ex, ey, bodyRect(v)) === null) continue;
    using(f.gun);
    hit(world, v, g.damage, f.aimX, f.aimY - 0.2, g.knockback, g.knockbackGrowth, f.id);
  }
  world.events.push({ type: 'beam', id: f.id, x1: sx, y1: sy, x2: ex, y2: ey });
}

// One piece of money, by the odds in CASH.
function pickCash(world) {
  let r = world.rng();
  for (const c of CASH) if ((r -= c.chance) < 0) return c;
  return CASH[0];
}

// The jackpot bursts: everyone near is pushed away (no damage), and money showers out to land
// around (see updateLoot).
function cashBurst(world, at, c, by) {
  blast(world, at, { radius: c.radius, damage: 0, knockback: c.knockback, knockbackGrowth: c.knockbackGrowth }, by, null, 'jackpot', 'jackpot');
  showerCash(world, at, c.pieces);
}

// `pieces` of money flung out from a spot, to land around it.
function showerCash(world, at, pieces) {
  for (let k = 0; k < pieces; k++) {
    const cash = pickCash(world);
    world.loot.push({ id: world.nextLoot++, x: at.x, y: at.y, x0: at.x, y0: at.y, born: world.tick, vx: (world.rng() * 2 - 1) * 170, vy: -140 - world.rng() * 170, look: cash.look, value: cash.damage * LOOT.heal, t: 0, landed: false });
  }
}

// Black holes pull: they speed you up toward their middles (harder near the middle), and inside
// one there's no gravity or floor friction (see move), so it lifts you and drags you along the
// floor. Right at the middle you slow down and hang there. Someone launched fast enough can
// still fly through.
function holePull(world, f) {
  f.inHole = false;
  for (const h of world.holes) {
    const c = center(f);
    const dx = h.x - c.x;
    const dy = h.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d >= h.r || f.state !== 'ok') continue;
    f.inHole = true;
    f.fastFall = false;
    const k = h.pull * (0.6 + 0.4 * (1 - d / h.r)) * DT;
    f.vx += (dx / (d || 1)) * k;
    f.vy += (dy / (d || 1)) * k;
    if (d < 16) {
      f.vx *= 0.88;
      f.vy *= 0.88;
    }
  }
}

// Money falls to the floor, lies there a while (blinking near the end), and heals whoever touches it.
function updateLoot(world, st) {
  const walls = solids(world, st);
  const floors = world.live ?? st.blocks;
  world.loot = world.loot.filter((m) => {
    m.t += DT;
    if (!m.landed) {
      m.vy = Math.min(m.vy + LOOT.gravity * DT, 500);
      const x = m.x + m.vx * DT;
      if (!walls.some((r) => x > r.x && x < r.x + r.w && m.y > r.y && m.y < r.y + r.h)) m.x = x;
      else m.vx = 0;
      const y = m.y + m.vy * DT;
      const floor = m.vy > 0 && floors.find((r) => m.x >= r.x && m.x <= r.x + r.w && m.y <= r.y && y >= r.y);
      // (In a gust it keeps sliding along the floor.)
      if (floor) Object.assign(m, { y: floor.y, landed: !world.wind?.on, vx: world.wind?.on ? m.vx : 0, vy: 0 });
      else m.y = y;
    }
    if (m.y > st.blast.bottom || m.t > LOOT.lie + LOOT.blink) return false;
    const v = m.landed && world.fighters.find((f) => f.state === 'ok' && Math.abs(f.x - m.x) < F.w / 2 + 3 && m.y <= f.y + 1 && m.y >= f.y - bodyHeight(f));
    if (!v) return true;
    v.damage = Math.max(0, v.damage - m.value);
    world.events.push({ type: 'cash', id: v.id, x: m.x, y: m.y - 4, look: m.look });
    return false;
  });
}

// The ammo chests: one on each of the stage's outermost spawn points.
function placeAmmoChests(st) {
  if (!st.spawns?.length || st.bare) return []; // (a bare stage: nothing on it)
  const sorted = [...st.spawns].sort((a, b) => a.x - b.x);
  const ends = sorted.length > 1 ? [sorted[0], sorted[sorted.length - 1]] : [sorted[0]];
  return ends.map((p) => ({ x: p.x, y: p.y, cd: 0 }));
}

// An ammo chest beside you (ready or not), or null.
const ammoChestBy = (world, f) => world.ammoChests.find((c) => Math.abs(c.x - f.x) <= AMMO_CHEST.reach && Math.abs(c.y - f.y) < 4) ?? null;

// Use an ammo chest: your gun filled up (a pistol if you have none), then it's shut a while.
function useAmmoChest(world, f, c) {
  if (c.cd > 0) return;
  if (!f.hasGun || !f.gun) giveGun(f, 'pistol', null, true);
  else {
    const g = GUNS[f.gun];
    const spares = Math.max(f.spareMags, g.magazines - 1);
    if (f.ammo === g.magazineSize && f.spareMags === spares) return; // (nothing to fill)
    Object.assign(f, { ammo: g.magazineSize, spareMags: spares, reload: 0 });
  }
  f.active = 'gun';
  c.cd = AMMO_CHEST.cooldown;
  world.events.push({ type: 'ammo', id: f.id, x: c.x, y: c.y });
}

// Slime landing on a floor leaves a puddle of glue there and hops on (while it has hops left);
// off a wall it bounces back, off a ceiling it drops.
function slimeBounce(world, b, wall, px, py) {
  if (b.vy > 0 && py <= wall.y + 0.5) {
    const x1 = clamp(b.x - SLIME.width / 2, wall.x, wall.x + wall.w);
    const x2 = clamp(b.x + SLIME.width / 2, wall.x, wall.x + wall.w);
    world.puddles.push({ x1, x2, y: wall.y, t: SLIME.time });
    world.events.push({ type: 'splat', x: b.x, y: wall.y });
    if (b.hops-- <= 0) return false;
    Object.assign(b, { y: wall.y - 1, vy: -260, vx: b.vx * 0.7 });
    return true;
  }
  if (px <= wall.x || px >= wall.x + wall.w) Object.assign(b, { x: px, vx: -b.vx * 0.5 });
  else Object.assign(b, { y: py, vy: Math.abs(b.vy) * 0.3 });
  return true;
}

// Standing in slime?
const inSlime = (world, f) => world.puddles.some((p) => Math.abs(p.y - f.y) < 1 && f.x >= p.x1 && f.x <= p.x2);

// About one spore in `spore.every` leaves a small poison patch where it stops.
function sporePatch(world, b) {
  const c = b.spore;
  if (world.rng() * c.every >= 1) return;
  world.clouds.push({ id: world.nextCloud++, kind: 'spore', x: b.x, y: b.y, r: c.radius, t: c.time, by: b.owner, perSecond: c.perSecond });
  const patches = world.clouds.filter((k) => k.kind === 'spore');
  if (patches.length > c.max) world.clouds.splice(world.clouds.indexOf(patches[0]), 1);
}

// An arrow in a wall: a short thin foothold sticking out of it, back toward the shooter.
function addFoothold(world, x, y, dir) {
  world.footholds.push({ x: Math.round(x), y: Math.round(y), dir, t: FOOTHOLD.time });
  if (world.footholds.length > FOOTHOLD.max) world.footholds.shift();
}

// Footholds wear out; the ones still there join the blocks you can stand on (world.live).
function updateFootholds(world, st) {
  world.footholds = world.footholds.filter((h) => (h.t -= DT) > 0);
  const base = st.movers ? world.live : world.standing;
  world.live = world.footholds.length ? [...base, ...world.footholds.map((h) => ({ x: h.dir > 0 ? h.x - FOOTHOLD.width : h.x, y: h.y, w: FOOTHOLD.width, h: 2, oneWay: true, look: 'arrow' }))] : base;
}

// A thrown weapon comes to rest on the floor below where it stopped, as a pickup. Over a pit with
// no floor under it, it's lost.
// ammo: a gun's rounds in its magazine (left out: a full one).
function dropWeapon(world, weapon, x, y, ammo) {
  let floor = null;
  for (const r of world.live ?? getStage(world.stage).blocks) {
    if (x < r.x || x > r.x + r.w || r.y < y - 4) continue;
    if (floor === null || r.y < floor) floor = r.y;
  }
  if (floor === null) return;
  world.pickups.push({ id: world.nextPickup++, x: Math.round(x), y: floor, weapon, ...(ammo !== undefined && GUNS[weapon] ? { ammo, t: 0 } : {}) });
  world.events.push({ type: 'spawn', x, y: floor, weapon });
  if (weapon === 'key') placeChest(world, x);
}

// A shot landing on a fighter. Thrown things hit like a melee blow. A light gun only adds damage;
// a heavy one pushes and stuns. A headshot hurts more and always stuns.
function shotHits(world, v, b, dx, dy) {
  if (b.thrown) return thrownHits(world, v, b, dx, dy);
  // (Fire staff flames set you burning.)
  if (b.burn && v.invincible <= 0 && v.dodge <= 0) Object.assign(v, { burn: Math.max(v.burn, b.burn), burnBy: b.owner });
  const head = b.y < headBottom(v);
  if (head) world.events.push({ type: 'headshot', id: v.id, by: b.owner, x: v.x, y: v.y - bodyHeight(v) });
  // (Style: your shot hit someone, so a melee hit right after is a combo; a headshot fills it too,
  // now and then.)
  const shooter = world.fighters[b.owner];
  if (shooter && shooter !== v && v.invincible <= 0) {
    shooter.gunHitT = STYLE.comboWindow;
    if (head && shooter.styleHeadCd <= 0) {
      addStyle(world, shooter, STYLE.headshot);
      shooter.styleHeadCd = STYLE.headshotCooldown;
    }
  }
  const damage = b.damage * (head ? HEADSHOT.damageMul : 1);
  using(b.gun ?? b.kind ?? null);
  if (b.sleep) {
    // The Snoozer: a scratch, then sleep (not if it was dodged).
    const lands = v.state === 'ok' && v.invincible <= 0 && v.dodge <= 0;
    chip(world, v, damage, b.owner);
    if (lands) fallAsleep(world, v);
    return;
  }
  if (b.light && !head) return chip(world, v, damage, b.owner);
  if (b.volley) {
    // A shotgun pellet: only the hit that takes this shot past half its pellets pushes and stuns.
    const n = (b.volley.hits[v.id] = (b.volley.hits[v.id] ?? 0) + 1);
    if (n !== b.volley.need) return chip(world, v, damage, b.owner);
  }
  const kb = b.light ? HEADSHOT.knockback : b.kb;
  const growth = b.light ? HEADSHOT.knockbackGrowth : b.growth;
  using(b.gun ?? b.kind ?? null);
  hit(world, v, damage, dx, dy - 0.2, kb, growth, b.owner);
}

// A thrown weapon landing on someone hits like a melee blow, with the weapon's own on-hit effects
// where they make sense: the fish's slap, the knife's backstab, the keyboard's word (a smash).
function thrownHits(world, v, b, dx, dy) {
  const m = b.kind ? MELEE[b.kind] : null;
  const behind = v.facing === Math.sign(b.vx);
  const back = m?.backstab && behind ? m.backstab : null;
  if (back) world.events.push({ type: 'backstab', id: v.id, x: v.x, y: v.y - bodyHeight(v) });
  if (m?.smash) world.events.push({ type: 'word', id: b.owner, x: v.x, y: v.y - bodyHeight(v), text: keyboardSmash(world, m), scale: 0.25 });
  using(b.gun ?? b.kind ?? null);
  const landed = hit(world, v, b.damage * (back ? back.damageMul : 1), dx, dy - 0.2, back ? back.knockback : b.kb, back ? back.knockbackGrowth : b.growth, b.owner);
  if (landed && m?.slippery) v.slip = m.slippery;
  if (landed && m?.bleed) Object.assign(v, { bleed: m.bleed.time, bleedRate: m.bleed.damage / m.bleed.time, bleedBy: b.owner });
  return landed;
}

// A keyboard smash: 3 to 5 keys in a row off one row of the keyboard.
function keyboardSmash(world, m) {
  const row = m.smash[Math.floor(world.rng() * m.smash.length)];
  const n = 3 + Math.floor(world.rng() * 3);
  const at = Math.floor(world.rng() * (row.length - n + 1));
  return row.slice(at, at + n);
}

// Damage with no push and no stun (light guns, burning, poison).
function chip(world, v, amount, by, quiet = false) {
  if (v.state !== 'ok' || v.invincible > 0 || (v.dodge > 0 && !quiet)) return;
  v.damage = Math.min(999, v.damage + amount);
  if (by >= 0 && by !== v.id) v.lastHitBy = by;
  if (v.drowsy > 0) clearDrowsy(world, v);
  morphHurt(world, v, amount);
  if (quiet) return; // (burning, bleeding, poison: not what knocks anyone out, nor wakes anyone)
  if (v.sleep > 0) wake(world, v);
  Object.assign(v, { lastHitWith: cause, lastHitAt: world.tick });
  v.flash = 0.08;
  world.events.push({ type: 'hit', id: v.id, by, x: v.x, y: v.y - F.h / 2, power: 0, damage: amount });
}

// --- Melee ------------------------------------------------------------------------------------

// A weapon's stats by key (null = fists); alt: its follow-up swing (the halberd's sweep).
// variant: 'heavy' (the melee button's swing) or 'jab' (see JAB).
export function weaponOf(key, variant = 'heavy') {
  const m = key ? MELEE[key] : STRIKE;
  return variant === 'jab' ? m.jabStats : m.heavyStats;
}

function useMelee(world, f, input, press) {
  f.comboT = Math.max(0, f.comboT - DT);
  f.throwCd = Math.max(0, f.throwCd - DT);
  const held = input.meleeHeld || (!f.hasGun && input.shoot);
  f.queuedT = Math.max(0, f.queuedT - DT);
  if (f.queuedT <= 0) f.queued = null;
  if (f.swing >= 0) {
    const s = weaponOf(f.swingWeapon, f.swingVariant);
    f.swing += DT;
    // (Pressed mid-swing: remembered for a moment, to come out as soon as it can.)
    if (press.kp || press.mp) Object.assign(f, { queued: press.kp ? 'kp' : 'mp', queuedT: COMBO.buffer });
    // (The katana swings the moment you click; holding on through the swing winds up a throw.)
    if (f.holding >= 0) f.holding = held ? f.holding + DT : -1;
    if (f.swing >= s.startup && f.swing < s.startup + s.active) meleeHits(world, f, s);
    if (f.swing >= s.startup + s.active + s.recovery * (f.swingLanded ? COMBO.recoveryOnHit : 1)) f.swing = -1;
    // A heavy cuts a jab's recovery short; so does a shot (or a heavy's, if it hit).
    else if (f.swing >= s.startup + s.active && ((f.queued === 'mp' && f.swingVariant === 'jab') || (f.queued === 'sp' && (f.swingVariant === 'jab' || f.swingLanded)))) f.swing = -1;
    if (f.swing >= 0) return;
  }
  if (f.queued && f.queued !== 'sp' && !f.blocking && !f.chain) {
    press = { ...press, [f.queued]: true };
    f.queued = null;
  }
  if (f.blocking || f.chain) {
    f.holding = -1;
    return;
  }
  // The jab: a quick poke with the melee weapon (else the fists).
  if (press.kp && f.holding < 0) return startSwing(world, f, weaponOf(f.melee, 'jab'), f.melee, false, 0, 'jab');
  const m = weaponOf(f.melee); // (the heavy)
  // (A weapon you keep when throwing, the cleaver, can't be thrown again until its cooldown is
  // over: until then it just swings.)
  const t = f.throwCd > 0 && throwOf(m)?.keep ? null : throwOf(m);
  if (t || m.charge || m.spin || m.eat || m.power || m.chain) {
    // A tap swings (when you let go). Holding winds up a throw, or charges the nodachi's dash
    // slash or a powered swing, spins the morning star, or takes a bite of the carrot; once a
    // throw or a dash is ready, letting go does it. You can hold it ready and aim. (The anvil
    // only throws; the katana swings the moment you click, and the hold throws it after; the
    // trident goes out on its chain the moment the hold's long enough.)
    if (press.mp) {
      f.holding = 0;
      f.active = 'melee';
      f.spinHit = {};
      if (m.instant) return startSwing(world, f, m, f.melee);
    }
    if (f.holding < 0) return;
    if (held) {
      f.holding += DT;
      if (m.spin && f.holding >= m.spin.after) spinHits(world, f, m);
      if (m.eat && f.holding >= m.eat.hold) bite(world, f, m);
      if (m.chain && f.holding >= m.holdToThrow) {
        f.holding = -1;
        throwTrident(world, f, m);
      }
      return;
    }
    const heldFor = f.holding;
    f.holding = -1;
    if (m.spin && heldFor >= m.spin.after) return; // let go of the spin
    if (t && (heldFor >= t.holdToThrow || m.throwOnly)) return throwMelee(world, f, m);
    if (m.instant) return; // (already swung)
    return startSwing(world, f, m, f.melee, !!m.charge && heldFor >= m.charge.time, powerOf(m, heldFor));
  }
  if (press.mp) startSwing(world, f, m, f.melee);
}

// How charged a held swing is (0: a tap). A graded wind-up (the club) grows with the hold, up to
// 1; the others are either full (held long enough) or a tap.
export function powerOf(m, heldFor) {
  if (!m.power) return 0;
  if (m.power.graded) return heldFor < 0.12 ? 0 : Math.min(1, heldFor / m.power.time);
  return heldFor >= m.power.time ? 1 : 0;
}

// A swing's hitting stats once its charge is counted. Graded: from the tap's to the power's at
// 90%, then the full ones (and a critical) at 100%.
function chargedStats(m, power) {
  if (!m.power || power <= 0) return m;
  const p = m.power;
  if (!p.graded) return { ...m, ...p };
  if (power >= 1) return { ...m, ...p.full, critical: true };
  const k = Math.min(1, power / 0.9);
  const mix = (a, b) => a + (b - a) * k;
  return { ...m, damage: mix(m.damage, p.damage), knockback: mix(m.knockback, p.knockback), knockbackGrowth: mix(m.knockbackGrowth, p.knockbackGrowth) };
}

// Where the morning star's ball is while it spins: round and round you, the way you face.
export function spinBall(f, m, holding) {
  const o = aimOrigin(f);
  const a = (holding - m.spin.after) * m.spin.speed * (f.facing || 1) - Math.PI / 2;
  return { x: o.x + Math.cos(a) * m.spin.radius, y: o.y + Math.sin(a) * m.spin.radius, a };
}

// The spinning morning star knocks away anyone the ball touches (each one now and then).
function spinHits(world, f, m) {
  const c = m.spin;
  const ball = spinBall(f, m, f.holding);
  for (const id of Object.keys(f.spinHit)) f.spinHit[id] -= DT;
  for (const v of world.fighters) {
    if (v === f || v.state !== 'ok' || (f.spinHit[v.id] ?? 0) > 0 || !circleHitsRect(ball.x, ball.y, c.ball, bodyRect(v))) continue;
    f.spinHit[v.id] = c.every;
    const dx = Math.sign(v.x - f.x) || f.facing;
    if (v.blocking && Math.sign(f.x - v.x) === v.facing) {
      world.events.push({ type: 'block', id: v.id, x: v.x, y: v.y - bodyHeight(v) / 2 });
      continue;
    }
    world.events.push({ type: 'strike', x: ball.x, y: ball.y, sound: m.hitSound });
    using(f.melee);
    hit(world, v, c.damage, dx, -0.5, c.knockback, c.knockbackGrowth, f.id);
  }
}

// A bite of the carrot: you run faster for a while. The last bite finishes it.
function bite(world, f, m) {
  f.holding = -1;
  f.uses++;
  f.haste = m.eat.time;
  world.events.push({ type: 'bite', id: f.id, x: f.x, y: f.y - 24, weapon: f.melee });
  if (f.uses >= m.eat.bites) f.melee = null;
}

// How a melee weapon is thrown (null: it isn't): its own throw, or, for light weapons in the
// melee slot, the light throw (not the ones whose hold does something else).
export const throwOf = (m) => m.throw ?? (m.weight === 'light' && !m.charge && !m.noThrow && m !== STRIKE ? LIGHT_THROW : null);

// key: which weapon swings (null = fists), so the swing keeps its stats and looks to the end.
// charged: the nodachi's dash slash (it dashes forward, and the slash launches). power: how charged
// a held swing is (see powerOf). variant: 'heavy' or 'jab' (see weaponOf).
function startSwing(world, f, m, key, charged = false, power = 0, variant = 'heavy') {
  f.swing = 0;
  f.swingVariant = variant;
  f.swingPower = power;
  f.swingWeapon = key;
  f.swingCharged = charged;
  f.swingLanded = false; // (set once it hits someone: then it can be cancelled, and recovers faster)
  f.active = 'melee';
  // Attacking on the run costs stamina (more for heavy weapons); without enough, you stop to
  // attack, as from standing.
  const cost = STAMINA.swing[m === STRIKE || m === STRIKE.heavyStats || m.jab ? 'fists' : m.weight];
  f.swingRunning = f.grounded && Math.abs(f.vx) > 40 && f.stamina >= cost && !charged;
  if (f.swingRunning) f.stamina -= cost;
  f.swingStance = f.crouching ? 'crouch' : 'stand';
  // A crouching attack goes out low and straight.
  f.swingX = f.swingStance === 'crouch' ? Math.sign(f.aimX) || f.facing : f.aimX;
  f.swingY = f.swingStance === 'crouch' ? 0 : f.aimY;
  f.swingHit = [];
  f.reload = 0;
  if (charged) f.vx = (Math.sign(f.swingX) || f.facing) * m.charge.dash;
  else if (f.grounded && !f.swingRunning) f.vx += Math.sign(f.swingX) * m.lunge;
  if (m.paint && f.grounded && f.uses < m.paint.ammo) {
    f.uses++;
    rollPaint(world, f, m.paint);
  }
  world.events.push({ type: charged ? 'dash' : 'swing', id: f.id, x: f.x, y: f.y, weapon: key, jab: variant === 'jab' });
}

// The paint roller: paint along the floor in front of you, only as far as that floor goes.
function rollPaint(world, f, c) {
  const dir = Math.sign(f.swingX) || f.facing;
  const floor = (world.live ?? getStage(world.stage).blocks).find((r) => Math.abs(r.y - f.y) < 1 && f.x >= r.x && f.x <= r.x + r.w);
  if (!floor) return;
  const a = clamp(f.x - dir * 6, floor.x, floor.x + floor.w);
  const b = clamp(f.x + dir * c.length, floor.x, floor.x + floor.w);
  world.paints.push({ x1: Math.min(a, b), x2: Math.max(a, b), y: floor.y, owner: f.id, t: c.time });
}

// The angle of the weapon during a swing (radians, 0 = right, y down). It waits at the start of the
// arc during the wind-up, sweeps across during the active part, and stays at the end after.
// The arc goes from above to below, in front of the attacker (from below to above if `rising`).
export function swingAngle(swingX, swingY, t, m) {
  const base = Math.atan2(swingY, swingX);
  const arc = ((m.arc ?? 0) * Math.PI) / 180;
  const p = Math.max(0, Math.min(1, (t - m.startup) / m.active));
  const side = (swingX >= 0 ? 1 : -1) * (m.rising ? -1 : 1);
  return base + side * arc * (2 * p - 1);
}

// Where the hit area is: at `reach` along the swing's angle. A thrust travels instead: jabbed out to
// its full reach (the tip) and pulled back in while it's hitting, so it catches people up close too.
export function swingPoint(f, m = weaponOf(f.swingWeapon)) {
  const o = aimOrigin(f);
  const a = swingAngle(f.swingX, f.swingY, f.swing, m);
  const reach = m.thrust ? thrustReach(m, f.swing) : m.reach;
  return { x: o.x + Math.cos(a) * reach, y: o.y + Math.sin(a) * reach };
}

// The whole hit area of a swing: circles along the blade, from near the hand out to the tip (just
// the one point for fists and thrusts).
export function swingPoints(f, m = weaponOf(f.swingWeapon)) {
  if (!m.length) return [swingPoint(f, m)];
  const o = aimOrigin(f);
  const a = swingAngle(f.swingX, f.swingY, f.swing, m);
  // A poked weapon (a jab): the length of it, back from the tip.
  if (m.thrust) {
    const tip = thrustReach(m, f.swing);
    return [0.75, 0.5, 0.25, 0].map((s) => Math.max(2, tip - m.length * s)).map((d) => ({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d }));
  }
  return [SWING_HAND + m.length * 0.3, SWING_HAND + m.length * 0.55, SWING_HAND + m.length * 0.8, m.reach].map((d) => ({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d }));
}

// How far out a thrust's tip is while it hits: shot out `travel` px to its reach, fast at first.
export const thrustReach = (m, t) => m.reach - (m.travel ?? m.reach * 0.6) * (1 - Math.max(0, Math.min(1, (t - m.startup) / m.active))) ** 2;

// A melee weapon thrown in an arc. Light ones land and lie there as a pickup to go get back; La
// Chola is gone for good.
function throwMelee(world, f, m) {
  const t = throwOf(m);
  const o = aimOrigin(f);
  const recover = t.recover !== false;
  // (The crystal ball: thrown weapons home in too, for less damage.)
  const homing = f.homing > 0;
  const damage = t.damage * (homing ? ITEMS.crystal.homing.damage : 1);
  world.bullets.push({ id: world.nextBullet++, owner: f.id, kind: f.melee, x: o.x, y: o.y, x0: o.x, y0: o.y, born: world.tick, vx: f.aimX * t.speed, vy: f.aimY * t.speed - t.lift, gravity: t.gravity, life: recover ? 3 : 2, thrown: true, recover, damage, kb: t.knockback, growth: t.knockbackGrowth, homing });
  // (The cleaver: you throw a spare and keep yours, and wait for the next throw.)
  if (t.keep) f.throwCd = t.cooldown;
  else f.melee = null;
  f.holding = -1;
  world.events.push({ type: 'throw', id: f.id, x: f.x, y: f.y - 20 });
}

// The trident thrown on its chain, in an arc.
function throwTrident(world, f, m) {
  const c = m.chain;
  const o = aimOrigin(f);
  f.chain = { phase: 'out', x: o.x, y: o.y, x0: o.x, y0: o.y, born: world.tick, vx: f.aimX * c.speed, vy: f.aimY * c.speed - c.lift, victim: -1, stuck: 0 };
  world.events.push({ type: 'throw', id: f.id, x: f.x, y: f.y - 20 });
}

// Tridents out on their chains. Flying out: a fighter it touches is hit (no push) and stunned,
// and the chain reels them in to melee range; a wall, the floor, or the end of the chain stops
// it and it's reeled back. It's back in your hand when it reaches you, or when your catch does.
// Getting hit yourself lets the catch go.
function updateChains(world, st) {
  for (const f of world.fighters) {
    const t = f.chain;
    if (!t) continue;
    const c = MELEE.trident.chain;
    const o = aimOrigin(f);
    if (f.state !== 'ok') {
      f.chain = null;
      continue;
    }
    if (t.phase === 'out') {
      t.vy += c.gravity * DT;
      const nx = t.x + t.vx * DT;
      const ny = t.y + t.vy * DT;
      let best = null;
      let bestT = Infinity;
      for (const r of solids(world, st)) {
        const k = segmentHitsRect(t.x, t.y, nx, ny, r);
        if (k !== null && k < bestT) [best, bestT] = [r, k];
      }
      for (const v of world.fighters) {
        if (v === f || v.state !== 'ok' || v.hidden >= 0) continue;
        const k = segmentHitsRect(t.x, t.y, nx, ny, bodyRect(v));
        if (k !== null && k < bestT) [best, bestT] = [{ fighter: v }, k];
      }
      if (best) {
        t.x += (nx - t.x) * bestT;
        t.y += (ny - t.y) * bestT;
        if (best.fighter) {
          const v = best.fighter;
          using('trident');
          hit(world, v, c.damage, 0, 0, 0, 0, f.id);
          v.stunned = true;
          Object.assign(t, { phase: 'pull', victim: v.id });
          world.events.push({ type: 'hooked', id: v.id, by: f.id, x: t.x, y: t.y });
        } else {
          t.phase = 'back';
          world.events.push({ type: 'spark', x: t.x, y: t.y, dx: -Math.sign(t.vx), dy: -0.5 });
        }
      } else {
        t.x = nx;
        t.y = ny;
        if (Math.hypot(t.x - o.x, t.y - o.y) >= c.length) t.phase = 'back';
      }
    } else if (t.phase === 'back') {
      const dx = o.x - t.x;
      const dy = o.y - t.y;
      const d = Math.hypot(dx, dy);
      if (d <= c.reelSpeed * DT) f.chain = null;
      else Object.assign(t, { x: t.x + (dx / d) * c.reelSpeed * DT, y: t.y + (dy / d) * c.reelSpeed * DT });
    } else {
      const v = world.fighters[t.victim];
      if (v.state !== 'ok' || v.hidden >= 0 || f.hitstun > 0) {
        t.phase = 'back';
        if (v.state === 'ok') v.stunned = false;
        continue;
      }
      const dx = f.x - v.x;
      const dy = o.y - center(v).y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) <= c.meleeRange && Math.abs(dy) < F.h) {
        // Reeled in: still stunned for a moment, right in front of you.
        Object.assign(v, { vx: 0, vy: Math.min(v.vy, 0), hitstun: Math.max(v.hitstun, c.stun), stunned: true });
        f.chain = null;
        continue;
      }
      // Dragged toward you; if a wall holds them for a while, the catch slips.
      const before = d;
      v.vx = (dx / d) * c.pullSpeed;
      v.vy = (dy / d) * c.pullSpeed;
      v.hitstun = Math.max(v.hitstun, 0.1);
      v.stunned = true;
      t.x = v.x;
      t.y = center(v).y;
      t.stuck = t.last !== undefined && before > t.last - 1 ? t.stuck + DT : 0;
      t.last = before;
      if (t.stuck > 0.4) {
        t.phase = 'back';
        v.stunned = false;
      }
    }
  }
}

// Keyboard: roll a word. Its tier sets the share of damage and push this hit does.
export function rollWord(world, m) {
  let r = world.rng();
  for (const tier of m.words) {
    if (r < tier.chance) return { scale: tier.scale, freeze: !!tier.freeze, text: tier.pool[Math.floor(world.rng() * tier.pool.length)] };
    r -= tier.chance;
  }
  const last = m.words[m.words.length - 1];
  return { scale: last.scale, freeze: !!last.freeze, text: last.pool[0] };
}

// Katana: bullets touching the blade mid-swing fly off toward the pointer, as yours, hitting harder.
function deflectBullets(world, f, m, area) {
  const d = m.deflect;
  for (const b of world.bullets) {
    if (b.owner === f.id || !area.some((c) => Math.hypot(b.x - c.x, b.y - c.y) <= m.radius + 4)) continue;
    const speed = Math.hypot(b.vx, b.vy) * d.speedMul;
    b.vx = f.aimX * speed;
    b.vy = f.aimY * speed;
    b.owner = f.id;
    b.damage *= d.damageMul;
    b.kb *= d.knockbackMul;
    b.life = Math.max(b.life, 0.6);
    b.deflected = true;
    world.events.push({ type: 'deflect', id: f.id, x: b.x, y: b.y });
  }
}

function meleeHits(world, f, m) {
  const area = swingPoints(f, m);
  const touches = (rect) => area.some((c) => circleHitsRect(c.x, c.y, m.radius, rect));
  if (m.deflect) deflectBullets(world, f, m, area);
  // (Jabs never launch; nor do light weapons, but for their heavy, which pushes.)
  const maxPower = m.jab || (m.weight === 'light' && !m.pushes) ? LIGHT_MAX_PUSH : Infinity;
  // Mostly in the swing direction, lifted a little so hits pop people up.
  const len = Math.hypot(f.swingX, f.swingY - 0.35) || 1;
  const kx = f.swingX / len;
  const ky = (f.swingY - 0.35) / len;
  for (const v of world.fighters) {
    if (v === f || v.state !== 'ok' || f.swingHit.includes('f' + v.id)) continue;
    if (!touches(bodyRect(v))) continue;
    f.swingHit.push('f' + v.id);
    // Blocks and parries only work against hits from the side you're facing: judged by the way the
    // attack travels (someone who lunged past your middle still swung at your face), or, for a
    // swing straight up or down, by where the attacker stands.
    const dir = Math.abs(f.swingX) > 0.2 ? Math.sign(f.swingX) : Math.sign(v.x - f.x);
    const front = dir === 0 || dir === -v.facing;
    if (v.blocking && front && !m.unblockable) {
      // Blocked: no damage, both slide apart a little.
      const away = Math.sign(v.x - f.x) || f.facing;
      v.vx += away * BLOCK.blockPush;
      f.vx -= away * BLOCK.blockPush;
      world.events.push({ type: 'block', id: v.id, x: v.x, y: v.y - bodyHeight(v) / 2 });
      continue;
    }
    if (front && v.blockDrop >= 0 && v.blockDrop < BLOCK.dropFrames / BLOCK.dropFps / 2 && v.dropStance === f.swingStance) {
      // Parry: let go of block just as a matching hit lands. The attacker is stunned.
      f.hitstun = BLOCK.parryStun;
      f.stunned = true;
      f.swing = -1;
      f.vx = 0;
      v.blockDrop = -1;
      world.events.push({ type: 'parry', id: v.id, by: f.id, x: (v.x + f.x) / 2, y: v.y - bodyHeight(v) / 2 });
      addStyle(world, v, STYLE.parry);
      return;
    }
    // (A held swing hits with its charged stats.)
    const c = chargedStats(m, f.swingPower ?? 0);
    world.events.push({ type: c.critical ? 'critical' : 'strike', x: v.x, y: v.y - bodyHeight(v) / 2, sound: c.hitSound ?? 'blunt' });
    if (m.words) {
      // Keyboard: the word sets the share of damage and of the full launch. Every word launches.
      const word = rollWord(world, m);
      const s = word.scale;
      world.events.push({ type: 'word', id: f.id, x: v.x, y: v.y - bodyHeight(v), text: word.text, scale: s });
      if (word.freeze) {
        // 100%: damage now, no push; frozen exactly as long as the phrase takes to type out,
        // then the full launch (see updateFighter).
        using(f.swingWeapon ?? 'fists');
        hit(world, v, m.damage, kx, ky, 0, 0, f.id);
        const stun = word.text.length / m.bigTypeSpeed;
        v.pendingLaunch = { left: stun, dx: kx, dy: ky - 0.4, base: m.launch.knockback, growth: m.launch.knockbackGrowth, by: f.id, with: f.swingWeapon ?? 'fists' };
        v.stunned = true;
      } else {
        using(f.swingWeapon ?? 'fists');
        hit(world, v, m.damage * s, kx, ky - 0.4 * s, m.launch.knockback * s, m.launch.knockbackGrowth * s, f.id);
      }
      continue;
    }
    // Quirks: from behind (backstab), straight up (uppercut), flat and far (flat).
    // (From behind: the swing travels the way they face, like the front check above.)
    const behind = dir !== 0 && dir === v.facing;
    const damage = c.damage * (m.backstab && behind ? m.backstab.damageMul : 1);
    let [dx, dy] = [kx, ky];
    if (m.uppercut) [dx, dy] = [Math.sign(f.swingX) * 0.15, -1];
    else if (c.critical) [dx, dy] = [Math.sign(f.swingX) || f.facing, -1]; // 45°
    else if (m.flat) [dx, dy] = [Math.sign(f.swingX) || f.facing, -0.25];
    // Light weapons' finishers launch: the nodachi's charged slash, the machete's last combo hit.
    let launch = f.swingCharged && m.charge ? m.charge.launch : m.backstab && behind ? m.backstab : null;
    if (m.combo && !f.swingHit.includes('combo')) {
      f.swingHit.push('combo');
      f.comboN = f.comboT > 0 ? f.comboN + 1 : 1;
      f.comboT = m.combo.window;
      if (f.comboN >= m.combo.hits) {
        launch = m.combo.launch;
        f.comboN = 0;
        world.events.push({ type: 'combo', id: f.id, x: v.x, y: v.y - bodyHeight(v) });
      }
    }
    // Staleness: the same attack again in one combo pushes and stuns less.
    if (v.hitstun <= 0) v.combo = [];
    const attack = `${f.swingWeapon ?? 'fists'}${f.swingVariant === 'jab' ? '/jab' : ''}`;
    const fresh = Math.max(COMBO.staleMin, 1 - COMBO.stale * v.combo.filter((k) => k === attack).length);
    using(f.swingWeapon ?? 'fists');
    const landed = launch
      ? hit(world, v, damage, dx, dy - 0.3, launch.knockback * fresh, launch.knockbackGrowth * fresh, f.id)
      : hit(world, v, damage, dx, dy, c.knockback * fresh, c.knockbackGrowth * fresh, f.id, maxPower);
    if (landed) {
      v.combo.push(attack);
      // A hit lets you keep going: the swing can be cancelled and recovers faster, your air jump
      // comes back, and your next dash is free.
      f.swingLanded = true;
      f.jumpsLeft = Math.max(f.jumpsLeft, F.airJumps + (f.rune ? ITEMS[f.rune].rune.airJumps ?? 0 : 0));
      f.freeDash = COMBO.freeDash;
    }
    if (landed && m.bleed) Object.assign(v, { bleed: m.bleed.time, bleedRate: m.bleed.damage / m.bleed.time, bleedBy: f.id });
    if (landed) hitQuirks(world, f, v, c);
    if (landed) addStyle(world, f, f.gunHitT > 0 ? STYLE.gunToMelee : STYLE.melee);
    if (m.backstab && behind) world.events.push({ type: 'backstab', id: v.id, x: v.x, y: v.y - bodyHeight(v) });
  }
  world.barrels.forEach((b, i) => {
    if (b.gone || f.swingHit.includes('b' + i) || !touches(barrelRect(b))) return;
    f.swingHit.push('b' + i);
    damageBarrel(b, m.damage, f.id);
  });
  for (const c of world.covers) {
    if (c.gone || f.swingHit.includes('c' + c.id) || !touches(c)) continue;
    f.swingHit.push('c' + c.id);
    damageCover(world, c, m.damage);
  }
}

// Cover takes damage; out of health, it breaks and is gone for the match.
function damageCover(world, c, damage) {
  if (c.gone || !(damage > 0)) return;
  c.hp -= damage;
  c.flash = 0.1;
  if (c.hp > 0) return;
  c.gone = true;
  world.standing = world.standing.filter((b) => b !== c);
  world.live = world.live.filter((b) => b !== c);
  world.events.push({ type: 'coverbreak', x: c.x + c.w / 2, y: c.y + c.h / 2, w: c.w });
}

// What a landed melee hit does besides damage and push: the pan's bonk (stunned longer), a bite
// of the ham (heals you), the fish's slap (their floor turns to ice), the pliers' yoink.
function hitQuirks(world, f, v, m) {
  if (m.bonk) Object.assign(v, { hitstun: Math.min(F.maxHitstun, v.hitstun + m.bonk), stunned: true });
  if (m.slippery) v.slip = m.slippery;
  if (m.yoink) yoink(world, f, v);
  if (m.radiation && !f.swingHit.includes('rad')) {
    f.swingHit.push('rad');
    irradiate(world, center(v), m.radiation, f.id);
  }
  if (m.bites && f.melee === f.swingWeapon) {
    f.uses++;
    f.damage = Math.max(0, f.damage - m.bites.heal);
    world.events.push({ type: 'bite', id: f.id, x: f.x, y: f.y - 24, weapon: f.melee, heal: m.bites.heal });
    if (f.uses >= m.bites.count) f.melee = null;
  }
}

// THE WARNING: everyone near where it landed (the swinger too) gets a random effect, good or bad.
function irradiate(world, at, c, by) {
  world.events.push({ type: 'radiation', x: at.x, y: at.y, r: c.radius });
  for (const f of world.fighters) {
    if (f.state !== 'ok' || Math.hypot(center(f).x - at.x, center(f).y - at.y) > c.radius) continue;
    const effect = RADIATION[Math.floor(world.rng() * RADIATION.length)];
    if (ITEMS[effect]?.rune) Object.assign(f, { rune: effect, runeT: c.time, reflects: 0 });
    else if (effect === 'jinx') f.jinx = c.time;
    else if (effect === 'slip') f.slip = c.time;
    else if (effect === 'burn') Object.assign(f, { burn: c.time, burnBy: by });
    else if (effect === 'homing') f.homing = c.time;
    world.events.push({ type: 'irradiated', id: f.id, x: f.x, y: f.y - F.h - 4, effect });
  }
}

// The pliers: take the victim's weapon (the one in their hand first) and drop it behind you.
function yoink(world, f, v) {
  const slot = v.active === 'melee' && v.melee ? 'melee' : v.hasGun ? 'gun' : v.melee ? 'melee' : null;
  if (!slot) return;
  let weapon;
  let ammo;
  if (slot === 'melee') {
    weapon = v.melee;
    Object.assign(v, { melee: null, holding: -1, chain: null });
  } else {
    weapon = v.gun;
    ammo = v.ammo; // (the gun keeps the rounds it had)
    Object.assign(v, { gun: null, hasGun: false, reload: 0 });
  }
  dropWeapon(world, weapon, f.x - f.facing * 20, f.y - 8, ammo);
  world.events.push({ type: 'yoink', id: f.id, by: v.id, x: v.x, y: v.y - 20, weapon });
}

// --- Pickups ----------------------------------------------------------------------------------

// Every so often a melee weapon appears at a free pickup spot inside the storm wall. Pickups the
// wall closes over are destroyed, so they don't use up a slot.
function updatePickups(world, st) {
  if (world.training) return;
  updateDrops(world);
  const s = world.storm;
  const inside = (x) => x > s.wallLeft + 8 && x < s.wallRight - 8;
  world.pickups = world.pickups.filter((p) => {
    if (inside(p.x)) return true;
    world.events.push({ type: 'destroyed', x: p.x, y: p.y });
    return false;
  });
  // Weapon shrines: a weapon always comes back to the altar a while after it's taken.
  const shrine = st.pickupSpots.find((sp) => sp.shrine && inside(sp.x) && !world.pickups.some((p) => p.x === sp.x && p.y === sp.y));
  if (shrine && (world.shrineTimer -= DT) <= 0) {
    world.shrineTimer = PICKUPS.shrineEvery;
    spawnPickup(world, shrine);
  }
  world.pickupTimer -= DT;
  if (world.pickupTimer > 0) return;
  world.pickupTimer = PICKUPS.every;
  const free = st.pickupSpots.filter((sp) => !sp.shrine && inside(sp.x) && !world.pickups.some((p) => p.x === sp.x && p.y === sp.y));
  if (!free.length) return;
  spawnPickup(world, free[Math.floor(world.rng() * free.length)]);
}

// What a pickup counts as, for the caps (PICKUPS.caps): a weapon (gun or melee), a grenade, an item.
const capOf = (weapon) => (GRENADES[weapon] ? 'grenade' : ITEMS[weapon] ? 'item' : 'weapon');

// The kinds of pickup still under their cap (what a knocked-out fighter dropped doesn't count).
function underCap(world) {
  const n = { weapon: 0, grenade: 0, item: 0 };
  for (const p of world.pickups) if (p.life === undefined) n[capOf(p.weapon)]++;
  return { melee: n.weapon < PICKUPS.caps.weapon, gun: n.weapon < PICKUPS.caps.weapon, grenade: n.grenade < PICKUPS.caps.grenade, item: n.item < PICKUPS.caps.item };
}

// A knocked-out fighter's weapons float down into the middle of what's left of the arena (DROPS):
// a gun other than the pistol (with its rounds), their melee weapon, their grenades.
function dropLoadout(world, st, f) {
  const drops = [];
  if (f.hasGun && f.gun !== 'pistol') drops.push({ weapon: f.gun, ammo: f.ammo });
  if (f.melee) drops.push({ weapon: f.melee });
  for (const g of f.grenades) drops.push({ weapon: g });
  Object.assign(f, { melee: null, grenades: [], hasGun: false, gun: null });
  if (!drops.length) return;
  const s = world.storm;
  const mid = (Math.max(s.left, s.wallLeft + 30) + Math.min(s.right, s.wallRight - 30)) / 2;
  const half = Math.max(20, Math.min(DROPS.range, (Math.min(s.right, s.wallRight) - Math.max(s.left, s.wallLeft)) / 2 - 30));
  const width = (drops.length - 1) * DROPS.spread;
  const room = Math.max(0, half - width / 2);
  const start = mid - width / 2 + (world.rng() * 2 - 1) * room;
  // (They land on the first floor under the height fighters come back in at.)
  const from = respawnPoint(world, st).y - 40;
  const blocks = world.live ?? st.blocks;
  drops.forEach((d, k) => {
    for (let tries = 0; tries < 8; tries++) {
      const x = Math.round(start + k * DROPS.spread + (tries % 2 ? 1 : -1) * Math.ceil(tries / 2) * 12);
      let floor = null;
      for (const r of blocks) if (x >= r.x && x <= r.x + r.w && r.y >= from && (floor === null || r.y < floor)) floor = r.y;
      if (floor === null) continue;
      world.pickups.push({ id: world.nextPickup++, x, y: floor, weapon: d.weapon, ...(d.ammo !== undefined ? { ammo: d.ammo, t: 0 } : {}), life: DROPS.life, fall: DROPS.height });
      world.events.push({ type: 'spawn', x, y: floor - DROPS.height, weapon: d.weapon });
      return;
    }
  });
}

// The dropped ones: floating down, then gone after their time.
function updateDrops(world) {
  world.pickups = world.pickups.filter((p) => {
    if (p.life === undefined) return true;
    if (p.fall > 0) {
      p.fall = Math.max(0, p.fall - DROPS.fallSpeed * DT);
      return true;
    }
    if ((p.life -= DT) > 0) return true;
    world.events.push({ type: 'destroyed', x: p.x, y: p.y });
    return false;
  });
}

// Training: a weapon (gun, melee weapon or grenade) dropped in front of a fighter, as a pickup.
export function spawnWeapon(world, id, weapon) {
  const f = world.fighters[id];
  if (!f || f.state !== 'ok') return;
  dropWeapon(world, weapon, f.x + f.facing * 12, f.y - 8);
}

// What can turn up as a pickup: melee weapons, guns (not the starting pistol) and grenades.
const PICKUP_KINDS = {
  melee: Object.keys(MELEE),
  gun: Object.keys(GUNS).filter((k) => k !== 'pistol'),
  grenade: Object.keys(GRENADES),
  item: Object.keys(ITEMS),
};

function spawnPickup(world, spot, weapon = null) {
  if (!weapon) {
    // (Weapons switched off in this match's rules never turn up; nor kinds already at their cap.)
    const on = world.rules;
    const open = underCap(world);
    const mix = {
      melee: on.melee && open.melee ? PICKUPS.mix.melee : 0,
      gun: on.ranged && open.gun ? PICKUPS.mix.gun : 0,
      grenade: on.thrown && open.grenade ? PICKUPS.mix.grenade : 0,
      item: on.items && open.item ? PICKUPS.mix.item : 0,
    };
    if (!(mix.melee + mix.gun + mix.grenade + mix.item)) return;
    let r = world.rng() * (mix.melee + mix.gun + mix.grenade + mix.item);
    const group = (r -= mix.melee) < 0 ? 'melee' : (r -= mix.gun) < 0 ? 'gun' : (r -= mix.grenade) < 0 ? 'grenade' : 'item';
    const kinds = PICKUP_KINDS[group];
    weapon = kinds[Math.floor(world.rng() * kinds.length)];
  }
  world.pickups.push({ id: world.nextPickup++, x: spot.x, y: spot.y, weapon });
  world.events.push({ type: 'spawn', x: spot.x, y: spot.y, weapon });
  if (weapon === 'key') placeChest(world, spot.x);
}

// Grab the nearest pickup you're touching: it replaces what you hold of its kind. A gun takes the
// gun slot (fully loaded); a grenade goes in your pocket, or, with both slots full, replaces the
// next one you'd throw. With nothing in reach, the button swaps your two grenades around.
// touch: playing on a touch screen (a wider reach: PICKUPS.touchReach).
function pickUp(world, f, touch = false) {
  if (catchGun(world, f)) return;
  let i = -1;
  const [rx, ry] = touch ? [PICKUPS.touchReach, PICKUPS.touchReachY] : [PICKUPS.reach, PICKUPS.reachY];
  world.pickups.forEach((p, k) => {
    if (Math.abs(p.x - f.x) > rx || Math.abs(p.y - (p.fall ?? 0) - f.y) > ry) return;
    if (i < 0 || Math.abs(p.x - f.x) < Math.abs(world.pickups[i].x - f.x)) i = k;
  });
  if (i < 0) {
    const chest = ammoChestBy(world, f);
    if (chest && chest.cd <= 0) return useAmmoChest(world, f, chest);
    if (f.grenades.length === 2) {
      f.grenades.reverse();
      world.events.push({ type: 'swap', id: f.id, x: f.x, y: f.y - F.h });
    }
    return;
  }
  if (ITEMS[world.pickups[i].weapon]?.carry && f.carry) return; // (one thing held up at a time)
  const [p] = world.pickups.splice(i, 1);
  if (ITEMS[p.weapon]) {
    useItem(world, f, p.weapon);
  } else if (GUNS[p.weapon]) {
    giveGun(f, p.weapon, p.ammo);
    f.active = 'gun';
  } else if (GRENADES[p.weapon]) {
    f.ring = 0; // (a grenade takes the ring's place)
    if (f.grenades.length >= GRENADE.max) f.grenades[0] = p.weapon;
    else f.grenades.push(p.weapon);
  } else {
    Object.assign(f, { melee: p.weapon, holding: -1, uses: 0, active: 'melee' });
  }
  world.events.push({ type: 'pickup', id: f.id, x: p.x, y: p.y, weapon: p.weapon });
}

// --- Items ------------------------------------------------------------------------------------

// An item picked up: eaten (heals), held up (the key), a rune's boon, the genie lamp (rubbed for a
// while, then a wish), the crystal ball's homing shots.
function useItem(world, f, key) {
  const it = ITEMS[key];
  if (it.heal) {
    f.damage = Math.max(0, f.damage - it.heal);
    world.events.push({ type: 'heal', id: f.id, x: f.x, y: f.y - 20, heal: it.heal });
  } else if (it.carry) {
    Object.assign(f, { carry: key, carryT: 0 });
    if (key === 'key') placeChest(world, f.x);
  } else if (it.rune) {
    Object.assign(f, { rune: key, runeT: it.rune.time, reflects: it.rune.reflect ?? 0 });
  } else if (it.wish) {
    f.wish = it.wish.rub;
  } else if (it.homing) {
    f.homing = it.homing.time;
  } else if (it.ring) {
    // Both grenade slots.
    f.ring = CAT.uses;
    f.grenades = [];
  }
  world.events.push({ type: 'item', id: f.id, x: f.x, y: f.y - 24, item: key });
}

// Drop what you hold up, where you are (lost over a pit).
function dropCarry(world, f) {
  const key = f.carry;
  Object.assign(f, { carry: null, carryT: 0 });
  dropWeapon(world, key, f.x, f.y - 10);
  world.events.push({ type: 'drop', id: f.id, x: f.x, y: f.y - 30, item: key });
}

// The locked chest goes on the floor farthest from where the key turned up (once, until opened).
function placeChest(world, keyX) {
  if (world.chest) return;
  const st = getStage(world.stage);
  let best = null;
  for (const p of [...st.spawns, ...st.pickupSpots]) if (!best || Math.abs(p.x - keyX) > Math.abs(best.x - keyX)) best = p;
  if (best) world.chest = { x: best.x, y: best.y };
}

// How much of a push this fighter takes: the iron rune shrugs it off, a jinx and the crown's weight
// make it worse.
function pushTaken(world, v) {
  let k = 1;
  if (v.rune) k *= ITEMS[v.rune].rune.push ?? 1;
  if (v.jinx > 0) k *= WISH.jinx.push;
  if (world.crownRule === 'weight' && world.crown === v.id) k *= CROWN.weight;
  return k;
}

export { setHealthRule };

// Is this spot inside the banner's melee-only zone?
const inHaven = (world, x) => !!world.haven && x >= world.haven.left && x <= world.haven.right;

// The banner planted where it landed: its stretch of the stage (the section it's in, on a random
// stage) becomes the melee-only zone, in its thrower's colour. A new banner replaces the old one.
function plantBanner(world, owner, x, y) {
  const st = getStage(world.stage);
  const sec = st.sections?.find((s) => x >= s.left && x < s.right);
  const [left, right] = sec ? [sec.left, sec.right] : [x - HAVEN.width / 2, x + HAVEN.width / 2];
  world.haven = { x: Math.round(x), y, left, right, owner, held: 0 };
  world.events.push({ type: 'plant', id: owner, x, y: y - 20 });
}

// The banner: its thrower earns a life by spending long enough in the zone; away from it (or
// knocked out) for more than HAVEN.away s, the zone fades out for good.
function updateHaven(world) {
  const h = world.haven;
  if (!h) return;
  const f = world.fighters[h.owner];
  const inside = f.state === 'ok' && inHaven(world, f.x);
  h.away = inside ? 0 : (h.away ?? 0) + DT;
  if (f.state === 'out' || h.away > HAVEN.away) {
    world.haven = null;
    world.events.push({ type: 'unplant', id: h.owner, x: h.x, y: h.y - 20 });
    return;
  }
  if (!inside || (h.held += DT) < GRENADES.banner.plant.hold) return;
  if (!world.training) f.stocks++;
  world.haven = null;
  world.events.push({ type: 'banner', id: f.id, x: f.x, y: f.y - 30 });
}

// The crystal ball's shots turn toward the nearest enemy (up to `turn` rad/s).
function homeIn(world, b) {
  let target = null;
  let best = Infinity;
  for (const v of world.fighters) {
    if (v.id === b.owner || v.state !== 'ok' || v.hidden >= 0) continue;
    const d = Math.hypot(v.x - b.x, v.y - F.h / 2 - b.y);
    if (d < best) [target, best] = [v, d];
  }
  if (!target) return;
  const want = Math.atan2(target.y - F.h / 2 - b.y, target.x - b.x);
  const now = Math.atan2(b.vy, b.vx);
  const turn = Math.atan2(Math.sin(want - now), Math.cos(want - now));
  const a = now + Math.max(-1, Math.min(1, turn / (ITEMS.crystal.homing.turn * DT))) * ITEMS.crystal.homing.turn * DT;
  const speed = Math.hypot(b.vx, b.vy);
  b.vx = Math.cos(a) * speed;
  b.vy = Math.sin(a) * speed;
}

// Items over time: runes wear off, the lamp's wish comes, a jinx and the homing end, the key opens
// the chest, the banner's planter earns a life; training dummies keep their set health.
function updateItems(world, st) {
  for (const f of world.fighters) {
    if (f.state !== 'ok') continue;
    if (f.rune && (f.runeT -= DT) <= 0) Object.assign(f, { rune: null, reflects: 0 });
    f.jinx = Math.max(0, f.jinx - DT);
    f.homing = Math.max(0, f.homing - DT);
    if (f.wish >= 0 && (f.wish -= DT) < 0) grantWish(world, f);
    if (f.carry === 'key' && world.chest && Math.abs(f.x - world.chest.x) <= CARRY.reach && Math.abs(f.y - world.chest.y) < 4) openChest(world, f);
    holdHealth(f);
    f.styleHeadCd = Math.max(0, f.styleHeadCd - DT);
    f.styleEvadeCd = Math.max(0, f.styleEvadeCd - DT);
    f.gunHitT = Math.max(0, f.gunHitT - DT);
    if (f.style >= 1) styleReload(world, f);
  }
  updateHaven(world);
}

// The genie lamp: (rarely) doom, a legendary weapon at your feet, a full heal, or a jinx. Doom is
// the keyboard's big phrase treatment: frozen, shaking, then launched off the stage.
function grantWish(world, f) {
  let r = world.rng();
  let wish;
  if ((r -= WISH.death) < 0) {
    wish = 'doom';
    f.pendingLaunch = { left: WISH.doom.freeze, dx: f.facing * 0.4, dy: -1, base: WISH.doom.knockback, growth: 0, by: -1, with: 'lamp' };
    f.stunned = true;
  } else if (r < WISH.legendary) {
    wish = 'legendary';
    dropWeapon(world, LEGENDARY[Math.floor(world.rng() * LEGENDARY.length)], f.x + f.facing * 12, f.y - 8);
  } else if (r < WISH.legendary + WISH.heal) {
    wish = 'heal';
    f.damage = 0;
  } else {
    wish = 'jinx';
    f.jinx = WISH.jinx.time;
  }
  world.events.push({ type: 'wish', id: f.id, x: f.x, y: f.y - 30, wish });
}

// The key in the chest: it opens and a legendary weapon comes out.
function openChest(world, f) {
  const at = world.chest;
  world.chest = null;
  Object.assign(f, { carry: null, carryT: 0 });
  const weapon = LEGENDARY[Math.floor(world.rng() * LEGENDARY.length)];
  world.pickups.push({ id: world.nextPickup++, x: at.x, y: at.y, weapon });
  world.events.push({ type: 'chest', id: f.id, x: at.x, y: at.y, weapon });
}

// Training dummies' health rule: 'set' (never changes), 'banded' (takes hits, then goes back to
// the set value `after` s after the last one).
function holdHealth(f) {
  const h = f.healthRule;
  if (!h) return;
  if (h.mode === 'set') f.damage = h.value;
  else if (h.mode === 'banded') {
    if (f.damage !== h.value && f.damage !== f.bandLast) f.bandT = h.after ?? 2;
    f.bandLast = f.damage;
    if (f.bandT > 0 && (f.bandT -= DT) <= 0) f.damage = h.value;
  }
}

// Training: a dummy's health rule ({ mode: 'set' | 'banded' | 'reset', value, after }). Reset just puts
// its damage back to the value once.
function setHealthRule(world, id, rule) {
  const f = world.fighters[id];
  if (!f) return;
  f.damage = rule.value;
  f.healthRule = rule.mode === 'set' || rule.mode === 'banded' ? { mode: rule.mode, value: rule.value, after: rule.after ?? 2 } : null;
  Object.assign(f, { bandT: 0, bandLast: rule.value });
}

// --- Getting hit, KOs, respawn ----------------------------------------------------------------

// maxPower caps the push (light weapons never launch).
// unavoidable: stage hazards (spikes, crushers) that a dash doesn't dodge.
function hit(world, v, amount, dx, dy, base, growth, by, maxPower = Infinity, unavoidable = false) {
  if (v.state !== 'ok' || v.invincible > 0) return false;
  if (v.dodge > 0 && !unavoidable) {
    world.events.push({ type: 'evade', id: v.id, x: v.x, y: v.y - F.h / 2 });
    if (v.styleEvadeCd <= 0) {
      addStyle(world, v, STYLE.evade);
      v.styleEvadeCd = STYLE.evadeEvery;
    }
    return false;
  }
  v.damage = Math.min(999, v.damage + amount);
  if (v.sleep > 0) wake(world, v);
  if (v.drowsy > 0) clearDrowsy(world, v);
  morphHurt(world, v, amount);
  // (The iron rune, a jinx and the crown's weight change how hard you're pushed.)
  const power = Math.min(maxPower, (base + growth * v.damage) * pushTaken(world, v));
  if (v.carry && power > CARRY.dropPush) dropCarry(world, v);
  // DI: the direction they hold bends the launch, most when it's at right angles to it.
  if (power >= DI.minPower && (v.heldX || v.heldY)) {
    const l = Math.hypot(dx, dy) || 1;
    const h = Math.hypot(v.heldX, v.heldY);
    const cross = (dx / l) * (v.heldY / h) - (dy / l) * (v.heldX / h);
    const a = (DI.degrees * Math.PI * cross) / 180;
    [dx, dy] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
  }
  const len = Math.hypot(dx, dy) || 1;
  v.vx = (dx / len) * power;
  v.vy = (dy / len) * power;
  if (v.grounded && v.vy > 0) v.vy = -v.vy * 0.5;
  v.grounded = false;
  v.hitstun = Math.min(F.maxHitstun, power * F.hitstunPerSpeed);
  if (v.hitstun > 0.15) {
    v.swing = -1;
    v.reload = 0;
  }
  v.fastFall = false;
  v.cutting = false;
  v.crouching = false;
  v.tucked = false;
  v.hidden = -1; // a hit knocks you out of a doorway
  v.blocking = null;
  v.blockDrop = -1;
  v.jumpsLeft = F.airJumps;
  v.flash = 0.12;
  if (by >= 0 && by !== v.id) v.lastHitBy = by;
  // (A player's hit is remembered past a hazard's: who put them on the spikes.)
  if (by >= 0 && by !== v.id) v.lastPlayerHitAt = world.tick;
  Object.assign(v, { lastHitWith: cause, lastHitAt: world.tick });
  world.events.push({ type: 'hit', id: v.id, by, x: v.x, y: v.y - F.h / 2, power, damage: amount });
  return true;
}

function checkBlastZone(world, st, f) {
  if (f.state !== 'ok') return;
  const b = st.blast;
  if (f.x > b.left && f.x < b.right && f.y < b.bottom && f.y > b.top) return;
  knockOut(world, st, f);
}

// how: 'out' (off the stage), or 'storm' (thrown into the storm's wall).
function knockOut(world, st, f, how = 'out') {
  f.pendingLaunch = null;
  if (!world.training) f.stocks--;
  // Who did it (see KO_CREDIT): whoever hit them lately (just before, if a hazard finished them).
  const hazard = ['spikes', 'crusher', 'lamp'].includes(f.lastHitWith);
  const ago = (tick) => (tick >= 0 ? (world.tick - tick) * DT : Infinity);
  const credited = hazard ? ago(f.lastPlayerHitAt) - ago(f.lastHitAt) <= KO_CREDIT.hazard : ago(f.lastPlayerHitAt) <= KO_CREDIT.credit;
  const by = credited && f.lastHitBy !== f.id ? f.lastHitBy : -1;
  if (by >= 0) world.fighters[by].kos++;
  if (f.carry) dropCarry(world, f);
  if (!world.training) dropLoadout(world, st, f);
  // Bounty: knock out the champion and the crown is yours.
  if (world.crownRule === 'bounty' && world.crown === f.id && by >= 0 && by !== f.id) {
    world.crown = by;
    const k = world.fighters[by];
    k.damage = Math.max(0, k.damage - CROWN.bountyHeal);
    world.events.push({ type: 'crown', id: by, x: k.x, y: k.y - F.h });
  }
  const cam = st.camera;
  // (What did it: the last thing that pushed them, if it was lately; else they did it themselves.)
  const what = ago(f.lastHitAt) <= KO_CREDIT.credit ? f.lastHitWith : null;
  world.events.push({ type: 'ko', id: f.id, by, with: what, how, x: clamp(f.x, cam.left + 20, cam.right - 20), y: clamp(f.y - F.h / 2, cam.top + 20, cam.bottom - 20) });
  f.state = f.stocks > 0 ? 'dead' : 'out';
  f.respawn = F.respawnTime;
  f.swing = -1;
  f.chain = null;
  f.hitstun = 0;
  f.vx = 0;
  f.vy = 0;
}

// Respawn at the spawn point closest to the middle of the safe area.
export function respawnPoint(world, st = getStage(world.stage)) {
  const target = (world.storm.left + world.storm.right) / 2;
  let best = st.spawns[0];
  for (const p of st.spawns) if (Math.abs(p.x - target) < Math.abs(best.x - target)) best = p;
  return { x: best.x, y: best.y - 60 };
}

function respawn(world, st, f) {
  const p = respawnPoint(world, st);
  Object.assign(f, { state: 'ok', hidden: -1, pendingLaunch: null, run: -1, runFrom: 0, x: p.x, y: p.y, vx: 0, vy: 0, damage: 0, invincible: F.respawnInvincible, lastHitBy: -1, lastHitWith: null, lastHitAt: -1, lastPlayerHitAt: -1, jumpsLeft: F.airJumps, drop: 0, grounded: false, fastFall: false, cutting: false });
  rearm(f);
  Object.assign(f, { burn: 0, bleed: 0, slip: 0, haste: 0, poison: 0, sleep: 0, drowsy: 0, shake: 0, rested: 0, cat: 0, catHurt: 0, animal: -1, animalT: 0, rune: null, runeT: 0, reflects: 0, wish: -1, jinx: 0, homing: 0, carryT: 0 });
}

function checkGameOver(world) {
  if (world.phase !== 'play' || world.fighters.length < 2 || world.training) return;
  const alive = world.fighters.filter((f) => f.stocks > 0);
  if (alive.length > 1) return;
  world.phase = 'over';
  world.timer = RULES.endDelay;
  world.winner = alive.length ? alive[0].id : -1;
  world.events.push({ type: 'game', winner: world.winner });
}

// --- Doorways ---------------------------------------------------------------------------------

// Duck into a free doorway you're standing in (on the ground, not busy attacking or blocking).
function hide(world, st, f) {
  if (!f.grounded || f.swing >= 0 || f.blocking) return;
  const i = st.doors.findIndex((d) => Math.abs(d.x - f.x) <= DOOR.reach && Math.abs(d.y - f.y) < 1);
  if (i < 0 || world.fighters.some((o) => o !== f && o.state === 'ok' && o.hidden === i)) return;
  Object.assign(f, { hidden: i, x: st.doors[i].x, vx: 0, vy: 0, crouching: false });
  world.events.push({ type: 'hide', id: f.id, x: f.x, y: f.y });
}

// --- Barrels and spikes -----------------------------------------------------------------------

function damageBarrel(b, amount, by) {
  if (b.gone || b.fuse >= 0) return;
  b.hp -= amount;
  b.flash = 0.08;
  if (by >= 0) b.lastBy = by;
  if (b.hp <= 0) b.fuse = 0;
}

function updateBarrels(world) {
  for (const b of world.barrels) {
    b.flash = Math.max(0, b.flash - DT);
    if (b.gone) {
      b.respawn -= DT;
      const blocked = world.fighters.some((f) => f.state === 'ok' && Math.abs(f.x - b.x) < 14 && Math.abs(f.y - b.y) < 30);
      if (b.respawn <= 0 && !blocked) Object.assign(b, { gone: false, hp: BARREL.health, lastBy: -1 });
      continue;
    }
    if (b.fuse >= 0) {
      b.fuse -= DT;
      if (b.fuse <= 0) explode(world, b);
    }
  }
}

function explode(world, b) {
  b.gone = true;
  b.fuse = -1;
  b.respawn = BARREL.respawnTime;
  blast(world, { x: b.x, y: b.y - 10 }, { radius: BARREL.blastRadius, damage: BARREL.blastDamage, knockback: BARREL.knockback, knockbackGrowth: BARREL.knockbackGrowth }, b.lastBy, null, 'explosion', 'barrel');
}

// An explosion: everyone in range is hurt and pushed away from the centre (less at the edge), and
// barrels in range go off a moment later. extra(f) runs on each fighter caught (fire grenades).
// what: what blew up (see cause; by default whatever was hitting already).
function blast(world, at, e, by, extra = null, look = 'explosion', what = cause) {
  using(what);
  for (const f of world.fighters) {
    const c = center(f);
    const dx = c.x - at.x;
    const dy = c.y - at.y;
    const d = Math.hypot(dx, dy);
    if (f.state !== 'ok' || d >= e.radius) continue;
    const strength = 1 - (BLAST.falloff * d) / e.radius;
    const len = d || 1;
    hit(world, f, e.damage * strength, dx / len, dy / len - BLAST.lift, e.knockback * strength, e.knockbackGrowth, by);
    if (extra) extra(f);
  }
  for (const c of world.covers) {
    // (From the nearest point of the cover.)
    const d = Math.hypot(Math.max(c.x - at.x, 0, at.x - c.x - c.w), Math.max(c.y - at.y, 0, at.y - c.y - c.h));
    if (!c.gone && d < e.radius) damageCover(world, c, e.damage * (1 - (BLAST.falloff * d) / e.radius) * COVER.blast);
  }
  for (const o of world.barrels) {
    if (!o.gone && o.fuse < 0 && Math.hypot(o.x - at.x, o.y - 10 - at.y) < e.radius) {
      o.fuse = BARREL.chainDelay;
      o.lastBy = by;
    }
  }
  world.events.push({ type: look, x: at.x, y: at.y, r: e.radius });
}

function updateSpikes(world, st) {
  for (const key of Object.keys(world.spikeCooldown)) {
    world.spikeCooldown[key] -= DT;
    if (world.spikeCooldown[key] <= 0) delete world.spikeCooldown[key];
  }
  for (const s of st.spikes) {
    const zone = spikeZone(s);
    for (const f of world.fighters) {
      if (f.state !== 'ok' || world.spikeCooldown[f.id] !== undefined) continue;
      if (!overlaps(zone, bodyRect(f))) continue;
      world.spikeCooldown[f.id] = SPIKES.cooldown;
      // Walls push you away from the wall; floors pop you up, a little away from the middle.
      const [dx, dy] = s.up ? [Math.sign(f.x - (s.x + (s.width * TILE) / 2)) * 0.3, -1] : [s.face, -0.6];
      using('spikes');
      hit(world, f, SPIKES.damage, dx, dy, SPIKES.knockback, SPIKES.knockbackGrowth, -1, Infinity, true);
      world.events.push({ type: 'spark', x: f.x, y: f.y - F.h / 2, dx, dy: s.up ? -1 : -0.5 });
    }
  }
}

// --- Grenades -----------------------------------------------------------------------------------

// Press the grenade button to take out the next grenade and start cooking it; hold to aim; let go
// to throw. Holding it past its fuse sets it off in your hand. Getting hit drops it at your feet.
function useGrenade(world, f, input, press, control) {
  if (f.cook < 0) {
    // With your C4 stuck somewhere, the button sets it off.
    const c4 = press.gp && world.grenades.filter((g) => g.owner === f.id && GRENADES[g.kind].remote);
    if (c4?.length) {
      for (const g of c4) g.fuse = 0;
      return;
    }
    if (!press.gp || !f.grenades.length || f.blocking || f.swing >= 0 || f.chain) return;
    f.cooking = world.infiniteAmmo ? f.grenades[0] : f.grenades.shift();
    f.cook = 0;
    return;
  }
  const g = GRENADES[f.cooking];
  f.cook += DT;
  const o = aimOrigin(f);
  if (f.cook >= g.fuse) return letGo(world, f, o.x, o.y, 0, 0, 0);
  if (!control) return letGo(world, f, f.x, f.y - 8, f.vx * 0.5, -60, g.fuse - f.cook);
  if (input.grenadeHeld) return;
  const t = GRENADE;
  letGo(world, f, o.x, o.y, f.aimX * t.throwSpeed + f.vx * 0.3, f.aimY * t.throwSpeed - t.lift, g.fuse - f.cook);
  world.events.push({ type: 'throw', id: f.id, x: f.x, y: f.y - 20 });
}

function letGo(world, f, x, y, vx, vy, fuse) {
  // (on: the fighter a C4 is stuck to, or -1; stuck: stuck to a wall or floor; power: how long it
  // was cooked, 0..1, for the soda.)
  const power = Math.min(1, f.cook / GRENADES[f.cooking].fuse);
  world.grenades.push({ id: world.nextGrenade++, owner: f.id, kind: f.cooking, x, y, x0: x, y0: y, born: world.tick, vx, vy, fuse, on: -1, stuck: false, power });
  f.cook = -1;
  f.cooking = null;
}

// Grenades fly, bounce off walls and floors (landing on thin platforms from above), roll to a stop
// and go off when the fuse runs out. A warp grenade touching someone swaps you with them.
function updateGrenades(world, st) {
  const walls = solids(world, st);
  const thins = (world.live ?? st.blocks).filter((b) => b.oneWay);
  const t = GRENADE;
  const box = (g) => ({ x: g.x - t.size / 2, y: g.y - t.size / 2, w: t.size, h: t.size });
  world.grenades = world.grenades.filter((g) => {
    if (world.haven && inHaven(world, g.x) && !GRENADES[g.kind].plant) {
      world.events.push({ type: 'fizzle', x: g.x, y: g.y });
      return false;
    }
    const remote = GRENADES[g.kind].remote;
    if (remote && (g.stuck || g.on >= 0)) {
      // C4 stuck to a wall stays put; stuck to someone, it goes where they go (falling off if
      // they're knocked out).
      const v = world.fighters[g.on];
      if (v && v.state === 'ok') Object.assign(g, { x: v.x + g.ox, y: v.y + g.oy });
      else if (v) Object.assign(g, { on: -1, stuck: false });
      if (g.fuse > 0) return true;
      detonate(world, st, g);
      return false;
    }
    g.fuse -= DT;
    g.vy = Math.min(g.vy + t.gravity * DT, 600);
    g.x += g.vx * DT;
    let bumped = false;
    if (walls.some((r) => overlaps(box(g), r))) {
      g.x -= g.vx * DT;
      g.vx = -g.vx * t.bounce;
      bumped = true;
      if (remote) g.stuck = true;
    }
    const prevBottom = g.y + t.size / 2;
    g.y += g.vy * DT;
    const landed = thins.find((r) => g.vy > 0 && prevBottom <= r.y + 0.01 && g.y + t.size / 2 >= r.y && g.x > r.x && g.x < r.x + r.w);
    const floor = landed || (g.vy > 0 && walls.find((r) => overlaps(box(g), r)));
    if (floor && GRENADES[g.kind].plant) {
      // The banner: planted where it first lands.
      plantBanner(world, g.owner, g.x, floor.y);
      return false;
    }
    if (walls.some((r) => overlaps(box(g), r)) || landed) {
      if (landed) g.y = landed.y - t.size / 2;
      else g.y -= g.vy * DT;
      g.vy = Math.abs(g.vy) < 60 ? 0 : -g.vy * t.bounce;
      g.vx *= t.friction;
      bumped = true;
      if (remote) g.stuck = true;
    }
    // (The soda bursts on the first thing it touches.)
    if (GRENADES[g.kind].impact && (bumped || world.fighters.some((o) => o.id !== g.owner && o.state === 'ok' && o.hidden < 0 && overlaps(box(g), bodyRect(o))))) g.fuse = 0;
    if (remote) {
      const v = !g.stuck && world.fighters.find((o) => o.id !== g.owner && o.state === 'ok' && o.hidden < 0 && overlaps(box(g), bodyRect(o)));
      if (v) Object.assign(g, { on: v.id, ox: g.x - v.x, oy: g.y - v.y });
      if (g.stuck || v) {
        Object.assign(g, { vx: 0, vy: 0 });
        world.events.push({ type: 'stick', x: g.x, y: g.y });
      }
      return true;
    }
    if (GRENADES[g.kind].warp) {
      const owner = world.fighters[g.owner];
      const v = world.fighters.find((o) => o.id !== g.owner && o.state === 'ok' && o.hidden < 0 && overlaps(box(g), bodyRect(o)));
      if (v && owner.state === 'ok') {
        const [ox, oy] = [owner.x, owner.y];
        Object.assign(owner, { x: v.x, y: v.y, vx: 0, vy: 0 });
        Object.assign(v, { x: ox, y: oy, vx: 0, vy: 0 });
        world.events.push({ type: 'warp', id: owner.id, x: owner.x, y: owner.y - F.h / 2 }, { type: 'warp', id: v.id, x: v.x, y: v.y - F.h / 2 });
        return false;
      }
    }
    if (g.fuse > 0) return true;
    detonate(world, st, g);
    return false;
  });
}

// Can this grenade be shot (see updateBullets)? Not the banner (it never goes off), and not by
// the one who threw it for GRENADE.ownShotGrace s (spraying right after a throw doesn't blow it
// up in their face).
function shootable(world, g, shooter) {
  if (GRENADES[g.kind].plant) return false;
  return !(g.owner === shooter && (world.tick - (g.born ?? 0)) * DT < GRENADE.ownShotGrace);
}

function detonate(world, st, g) {
  const k = GRENADES[g.kind];
  const at = { x: g.x, y: g.y };
  // (Set off by a shot: the shooter gets the blame for what it does; see updateBullets.)
  const by = g.shotBy ?? g.owner;
  if (k.explode) {
    const burn = k.burn ? (f) => Object.assign(f, { burn: k.burn.time, burnBy: by }) : null;
    blast(world, at, k.explode, by, burn, k.burn ? 'fireball' : k.cash ? 'moneyblast' : 'explosion', g.kind);
    if (k.cash) showerCash(world, at, k.cash);
  } else if (k.hole) {
    world.holes.push({ id: world.nextCloud++, x: at.x, y: at.y, r: k.hole.radius, t: k.hole.time, pull: k.hole.pull });
    world.events.push({ type: 'hole', x: at.x, y: at.y });
  } else if (k.cloud) {
    world.clouds.push({ id: world.nextCloud++, kind: g.kind, x: at.x, y: at.y, r: k.cloud.radius, t: k.cloud.time, by });
    world.events.push({ type: 'cloud', kind: g.kind, x: at.x, y: at.y });
  } else if (k.soda) {
    // As big as it was shaken.
    const p = g.power ?? 0;
    const e = Object.fromEntries(Object.keys(k.soda.max).map((key) => [key, k.soda.min[key] + (k.soda.max[key] - k.soda.min[key]) * p]));
    blast(world, at, e, by, null, 'soda', g.kind);
  } else if (k.polymorph) {
    world.events.push({ type: 'poof', x: at.x, y: at.y, r: k.polymorph.radius });
    for (const f of world.fighters) {
      if (f.state !== 'ok' || f.invincible > 0 || f.dodge > 0) continue;
      if (Math.hypot(center(f).x - at.x, center(f).y - at.y) > k.polymorph.radius) continue;
      if (f.cat) unmorph(world, f);
      Object.assign(f, { animal: Math.floor(world.rng() * ANIMALS.length), animalT: k.polymorph.time, swing: -1, blocking: null, holding: -1, hidden: -1 });
      world.events.push({ type: 'morph', id: f.id, x: f.x, y: f.y - F.crouchH / 2, animal: ANIMALS[f.animal] });
    }
  } else if (k.warp) {
    const f = world.fighters[g.owner];
    if (f.state !== 'ok' || f.hidden >= 0) return;
    world.events.push({ type: 'warp', id: f.id, x: f.x, y: f.y - F.h / 2 });
    // Stand where it went off, nudged up out of any wall or floor.
    Object.assign(f, { x: at.x, y: at.y + F.h / 2, vx: 0, vy: 0 });
    for (let k = 0; k < 40 && solids(world, st).some((r) => overlaps(bodyRect(f), r)); k++) f.y -= 2;
    world.events.push({ type: 'warp', id: f.id, x: f.x, y: f.y - F.h / 2 });
  }
}

// Burning and poison clouds: damage over time, no stun.
function updateAilments(world) {
  for (const f of world.fighters) {
    if (f.bleed > 0) {
      f.bleed = f.state === 'ok' ? Math.max(0, f.bleed - DT) : 0;
      chip(world, f, f.bleedRate * DT, f.bleedBy, true);
    }
    if (f.poison > 0) {
      f.poison = f.state === 'ok' ? Math.max(0, f.poison - DT) : 0;
      chip(world, f, VENT.poison.perSecond * DT, -1, true);
    }
    if (f.burn <= 0) continue;
    f.burn = f.state === 'ok' ? f.burn - DT : 0;
    chip(world, f, GRENADES.fire.burn.perSecond * DT, f.burnBy, true);
  }
  world.clouds = world.clouds.filter((c) => {
    c.t -= DT;
    const per = c.perSecond ?? GRENADES[c.kind].cloud.perSecond;
    if (GRENADES[c.kind]?.cloud?.drowsy) {
      for (const f of world.fighters) {
        if (f.state !== 'ok' || f.drowsy > 0 || f.sleep > 0 || f.rested > 0 || f.invincible > 0) continue;
        if (Math.hypot(center(f).x - c.x, center(f).y - c.y) >= c.r) continue;
        Object.assign(f, { drowsy: DROWSY.time, shake: 0, shakeLast: null, shakeRun: 0, shakeHeld: 0 });
        world.events.push({ type: 'drowsy', id: f.id, x: f.x, y: f.y - F.h });
      }
    }
    if (per) for (const f of world.fighters) if (f.state === 'ok' && Math.hypot(center(f).x - c.x, center(f).y - c.y) < c.r) chip(world, f, per * DT, c.by, true);
    return c.t > 0;
  });
}

// The Ring of Cat and the polymorph potion (see CAT, ANIMALS).
function becomeCat(world, f) {
  if (f.cat || f.animal >= 0) return;
  f.ring--;
  Object.assign(f, { cat: 1 + Math.floor(world.rng() * CAT.kinds), catHurt: 0, swing: -1, blocking: null, holding: -1 });
  world.events.push({ type: 'morph', id: f.id, x: f.x, y: f.y - F.crouchH / 2, cat: f.cat });
}

function unmorph(world, f) {
  Object.assign(f, { cat: 0, catHurt: 0, animal: -1, animalT: 0 });
  world.events.push({ type: 'unmorph', id: f.id, x: f.x, y: f.y - F.h / 2 });
}

// Any other status turns you back (a cat keeps through drowsiness and sleep); an animal also
// turns back when its time is up.
function morphTick(world, f) {
  const status = f.burn > 0 || f.poison > 0 || f.bleed > 0 || f.slip > 0 || f.jinx > 0 || f.stunned || !!f.pendingLaunch || (!f.cat && (f.drowsy > 0 || f.sleep > 0));
  if (status || (f.animal >= 0 && (f.animalT -= DT) <= 0)) unmorph(world, f);
}

// Damage turns an animal back at once, a cat once it adds up to CAT.breakAt.
function morphHurt(world, f, amount) {
  if (!(amount > 0)) return;
  if (f.animal >= 0) return unmorph(world, f);
  if (f.cat && (f.catHurt += amount) >= CAT.breakAt) unmorph(world, f);
}

// Sleep and drowsiness (see SLEEP, DROWSY). Falling asleep drops whatever you were doing.
function fallAsleep(world, f) {
  Object.assign(f, { sleep: SLEEP.time, drowsy: 0, shake: 0, shakeLast: null, shakeRun: 0, shakeHeld: f.heldX, swing: -1, blocking: null, hidden: -1 });
  world.events.push({ type: 'sleep', id: f.id, x: f.x, y: f.y - F.h });
}

function wake(world, f) {
  Object.assign(f, { sleep: 0, rested: SLEEP.rested });
  world.events.push({ type: 'wake', id: f.id, x: f.x, y: f.y - F.h });
}

function clearDrowsy(world, f) {
  Object.assign(f, { drowsy: 0, shake: 0, rested: SLEEP.rested });
  world.events.push({ type: 'shake', id: f.id, x: f.x, y: f.y - F.h });
}

// Jerky moves fill f.shake (see DROWSY): turns, jumps, dashes, taps down, each worth less when
// it's the same one again in a row. Shakes off drowsiness; wakes you early from sleep.
function shakeMoves(f, input, press) {
  const s = DROWSY.shake;
  const move = (kind, base) => {
    f.shakeRun = kind === f.shakeLast ? f.shakeRun + 1 : 0;
    f.shakeLast = kind;
    f.shake += base * s.repeat ** f.shakeRun;
  };
  const dir = Math.sign(input.mx ?? 0);
  if (dir && dir !== f.shakeHeld) move(dir > 0 ? 'right' : 'left', s.turn);
  f.shakeHeld = dir;
  if (press.jp) move('jump', s.jump);
  if (press.xp) move('dash', s.dash);
  if (press.dp) move('drop', s.drop);
}

// Drowsy: jerky moves shake it off; if the time runs out first, you fall asleep.
function drowsyTick(world, f, input, press) {
  shakeMoves(f, input, press);
  if (f.shake >= 1) return clearDrowsy(world, f);
  if ((f.drowsy -= DT) <= 0) fallAsleep(world, f);
}

// Is this point inside a smoke or poison cloud? (Bots can't see through them.)
export const inCloud = (world, x, y) => (world.clouds ?? []).some((c) => c.kind !== 'spore' && Math.hypot(c.x - x, c.y - y) < c.r * 0.9);

// --- Moving stage pieces ----------------------------------------------------------------------

const ease = (k) => k * k * (3 - 2 * k);
const standingOn = (f, x, y, w) => f.state === 'ok' && f.grounded && Math.abs(f.y - y) < 0.5 && f.x + F.w / 2 > x && f.x - F.w / 2 < x + w;

// Moves the stage's movers for this tick, carries whoever stands on them, and rebuilds world.live
// (the blocks that are there right now). Timed movers run off the tick count, so they're the same
// on every machine; `phase` staggers them.
function updateMovers(world, st) {
  if (!st.movers) return;
  const time = world.tick * DT;
  const live = [...world.standing];
  st.movers.forEach((def, i) => {
    const m = world.movers[i];
    const oldY = m.y;
    const oldX = m.x ?? def.x;
    if (def.kind === 'drift') {
      const t = ((time + def.phase) % def.period) / def.period;
      m.x = def.left + (def.right - def.left) * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
    } else if (def.kind === 'bridge') {
      const c = MOVERS.bridge;
      const t = (time + def.phase) % (c.up + c.warn + c.open);
      m.on = t < c.up + c.warn;
      m.warn = t >= c.up && m.on;
    } else if (def.kind === 'lift') {
      const c = MOVERS.lift;
      const t = (time + def.phase) % (2 * (c.wait + c.travel));
      const k = t < c.wait ? 0 : t < c.wait + c.travel ? ease((t - c.wait) / c.travel) : t < 2 * c.wait + c.travel ? 1 : 1 - ease((t - 2 * c.wait - c.travel) / c.travel);
      m.y = def.bottom + (def.top - def.bottom) * k;
    } else if (def.kind === 'crusher') {
      const c = MOVERS.crusher;
      let t = (time + def.phase) % (c.wait + c.warn + c.slam + c.hold + c.rise);
      m.warn = t >= c.wait && t < c.wait + c.warn;
      t -= c.wait + c.warn;
      const k = t < 0 ? 0 : t < c.slam ? t / c.slam : t < c.slam + c.hold ? 1 : 1 - ease((t - c.slam - c.hold) / c.rise);
      m.y = def.top + (def.bottom - def.top) * k;
      if (m.y > oldY) crush(world, def, m);
      else spikedUnderside(world, def, m);
    } else if (def.kind === 'crumble') {
      const c = MOVERS.crumble;
      if (m.on && m.t < 0) {
        if (world.fighters.some((f) => standingOn(f, def.x, def.y, def.w))) m.t = 0;
      } else if (m.on) {
        m.t += DT;
        if (m.t >= c.shake) Object.assign(m, { on: false, t: 0 });
      } else {
        m.t += DT;
        const rect = { x: def.x, y: def.y, w: def.w, h: def.h };
        if (m.t >= c.gone && !world.fighters.some((f) => f.state === 'ok' && overlaps(rect, bodyRect(f)))) Object.assign(m, { on: true, t: -1 });
      }
      m.warn = m.on && m.t >= 0;
    }
    const dy = m.y - oldY;
    const x = m.x ?? def.x;
    // (Whoever stands on it rides along.)
    if (dy !== 0 || x !== oldX) {
      for (const f of world.fighters) {
        if (!standingOn(f, oldX, oldY, def.w)) continue;
        f.y = m.y;
        f.x += x - oldX;
      }
    }
    if (m.on) live.push({ x, y: m.y, w: def.w, h: def.h, look: def.look, oneWay: !!def.oneWay, glue: !!def.glue, slack: Math.max(0, -dy) });
  });
  world.live = live;
}

// The wind (see WIND): gusts, the other way each time, each lasting its own while (the same on
// every machine: it comes from which gust it is). People drift with it (windDrift); grenades and
// money lying around are blown along.
function updateWind(world, st, canAct) {
  if (!st.wind) return;
  const w = st.wind;
  const time = world.tick * DT;
  const n = Math.floor(time / w.every);
  const t = time % w.every;
  const [lo, hi] = WIND.gust;
  const gust = lo + (((n * 7919) >>> 0) % 1000) / 1000 * (hi - lo);
  const on = t >= w.every - gust;
  const dir = n % 2 ? -1 : 1;
  world.wind = { dir, on, warn: !on && t >= w.every - gust - WIND.warn };
  if (!on || !canAct) return;
  const blow = dir * WIND.things;
  for (const g of world.grenades) if (!g.stuck && g.on < 0) g.vx = approach(g.vx, blow, 400 * DT);
  for (const m of world.loot) {
    m.landed = false;
    m.vx = approach(m.vx, blow, 300 * DT);
  }
}

// How fast the wind carries someone along right now (px/s; 0 with no gust).
function windDrift(world, f) {
  const w = world.wind;
  if (!w?.on || f.hidden >= 0) return 0;
  return w.dir * (f.grounded ? WIND.ground : WIND.air);
}

// Gas vents (see VENT): each puffs a poison cloud now and then, bubbling first.
function updateVents(world, st) {
  if (!st.vents) return;
  const time = world.tick * DT;
  st.vents.forEach((v, i) => {
    const t = (time + v.phase) % v.every;
    // (How far into the warning it is, 0..1: the rock shakes harder and harder.)
    world.vents[i] = t >= v.every - VENT.warn ? (t - (v.every - VENT.warn)) / VENT.warn : 0;
    if (t >= DT) return;
    // A burst of gas: a quick cloud (looks only), a push away from it, and poison.
    world.clouds.push({ id: world.nextCloud++, kind: 'vent', x: v.x, y: v.y - VENT.radius * 0.5, r: VENT.radius, t: 1.2, by: -1, perSecond: 0 });
    world.events.push({ type: 'vent', x: v.x, y: v.y });
    for (const f of world.fighters) {
      const c = center(f);
      const dx = c.x - v.x;
      const dy = c.y - v.y;
      if (f.state !== 'ok' || Math.hypot(dx, dy) > VENT.radius) continue;
      using('vent');
      if (hit(world, f, VENT.damage, Math.sign(dx) || 1, -0.7, VENT.knockback, VENT.knockbackGrowth, -1)) f.poison = VENT.poison.time;
    }
  });
}

// Portals (see PORTAL): in one, out the other. The storm reaching one moves them both.
function updatePortals(world, st) {
  if (!world.portalsAt) return;
  const p = PORTAL;
  const s = world.storm;
  if (s && world.portalsAt.some((o) => o.x - p.w / 2 <= s.wallLeft || o.x + p.w / 2 >= s.wallRight)) {
    movePortals(world, st);
    if (!world.portalsAt) return;
  }
  const at = world.portalsAt;
  for (const f of world.fighters) {
    f.portalCd = Math.max(0, (f.portalCd ?? 0) - DT);
    if (f.state !== 'ok' || f.portalCd > 0) continue;
    // (Where the body was this tick and the last, so someone flying fast can't skip past one.)
    const b = bodyRect(f);
    const sweep = { x: b.x - Math.max(0, f.vx * DT), y: b.y - Math.max(0, f.vy * DT), w: b.w + Math.abs(f.vx * DT), h: b.h + Math.abs(f.vy * DT) };
    const i = at.findIndex((o) => overlaps({ x: o.x - p.w / 2, y: o.y - p.h, w: p.w, h: p.h }, sweep));
    if (i < 0) continue;
    const to = at[i ^ 1];
    if (!to) continue;
    world.events.push({ type: 'portal', x: f.x, y: f.y - F.h / 2 });
    Object.assign(f, { x: to.x, y: to.y, portalCd: p.cooldown, grounded: false });
    world.events.push({ type: 'portal', x: f.x, y: f.y - F.h / 2 });
  }
}

// The storm reached a portal: put both somewhere clear of it (see PORTAL), or nowhere if there's
// no room left. Random, but the same on every machine (world.rng).
function movePortals(world, st) {
  const p = PORTAL;
  const s = world.storm;
  const lo = s.wallLeft + p.w;
  const hi = s.wallRight - p.w;
  const grounds = st.blocks
    .filter((b) => !b.oneWay && !b.cover && b.w >= 64)
    .map((b) => ({ x0: Math.max(b.x + p.w / 2, lo), x1: Math.min(b.x + b.w - p.w / 2, hi), y: b.y }))
    .filter((g) => g.x1 > g.x0);
  const length = grounds.reduce((n, g) => n + g.x1 - g.x0, 0);
  if (!length || hi - lo < 2 * p.w) {
    world.portalsAt = null;
    world.events.push({ type: 'portalmove' });
    return;
  }
  const onGround = () => {
    let k = world.rng() * length;
    for (const g of grounds) {
      if (k <= g.x1 - g.x0) return { x: g.x0 + k, y: g.y };
      k -= g.x1 - g.x0;
    }
    return { x: grounds[0].x0, y: grounds[0].y };
  };
  const apart = Math.min(p.apart, (hi - lo) / 2);
  const a = onGround();
  const inAir = world.rng() < 0.5;
  let b = null;
  for (let tries = 0; tries < 30 && !b; tries++) {
    let c;
    if (inAir) {
      const g = onGround();
      c = { x: g.x, y: g.y - 64 - world.rng() * (p.air - 64) };
      // (Not inside anything.)
      if ((world.live ?? st.blocks).some((r) => overlaps({ x: c.x - p.w / 2, y: c.y - p.h, w: p.w, h: p.h }, r))) c = null;
    } else c = onGround();
    if (c && Math.abs(c.x - a.x) >= apart) b = c;
  }
  world.portalsAt = [a, b ?? onGround()];
  world.events.push({ type: 'portalmove' });
}

// A crusher that isn't falling: its spiked underside hurts like any spikes, pushing you down and
// away from its middle.
function spikedUnderside(world, def, m) {
  const zone = { x: def.x, y: m.y + def.h, w: def.w, h: 3 };
  for (const f of world.fighters) {
    if (f.state !== 'ok' || world.spikeCooldown[f.id] !== undefined || !overlaps(zone, bodyRect(f))) continue;
    world.spikeCooldown[f.id] = SPIKES.cooldown;
    const side = f.x < def.x + def.w / 2 ? -1 : 1;
    using('crusher');
    hit(world, f, SPIKES.damage, side * 0.5, 1, SPIKES.knockback, SPIKES.knockbackGrowth, -1, Infinity, true);
    world.events.push({ type: 'spark', x: f.x, y: m.y + def.h, dx: side, dy: 1 });
  }
}

// A slamming crusher hits anyone under it and shoves them out to the nearer side.
function crush(world, def, m) {
  const c = MOVERS.crusher;
  const rect = { x: def.x, y: m.y, w: def.w, h: def.h };
  const mid = def.x + def.w / 2;
  for (const f of world.fighters) {
    if (f.state !== 'ok' || !overlaps(rect, bodyRect(f))) continue;
    const side = f.x < mid ? -1 : 1;
    f.x = side < 0 ? def.x - F.w / 2 : def.x + def.w + F.w / 2;
    if (world.spikeCooldown[f.id] !== undefined) continue;
    world.spikeCooldown[f.id] = SPIKES.cooldown;
    using('crusher');
    hit(world, f, c.damage, side, -0.35, c.knockback, c.knockbackGrowth, -1, Infinity, true);
    world.events.push({ type: 'spark', x: f.x, y: f.y - F.h / 2, dx: side, dy: -0.3 });
  }
}

// --- Storm ------------------------------------------------------------------------------------

// The storm waits, then the safe area shrinks from both sides toward a random spot, in two steps.
// On a stage built from sections, the zones snap to them: three sections, then one that the stage
// allows to be the last (see canEndHere in sections.js).
function createStorm(st, cfg, rng) {
  const { left, right } = st.storm;
  let zone1;
  let zone2;
  if (st.arena) {
    // (A random dungeon's arena: the storm closes on it, its slab the last ground.)
    zone2 = [st.arena.left, st.arena.right];
    zone1 = [Math.max(left, st.arena.left - 96 - 256), Math.min(right, st.arena.right + 96 + 256)];
  } else {
    const c2 = left + cfg.finalWidth / 2 + rng() * (right - left - cfg.finalWidth);
    const c1 = clamp(c2, left + cfg.firstWidth / 2, right - cfg.firstWidth / 2);
    zone1 = [c1 - cfg.firstWidth / 2, c1 + cfg.firstWidth / 2];
    zone2 = [c2 - cfg.finalWidth / 2, c2 + cfg.finalWidth / 2];
  }
  return {
    cfg,
    time: 0,
    left,
    right,
    wallLeft: left,
    wallRight: right,
    start: [left, right],
    zone1,
    zone2,
  };
}

function updateStorm(world) {
  const s = world.storm;
  const c = s.cfg;
  s.time += DT;
  const t = s.time - c.startDelay;
  let zone = s.start;
  if (t > 0) {
    zone = lerp2(s.start, s.zone1, clamp(t / c.firstShrink, 0, 1));
    const t2 = t - c.firstShrink - c.hold;
    if (t2 > 0) zone = lerp2(s.zone1, s.zone2, clamp(t2 / c.finalShrink, 0, 1));
  }
  [s.left, s.right] = zone;
  // Each side of the storm: a pale band next to the safe zone (hurts), then the deep-red wall.
  s.wallLeft = s.left - c.dangerBand * (s.left - s.start[0]);
  s.wallRight = s.right + c.dangerBand * (s.start[1] - s.right);
  for (const f of world.fighters) {
    if (f.state === 'ok' && f.invincible <= 0 && (f.x < s.left || f.x > s.right)) f.damage = Math.min(999, f.damage + c.damagePerSecond * DT);
  }
}

// The deep-red storm wall is the new edge of the stage: it stops you, but a hit that launches
// you into it fast enough costs a life.
function enforceStormWall(world, st) {
  const s = world.storm;
  const half = F.w / 2;
  for (const f of world.fighters) {
    if (f.state !== 'ok') continue;
    if (f.x - half < s.wallLeft) {
      if (f.hitstun > 0 && -f.vx > s.cfg.wallKoSpeed) knockOut(world, st, f, 'storm');
      else {
        f.x = s.wallLeft + half;
        f.vx = Math.max(f.vx, 0);
      }
    } else if (f.x + half > s.wallRight) {
      if (f.hitstun > 0 && f.vx > s.cfg.wallKoSpeed) knockOut(world, st, f, 'storm');
      else {
        f.x = s.wallRight - half;
        f.vx = Math.min(f.vx, 0);
      }
    }
  }
}

export function stormStatus(s) {
  const c = s.cfg;
  const t = s.time - c.startDelay;
  if (t < -3600) return { text: '', next: null }; // (turned off: never comes)
  if (t < 0) return { text: `STORM IN ${Math.ceil(-t)}`, next: t > -10 ? s.zone1 : null };
  if (t < c.firstShrink) return { text: 'STORM CLOSING', next: s.zone1 };
  const t2 = t - c.firstShrink - c.hold;
  if (t2 < 0) return { text: `STORM IN ${Math.ceil(-t2)}`, next: s.zone2 };
  if (t2 < c.finalShrink) return { text: 'STORM CLOSING', next: s.zone2 };
  return { text: 'FINAL ZONE', next: null };
}

// --- Small helpers ----------------------------------------------------------------------------

function approach(value, target, amount) {
  return value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleHitsRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

// The world's random numbers (world.rng()), the same sequence as mulberry32, but where it's up to is
// kept in the world itself (rngState): a saved copy of the world rolls the same numbers again (see
// src/sim/snapshot.js). The function itself is hidden (not copied with the world).
export function attachRng(world) {
  const rng = () => {
    world.rngState = (world.rngState + 0x6d2b79f5) >>> 0;
    let t = world.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Object.defineProperty(world, 'rng', { value: rng, enumerable: false, configurable: true, writable: true });
  return world;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
