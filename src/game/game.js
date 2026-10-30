// The single Phaser.Game, created on the first match and reused after that.
import Phaser from 'phaser';
import { MatchScene, loadArt } from './MatchScene.js';
import { VIEW_W, VIEW_H } from '../sim/constants.js';
import { settings } from './settings.js';

let game = null;

// The game is laid out in a 640×360 view, but drawn at a whole multiple of it (RENDER_SCALE): big
// enough to cover the window at the screen's real pixel density, so pixel art stays square and
// text stays sharp. The cameras zoom by the same factor. If the canvas doesn't match the window
// exactly, the browser shrinks it slightly and smoothly; if it's capped below the window (see
// SCALE_CAP), the browser enlarges it with square pixels (see UPSCALED and style.css).
// Most multiples, by the Graphics setting: 'sharp' up to 4x; 'fast' (slower computers) 2x; 'auto'
// 4x, but 3x on phones and tablets (a touch screen with no mouse), about their screens' real
// resolution, for battery and heat. (?scale=N in the address forces a multiple, for measuring.)
const NEEDED = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H) * (window.devicePixelRatio || 1);
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
const SCALE_CAP = { sharp: 4, fast: 2, auto: TOUCH ? 3 : 4 }[settings.graphics] ?? 4;
const FORCED = Number(new URLSearchParams(location.search).get('scale')) | 0;
export const RENDER_SCALE = FORCED >= 1 && FORCED <= 4 ? FORCED : Math.max(1, Math.min(SCALE_CAP, Math.ceil(NEEDED)));
// Drawn smaller than the window (enlarged to fit it).
export const UPSCALED = RENDER_SCALE < NEEDED;

// The Phaser game, made the first time it's needed.
function ensureGame() {
  if (!game) {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: VIEW_W * RENDER_SCALE,
      height: VIEW_H * RENDER_SCALE,
      backgroundColor: '#101427',
      // Crisp pixel art: no smoothing when scaled up from 640×360.
      pixelArt: true,
      // Controllers (the Gamepad API); read in controls.js.
      input: { gamepad: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [],
    });
    if (UPSCALED) document.getElementById('game')?.classList.add('upscaled');
    game.scene.add('match', MatchScene, false);
    game.scene.add('warm', { key: 'warm', preload() { loadArt(this); } }, false);
    // Local dev server only (not in builds): lets test scripts inspect the running game.
    if (import.meta.env.DEV) window.__oxasmash = game;
  }
  return game;
}

export function startMatch(cfg) {
  const g = ensureGame();
  // (The art still loading ahead: the match starts once it's in, rather than loading it twice.)
  const warm = g.scene.getScene('warm');
  if (warm?.load?.isLoading()) warm.load.once('complete', () => g.scene.start('match', cfg));
  else g.scene.start('match', cfg);
}

// Load the game's art ahead of a match (joining a room), so the match starts without the wait.
export function warmUp() {
  const g = ensureGame();
  if (!g.scene.isActive('match') && !g.scene.isActive('warm')) g.scene.start('warm');
}

// The page's in-game menu talks to the match through these.
const match = () => (game?.scene.isActive('match') ? game.scene.getScene('match') : null);
export const inMatch = () => !!match();
export const setMenu = (open) => match()?.setMenu(open);
export const applySettings = () => match()?.applySettings();
export const setCharacter = (char, slot) => match()?.setCharacter(char, slot);
export const trainingSpawn = (weapon) => match()?.trainingSpawn(weapon);
export const setDummies = (cfg) => match()?.setDummies(cfg);
export const setDummyHealth = (health) => match()?.setDummyHealth(health);
export const setTrainingOptions = (options) => match()?.setTrainingOptions(options);

export function stopMatch() {
  if (game?.scene.isActive('match')) game.scene.stop('match');
}
