// Bots read the world and produce the same input a player would, so the rules treat them alike.
// Priorities: get back on stage > get out of the storm > fight the nearest enemy. Ported from Godot.
import { getStage } from '../sim/stage.js';
import { bump } from '../sim/input.js';
import { DT, FIGHTER, GUNS, GRENADES, GRENADE, GUN_THROW } from '../sim/constants.js';
import { center, aimOrigin, gunOrigin, lineOfSight, groundBelow, respawnPoint, solids, mulberry32, sparesOf } from '../sim/world.js';

const LEVELS = {
  easy: { think: 0.45, aimError: 0.22, fireGap: 0.7, meleeGap: 0.6 },
  normal: { think: 0.25, aimError: 0.12, fireGap: 0.4, meleeGap: 0.35 },
  hard: { think: 0.12, aimError: 0.05, fireGap: 0.22, meleeGap: 0.2 },
  // Training dummy: stands there and takes it.
  dummy: { dummy: true, think: 1, aimError: 0, fireGap: 1, meleeGap: 1 },
};

export const BOT_LEVELS = Object.keys(LEVELS);

// Training dummies are set from the menu: how they behave (a level; 'dummy' stands still), whether
// they attack, and what they pick up ({ melee, gun, grenade }).
export function configureBot(bot, { level, attack = true, pickup = null }) {
  if (level) bot.level = LEVELS[level] ?? bot.level;
  bot.noAttack = !attack;
  bot.pickup = pickup;
}

// Does this bot want that pickup? Only kinds it's allowed (all of them, outside training), and
// only what it lacks: a melee weapon, a better gun than the pistol, room for a grenade.
function wants(bot, f, weapon) {
  const kind = GUNS[weapon] ? 'gun' : GRENADES[weapon] ? 'grenade' : 'melee';
  if (bot.pickup && !bot.pickup[kind]) return false;
  if (kind === 'gun') return !!bot.pickup && (!f.hasGun || f.gun === 'pistol');
  if (kind === 'grenade') return !!bot.pickup && f.grenades.length < GRENADE.max;
  return !f.melee;
}

export function createBot(level = 'normal', seed = 1) {
  const rng = mulberry32(seed);
  return {
    level: LEVELS[level] ?? LEVELS.normal,
    rng,
    counts: { jp: 0, sp: 0, mp: 0, dp: 0, rp: 0, hp: 0, ep: 0, gp: 0, xp: 0, cp: 0, kp: 0 },
    follow: null, // the rest of a string: { key, in } (a heavy or a shot, pressed during the jab)
    think: 0,
    target: -1,
    move: 0,
    detour: 0,
    climb: null,
    descend: null,
    waitSince: null,
    wantJump: false,
    wantDrop: false,
    mustCross: false,
    holdJump: 0,
    fireWait: 0.5 + rng(),
    meleeWait: 0,
    lastX: 0,
    stuck: 0,
  };
}

export function botInput(world, id, bot) {
  const f = world.fighters[id];
  const out = { mx: 0, down: false, jump: false, shoot: false, ax: 0, ay: 0 };
  const press = (k) => (bot.counts[k] = bump(bot.counts[k]));
  if (f && f.state === 'ok' && world.phase === 'play' && !bot.level.dummy) {
    bot.fireWait -= DT;
    bot.meleeWait -= DT;
    bot.think -= DT;
    if (bot.think <= 0) {
      bot.think = bot.level.think * (0.7 + bot.rng() * 0.6);
      decide(world, f, bot);
    }
    out.mx = bot.move;
    if (bot.wantJump) {
      press('jp');
      bot.wantJump = false;
      bot.holdJump = 0.3;
    }
    // Dropping through a thin platform takes two taps of down.
    if (bot.wantDrop || bot.tapAgain) {
      press('dp');
      bot.tapAgain = bot.wantDrop;
      bot.wantDrop = false;
    }
    if ((world.pickups ?? []).some((p) => Math.abs(p.x - f.x) <= 14 && Math.abs(p.y - f.y) <= 20 && wants(bot, f, p.weapon))) press('ep');
    if (bot.descend !== null) out.mx = Math.sign(bot.descend - f.x) || 1;
    else if (bot.climb) climb(f, bot, out, press);
    recover(world, f, bot, out, press);
    avoidDrops(world, f, bot, out, press);
    unstick(f, bot, out, press);
    if (!bot.noAttack) attack(world, f, bot, out, press);
    if (bot.follow && (bot.follow.in -= DT) <= 0) {
      press(bot.follow.key);
      bot.follow = null;
    }
    duck(world, f, bot, out);
    bot.holdJump -= DT;
    out.jump = bot.holdJump > 0;
  }
  return { ...out, ...bot.counts };
}

