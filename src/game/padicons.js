// Controller button pictures (public/art/buttons.png, made by tools/buttons_atlas.py from Vryell's
// controller sheets): a row per controller style, and per standard button number three frames
// (idle, pressed, dim), each 16×16. Buttons without a picture show their name as text.
export const ICON_STYLES = ['xbox', 'ps', 'switch'];
// Which standard buttons have a picture, by style (keep in step with the tool's table).
const HAS = {
  xbox: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  ps: [0, 1, 2, 3, 4, 5, 6, 7],
  switch: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15],
};
export const BUTTONS_PER_ROW = 17;
export const hasIcon = (style, button) => !!HAS[style]?.includes(button);
// The frame in the sheet (state 0: idle, 1: pressed, 2: dim).
export const iconFrame = (style, button, state = 0) => ICON_STYLES.indexOf(style) * BUTTONS_PER_ROW * 3 + button * 3 + state;
