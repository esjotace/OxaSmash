// A chunky DOS-style bitmap font, drawn pixel by pixel with Phaser Graphics (no font files).
// Glyphs are 6x7 with double-thick vertical strokes, like old text-mode fonts. Original design.

const GLYPHS = {
  A: [' #### ', '##  ##', '##  ##', '######', '##  ##', '##  ##', '##  ##'],
  B: ['##### ', '##  ##', '##  ##', '##### ', '##  ##', '##  ##', '##### '],
  C: [' #### ', '##  ##', '##    ', '##    ', '##    ', '##  ##', ' #### '],
  D: ['####  ', '## ## ', '##  ##', '##  ##', '##  ##', '## ## ', '####  '],
  E: ['######', '##    ', '##    ', '##### ', '##    ', '##    ', '######'],
  F: ['######', '##    ', '##    ', '##### ', '##    ', '##    ', '##    '],
  G: [' #### ', '##  ##', '##    ', '## ###', '##  ##', '##  ##', ' #####'],
  H: ['##  ##', '##  ##', '##  ##', '######', '##  ##', '##  ##', '##  ##'],
  I: ['######', '  ##  ', '  ##  ', '  ##  ', '  ##  ', '  ##  ', '######'],
  J: ['   ###', '    ##', '    ##', '    ##', '##  ##', '##  ##', ' #### '],
  K: ['##  ##', '## ## ', '####  ', '###   ', '####  ', '## ## ', '##  ##'],
  L: ['##    ', '##    ', '##    ', '##    ', '##    ', '##    ', '######'],
  M: ['##  ##', '######', '######', '##  ##', '##  ##', '##  ##', '##  ##'],
  N: ['##  ##', '### ##', '######', '## ###', '##  ##', '##  ##', '##  ##'],
  O: [' #### ', '##  ##', '##  ##', '##  ##', '##  ##', '##  ##', ' #### '],
  P: ['##### ', '##  ##', '##  ##', '##### ', '##    ', '##    ', '##    '],
  Q: [' #### ', '##  ##', '##  ##', '##  ##', '## ###', ' #### ', '   ###'],
  R: ['##### ', '##  ##', '##  ##', '##### ', '####  ', '## ## ', '##  ##'],
  S: [' #### ', '##  ##', '##    ', ' #### ', '    ##', '##  ##', ' #### '],
  T: ['######', '  ##  ', '  ##  ', '  ##  ', '  ##  ', '  ##  ', '  ##  '],
  U: ['##  ##', '##  ##', '##  ##', '##  ##', '##  ##', '##  ##', ' #### '],
  V: ['##  ##', '##  ##', '##  ##', '##  ##', '##  ##', ' #### ', '  ##  '],
  W: ['##  ##', '##  ##', '##  ##', '##  ##', '######', '######', '##  ##'],
  X: ['##  ##', '##  ##', ' #### ', '  ##  ', ' #### ', '##  ##', '##  ##'],
  Y: ['##  ##', '##  ##', '##  ##', ' #### ', '  ##  ', '  ##  ', '  ##  '],
  Z: ['######', '    ##', '   ## ', '  ##  ', ' ##   ', '##    ', '######'],
  '!': ['  ##  ', '  ##  ', '  ##  ', '  ##  ', '  ##  ', '      ', '  ##  '],
  '%': ['##   #', '##  ##', '   ## ', '  ##  ', ' ##   ', '##  ##', '#   ##'],
  ' ': ['      ', '      ', '      ', '      ', '      ', '      ', '      '],
};

const W = 6;
const H = 7;
export const ADVANCE = W + 1;
export const LINE = H + 3;

// Pixel offsets of the "on" pixels of each glyph, precomputed.
const PIXELS = Object.fromEntries(
  Object.entries(GLYPHS).map(([ch, rows]) => {
    const on = [];
    rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && on.push([x, y])));
    return [ch, on];
  }),
);

export const lineWidth = (text, scale = 1) => (text.length * ADVANCE - 1) * scale;

// Split into lines of at most `max` characters, breaking at spaces.
export function wrap(text, max) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

// Draw `lines` centered on (cx, top). Only the first `shown` characters appear (typing effect);
// a block cursor follows the last typed one while `cursor` is on. A 1-pixel dark outline keeps
// the text readable over anything.
export function drawDosText(g, lines, cx, top, { scale = 1, color = 0xffffff, outline = 0x0b0d18, alpha = 1, shown = Infinity, cursor = false } = {}) {
  let left = shown;
  let cursorAt = null;
  const plan = [];
  lines.forEach((line, row) => {
    const x0 = Math.round(cx - lineWidth(line, scale) / 2);
    const y0 = Math.round(top + row * LINE * scale);
    const n = Math.max(0, Math.min(line.length, left));
    for (let i = 0; i < n; i++) plan.push([line[i].toUpperCase(), x0 + i * ADVANCE * scale, y0]);
    if (n < line.length && cursorAt === null) cursorAt = [x0 + n * ADVANCE * scale, y0];
    left -= line.length + 1;
  });
  for (const pass of [0, 1]) {
    g.fillStyle(pass ? color : outline, alpha);
    for (const [ch, x, y] of plan) {
      for (const [px, py] of PIXELS[ch] ?? []) {
        if (pass) g.fillRect(x + px * scale, y + py * scale, scale, scale);
        else g.fillRect(x + px * scale - 1, y + py * scale - 1, scale + 2, scale + 2);
      }
    }
  }
  if (cursor && cursorAt) {
    g.fillStyle(outline, alpha).fillRect(cursorAt[0] - 1, cursorAt[1] - 1, W * scale + 2, H * scale + 2);
    g.fillStyle(color, alpha).fillRect(cursorAt[0], cursorAt[1], W * scale, H * scale);
  }
}
