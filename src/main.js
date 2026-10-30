// Menus, lobby and results (plain DOM), and starting matches in the right mode.
import { OnlineRoom, RoomList, cleanCode, cleanName, describeNetError, CODE_LENGTH, PRACTICE_LAG, PRACTICE_DELAY } from './net/room.js';
import { DUEL_MODES } from './net/duels.js';
import { rulesPicker, PRESETS } from './rulesui.js';
import { PLAYER_COLORS } from './game/palette.js';
import { RULES, GUNS, MELEE, GRENADES, ITEMS } from './sim/constants.js';
import { describe } from './sim/describe.js';
import { hasIcon, iconFrame, BUTTONS_PER_ROW, ICON_STYLES } from './game/padicons.js';
import { STAGES, DEFAULT_STAGE, MIXED, isStageId, rollStage } from './sim/stage.js';
import { CHARACTERS, pickCast } from './game/cast.js';
import { startPadNav } from './padnav.js';
import { settings, ui, firstPad, padStyle, padButtonName, padActionName, saveSettings, deviceSettings, padBindings, deviceLabel, KEY_ACTIONS, PAD_ACTIONS, DEFAULT_KEYS, DEFAULT_PAD, keyName } from './game/settings.js';

// A fresh random character for each player, every match; players who picked one (pref) get it.
function cast(roster) {
  const chars = pickCast(roster.length);
  roster.forEach((p, i) => {
    if (!CHARACTERS.includes(p.pref)) return;
    const j = chars.indexOf(p.pref);
    if (j >= 0 && j !== i) chars[j] = chars[i];
    chars[i] = p.pref;
  });
  return roster.map((p, i) => ({ ...p, char: chars[i] }));
}

const $ = (id) => document.getElementById(id);

// Which build this is, in the menu's corner (the Docker build sets these; see Dockerfile).
const VERSION = import.meta.env.VITE_APP_VERSION || 'dev';
const BUILD = import.meta.env.VITE_APP_BUILD;
$('version').textContent = BUILD ? `${VERSION} · build ${BUILD}` : VERSION;
// (Practice lag on: said in the corner, so it's not mistaken for a slow connection.)
if (PRACTICE_LAG.ms || PRACTICE_LAG.jitter) $('version').textContent += ` · practice lag ${PRACTICE_LAG.ms} ms${PRACTICE_LAG.jitter ? ` ±${PRACTICE_LAG.jitter}` : ''}`;
if (PRACTICE_DELAY !== null) $('version').textContent += ` · input delay ${PRACTICE_DELAY}`;

// Phaser is most of the download, so the menu shows first and the game loads right after.
let gameModule = null;
const loadGame = () => (gameModule ??= import('./game/game.js'));
const startMatch = (cfg) => loadGame().then((m) => m.startMatch(cfg));
// (The art, loaded ahead of an online match, while in the room.)
const warmUp = () => loadGame().then((m) => m.warmUp());
const stopMatch = () => gameModule?.then((m) => m.stopMatch());

// role: null for local play, 'online' in a room on the game server; owner: whether you run that
// room (you made it, or whoever did left).
// series: Same screen rounds ({ rounds, wins, round, over }), or null. crownName: who won the
// previous round (they wear the crown next match), or null. onScreen: the players on
// this screen in the current match ({ name, kind }).
// training: the dummies' setup ({ count, level, attack, pickup }).
const state = { role: null, owner: false, room: null, lobby: null, lastLocal: null, series: null, onScreen: [], crownName: null, training: null };

// The roster with the crown on the previous round's winner (matched by name).
const crowned = (roster) => roster.map((p) => ({ ...p, crowned: !!state.crownName && p.name === state.crownName }));

// The in-game menu (see below): whether it's up, when the browser last let go of a captured mouse
// (it does on Esc), and a binding being changed ({ kind: 'key' | 'pad', action }).
let menuOpen = false;
let mouseFreedAt = 0;
let waiting = null;
// Whose settings the menu changes: the player (their device's slot, for the character) and the
// controller slot (for the button layout).
let editing = { player: 'kbm', pad: 'pad0' };

const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private mode or blocked storage: the name just isn't remembered.
    }
  },
};

