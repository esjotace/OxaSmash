# Props (planned)

Props are stage objects you can use two ways: as **low cover** where they stand, and as a **weapon** once you pick them up. They're not in the game yet; this note and the switched-off entries in `PROPS` (`src/sim/constants.js`) hold the design until they're built.

## The first one: the chair

| | |
|---|---|
| Where it stands | Like low cover: tuck behind it and your gun is held up over it (big guns can't be fired from behind it). |
| Health | 30 (a 2-tile crate has 80). Shots, melee hits and blasts wear it down, like cover; broken, it's gone. |
| Picking it up | The pickup button, standing next to it. It takes the melee slot, and you carry it at 85% speed. |
| Throwing it | Hold the melee button, like a heavy weapon: a slow, high arc, 9 damage, a solid push. It breaks where it lands. |
| Swinging it | Not planned for now (`swing: null`). |

Numbers are a starting point, set in `PROPS.chair`.

## What building a prop takes

1. **Art**: the prop standing, beaten up (below half health, like the cover boxes), and in hand.
2. **On stages**: where props stand, in the stage data (fixed stages) and in the random dungeon's sections.
3. **Rules** (`src/sim/world.js`): a prop is cover (its health, breaking) until someone picks it up; then it's a carried weapon with its own throw. Thrown, it hits like a thrown weapon and breaks.
4. **Bots** (`src/bots/bot.js`): ducking behind props like cover; picking them up and throwing them.
5. **Online**: nothing extra (props are part of the world, so rollback covers them).
6. **ITEMS.md**: a props section (`npm run items`).
7. Switch it on: `on: true`.

## Ideas for later props

- A table: wider cover; heavy to carry; flipping it is a cover in itself.
- A barrel you can roll (the barrels that explode already exist; this would be a plain one).
- A crate you can carry and drop as cover somewhere else.
