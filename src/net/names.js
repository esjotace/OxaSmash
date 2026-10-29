// Room codes and player names, cleaned the same way by the page and the game server.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1: easy to read out loud
export const CODE_LENGTH = 5;

export function makeCode(rng = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return code;
}

export function cleanCode(text) {
  return String(text).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

export function cleanName(text) {
  const name = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12);
  return name || 'Player';
}