function show(id) {
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== id;
  // (The room list keeps itself up to date only while the main menu is showing.)
  if (id === 'menu') roomList.start();
  else roomList.stop();
  $('quit').hidden = id !== null;
  // Leaving the match (results, menus): close the in-game menu and let go of the mouse.
  if (id !== null) {
    closeMenu();
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
}

async function busy(button, label, work) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    await work();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

const myName = () => cleanName($('name').value);

function playerRow(name, colorIndex, tag) {
  const li = document.createElement('li');
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = PLAYER_COLORS[colorIndex].css;
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = name;
  const label = document.createElement('span');
  label.className = 'tag';
  label.textContent = tag;
  li.append(dot, who, label);
  return li;
}

// ---- Local play -------------------------------------------------------------

// The stage picked in a menu (a stage, or MIXED for a random one), or the default if the choice
// isn't a known stage.
const stageFrom = (id) => (Object.hasOwn(STAGES, $(id).value) || $(id).value === MIXED ? $(id).value : DEFAULT_STAGE);
// The stages every stage picker offers (the first one picked to start with).
const STAGE_CHOICES = [[MIXED, 'Random dungeon'], ['dungeon', 'Dungeon'], ['village', 'Village'], ['warehouse', 'Warehouse'], ['bajaita', 'La Bajaita'], ['azotea', 'La Azotea'], ['swamp', 'El Pantano'], ['castle', 'El Castillo'], ['pines', 'Pinar Nevado'], ['residencia', 'Residencia']];

// extra: { rules, stormPace } for Same screen matches.
function playLocal(roster, stocks, stage = MIXED, training = false, extra = {}) {
  // (A stage without a storm, unless the rules set one.)
  if (!extra.stormPace && STAGES[stage]?.noStorm) extra = { ...extra, stormPace: 'off' };
  state.role = null;
  state.botMatch = !!extra.fromLobby; // (from the Solo / Bot match lobby: back there after)
  state.onScreen = roster.filter((p) => p.kind === 'kbm' || p.kind.startsWith('pad'));
  state.lastLocal = { roster, stocks, stage, training, extra };
  show(null);
  // A random stage and random characters are rolled again for every match, rematches included.
  startMatch({ mode: 'local', roster: crowned(cast(roster)), you: 0, stocks, stage: rollStage(stage), training, ...extra, onEnd: (view) => showResults(view, roster) });
}

// Training: you and one bot in the training room; nobody runs out of lives, so it ends on Quit.
$('playTraining').onclick = () => {
  state.series = null;
  state.crownName = null;
  state.training = { stage: $('trainStage').value, count: 1, level: $('trainBot').value, attack: true, pickup: { melee: false, gun: false, grenade: false }, health: { mode: 'normal', value: 0, after: 2 }, infinite: true, hitboxes: false };
  playTraining();
};

// Training: you and the dummies, set up in the menu's Dummies tab (state.training).
function playTraining() {
  const d = state.training;
  const roster = [{ name: myName(), kind: 'kbm' }];
  for (let i = 1; i <= d.count; i++) roster.push({ name: d.count > 1 ? `Dummy ${i}` : 'Dummy', kind: 'bot', level: d.level });
  // (A random stage is rolled again each time.)
  playLocal(roster, RULES.stocks, Object.hasOwn(STAGES, d.stage) || d.stage === MIXED ? d.stage : 'training', true, { dummies: d });
}

// ---- Main menu ----------------------------------------------------------------
// The modes are slanted bars, one open at a time; a closed bar's buttons and fields can't be
// reached (inert), with the mouse, the keyboard or a controller.
const menuBars = [...document.querySelectorAll('#menu .bar')];
function openBar(bar) {
  for (const b of menuBars) {
    const on = b === bar;
    b.classList.toggle('on', on);
    b.querySelector('.bar-head').setAttribute('aria-expanded', String(on));
    b.querySelector('.bar-body').inert = !on;
  }
}
for (const bar of menuBars) bar.querySelector('.bar-head').onclick = () => openBar(bar.classList.contains('on') ? null : bar);

// ---- Solo and Bot match ---------------------------------------------------------
// One lobby for both: Solo (you and 1 to 3 bots) and Bot match (2 to 4 bots to watch with the
// spectator camera). Each bot has its own level; the stage and the rules are the ones online rooms
// use (the same rules screen, remembered between games).

// mode: 'solo' or 'watch'; bots: each bot's level, per mode.
const botMatch = { mode: 'solo', bots: { solo: ['normal'], watch: ['normal', 'normal'] } };
const BOT_LEVELS = [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']];

function openBotLobby(mode) {
  botMatch.mode = mode;
  renderBotLobby();
  show('botLobby');
}
$('playBots').onclick = () => openBotLobby('solo');
$('botMatch').onclick = () => openBotLobby('watch');

function renderBotLobby() {
  const solo = botMatch.mode === 'solo';
  const bots = botMatch.bots[botMatch.mode];
  $('botTitle').textContent = solo ? 'Solo' : 'Bot match';
  $('botHint').textContent = solo ? 'You against the bots. Add or remove bots, pick each one’s level, the stage and the rules.' : 'Set up the bots and watch them fight. ←/→ switch who the camera follows, Space for a free camera, ↑/↓ zoom.';
  $('botStart').textContent = solo ? 'Play' : 'Watch';
  // (Solo: you first, then the bots.)
  const you = solo ? [playerRow(myName(), 0, 'You')] : [];
  $('botList').replaceChildren(
    ...you,
    ...bots.map((level, i) => {
      const li = playerRow(`Bot ${i + 1}`, i + you.length, '');
      const pick = document.createElement('select');
      pick.setAttribute('aria-label', `Bot ${i + 1}'s level`);
      for (const [value, text] of BOT_LEVELS) pick.append(new Option(text, value, false, value === level));
      pick.onchange = () => (bots[i] = pick.value);
      const remove = document.createElement('button');
      remove.className = 'btn small ghost';
      remove.textContent = 'Remove';
      remove.disabled = bots.length + you.length <= 2;
      remove.onclick = () => {
        bots.splice(i, 1);
        renderBotLobby();
      };
      li.append(pick, remove);
      return li;
    }),
  );
  $('botAdd').disabled = bots.length + you.length >= RULES.maxPlayers;
  if ($('botStage').value !== $('roomStage').value) $('botStage').value = $('roomStage').value;
  $('botRules').textContent = `Rules: ${rulesSummary()}`;
}

$('botAdd').onclick = () => {
  const bots = botMatch.bots[botMatch.mode];
  if (bots.length + (botMatch.mode === 'solo' ? 1 : 0) < RULES.maxPlayers) bots.push('normal');
  renderBotLobby();
};
// The stage, right here (the rules screen shows it too).
$('botStage').onchange = () => {
  $('roomStage').value = $('botStage').value;
  $('roomStage').dispatchEvent(new Event('change'));
  renderBotLobby();
};
$('botRulesBtn').onclick = () => {
  rulesFor = 'bots';
  $('roomRulesGo').textContent = 'Done';
  show('roomRules');
};
$('botBack').onclick = () => show('menu');
$('botStart').onclick = () => {
  const r = roomRules();
  const solo = botMatch.mode === 'solo';
  const bots = botMatch.bots[botMatch.mode].map((level, i) => ({ name: `Bot ${i + 1}`, kind: 'bot', level }));
  const roster = solo ? [{ name: myName(), kind: 'kbm', pref: deviceSettings('kbm').character }, ...bots] : bots;
  state.crownName = null;
  state.series = r.rounds > 1 ? { rounds: r.rounds, wins: roster.map(() => 0), round: 1 } : null;
  playLocal(roster, r.stocks, r.stage, false, { rules: r.rules, stormPace: r.stormPace, crownRule: r.crownRule, fromLobby: true });
};

// ---- Same screen -------------------------------------------------------------
// A three-step setup: how many players, who plays with what (keyboard + mouse, or a controller
// each), then the rules. A match can be one of several rounds (best of 3 or 5).

const connectedPads = () => [...(navigator.getGamepads?.() ?? [])].filter((g) => g && g.connected).map((g) => g.index).filter((n) => n < 4);
const DEVICES = ['kbm', 'pad0', 'pad1', 'pad2', 'pad3'];
const setup = { step: 1, players: 2, devices: ['kbm', 'pad0', 'pad1', 'pad2'] };
for (const id of ['ruleStage', 'roomStage', 'lobbyStage', 'botStage', 'trainStage', 'dumStage']) for (const [value, text] of STAGE_CHOICES) $(id).append(new Option(text, value));
// The rules pickers (presets, or custom), remembered between games: Same screen's, and the one
// online rooms and Bot match share.
const localRules = rulesPicker('rule', 'oxasmash.rules.local');
const roomPicker = rulesPicker('room', 'oxasmash.rules.room', () => !$('botLobby').hidden && renderBotLobby());

$('playLocal').onclick = () => {
  setup.step = 1;
  renderSetup();
  show('localSetup');
};

for (const btn of $('playerCount').querySelectorAll('button')) {
  btn.onclick = () => {
    setup.players = Number(btn.dataset.n);
    setup.step = 2;
    renderSetup();
  };
}

function renderSetup() {
  for (const li of document.querySelectorAll('.steps li')) li.classList.toggle('on', Number(li.dataset.step) === setup.step);
  for (const sec of document.querySelectorAll('.setup-step')) sec.hidden = Number(sec.dataset.step) !== setup.step;
  for (const btn of $('playerCount').querySelectorAll('button')) btn.setAttribute('aria-pressed', String(Number(btn.dataset.n) === setup.players));
  $('setupNext').textContent = setup.step === 3 ? 'Start' : 'Next';
  if (setup.step === 2) renderDevices();
  $('ruleBots').disabled = setup.players >= RULES.maxPlayers;
  if (setup.players >= RULES.maxPlayers) $('ruleBots').value = '0';
}

// Step 2: a row per player, picking keyboard + mouse or a controller (connected ones marked).
function renderDevices() {
  const pads = connectedPads();
  $('padCount').textContent = pads.length ? `${pads.length} controller${pads.length === 1 ? '' : 's'} connected.` : 'No controllers found: plug one in and press a button on it.';
  $('deviceList').replaceChildren(
    ...Array.from({ length: setup.players }, (_, k) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = `P${k + 1}`;
      name.style.color = PLAYER_COLORS[k].css;
      const pick = document.createElement('select');
      for (const d of DEVICES) {
        const ok = d === 'kbm' || pads.includes(Number(d.slice(3)));
        pick.append(new Option(`${deviceLabel(d)}${ok ? '' : ' (not connected)'}`, d, false, setup.devices[k] === d));
      }
      pick.onchange = () => {
        setup.devices[k] = pick.value;
        checkDevices();
      };
      li.append(name, pick);
      return li;
    }),
  );
  checkDevices();
}

// Everyone needs their own device, and controllers must be plugged in.
function checkDevices() {
  const chosen = setup.devices.slice(0, setup.players);
  const pads = connectedPads();
  let problem = '';
  if (new Set(chosen).size < chosen.length) problem = 'Two players have the same controls.';
  else {
    const missing = chosen.find((d) => d !== 'kbm' && !pads.includes(Number(d.slice(3))));
    if (missing) problem = `${deviceLabel(missing)} isn't connected. Plug it in and press a button on it.`;
  }
  $('deviceProblem').textContent = problem;
  return !problem;
}

window.addEventListener('gamepadconnected', () => setup.step === 2 && renderDevices());
window.addEventListener('gamepaddisconnected', () => setup.step === 2 && renderDevices());

$('setupBack').onclick = () => {
  if (setup.step === 1) return show('menu');
  setup.step--;
  renderSetup();
};

$('setupNext').onclick = () => {
  if (setup.step === 2 && !checkDevices()) return;
  if (setup.step < 3) {
    setup.step++;
    return renderSetup();
  }
  // Start: the players, then any bots; the first player gets the character they picked.
  // Each player gets the character last picked on their device.
  const roster = setup.devices.slice(0, setup.players).map((kind, k) => ({ name: `P${k + 1}`, kind, pref: deviceSettings(kind).character }));
  for (let i = 1; i <= Number($('ruleBots').value) && roster.length < RULES.maxPlayers; i++) roster.push({ name: `Bot ${i}`, kind: 'bot', level: 'normal' });
  const rounds = Number($('ruleRounds').value);
  state.series = rounds > 1 ? { rounds, wins: roster.map(() => 0), round: 1 } : null;
  state.crownName = null;
  const extra = { rules: localRules.read().rules, stormPace: $('ruleStorm').value, crownRule: $('ruleCrown').value };
  const stage = Object.hasOwn(STAGES, $('ruleStage').value) || $('ruleStage').value === MIXED ? $('ruleStage').value : DEFAULT_STAGE;
  playLocal(roster, Number($('ruleLives').value), stage, false, extra);
};

// ---- Online -----------------------------------------------------------------
// Rooms live on the game server (see server/), which runs the matches. Whoever made a room is its
// owner (state.owner): they set the rules, add bots, start matches, rematch and go back to the
// lobby. Everyone else (and the owner too) just plays.

// Create room: the rules come first (the same screen changes them later, from the lobby).
let rulesFor = 'create'; // what the rules screen is for: 'create' (a new room), 'edit' (the lobby's) or 'bots' (a bot match)
$('createRoom').onclick = () => {
  rulesFor = 'create';
  $('roomRulesGo').textContent = 'Create room';
  show('roomRules');
};
$('addBot').onclick = () => state.room?.command('addBot', { level: $('lobbyBotLevel').value });
$('lobbyRulesBtn').onclick = () => {
  rulesFor = 'edit';
  $('roomRulesGo').textContent = 'Done';
  show('roomRules');
};
$('roomRulesBack').onclick = () => {
  if (rulesFor === 'bots') {
    renderBotLobby();
    show('botLobby');
  } else if (rulesFor === 'edit') {
    renderLobby();
    show('lobby');
  } else show('menu');
};
$('roomRulesGo').onclick = () => {
  state.series = null;
  if (rulesFor === 'bots') {
    renderBotLobby();
    show('botLobby');
  } else if (rulesFor === 'edit') {
    state.room?.command('rules', { rules: roomRules() });
    renderLobby();
    show('lobby');
  } else enterRoom({ create: true, rules: roomRules() }, $('roomRulesGo'), 'Creating…');
};

// The rules as set on the rules screen.
function roomRules() {
  const stage = Object.hasOwn(STAGES, $('roomStage').value) || $('roomStage').value === MIXED ? $('roomStage').value : DEFAULT_STAGE;
  const { preset, rules } = roomPicker.read();
  return { stocks: Number($('roomLives').value) || RULES.stocks, rounds: Number($('roomRounds').value) || 1, stage, preset, rules, stormPace: $('roomStorm').value, crownRule: $('roomCrown').value };
}

// Rules in a line, for the lobby (the room's, as the server has them; else the rules screen's).
// The stage's name, from the menu's list.
const stageName = (stage) => [...$('roomStage').options].find((o) => o.value === String(stage))?.text ?? String(stage);

// The rules in a line (the stage is shown on its own): the preset, or what custom rules turn off.
function rulesSummary(r = roomRules()) {
  const label = (id, value) => [...$(id).options].find((o) => o.value === String(value))?.text ?? String(value);
  const on = r.rules ?? {};
  const off = [['melee', 'no melee'], ['ranged', 'no guns'], ['thrown', 'no grenades'], ['items', 'no items']].filter(([k]) => on[k] === false).map(([, t]) => t);
  const what = PRESETS.includes(r.preset) ? [DUEL_MODES[r.preset].name] : off.length ? off : ['everything on'];
  const parts = [...what, `${r.stocks} ${r.stocks === 1 ? 'life' : 'lives'}`, r.rounds > 1 ? `best of ${r.rounds}` : '', `storm ${label('roomStorm', r.stormPace).toLowerCase()}`].filter(Boolean);
  if (r.crownRule && r.crownRule !== 'show') parts.push(`crown: ${r.crownRule}`);
  return parts.join(' · ');
}

// Into a room on the server: a new one ({ create, rules }) or a friend's ({ code }).
function enterRoom(how, button, label) {
  return busy(button, label, async () => {
    try {
      const room = await OnlineRoom.connect({ name: myName(), char: deviceSettings('kbm').character, ...how });
      state.role = 'online';
      state.room = room;
      warmUp();
      state.lobby = null;
      state.owner = false;
      state.crownName = null;
      room
        .on('lobby', (msg) => {
          state.lobby = msg;
          state.owner = !!msg.owner;
          duel.view = null;
          stopMatch();
          renderLobby();
          show('lobby');
        })
        .on('start', startOnline)
        .on('duels', onDuels)
        .on('standing', (msg) => {
          state.standing = { left: Array.isArray(msg.left) ? msg.left.filter(Number.isInteger) : [], rematch: msg.rematch !== false, duel: msg.duel !== false };
          resultsButtons();
          renderDuelBoard();
        })
        .on('closed', (reason) => {
          backToMenu();
          toast(reason);
        });
    } catch (err) {
      toast(describeNetError(err));
    }
  });
}

$('startMatch').onclick = () => state.room?.command('start');
// The owner's stage pick, from the lobby (the rules screen shows it too).
$('lobbyStage').onchange = () => {
  $('roomStage').value = $('lobbyStage').value;
  $('roomStage').dispatchEvent(new Event('change'));
  state.room?.command('rules', { rules: roomRules() });
};

function join() {
  const code = cleanCode($('joinCode').value);
  if (code.length !== CODE_LENGTH) {
    toast(`Room codes have ${CODE_LENGTH} characters.`);
    return;
  }
  enterRoom({ code }, $('joinRoom'), 'Joining…');
}

$('joinRoom').onclick = join;

// The rooms on the server, under the code: whose, how full, what's on, best ping first.
const roomList = new RoomList((list) => {
  if (!list) {
    $('roomListStatus').textContent = "Can't reach the game server right now.";
    $('roomList').replaceChildren();
    return;
  }
  const n = list.rooms.length;
  $('roomListStatus').textContent = `${n ? `${n} open room${n === 1 ? '' : 's'}` : 'No rooms yet: make one!'}${list.ping !== null ? ` · your ping ${list.ping} ms` : ''}`;
  $('roomList').replaceChildren(
    ...list.rooms.slice(0, 20).map((r) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'who';
      name.textContent = `${cleanName(r.owner)}'s room`;
      const full = r.players >= RULES.maxOnline;
      const info = document.createElement('span');
      info.className = 'tag';
      info.textContent = [`${r.players}/${RULES.maxOnline}`, r.watching ? `${r.watching} watching` : '', r.phase === 'lobby' ? 'in the lobby' : 'playing', Number.isInteger(r.ping) ? `${r.ping} ms` : ''].filter(Boolean).join(' · ');
      const code = cleanCode(r.code ?? '');
      const go = rowButton(full || r.phase !== 'lobby' ? 'Watch' : 'Join', () => enterRoom({ code }, go, 'Joining…'));
      li.append(name, info, go);
      return li;
    }),
  );
});
if (!$('menu').hidden) roomList.start();
$('joinCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') join();
});

