// The single Phaser.Game, created on the first match and reused after that.
import Phaser from 'phaser';
import { MatchScene } from './MatchScene.js';
import { VIEW_W, VIEW_H } from '../sim/constants.js';

let game = null;

// The game is laid out in a 640×360 view, but drawn at a whole multiple of it (RENDER_SCALE): big
// enough to cover the window at the screen's real pixel density, so pixel art stays square and
// text stays sharp. The cameras zoom by the same factor. If the canvas still doesn't match the
// window exactly, the browser shrinks it slightly and smoothly (see style.css).
export const RENDER_SCALE = Math.max(
  1,
  Math.min(4, Math.ceil(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H) * (window.devicePixelRatio || 1))),
);

export function startMatch(cfg) {
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
    game.scene.add('match', MatchScene, false);
    // Local dev server only (not in builds): lets test scripts inspect the running game.
    if (import.meta.env.DEV) window.__oxasmash = game;
  }
  game.scene.start('match', cfg);
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
