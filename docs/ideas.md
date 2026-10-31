# Ideas to brainstorm

Open design questions and shelved ideas, kept so they aren't lost. Nothing here is decided.

## Combos after a launch (2026-10-31)

Right now a combo ends once a player is sent flying out of reach: you can shoot them while they
fly off, and that's it. The run (dash, then keep holding; see `RUN` in `src/sim/constants.js`)
is a first answer: it lets you chase them down. Still to brainstorm, ways to keep pressure on a
launched player:

- Follow-ups that reach a flying player: a jump-cancel into an air dash toward them, or a run
  that carries into a longer jump.
- Something to do with them mid-air besides shooting: a grab, a spike (hit them down), a juggle.
- What the launched player can do back (DI, the breaker, the dash's tilt), so it stays a contest.

## Running attacks (shelved)

Running is in; special running attacks aren't. Ideas: Heavy on the run as a lunge (a long
forward thrust with extra push) or a slide (low, under shots, knocks them up). Shelved because
our characters have no animations for them (idle, run, stun, fall and sleep only).

## Phones

- Install as an app (Add to Home Screen): the only way to play fullscreen on an iPhone. Parked
  until the touch controls settle, since an installed copy makes testing each change slower.
- Headshots: aim assist aims at the body, so touch players rarely land headshots against mouse
  players. Hold-to-fire with drag aiming helps; watch it once friends play on phones.
