# Sounds

The game's sound effects are synthesized by `tools/make_sounds.py` into `public/sounds/` (each one
is a short recipe there: edit it and rerun to reshape a sound). `src/game/audio.js` decides which
sound each game event plays, and how loud: world sounds by distance from the middle of your screen,
your own sounds and announcements at full volume.

To use a recorded sound instead, drop a `.wav` or `.ogg` with the same name into `public/sounds/`,
and note where it came from and its license in `CREDITS.md` at the project root.