// A match starts (the server's message, checked before use; names are only ever shown as text).
function startOnline(msg) {
  const names = Array.isArray(msg.names) ? msg.names.slice(0, RULES.maxOnline).map(cleanName) : [];
  const you = Number.isInteger(msg.you) && msg.you >= 0 && msg.you < names.length ? msg.you : -1;
  // (-1: watching it, without a seat.)
  const isDuel = Object.hasOwn(DUEL_MODES, msg.duel);
  if (names.length < 2) return;
  $('duelPick').hidden = true;
  state.standing = null; // (who's left, after this match: see 'standing')
  const stocks = Number.isInteger(msg.stocks) ? Math.max(1, Math.min(5, msg.stocks)) : RULES.stocks;
  const stage = isStageId(msg.stage) ? msg.stage : DEFAULT_STAGE;
  const chars = Array.isArray(msg.chars) ? msg.chars : [];
  const roster = names.map((name, i) => ({ name, kind: i === you ? 'kbm' : 'remote', char: CHARACTERS.includes(chars[i]) ? chars[i] : undefined, crowned: msg.crown === i }));
  state.onScreen = you >= 0 ? [roster[you]] : [];
  // How the server made the match's world: this browser makes the very same one (rollback).
  const made = msg.init;
  if (!made || typeof made !== 'object' || made.players !== names.length || !Number.isInteger(made.seed) || !isStageId(made.stage)) return;
  const init = { players: names.length, stocks, stage, seed: made.seed >>> 0, rules: made.rules && typeof made.rules === 'object' ? made.rules : {}, stormPace: String(made.stormPace ?? 'normal'), crown: Number.isInteger(made.crown) ? made.crown : -1, crownRule: String(made.crownRule ?? 'show') };
  if (isDuel) {
    show(null);
    return startMatch({ mode: 'client', room: state.room, roster, you, stocks, stage, init, onEnd: () => showDuelScreen() });
  }
  // Rounds: the series so far (the score is counted here the same way from each result).
  const s = msg.series;
  state.series = s && Number.isInteger(s.rounds) && Number.isInteger(s.round) && Array.isArray(s.wins) ? { rounds: s.rounds, round: s.round, wins: names.map((_, i) => Number(s.wins[i]) || 0) } : null;
  show(null);
  startMatch({ mode: 'client', room: state.room, roster, you, stocks, stage, init, onEnd: (view) => showResults(view, roster) });
}