// Reloading right beside cover with the target on its far side: crouch behind it (tuck).
function duck(world, f, bot, out) {
  const t = world.fighters[bot.target];
  if (!t || t.state !== 'ok' || !f.grounded || f.reload <= 0) return;
  const side = Math.sign(t.x - f.x);
  const cover = world.covers.some((c) => {
    if (c.gone || Math.abs(c.y + c.h - f.y) > 1) return false;
    const gap = side > 0 ? c.x - (f.x + FIGHTER.w / 2) : f.x - FIGHTER.w / 2 - (c.x + c.w);
    return gap >= 0 && gap <= FIGHTER.tuckReach;
  });
  if (!cover) return;
  out.crouch = true;
  out.mx = 0;
}

function decide(world, f, bot) {
  const t = nearestEnemy(world, f);
  bot.target = t ? t.id : -1;
  bot.mustCross = false;
  // Committed to walking off a ledge: keep going until we're off it.
  if (bot.descend !== null) {
    if (f.grounded) return;
    bot.descend = null;
  }
  const plan = bot.climb;
  // Mid-jump on a climb: see it through (re-planned once we land).
  if (plan?.jumped && !f.grounded) return;
  bot.climb = null; // re-planned below while still needed
  const s = world.storm;
  // (An edge we can get to: not past the storm's wall, which nobody gets through.)
  const reachable = (x) => x > (s.wallLeft ?? -Infinity) + 8 && x < (s.wallRight ?? Infinity) - 8;
  // Normally stay well inside; while going around a floor, a short dip into the storm is fine,
  // and mid-climb the storm is ignored until we're up (taking its damage is the price).
  const margin = bot.detour ? -60 : 24;
  if ((!plan || plan.storm) && (f.x < s.left + margin || f.x > s.right - margin)) {
    bot.move = Math.sign((s.left + s.right) / 2 - f.x);
    bot.mustCross = true;
    // (A climb out is kept while its spot is still reachable, for up to 3 s.)
    if (plan && reachable(plan.x) && world.tick - plan.since < 180) bot.climb = plan;
    // Walled in on the way out (the side of a pit): climb out, over toward the safe side.
    else if (f.grounded && !lineOfSight(world, f.x, f.y - 10, f.x + bot.move * 16, f.y - 10)) {
      const top = ledgeTop(world, f.x + bot.move * 16, f.y - 10);
      const x = openColumn(world, f, top, bot.move);
      if (x !== null) bot.climb = { x, onto: bot.move, top, jumped: false, storm: true, since: world.tick };
    }
    return;
  }
  // Grab a weapon lying nearby on this floor (one it wants), unless an enemy is right on top of us.
  const loot = (world.pickups ?? []).find((p) => Math.abs(p.y - f.y) < 4 && Math.abs(p.x - f.x) < 160 && wants(bot, f, p.weapon));
  if (loot && (!t || Math.hypot(t.x - f.x, t.y - f.y) > 80)) {
    bot.move = Math.abs(loot.x - f.x) > 4 ? Math.sign(loot.x - f.x) : 0;
    return;
  }
  if (!t) {
    bot.move = 0;
    return;
  }
  const dx = t.x - f.x;
  const dy = t.y - f.y;
  const armed = f.hasGun && (f.ammo > 0 || sparesOf(f) > 0);
  // Keep shooting distance with a gun; close in to fight without one.
  const near = armed ? 70 : 0;
  const far = armed ? 200 : 14;
  const r = bot.rng;
  if (Math.abs(dx) > far) bot.move = Math.sign(dx);
  else if (Math.abs(dx) < near && r() < 0.6) bot.move = -Math.sign(dx);
  else bot.move = r() < 0.5 ? 0 : Math.sign(dx) * (r() < 0.5 ? 1 : -1);
  // No clear shot at them on this level (barrels, a wall in the way; cover doesn't count, it gets
  // shot through): close in rather than hang back.
  if (armed && Math.abs(dy) <= 48 && !lineOfSight(world, f.x, f.y - 20, t.x, t.y - 20, true)) bot.move = Math.sign(dx) || 1;
  // A solid floor between us: the one below walks around to climb up; the one above waits.
  const blocked = Math.abs(dy) > 48 && Math.abs(dx) < 200 && !lineOfSight(world, f.x, f.y - 20, t.x, t.y - 20);
  if (blocked && dy > 0 && !f.onThin) {
    bot.waitSince ??= world.tick;
    if (world.tick - bot.waitSince < 180) {
      bot.detour = 0;
      bot.move = 0;
      return;
    }
    // Waited 3 s and they never came up: walk off the edge nearest them and go after them.
    const floor = solids(world).find((r) => Math.abs(r.y - f.y) < 1 && f.x >= r.x - 6 && f.x <= r.x + r.w + 6);
    if (floor) {
      const edges = [floor.x - 10, floor.x + floor.w + 10];
      const open = edges.filter(reachable);
      bot.descend = (open.length ? open : edges).sort((a, b) => Math.abs(a - t.x) - Math.abs(b - t.x))[0];
    }
    bot.waitSince = null;
    return;
  }
  bot.waitSince = null;
  if (blocked) {
    // Climb: walk to the nearest edge of the floor overhead (inside the safe zone if possible).
    const roof = floorAbove(world, f);
    if (roof) {
      const edges = [roof.x - 12, roof.x + roof.w + 12];
      const safe = edges.filter((x) => x > s.left && x < s.right);
      const open = edges.filter(reachable);
      const pick = (safe.length ? safe : open.length ? open : edges).sort((a, b) => Math.abs(a - f.x) - Math.abs(b - f.x))[0];
      // Keep the same plan (and whether we've already jumped) while it still applies.
      bot.climb = plan && plan.x === pick ? plan : { x: pick, onto: pick < roof.x ? 1 : -1, top: roof.y, jumped: false };
      bot.detour = 1;
      return;
    }
    bot.detour ||= Math.sign((s.left + s.right) / 2 - f.x) || 1;
    bot.move = bot.detour;
  } else {
    bot.detour = 0;
    bot.climb = null;
  }
  // Change floors to reach them: from a spot with open sky overhead (not under a ledge or the lip
  // of a pit), straight up, then over onto their floor (see climb).
  if (dy < -48 && f.grounded && r() < 0.6) {
    const x = openColumn(world, f, t.y, Math.sign(dx) || 1);
    if (x !== null) {
      bot.climb = { x, onto: Math.abs(dx) > 8 ? Math.sign(dx) : r() < 0.5 ? 1 : -1, top: t.y, jumped: false };
      return;
    }
    bot.wantJump = true;
    if (bot.move === 0) bot.move = Math.abs(dx) > 8 ? Math.sign(dx) : r() < 0.5 ? 1 : -1;
    bot.mustCross = true;
    return;
  } else if (dy > 48 && f.grounded && f.onThin) {
    bot.wantDrop = true;
  }
  bot.mustCross = Math.abs(dx) > 60;
}

