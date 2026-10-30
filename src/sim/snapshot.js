// Saving and restoring a whole world, for rollback (see src/net/rollback.js): a saved world played
// on with the same inputs comes out the same, tick for tick, on any machine.
//   save / restore: a copy kept in memory (fast; shared pieces stay shared).
//   pack / unpack: a copy to send over the network (plain JSON).
//   fingerprint: a short summary to check two worlds still agree.
import { attachRng } from './world.js';
import { getStage } from './stage.js';

export const save = (world) => structuredClone(world); // (the hidden rng function isn't copied)

// The saved world, back into `world` (the same object, so its random numbers carry on from there).
export function restore(world, saved) {
  Object.assign(world, structuredClone(saved));
  return world;
}

// To send: everything but the blocks standing (rebuilt from the stage and its cover on arrival).
export function pack(world) {
  const { standing, live, ...rest } = world;
  return JSON.stringify(rest);
}

export function unpack(text) {
  const world = attachRng(JSON.parse(text));
  // The stage's blocks, each low cover standing in by its own copy, broken cover left out.
  let k = 0;
  const blocks = getStage(world.stage).blocks.map((b) => (b.cover ? world.covers[k++] : b));
  world.standing = blocks.filter((b) => !b.gone);
  world.live = world.standing;
  return world;
}

// A short summary of where everything is: two worlds that agree on it are (nearly surely) the same.
export function fingerprint(world) {
  let h = 2166136261 ^ world.tick ^ world.rngState;
  const mix = (n) => {
    h = Math.imul(h ^ (Math.round(n * 64) | 0), 16777619);
  };
  for (const f of world.fighters) {
    mix(f.x);
    mix(f.y);
    mix(f.vx);
    mix(f.vy);
    mix(f.damage);
    mix(f.stocks);
  }
  for (const b of world.bullets) {
    mix(b.x);
    mix(b.y);
  }
  mix(world.storm.left);
  mix(world.storm.right);
  return h >>> 0;
}