// ---- Lobby ------------------------------------------------------------------

function renderLobby() {
  const room = state.room;
  if (!room) return;
  const owner = state.owner;
  const all = state.lobby?.players ?? [];
  const you = state.lobby?.you;
  $('roomCode').textContent = room.code;
  // The seated players (in play order), then everyone watching (in the order they'll get a seat).
  const row = (p, i, color, extra = []) => {
    const tags = [...extra];
    if (i === you) tags.push('You');
    if (p.kind === 'host') tags.push('Owner');
    if (p.kind === 'bot') tags.push(`Bot · ${String(p.level ?? 'normal')}`);
    const li = playerRow(cleanName(p.name), color, tags.join(' · '));
    if (owner && p.kind !== 'host') li.append(rowButton('Remove', () => room.command('remove', { i })));
    return li;
  };
  const seated = all.map((p, i) => ({ p, i })).filter(({ p }) => !p.watching);
  const watching = all.map((p, i) => ({ p, i })).filter(({ p }) => p.watching);
  const players = seated.map(({ p }) => p);
  $('players').replaceChildren(...seated.map(({ p, i }, k) => row(p, i, k % PLAYER_COLORS.length)));
  $('watchers').hidden = !watching.length;
  $('watchers').replaceChildren(...watching.map(({ p, i }, k) => row(p, i, 0, [`Watching · ${k + 1}${k === 0 ? 'st' : k === 1 ? 'nd' : k === 2 ? 'rd' : 'th'} in line`])));
  $('hostTools').hidden = !owner;
  $('addBot').disabled = players.length >= RULES.maxOnline;
  $('lobbyRules').hidden = !state.lobby?.rules;
  // (The stage on its own: the owner picks it right here; everyone else sees it named.)
  const r = state.lobby?.rules;
  if (r && $('lobbyStage').value !== r.stage) $('lobbyStage').value = r.stage;
  $('lobbyRules').textContent = r ? `${owner ? '' : `Stage: ${stageName(r.stage)} · `}Rules: ${rulesSummary(r)}` : '';
  $('startMatch').hidden = !owner;
  $('startMatch').disabled = players.length < 2;
  $('lobbyStatus').textContent = !players.length
    ? 'Connecting…'
    : !owner
      ? 'Waiting for the room owner to start…'
      : players.length < 2
        ? 'Waiting for friends. Add a bot to try it on your own.'
        : `${players.length} of ${RULES.maxOnline} players${watching.length ? `, ${watching.length} watching` : ''}.`;
}

$('copyCode').onclick = () => {
  const code = state.room?.code;
  if (!code) return;
  const link = `${location.origin}${location.pathname}?room=${code}`;
  navigator.clipboard?.writeText(link).then(
    () => ($('lobbyStatus').textContent = 'Invite link copied.'),
    () => toast(`Couldn't copy. The code is ${code}.`),
  );
};

$('leaveRoom').onclick = backToMenu;

function backToMenu() {
  duel.view = null;
  stopMatch();
  state.room?.close();
  state.room = null;
  state.role = null;
  state.owner = false;
  state.lobby = null;
  show('menu');
}

// ---- Results and quitting ---------------------------------------------------

function showResults(view, roster) {
  const w = view.winner;
  $('winner').textContent = w >= 0 && roster[w] ? `${roster[w].name} wins!` : 'Draw!';
  // The winner wears the crown next round (a draw: nobody does).
  state.crownName = w >= 0 && roster[w] ? roster[w].name : null;
  // Rounds (best of 3 or 5): the score so far, and whether someone has won it all.
  const series = state.series;
  $('seriesLine').hidden = !series;
  if (series) {
    if (w >= 0) series.wins[w]++;
    const need = Math.ceil(series.rounds / 2);
    const champ = series.wins.findIndex((n) => n >= need);
    series.over = champ >= 0;
    const score = roster.map((p, i) => `${p.name} ${series.wins[i]}`).join(' · ');
    $('seriesLine').textContent = series.over ? `${roster[champ].name} wins the series! ${score}` : `Round ${series.round} of up to ${series.rounds} · ${score}`;
  }
  const order = view.fighters.map((f, i) => ({ f, i })).sort((a, b) => b.f.stocks - a.f.stocks || b.f.kos - a.f.kos);
  const list = $('scores');
  list.replaceChildren(
    ...order.map(({ f, i }) => {
      const row = playerRow(roster[i]?.name ?? '?', i, `${f.kos} KO · ${f.stocks} ${f.stocks === 1 ? 'life' : 'lives'} left`);
      row.dataset.fighter = String(i);
      return row;
    }),
  );
  resultsButtons();
  renderDuelBoard();
  show('results');
}