function nearestEnemy(world, f) {
  let best = null;
  let bestD = Infinity;
  for (const o of world.fighters) {
    if (o === f || o.state !== 'ok') continue;
    // Invincible or hidden-in-a-doorway targets are less attractive (bullets won't touch them).
    const d = Math.hypot(o.x - f.x, o.y - f.y) + (o.invincible > 0 ? 300 : 0) + (o.hidden >= 0 ? 150 : 0);
    if (d < bestD) [best, bestD] = [o, d];
  }
  return best;
}

// The lowest solid floor overhead, within two jumps.
function floorAbove(world, f) {
  let best = null;
  for (const r of solids(world)) {
    const bottom = r.y + r.h;
    if (f.x < r.x - 6 || f.x > r.x + r.w + 6 || bottom > f.y - FIGHTER.h + 1 || bottom < f.y - 200) continue;
    if (!best || bottom > best.y + best.h) best = r;
  }
  return best;
}

// The top of the wall (or stack of blocks) at x, from y upward: where you'd stand on it.
function ledgeTop(world, x, y) {
  const walls = solids(world);
  let top = y;
  for (let yy = y; yy > y - 240; yy -= 4) {
    const r = walls.find((w) => x >= w.x && x <= w.x + w.w && yy >= w.y && yy <= w.y + w.h);
    if (!r) break;
    top = r.y;
    yy = r.y;
  }
  return top;
}

