// One player's input for one tick. Held buttons are booleans (down, jump, crouch, shoot, block,
// meleeHeld, grenadeHeld); presses are counters (jp jump, sp shoot, mp melee, dp down, rp reload,
// hp hide, ep pick up, gp grenade, xp dodge, cp cycle grenades) that go up by one per press, so a
// quick click is never lost between network packets. ax/ay is the aim direction (-1..1);
// 0,0 means "the way I'm facing".

export const NEUTRAL = Object.freeze({ mx: 0, down: false, jump: false, crouch: false, shoot: false, block: false, meleeHeld: false, grenadeHeld: false, ax: 0, ay: 0, jp: 0, sp: 0, mp: 0, dp: 0, rp: 0, hp: 0, ep: 0, gp: 0, xp: 0, cp: 0 });

export const bump = (count) => (count + 1) & 0xff;

export function encodeInput(i) {
  const flags = (i.down ? 1 : 0) | (i.jump ? 2 : 0) | (i.shoot ? 4 : 0) | (i.block ? 8 : 0) | (i.crouch ? 16 : 0) | (i.meleeHeld ? 32 : 0) | (i.grenadeHeld ? 64 : 0);
  return [i.mx, flags, i.jp, i.sp, i.mp, i.dp, i.rp, Math.round(i.ax * 100), Math.round(i.ay * 100), i.hp, i.ep, i.gp ?? 0, i.xp ?? 0, i.cp ?? 0];
}

// Remote input is untrusted: anything malformed becomes null, numbers are clamped.
export function decodeInput(a) {
  if (!Array.isArray(a) || a.length !== 14) return null;
  const n = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.trunc(v))) : 0);
  const flags = n(a[1], 0, 127);
  return {
    mx: n(a[0], -1, 1),
    down: (flags & 1) !== 0,
    jump: (flags & 2) !== 0,
    shoot: (flags & 4) !== 0,
    block: (flags & 8) !== 0,
    crouch: (flags & 16) !== 0,
    meleeHeld: (flags & 32) !== 0,
    grenadeHeld: (flags & 64) !== 0,
    jp: n(a[2], 0, 255),
    sp: n(a[3], 0, 255),
    mp: n(a[4], 0, 255),
    dp: n(a[5], 0, 255),
    rp: n(a[6], 0, 255),
    ax: n(a[7], -100, 100) / 100,
    ay: n(a[8], -100, 100) / 100,
    hp: n(a[9], 0, 255),
    ep: n(a[10], 0, 255),
    gp: n(a[11], 0, 255),
    xp: n(a[12], 0, 255),
    cp: n(a[13], 0, 255),
  };
}