// The results screen's buttons: online, only the owner rematches (or takes everyone back to the
// lobby); everyone else can leave the room.
function resultsButtons() {
  const online = state.role === 'online';
  const series = state.series;
  $('again').hidden = online && !state.owner;
  $('again').textContent = series ? (series.over ? 'New series' : 'Next round') : online ? 'Rematch' : 'Play again';
  // Online: who's left the room, grayed out; no one left to play: no rematch.
  const standing = online ? state.standing : null;
  for (const row of $('scores').children) {
    const gone = !!standing?.left.includes(Number(row.dataset.fighter));
    row.classList.toggle('gone', gone);
    const tag = row.querySelector('.tag');
    if (tag && gone && !tag.textContent.startsWith('Left')) tag.textContent = `Left the room · ${tag.textContent}`;
  }
  $('again').disabled = !!standing && !standing.rematch;
  $('toMenu').textContent = online ? (state.owner ? 'Back to lobby' : 'Leave room') : state.botMatch ? 'Back to setup' : 'Menu';
  $('resultsStatus').textContent = standing && !standing.rematch ? 'Everyone else has left: not enough players for a rematch.' : online && !state.owner ? 'Waiting for the room owner…' : '';
}

$('again').onclick = () => {
  if (state.role === 'online') return state.room?.command('again');
  const series = state.series;
  if (series) {
    if (series.over) Object.assign(series, { wins: series.wins.map(() => 0), round: 1, over: false });
    else series.round++;
  }
  if (state.lastLocal) playLocal(state.lastLocal.roster, state.lastLocal.stocks, state.lastLocal.stage, state.lastLocal.training, state.lastLocal.extra);
};

function quit() {
  const online = state.role === 'online';
  // Only watching a duel: back to the duel board (still in the room).
  if (online && duel.view && !state.onScreen.length) {
    stopMatch();
    return showDuelScreen();
  }
  state.series = online ? null : state.series;
  if (online && state.owner) {
    // (Everyone goes back to the lobby: the server sends it.)
    state.room.command('lobby');
  } else if (online) {
    backToMenu();
  } else if (state.botMatch) {
    stopMatch();
    renderBotLobby();
    show('botLobby');
  } else {
    stopMatch();
    show('menu');
  }
}

$('toMenu').onclick = quit;

// ---- Honor duels (online) ---------------------------------------------------
// After an online match, from the results screen, players challenge each other to 1v1 duels (see
// DuelBoard in net/duels.js): the server keeps the board and sends everyone its view (onDuels);
// everyone sends their moves. The duels are then fought one after another; anyone not in the one
// being fought can watch it (the spectator camera).

// view, names, bots, you: the board as last seen here.
const duel = { view: null, names: [], bots: [], you: -1 };
const duelName = (i) => cleanName(duel.names[i] ?? '?');

// The board from the server (checked before use; names only ever shown as text). null: closed.
function onDuels(msg) {
  const d = msg?.d;
  if (!d) {
    duel.view = null;
    renderDuelBoard();
    return;
  }
  const ints = (a) => (Array.isArray(a) ? a.filter(Number.isInteger) : []);
  if (!Array.isArray(d.duels) || !Array.isArray(d.invites) || typeof d.phase !== 'string') return;
  duel.view = { ...d, present: ints(d.present), watching: ints(d.watching), autoOff: ints(d.autoOff) };
  duel.names = Array.isArray(msg.names) ? msg.names.map(String) : [];
  duel.bots = ints(msg.bots);
  duel.you = Number.isInteger(msg.you) ? msg.you : -1;
  // (The owner can change: whoever made the room left.)
  if (typeof msg.owner === 'boolean') state.owner = msg.owner;
  if (!inMatchNow()) showDuelScreen();
}

const duelMove = (move) => state.room?.sendDuel(move);

// Not in a match: the screen for where the duels are (choosing the rules, or the board).
function showDuelScreen() {
  const v = duel.view;
  if (v && (v.phase === 'rules' || v.phase === 'vote')) {
    renderDuelRules();
    if ($('duelRules').hidden) show('duelRules');
    return;
  }
  renderDuelBoard();
  resultsButtons();
  if ($('results').hidden) {
    // (Someone who joined to watch has no match of their own to show.)
    if (!$('scores').children.length) $('winner').textContent = 'Honor duels';
    show('results');
  }
}

// A small button for a row.
function rowButton(text, onclick, primary = false) {
  const b = document.createElement('button');
  b.className = `btn small ${primary ? 'primary' : 'ghost'}`;
  b.textContent = text;
  b.onclick = onclick;
  return b;
}

// The board on the results screen: the DUEL button, challenges to and from you, everything set.
function renderDuelBoard() {
  const v = duel.view;
  $('duelBoard').hidden = !v;
  if (!v) return;
  const me = duel.you;
  const taken = (i) => v.duels.some((d) => d.a === i || d.b === i);
  const free = (i) => v.present.includes(i) && !taken(i);
  const gathering = v.phase === 'gather' || v.phase === 'countdown';
  const watching = v.watching.includes(me);
  const undecided = free(me) && !watching;
  $('duelBtn').disabled = !gathering || !free(me) || state.standing?.duel === false;
  $('duelWatch').textContent = watching ? 'Stop spectating' : 'Spectate duels';
  $('duelAuto').checked = !v.autoOff.includes(me);
  $('duelNow').hidden = !(state.owner && v.phase === 'gather' && v.duels.length > 0);
  const d = v.duels[v.current];
  const vs = d ? `${duelName(d.a)} vs ${duelName(d.b)}` : '';
  const prompt = undecided ? ' Not dueling? Spectate the duels.' : '';
  let line;
  if (v.phase === 'gather') {
    if (!v.duels.length) line = `Challenge someone to an honor duel!${prompt}`;
    else if (v.invites.length) line = 'Waiting for challenges to be answered…';
    else line = `The duels start once everyone's set${undecided && v.idleLeft ? ` (${v.idleLeft} s)` : ''}.${prompt}`;
  } else if (v.phase === 'countdown') line = `First duel in ${v.countdown}…${prompt}`;
  else if (v.phase === 'fight') line = `Duel ${v.current + 1}: ${vs}, being fought.`;
  else if (v.phase === 'done') line = 'All the duels are fought.';
  else line = `Duel ${v.current + 1}: ${vs}, choosing the rules.`;
  $('duelPhase').textContent = line;
  // Challenges to and from you.
  $('duelInbox').replaceChildren(
    ...v.invites
      .filter((x) => x.to === me || x.from === me)
      .map((x) => {
        const theirs = x.to === me;
        const li = playerRow(theirs ? `${duelName(x.from)} challenges you` : `You challenged ${duelName(x.to)}`, theirs ? x.from : x.to, theirs ? '' : 'waiting…');
        if (theirs) li.append(rowButton('Accept', () => duelMove({ a: 'accept', from: x.from }), true), rowButton('No', () => duelMove({ a: 'decline', from: x.from })));
        else li.append(rowButton('Cancel', () => duelMove({ a: 'cancel', to: x.to })));
        return li;
      }),
  );
  // Everything set, for everyone to see.
  $('duelList').replaceChildren(
    ...v.invites.filter((x) => x.to !== me && x.from !== me).map((x) => playerRow(`${duelName(x.from)} challenged ${duelName(x.to)}`, x.from, 'pending')),
    ...v.duels.map((x, k) => {
      const tags = [];
      if (x.mode) tags.push(DUEL_MODES[x.mode]?.name ?? '');
      if (k === v.current && v.phase === 'fight') tags.push('fighting now');
      else if (k < v.current || v.phase === 'done') tags.push(x.winner >= 0 ? `${duelName(x.winner)} won` : 'draw');
      return playerRow(`Duel ${k + 1}: ${duelName(x.a)} vs ${duelName(x.b)}`, x.a, tags.join(' · '));
    }),
  );
}