// The nearest spot on this floor (toward `dir` first) with open sky up to a floor at `top`, to jump
// straight up from: not under a ledge, nor the lip of a pit. null: none within reach.
function openColumn(world, f, top, dir) {
  // (Not past the storm's wall, which nobody gets through.)
  const s = world.storm;
  const inside = (x) => x > (s.wallLeft ?? -Infinity) + 8 && x < (s.wallRight ?? Infinity) - 8;
  const clear = (x) => [-FIGHTER.w / 2 + 1, FIGHTER.w / 2 - 1].every((o) => lineOfSight(world, x + o, f.y - FIGHTER.h - 1, x + o, top - FIGHTER.h));
  for (let d = 0; d <= 160; d += 8) {
    for (const x of d ? [f.x + dir * d, f.x - dir * d] : [f.x]) {
      if (inside(x) && groundBelow(world, x, f.y - 2, 6) && clear(x)) return x;
    }
  }
  return null;
}

function climb(f, bot, out, press) {
  const c = bot.climb;
  const atEdge = Math.abs(f.x - c.x) <= 8;
  if (f.grounded) c.jumped = false;
  // Walk to the edge (jumping over crates on the way is handled by unstick).
  if (!c.jumped && !atEdge) {
    out.mx = Math.sign(c.x - f.x);
    return;
  }
  // At the edge: jump straight up, use the air jump near the top, and only steer over onto the
  // floor once we're above it (steering early runs into its underside).
  out.mx = c.top === undefined || f.y < c.top - 2 ? c.onto : 0;
  if (f.grounded) {
    press('jp');
    bot.holdJump = 0.4;
    c.jumped = true;
  } else if (c.jumped && f.vy > -60 && f.jumpsLeft > 0) {
    press('jp');
    bot.holdJump = 0.3;
  }
}

// Is there floor somewhere in this direction within a jump's reach?
function groundAhead(world, f, dir) {
  for (let k = 40; k <= 200; k += 40) if (groundBelow(world, f.x + dir * k, f.y - 40, 300)) return true;
  return false;
}

// Off the stage or under it: keep crossing if there's ground ahead, else head for a spawn point.
function recover(world, f, bot, out, press) {
  if (f.grounded || groundBelow(world, f.x, f.y - 4, 500)) return;
  if (bot.move !== 0 && groundAhead(world, f, bot.move)) {
    out.mx = bot.move;
  } else {
    let best = respawnPoint(world);
    for (const p of getStage(world.stage).spawns) if (Math.abs(p.x - f.x) < Math.abs(best.x - f.x)) best = p;
    out.mx = Math.sign(best.x - f.x);
  }
  if (f.vy > 0 && f.jumpsLeft > 0) {
    press('jp');
    bot.holdJump = 0.3;
  }
}

