# Netcode notes

How online play got to where it is, and what to try next. Tuning lives in `src/net/rollback.js`
(`SYNC`, `INPUT_DELAY`, `SNAP_PAST`, `EASE`).

## The path so far (2026-10-29)

1. **Fix 1: less waiting.** The first version (still on the live site as v1) had the server send 30
   snapshots a second and every browser draw them 83 ms behind. Your own presses took ~190 ms to show
   at 70 ms of ping. Snapshots went to 60 a second, compressed, with a buffer that adapts to the
   connection.
2. **Fix 2: predicting your own fighter.** Your browser ran your fighter on your presses at once and
   eased it to the server's version when they disagreed (99.6% of the time they didn't). Others
   were drawn smoothly ~100 ms in the past. Replaced by fix 3.
3. **Fix 3: rollback** (what's in now). Every browser plays the whole match from the same start and
   inputs; others' inputs are guessed (whatever they last pressed) and the match is played again
   when a guess was wrong. Your own fighter is never corrected, and what you see is what hits.

## The problem: rubber-banding (2026-10-29)

Tested with practice lag (`?lag=70` against `?lag=70` and `?lag=140`), rollback showed unacceptable
rubber-banding. Measured against the real dev server (25-30 s of human-like input):

- **Your own fighter: never corrected.** Inputs reach the server in time.
- **Others: corrected ~2.5-2.7 times a second each** (every time they change what they're doing),
  typically by 13-18 px at 70 ms and ~26 px at 140 ms, 1 in 20 by over 60-90 px. Corrections were
  eased over ~55 ms, so they read as snaps.

## What was done (option A: keep rollback, tune it)

- **Input delay: 2 ticks (33 ms)** (`INPUT_DELAY`). Your input counts 2 ticks after you press it, for
  everyone. Your browser needs to run 2 ticks less ahead of the server, so every guess about the
  others is 2 ticks shorter.
- **Softer easing**: corrections spread over ~150 ms (`EASE` 18 → 7), and only ones over 128 px
  (`SNAP_PAST`, was 64) jump.
- **Dev knob**: `&delay=0..6` on the dev page tries another input delay (shown in the menu's corner).

Measured after (same setup):

| Input delay | 70 vs 70: others' typical correction (1 in 20 over) | 70 vs 140: on the 140 ms side |
|---|---|---|
| 0 | 17.5 px (64 px) | 26 px (88 px) |
| **2 (default)** | **13 px (49 px)** | **22 px (82 px)** |
| 3 | 11-12 px (47-51 px) | 20 px (70 px) |

Corrections are ~25-35% smaller, and drift instead of snapping, but still ~2.5 a second per opponent.

**Why it matters for how input feels:** 2 ticks of input delay means every press (move, jump, shoot,
swing) takes effect 33 ms later. Most players don't notice 2 ticks; some do, especially for precise
timing (parries, jab strings). Since 2026-10-29 local play (Solo, Bot match, Same screen, Training)
has the same delay, so the game feels the same offline and online. If input feels sluggish or
"weird" anywhere, this is the first thing to check: try `&delay=0` on the dev page.

**Status (2026-10-29):** the user found it OK for now and will test it more.

## Worth asking: try fix 2 again?

When this comes up again, ask whether to try **fix 2** (option B below) for comparison:

- **What it is:** only your own fighter is predicted (moves the moment you press); everyone else is
  drawn smoothly a little in the past (~100 ms at 70 ms of ping), straight from the server, plus lag
  compensation so shots and swings hit what you aimed at on your screen.
- **Why try it:** it removes the rubber-banding of other players entirely, which rollback can only
  shrink (corrections ~2.5 a second per opponent, even with the input delay). It's how most online
  shooters work. The cost: others are shown slightly late, and now and then you're hit by something
  that looked like a near miss.
- It worked before (99.6% of your own predictions exact); it was replaced by rollback, not dropped
  for being broken.

## If it's still not good enough: option B

Go back to fix 2 (your fighter predicted, others drawn smoothly in the past: no rubber-banding of
others) and add **lag compensation**: the server checks shots and swings against where people were
on the shooter's screen, so what you aim at is what you hit (how Overwatch and Valorant work). The
cost: sometimes you're hit by something that looked like a near miss, since others saw you in their
past. A bigger rebuild than A.

(Option C, rollback underneath with others drawn from confirmed moments only, was ranked last: it has
B's delay without B's fairness fix.)