// Choosing the next duel's rules: the duellers pick (the same pick applies, else Normal); with
// Crowd's Choice, everyone else votes.
function renderDuelRules() {
  const v = duel.view;
  const d = v?.duels[v.current];
  if (!d) return;
  const me = duel.you;
  const dueller = me === d.a || me === d.b;
  const voting = v.phase === 'vote';
  $('duelCount').textContent = `Honor duel ${v.current + 1} of ${v.duels.length}`;
  $('duelTitle').textContent = `${duelName(d.a)} vs ${duelName(d.b)}`;
  if (voting) $('duelInfo').textContent = dueller ? `Crowd's Choice: the spectators are voting. ${v.voteLeft} s` : `Crowd's Choice: vote for the rules! ${v.voteLeft} s`;
  else if (dueller) $('duelInfo').textContent = `Pick the rules. If you both pick the same, that's the duel; if not, it's a Normal Duel. ${v.rulesLeft} s`;
  else $('duelInfo').textContent = `${duelName(d.a)} and ${duelName(d.b)} are picking the rules… ${v.rulesLeft} s`;
  const votes = Object.values(v.votes ?? {});
  const mine = voting ? v.votes?.[me] : me === d.a ? v.picks?.a : me === d.b ? v.picks?.b : null;
  $('duelModes').replaceChildren(
    ...Object.entries(DUEL_MODES)
      .filter(([key]) => !voting || key !== 'crowd')
      .map(([key, m]) => {
        const b = document.createElement('button');
        b.className = `duel-mode${mine === key ? ' on' : ''}`;
        b.disabled = voting ? dueller || !v.present.includes(me) : !dueller;
        const name = document.createElement('b');
        name.textContent = m.name;
        const text = document.createElement('span');
        text.textContent = m.text;
        // Who picked it (or, in the vote, how many voted for it).
        const marks = document.createElement('em');
        const n = votes.filter((x) => x === key).length;
        if (voting) marks.textContent = n ? `${n} vote${n === 1 ? '' : 's'}` : '';
        else marks.textContent = [v.picks?.a === key ? duelName(d.a) : '', v.picks?.b === key ? duelName(d.b) : ''].filter(Boolean).join(' · ');
        b.append(name, text, marks);
        b.onclick = () => duelMove({ a: voting ? 'vote' : 'pick', mode: key });
        return b;
      }),
  );
  $('duelStatus').textContent = voting ? '' : `${duelName(d.a)}: ${v.picks?.a ? 'picked' : 'choosing…'} · ${duelName(d.b)}: ${v.picks?.b ? 'picked' : 'choosing…'}`;
}

// Picking who to challenge.
$('duelBtn').onclick = () => {
  const v = duel.view;
  if (!v) return;
  const me = duel.you;
  const taken = (i) => v.duels.some((d) => d.a === i || d.b === i);
  const foes = v.present.filter((i) => i !== me && !taken(i) && !v.invites.some((x) => x.from === me && x.to === i));
  $('duelFoes').replaceChildren(
    ...foes.map((i) => {
      const li = playerRow(duelName(i), i, duel.bots.includes(i) ? 'Bot' : v.watching.includes(i) ? 'spectating' : '');
      li.append(
        rowButton(
          'Challenge',
          () => {
            duelMove({ a: 'invite', to: i });
            $('duelPick').hidden = true;
          },
          true,
        ),
      );
      return li;
    }),
  );
  $('duelFoesNone').hidden = foes.length > 0;
  $('duelPick').hidden = false;
};
$('duelPickClose').onclick = () => ($('duelPick').hidden = true);
$('duelWatch').onclick = () => duelMove({ a: 'spectate', on: !duel.view?.watching.includes(duel.you) });
$('duelAuto').onchange = () => duelMove({ a: 'auto', on: $('duelAuto').checked });
$('duelNow').onclick = () => state.room?.command('duelNow');

// ---- In-game menu -----------------------------------------------------------
// Esc (or a controller's Start, or the Menu button) opens it during a match. It frees the mouse;
// a local match pauses while it's up. Closing it and clicking the game captures the mouse again.

const inMatchNow = () => !$('quit').hidden;

// opener: who opened it ({ player, pad }); the keyboard (Esc, the Menu button) when not given.
function openMenu(opener) {
  if (!inMatchNow() || menuOpen) return;
  menuOpen = true;
  const players = state.onScreen.length ? state.onScreen : [{ name: myName(), kind: 'kbm' }];
  const first = players.find((p) => p.kind === 'kbm') ?? players[0];
  editing = opener ?? { player: first.kind, pad: first.kind === 'kbm' ? 'pad0' : first.kind };
  $('menuFor').replaceChildren(...players.map((p) => new Option(`${p.name} · ${deviceLabel(p.kind)}`, p.kind, false, p.kind === editing.player)));
  $('menuFor').disabled = players.length < 2;
  $('gameMenu').hidden = false;
  $('leaveMatch').textContent = state.role !== 'online' ? 'Quit to menu' : !state.onScreen.length && duel.view ? 'Stop watching' : state.owner ? 'Back to lobby' : 'Leave room';
  $('pausedNote').textContent = state.role ? 'Online matches keep going while this is open.' : 'The match is paused.';
  // The Training and Dummies tabs: only in training.
  const training = !state.role && !!state.lastLocal?.training;
  for (const t of document.querySelectorAll('.tab[data-training]')) t.hidden = !training;
  if (!training && document.querySelector('.tab.on')?.hidden) document.querySelector('.tab[data-tab="general"]').click();
  refreshMenu();
  gameModule?.then((m) => m.setMenu(true));
}

function closeMenu() {
  if (!menuOpen) return;
  stopWaiting();
  menuOpen = false;
  $('gameMenu').hidden = true;
  gameModule?.then((m) => {
    m.applySettings();
    m.setMenu(false);
  });
}

$('quit').onclick = () => openMenu();
// Switch whose settings to change.
$('menuFor').onchange = () => {
  const slot = $('menuFor').value;
  editing = { player: slot, pad: slot === 'kbm' ? 'pad0' : slot };
  stopWaiting();
  refreshMenu();
};
$('resume').onclick = closeMenu;
$('leaveMatch').onclick = () => {
  closeMenu();
  quit();
};
window.addEventListener('oxasmash-menu', (e) => (menuOpen ? closeMenu() : openMenu(e.detail)));
// The browser lets go of a captured mouse on Esc (that Esc never reaches the page): open the menu.
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement || !inMatchNow() || menuOpen) return;
  mouseFreedAt = performance.now();
  openMenu();
});
window.addEventListener(
  'keydown',
  (e) => {
    if (waiting?.kind === 'key') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key !== 'Escape') {
        // A key another action uses moves over to this one; that action gets this one's old key.
        const old = settings.keys[waiting.action] ?? [];
        for (const [action, keys] of Object.entries(settings.keys)) {
          if (action !== waiting.action && keys.includes(e.keyCode)) settings.keys[action] = keys.map((k) => (k === e.keyCode ? old[0] : k)).filter((k) => k !== undefined);
        }
        settings.keys[waiting.action] = [e.keyCode];
        saveSettings();
      }
      stopWaiting();
      renderBindings();
      return;
    }
    if (e.key !== 'Escape') return;
    if (menuOpen) closeMenu();
    else if (performance.now() - mouseFreedAt > 300) openMenu();
  },
  true,
);

