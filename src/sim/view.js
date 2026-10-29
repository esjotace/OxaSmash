// What the renderer needs from the world: drawn locally, and sent by the host to guests ~30×/s.
import { GUNS, GRENADES, LOOT, ITEMS, HAVEN, GUN_THROW, AMMO_CHEST, STYLE } from './constants.js';
import { stormStatus, sparesOf } from './world.js';

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

export function toView(world) {
  const s = world.storm;
  const status = stormStatus(s);
  return {
    tick: world.tick,
    phase: world.phase,
    timer: r2(world.timer),
    winner: world.winner,
    fighters: world.fighters.map((f) => ({
      id: f.id,
      x: r1(f.x),
      y: r1(f.y),
      vy: Math.round(f.vy),
      facing: f.facing,
      aimX: r2(f.aimX),
      aimY: r2(f.aimY),
      grounded: f.grounded,
      damage: Math.floor(f.damage),
      stocks: f.stocks,
      state: f.state,
      melee: f.melee,
      blade: f.blade,
      // The swing in progress: time since it started, its direction and the weapon swinging
      // (null = fists); the renderer animates the arc.
      // (jab: a jab, not the heavy swing.)
      swing: f.swing >= 0 ? { t: r2(f.swing), x: r2(f.swingX), y: r2(f.swingY), w: f.swingWeapon, jab: f.swingVariant === 'jab' } : null,
      swingStance: f.swingStance,
      crouching: f.crouching,
      tucked: !!f.tucked,
      blocking: f.blocking,
      dropping: f.blockDrop >= 0 ? f.dropStance : null,
      stunned: f.stunned,
      frozen: !!f.pendingLaunch, // frozen by the keyboard's 100% phrase (drawn jiggling)
      hidden: f.hidden >= 0,
      hitstun: f.hitstun > 0,
      flash: f.flash > 0,
      invincible: r2(f.invincible),
      kos: f.kos,
      hasGun: f.hasGun,
      ammo: f.ammo,
      spareMags: sparesOf(f),
      gun: f.gun,
      reload: f.reload > 0 && f.gun ? r2(1 - f.reload / GUNS[f.gun].reloadTime) : 0,
      grenades: f.grenades,
      // The grenade in hand: its kind and how much of its fuse is left (0..1).
      cooking: f.cook >= 0 ? { kind: f.cooking, left: r2(1 - f.cook / GRENADES[f.cooking].fuse) } : null,
      burning: f.burn > 0,
      slipping: f.slip > 0,
      hasted: f.haste > 0,
      uses: f.uses, // bites taken out of the melee weapon (a bitten carrot is drawn rotten)
      throwReady: f.throwCd <= 0, // a weapon you keep when throwing (the cleaver) can be thrown again
      // The style meter (0..1), and how much of the headshot cooldown is left (0..1).
      style: r2(f.style),
      styleCd: r2(f.styleHeadCd / STYLE.headshotCooldown),
      bleeding: f.bleed > 0,
      active: f.active,
      stamina: r2(f.stamina),
      dashing: f.dash > 0,
      dodging: f.dodge > 0,
      glued: f.grounded && (f.onGlue || !!f.slimed),
      // Seconds the melee button has been held (winding up a throw, or charging), or null.
      holding: f.holding >= 0 ? r2(f.holding) : null,
      // How drawn the bow is / charged the railgun (0..1), or null.
      // (Or how wound up the throw of an empty gun is.)
      gunHold: f.gunHold >= 0 && f.gun ? r2(Math.min(1, f.gunHold / (f.ammo === 0 && sparesOf(f) === 0 ? GUN_THROW.hold : GUNS[f.gun].charge?.time ?? 1))) : null,
      slimed: !!f.slimed,
      // The trident out on its chain: where its head is, and whether it has caught someone.
      chain: f.chain ? { x: r1(f.chain.x), y: r1(f.chain.y), caught: f.chain.phase === 'pull' } : null,
      muzzle: f.muzzle > 0,
      // Items: what's held up, the rune on you (and how much of it is left), rubbing the lamp,
      // jinxed, shots homing in.
      carry: f.carry,
      rune: f.rune,
      runeK: f.rune ? r2(f.runeT / ITEMS[f.rune].rune.time) : 0,
      wishing: f.wish >= 0,
      jinxed: f.jinx > 0,
      homing: f.homing > 0,
      walk: r1(f.walk),
    })),
    bullets: world.bullets.map((b) => ({ id: b.id, x: r1(b.x), y: r1(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy), thrown: b.thrown, kind: b.kind ?? null, look: b.look ?? null, size: b.size ?? 1, deflected: !!b.deflected })),
    grenades: world.grenades.map((g) => ({ id: g.id, x: r1(g.x), y: r1(g.y), kind: g.kind, fuse: r2(g.fuse), stuck: g.stuck || g.on >= 0 })),
    clouds: world.clouds.map((c) => ({ id: c.id, kind: c.kind, x: r1(c.x), y: r1(c.y), r: c.r, t: r2(c.t) })),
    // Slime glue on floors [x1, x2, y, t]; arrows stuck in walls [x, y, dir, t]; money lying
    // around [id, x, y, look, blinking].
    // Black holes [id, x, y, r, t].
    holes: world.holes.map((h) => [h.id, r1(h.x), r1(h.y), h.r, r1(h.t)]),
    puddles: world.puddles.map((p) => [r1(p.x1), r1(p.x2), p.y, r1(p.t)]),
    footholds: world.footholds.map((h) => [h.x, h.y, h.dir, r1(h.t)]),
    loot: world.loot.map((m) => [m.id, r1(m.x), r1(m.y), m.look, m.t > LOOT.lie ? 1 : 0]),
    paints: world.paints.map((p) => [r1(p.x1), r1(p.x2), p.y, p.owner, r1(p.t)]),
    training: world.training,
    infiniteAmmo: world.infiniteAmmo,
    chest: world.chest && [world.chest.x, world.chest.y],
    // Ammo chests [x, y, shut (0..1: how long until it opens again)].
    ammoChests: world.ammoChests.map((c) => [c.x, c.y, r2(c.cd / AMMO_CHEST.cooldown)]),
    // The banner's melee-only zone: [left, right, x, y, owner, how far along the planter is (0..1),
    // how close it is to fading out with its thrower away (0..1)].
    haven: world.haven && [r1(world.haven.left), r1(world.haven.right), world.haven.x, world.haven.y, world.haven.owner, r2(world.haven.held / GRENADES.banner.plant.hold), r2((world.haven.away ?? 0) / HAVEN.away)],
    crown: world.crown ?? -1,
    // Moving stage pieces: [y, there (1/0), about to change (1/0)].
    movers: world.movers.map((m) => [r1(m.y), m.on ? 1 : 0, m.warn ? 1 : 0]),
    // (blink: an empty gun about to vanish.)
    pickups: world.pickups.map((p) => ({ id: p.id, x: p.x, y: p.y, weapon: p.weapon, blink: p.ammo === 0 && p.t > GUN_THROW.emptyLife - GUN_THROW.emptyBlink })),
    covers: world.covers.map((c) => (c.gone ? 0 : { hp: Math.ceil(c.hp), max: c.max, flash: c.flash > 0 })),
    barrels: world.barrels.map((b) => (b.gone ? 0 : b.flash > 0 || (b.fuse >= 0 && Math.floor(b.fuse * 30) % 2 === 0) ? 2 : 1)),
    storm: { left: r1(s.left), right: r1(s.right), wallLeft: r1(s.wallLeft), wallRight: r1(s.wallRight), text: status.text, next: status.next && [r1(status.next[0]), r1(status.next[1])] },
  };
}