// Don't walk off a ledge into nothing, unless there's a reason to jump the gap.
function avoidDrops(world, f, bot, out, press) {
  if (!f.grounded || out.mx === 0) return;
  if (groundBelow(world, f.x + out.mx * 20, f.y - 4, 220)) return;
  if (bot.mustCross && groundAhead(world, f, out.mx)) {
    press('jp');
    bot.holdJump = 0.5;
  } else {
    out.mx = 0;
  }
}

function unstick(f, bot, out, press) {
  if (out.mx !== 0 && f.grounded && Math.abs(f.x - bot.lastX) < 0.2) {
    bot.stuck += DT;
    if (bot.stuck > 0.3) {
      press('jp');
      bot.holdJump = 0.4;
      bot.stuck = 0;
    }
  } else {
    bot.stuck = 0;
  }
  bot.lastX = f.x;
}

function attack(world, f, bot, out, press) {
  const t = world.fighters[bot.target];
  if (!t || t.state !== 'ok') return;
  const o = f.hasGun && f.gun ? gunOrigin(f) : aimOrigin(f);
  const c = center(t);
  let ax = c.x - o.x;
  let ay = c.y - o.y;
  const dist = Math.hypot(ax, ay);
  const err = (bot.rng() * 2 - 1) * bot.level.aimError;
  [ax, ay] = [ax * Math.cos(err) - ay * Math.sin(err), ax * Math.sin(err) + ay * Math.cos(err)];
  out.ax = ax / (dist || 1);
  out.ay = ay / (dist || 1);
  if (dist < 26 && bot.meleeWait <= 0) {
    // Hurt targets get an uppercut (launching upward is the surest knockout), unless there's a
    // ceiling in the way; then a sideways hit.
    const headroom = lineOfSight(world, o.x, o.y, o.x, o.y - 150);
    if (t.damage > 90 && headroom) {
      const l = Math.hypot(0.5, 1);
      out.ax = (Math.sign(c.x - o.x) * 0.5) / l;
      out.ay = -1 / l;
    } else if (!headroom || Math.abs(c.x - o.x) < 4) {
      out.ax = Math.sign(c.x - o.x) || f.facing;
      out.ay = -0.3;
    }
    // Up close: melee (the trident, in the gun slot, with the shoot button). Hurt targets get the
    // heavy straight away (to launch them); otherwise usually a string: a jab, then the heavy (or a
    // shot, with a loaded gun) pressed during it, to come out as soon as the jab has hit.
    if (f.blade) press('sp');
    else if (t.damage > 90 || bot.rng() < 0.3) press('mp');
    else {
      press('kp');
      bot.follow = { key: f.hasGun && f.ammo > 0 && bot.rng() < 0.4 ? 'sp' : 'mp', in: 0.06 };
    }
    bot.meleeWait = bot.level.meleeGap * (0.8 + bot.rng() * 0.6);
    return;
  }
  // The bow, the railgun: once drawing, hold on until it's full.
  const charge = f.hasGun ? GUNS[f.gun]?.charge : null;
  if (charge && f.gunHold >= 0) out.shoot = f.gunHold < charge.time;
  // An empty gun: hold on until the throw is wound up, then let go.
  const dry = f.hasGun && f.ammo === 0 && sparesOf(f) === 0;
  if (dry && f.gunHold >= 0) out.shoot = f.gunHold < GUN_THROW.hold;
  // (Cover in the way is fair game: shots wear it down.)
  if (!f.hasGun || bot.fireWait > 0 || !lineOfSight(world, o.x, o.y, c.x, c.y, true)) return;
  if (f.ammo > 0 && dist < 420) {
    press('sp');
    if (charge) out.shoot = true; // (start drawing: held on above)
    bot.fireWait = bot.level.fireGap * (0.7 + bot.rng() * 0.8);
  } else if (f.ammo === 0 && sparesOf(f) === 0 && dist < 140) {
    press('sp'); // winds up throwing the empty gun (held on above)
    out.shoot = true;
    bot.fireWait = 1;
  }
}