for (const tab of document.querySelectorAll('.tab')) {
  tab.onclick = () => {
    stopWaiting();
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t === tab);
    for (const page of document.querySelectorAll('.menu-page')) page.hidden = page.dataset.page !== tab.dataset.tab;
    refreshMenu();
  };
}

// What the browser says about each controller, live: its slot, layout, every axis and the buttons
// held. If aiming won't switch to a controller, this shows why (wrong slot, a non-standard layout,
// a stick on other axes).
function padLiveText() {
  const pads = [...(navigator.getGamepads?.() ?? [])].filter((g) => g && g.connected);
  if (!pads.length) return 'No controller found. Plug one in and press a button on it.';
  const first = firstPad()?.index;
  return pads
    .map((g) => {
      const std = g.mapping === 'standard';
      const axes = [...g.axes].map((v) => (v >= 0 ? '+' : '') + v.toFixed(2)).join(' ');
      const down = g.buttons.map((b, i) => (b.pressed ? (std ? padButtonName(i, g) : i) : null)).filter((x) => x !== null);
      return `Slot ${g.index}${g.index === first ? ' (the one used for keyboard + mouse play)' : ''}: ${g.id}\n  layout: ${std ? `standard (${padStyle(g)} names)` : 'NOT standard: the sticks may be on other axes'} · ${g.buttons.length} buttons · ${g.axes.length} axes\n  axes: ${axes}\n  buttons held: ${down.join(', ') || 'none'}`;
    })
    .join('\n\n');
}

let padLiveFrame = 0;
function runPadLive() {
  cancelAnimationFrame(padLiveFrame);
  const tab = document.querySelector('.tab[data-tab="controller"]');
  const loop = () => {
    if (!menuOpen || !tab.classList.contains('on')) return;
    $('padLive').textContent = padLiveText();
    padLiveFrame = requestAnimationFrame(loop);
  };
  loop();
}

function refreshMenu() {
  runPadLive();
  for (const [id, key] of [['volMaster', 'master'], ['volEffects', 'effects'], ['volAnnouncer', 'announcer']]) $(id).value = settings.volume[key];
  renderCharacter();
  renderBindings();
  renderTraining();
  renderDummies();
}

// ---- Training menu ------------------------------------------------------------
// Spawn anything: pick a category, then one of its sprites; its details show below, with a button
// to drop it in front of you.

const CATEGORIES = {
  gun: () => Object.keys(GUNS),
  melee: () => Object.keys(MELEE),
  thrown: () => Object.keys(GRENADES),
  item: () => Object.keys(ITEMS),
};
const training = { cat: 'gun', pick: { gun: 'pistol', melee: 'katana', thrown: 'frag', item: 'apple' } };

for (const chip of $('trainCats').querySelectorAll('.chip')) {
  chip.onclick = () => {
    training.cat = chip.dataset.cat;
    renderTraining();
  };
}

// Training options: infinite ammo, hitboxes (applied right away).
for (const [id, key] of [['trainInfinite', 'infinite'], ['trainHitboxes', 'hitboxes']]) {
  $(id).onchange = () => {
    if (!state.training) return;
    state.training[key] = $(id).checked;
    gameModule?.then((m) => m.setTrainingOptions(state.training));
  };
}

function renderTraining() {
  if (state.training) {
    $('trainInfinite').checked = state.training.infinite !== false;
    $('trainHitboxes').checked = !!state.training.hitboxes;
  }
  for (const chip of $('trainCats').querySelectorAll('.chip')) chip.classList.toggle('on', chip.dataset.cat === training.cat);
  const keys = CATEGORIES[training.cat]();
  if (!keys.includes(training.pick[training.cat])) training.pick[training.cat] = keys[0] ?? null;
  const chosen = training.pick[training.cat];
  $('trainGrid').replaceChildren(
    ...keys.map((key) => {
      const info = describe(key);
      const btn = document.createElement('button');
      btn.className = `art-pick${key === chosen ? ' on' : ''}`;
      btn.innerHTML = `<img src="art/${key}.png" alt="" /><span></span>`;
      btn.querySelector('span').textContent = info.name;
      btn.onclick = () => {
        training.pick[training.cat] = key;
        renderTraining();
        $('trainInfo').querySelector('.spawn')?.focus();
      };
      return btn;
    }),
  );
  if (!chosen) {
    $('trainInfo').innerHTML = '<p class="muted">No items yet. Health snacks, runes, the key and the rest come with the items batch.</p>';
    return;
  }
  const info = describe(chosen);
  const box = $('trainInfo');
  box.innerHTML = `<img src="art/${chosen}.png" alt="" /><h3></h3><p class="blurb"></p><dl class="stats"></dl><ul class="quirks"></ul><button class="btn primary spawn">Spawn in front of me</button>`;
  box.querySelector('h3').textContent = info.name;
  box.querySelector('.blurb').textContent = info.blurb;
  box.querySelector('.stats').replaceChildren(
    ...info.stats.map(([label, value]) => {
      const row = document.createElement('div');
      row.innerHTML = '<dt></dt><dd></dd>';
      row.querySelector('dt').textContent = label;
      row.querySelector('dd').textContent = value;
      return row;
    }),
  );
  box.querySelector('.quirks').replaceChildren(
    ...info.quirks.map((q) => {
      const li = document.createElement('li');
      li.textContent = q[0].toUpperCase() + q.slice(1) + '.';
      return li;
    }),
  );
  box.querySelector('.spawn').onclick = () => {
    gameModule?.then((m) => m.trainingSpawn(chosen));
    closeMenu();
  };
}

// The dummies: how many (changing it restarts training), how they behave, whether they attack,
// and what they pick up (applied right away).
function renderDummies() {
  const d = state.training;
  if (!d) return;
  $('dumStage').value = d.stage;
  $('dumCount').value = String(d.count);
  $('dumHealth').value = d.health.mode;
  $('dumHealthValue').value = String(d.health.value);
  $('dumHealthValue').disabled = d.health.mode === 'normal';
  $('dumHealthAfter').value = String(d.health.after ?? 2);
  $('dumHealthAfterField').hidden = d.health.mode !== 'banded';
  $('dumLevel').value = d.level;
  $('dumAttack').checked = d.attack;
  $('dumMelee').checked = d.pickup.melee;
  $('dumGun').checked = d.pickup.gun;
  $('dumGrenade').checked = d.pickup.grenade;
  for (const id of ['dumAttack', 'dumMelee', 'dumGun', 'dumGrenade']) $(id).disabled = d.level === 'dummy';
  $('dumNote').textContent = `${d.level === 'dummy' ? 'Standing still, they just take it; pick a level to have them move, fight back and pick things up. ' : ''}Changing the stage or how many restarts training.`;
}

function dummiesChanged() {
  const d = state.training;
  if (!d) return;
  const count = Number($('dumCount').value);
  const stage = $('dumStage').value;
  const health = { mode: $('dumHealth').value, value: Math.max(0, Math.min(300, Number($('dumHealthValue').value) || 0)), after: Math.max(0.5, Math.min(10, Number($('dumHealthAfter').value) || 2)) };
  const healthChanged = health.mode !== d.health.mode || health.value !== d.health.value || health.after !== d.health.after;
  d.health = health;
  Object.assign(d, { level: $('dumLevel').value, attack: $('dumAttack').checked, pickup: { melee: $('dumMelee').checked, gun: $('dumGun').checked, grenade: $('dumGrenade').checked } });
  renderDummies();
  if (count !== d.count || stage !== d.stage) {
    Object.assign(d, { count, stage });
    closeMenu();
    playTraining();
    return;
  }
  gameModule?.then((m) => {
    m.setDummies(d);
    if (healthChanged) m.setDummyHealth(d.health);
  });
}
for (const id of ['dumStage', 'dumCount', 'dumLevel', 'dumAttack', 'dumMelee', 'dumGun', 'dumGrenade', 'dumHealth', 'dumHealthValue', 'dumHealthAfter']) $(id).onchange = dummiesChanged;

// Volumes: saved and heard right away.
for (const [id, key] of [['volMaster', 'master'], ['volEffects', 'effects'], ['volAnnouncer', 'announcer']]) {
  $(id).oninput = () => {
    settings.volume[key] = Number($(id).value);
    saveSettings();
    gameModule?.then((m) => m.applySettings());
  };
}

// Character: Random, then the cast; the idle animation and the name.
const CHOICES = [null, ...CHARACTERS];
const charLabel = (c) => (c ? c.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : 'Random');
function renderCharacter() {
  const c = deviceSettings(editing.player).character;
  $('charSprite').style.backgroundImage = c ? `url(art/chars/${c}-idle.png)` : 'none';
  $('charSprite').textContent = c ? '' : '?';
  $('charName').textContent = charLabel(c);
}
function stepCharacter(by) {
  const mine = deviceSettings(editing.player);
  const i = Math.max(0, CHOICES.indexOf(mine.character));
  mine.character = CHOICES[(i + by + CHOICES.length) % CHOICES.length];
  saveSettings();
  renderCharacter();
  if (mine.character) gameModule?.then((m) => m.setCharacter(mine.character, editing.player));
}
$('charPrev').onclick = () => stepCharacter(-1);
$('charNext').onclick = () => stepCharacter(1);

// Key and controller bindings: click one, then press the new key or button (Esc cancels).
// The controller in a controller slot ('pad0'..'pad3'), or, for the first, the first one found.
function slotPad(slot) {
  const g = navigator.getGamepads?.()[Number(slot.slice(3))];
  return g?.connected ? g : slot === 'pad0' ? firstPad() : null;
}

function renderBindings() {
  // icon: { style, button } to show the button's picture beside its name.
  const row = (label, text, onclick, isWaiting, icon = null) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = label;
    const btn = document.createElement('button');
    btn.className = `btn ghost${isWaiting ? ' waiting' : ''}`;
    if (icon && !isWaiting) {
      const pic = document.createElement('span');
      pic.className = 'pad-icon';
      pic.style.backgroundImage = 'url(art/buttons.png)';
      // (The picture sheet, shown at 2×: the frame's column and the style's row.)
      const frame = iconFrame(icon.style, icon.button);
      pic.style.backgroundPosition = `-${(frame % (BUTTONS_PER_ROW * 3)) * 32}px -${Math.floor(frame / (BUTTONS_PER_ROW * 3)) * 32}px`;
      btn.append(pic);
    }
    btn.append(isWaiting ? 'Press…' : text);
    btn.onclick = onclick;
    li.append(name, btn);
    return li;
  };
  $('keyList').replaceChildren(
    ...KEY_ACTIONS.map(([action, label]) =>
      row(label, (settings.keys[action] ?? []).map(keyName).join(' / ') || '—', () => startWaiting('key', action), waiting?.kind === 'key' && waiting.action === action),
    ),
  );
  $('padList').replaceChildren(
    ...PAD_ACTIONS.map(([action, label]) => {
      // The controller in this slot (or the first one, for the keyboard + mouse player's layout).
      const gp = slotPad(editing.pad);
      const button = padBindings(editing.pad)[action];
      const icon = gp && gp.mapping === 'standard' && hasIcon(padStyle(gp), button) ? { style: padStyle(gp), button } : null;
      return row(label, padActionName(padBindings(editing.pad), action, gp), () => startWaiting('pad', action), waiting?.kind === 'pad' && waiting.action === action, icon);
    }),
  );
  $('padFor').textContent = `Button layout for ${deviceLabel(editing.pad)}.`;
  const pads = [...(navigator.getGamepads?.() ?? [])].filter((g) => g && g.connected);
  $('padStatus').textContent = pads.length ? `Connected: ${pads.map((g) => g.id.replace(/\s*\(.*\)\s*/g, ' ').trim()).join(', ')}. Left stick moves, right stick aims.` : 'No controller found. Plug one in and press a button on it.';
}

function startWaiting(kind, action) {
  stopWaiting();
  waiting = { kind, action };
  renderBindings();
  if (kind === 'pad') {
    ui.rebinding = true;
    // Watch the controllers for a button that wasn't already held when this started.
    const held = new Set(pressedButtons());
    const poll = () => {
      if (waiting?.kind !== 'pad') return;
      const now = pressedButtons();
      const fresh = now.find((b) => !held.has(b));
      for (const b of [...held]) if (!now.includes(b)) held.delete(b);
      if (fresh !== undefined) {
        // Swap with whichever action had that button, so no two share one.
        const layout = settings.devices[editing.pad].pad;
        const other = Object.keys(layout).find((a) => a !== action && layout[a] === fresh);
        if (other) layout[other] = layout[action];
        layout[action] = fresh;
        saveSettings();
        stopWaiting();
        renderBindings();
        return;
      }
      waiting.frame = requestAnimationFrame(poll);
    };
    waiting.frame = requestAnimationFrame(poll);
  }
}

function stopWaiting() {
  if (waiting?.frame) cancelAnimationFrame(waiting.frame);
  waiting = null;
  // The game hears the controller again once the picked button is let go.
  const release = () => (pressedButtons().length ? requestAnimationFrame(release) : (ui.rebinding = false));
  if (ui.rebinding) release();
}

function pressedButtons() {
  const out = [];
  for (const g of navigator.getGamepads?.() ?? []) if (g) g.buttons.forEach((b, i) => b.pressed && out.push(i));
  return out;
}

$('resetKeys').onclick = () => {
  settings.keys = structuredClone(DEFAULT_KEYS);
  saveSettings();
  renderBindings();
};
$('resetPad').onclick = () => {
  settings.devices[editing.pad].pad = { ...DEFAULT_PAD };
  saveSettings();
  renderBindings();
};
window.addEventListener('gamepadconnected', () => menuOpen && renderBindings());

// ---- Start-up ---------------------------------------------------------------

$('name').value = store.get('oxasmash-name') || '';
$('name').addEventListener('change', () => store.set('oxasmash-name', myName()));

// An invite link (?room=CODE) fills in the code.
const invited = cleanCode(new URLSearchParams(location.search).get('room') ?? '');
if (invited.length === CODE_LENGTH) {
  $('joinCode').value = invited;
  $('name').focus();
  toast(`You're invited to room ${invited}. Type your name and press Join.`);
}

window.addEventListener('load', () => setTimeout(loadGame, 300));

// Controllers drive the menus too: the page's screens, or the in-game menu while it's up (during
// play the controllers belong to the game). B goes back: closes the in-game menu, steps back in
// the Same screen setup.
startPadNav({
  root: () => (menuOpen ? $('gameMenu') : inMatchNow() ? null : !$('duelPick').hidden ? $('duelPick') : document.querySelector('.screen:not([hidden])')),
  back: (el) => {
    if (el.id === 'gameMenu') closeMenu();
    else if (el.id === 'localSetup') $('setupBack').click();
    else if (el.id === 'roomRules') $('roomRulesBack').click();
    else if (el.id === 'botLobby') $('botBack').click();
    else if (el.id === 'duelPick') $('duelPick').hidden = true;
  },
  busy: () => waiting?.kind === 'pad',
});
