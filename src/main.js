// Menus, lobby and results (plain DOM), and starting matches in the right mode.
import { HostRoom, ClientRoom, cleanCode, cleanName, describeNetError, CODE_LENGTH } from './net/room.js';
import { PLAYER_COLORS } from './game/palette.js';
import { RULES, GUNS, MELEE, GRENADES, ITEMS } from './sim/constants.js';
import { describe } from './sim/describe.js';
import { hasIcon, iconFrame, BUTTONS_PER_ROW, ICON_STYLES } from './game/padicons.js';
import { STAGES, DEFAULT_STAGE, MIXED, isStageId, rollStage } from './sim/stage.js';
import { CHARACTERS, pickCast } from './game/cast.js';
import { startPadNav } from './padnav.js';
import { settings, ui, firstPad, padStyle, padButtonName, saveSettings, deviceSettings, padBindings, deviceLabel, KEY_ACTIONS, PAD_ACTIONS, DEFAULT_KEYS, DEFAULT_PAD, keyName } from './game/settings.js';

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

// Phaser is most of the download, so the menu shows first and the game loads right after.
let gameModule = null;
const loadGame = () => (gameModule ??= import('./game/game.js'));
const startMatch = (cfg) => loadGame().then((m) => m.startMatch(cfg));
const stopMatch = () => gameModule?.then((m) => m.stopMatch());

// role: null for local play, 'host' or 'client' online.
// series: Same screen rounds ({ rounds, wins, round, over }), or null. crownName: who won the
// previous round (they wear the crown next match), or null. onScreen: the players on
// this screen in the current match ({ name, kind }).
// training: the dummies' setup ({ count, level, attack, pickup }).
const state = { role: null, room: null, lobby: null, lastLocal: null, series: null, onScreen: [], crownName: null, training: null };

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
const livesFrom = (id) => Number($(id).value) || RULES.stocks;

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

// extra: { rules, stormPace } for Same screen matches.
function playLocal(roster, stocks, stage = stageFrom('stage'), training = false, extra = {}) {
  state.role = null;
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
  state.training = { stage: $('trainStage').value, count: 1, level: $('trainBot').value, attack: true, pickup: { melee: false, gun: false, grenade: false }, health: { mode: 'normal', value: 0 }, infinite: true, hitboxes: false };
  playTraining();
};

// Training: you and the dummies, set up in the menu's Dummies tab (state.training).
function playTraining() {
  const d = state.training;
  const roster = [{ name: myName(), kind: 'kbm' }];
  for (let i = 1; i <= d.count; i++) roster.push({ name: d.count > 1 ? `Dummy ${i}` : 'Dummy', kind: 'bot', level: d.level });
  // (A random stage is rolled again each time.)
  playLocal(roster, RULES.stocks, d.stage === 'mixed' ? MIXED : 'training', true, { dummies: d });
}

$('playBots').onclick = () => {
  state.series = null;
  state.crownName = null;
  const level = $('botLevel').value;
  const roster = [{ name: myName(), kind: 'kbm', pref: deviceSettings('kbm').character }];
  for (let i = 1; i <= Number($('botCount').value); i++) roster.push({ name: `Bot ${i}`, kind: 'bot', level });
  playLocal(roster, livesFrom('stocks'));
};

// ---- Same screen -------------------------------------------------------------
// A three-step setup: how many players, who plays with what (keyboard + mouse, or a controller
// each), then the rules. A match can be one of several rounds (best of 3 or 5).

const connectedPads = () => [...(navigator.getGamepads?.() ?? [])].filter((g) => g && g.connected).map((g) => g.index).filter((n) => n < 4);
const DEVICES = ['kbm', 'pad0', 'pad1', 'pad2', 'pad3'];
const setup = { step: 1, players: 2, devices: ['kbm', 'pad0', 'pad1', 'pad2'] };
for (const option of $('stage').options) $('ruleStage').append(new Option(option.text, option.value, false, option.selected));
for (const option of $('stage').options) $('roomStage').append(new Option(option.text, option.value, false, option.selected));

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
  const extra = { rules: { melee: $('ruleMelee').checked, ranged: $('ruleRanged').checked, thrown: $('ruleThrown').checked, items: $('ruleItems').checked }, stormPace: $('ruleStorm').value, crownRule: $('ruleCrown').value };
  const stage = Object.hasOwn(STAGES, $('ruleStage').value) || $('ruleStage').value === MIXED ? $('ruleStage').value : DEFAULT_STAGE;
  playLocal(roster, Number($('ruleLives').value), stage, false, extra);
};

// ---- Online: host -----------------------------------------------------------

// Create room: the rules come first (the same screen changes them later, from the lobby).
let rulesFor = 'create'; // what the rules screen is for: 'create' (a new room) or 'edit' (the lobby's)
$('createRoom').onclick = () => {
  rulesFor = 'create';
  $('roomRulesGo').textContent = 'Create room';
  show('roomRules');
};
$('addBot').onclick = () => state.room.addBot($('lobbyBotLevel').value);
$('lobbyRulesBtn').onclick = () => {
  rulesFor = 'edit';
  $('roomRulesGo').textContent = 'Done';
  show('roomRules');
};
$('roomRulesBack').onclick = () => {
  if (rulesFor === 'edit') {
    renderLobby();
    show('lobby');
  } else show('menu');
};
$('roomRulesGo').onclick = () => {
  state.series = null;
  if (rulesFor === 'edit') {
    renderLobby();
    show('lobby');
  } else createRoom();
};

// The online room's rules, as set on the rules screen.
function roomRules() {
  const stage = Object.hasOwn(STAGES, $('roomStage').value) || $('roomStage').value === MIXED ? $('roomStage').value : DEFAULT_STAGE;
  const rules = { melee: $('roomMelee').checked, ranged: $('roomRanged').checked, thrown: $('roomThrown').checked, items: $('roomItems').checked };
  return { stocks: Number($('roomLives').value) || RULES.stocks, rounds: Number($('roomRounds').value) || 1, stage, rules, stormPace: $('roomStorm').value, crownRule: $('roomCrown').value };
}

// The rules in a line, for the lobby.
function rulesSummary() {
  const r = roomRules();
  const off = [['melee', 'no melee'], ['ranged', 'no guns'], ['thrown', 'no grenades'], ['items', 'no items']].filter(([k]) => !r.rules[k]).map(([, t]) => t);
  const parts = [`${r.stocks} ${r.stocks === 1 ? 'life' : 'lives'}`, r.rounds > 1 ? `best of ${r.rounds}` : '', $('roomStage').selectedOptions[0]?.text ?? '', ...(off.length ? off : ['everything on']), `storm ${$('roomStorm').selectedOptions[0]?.text.toLowerCase()}`].filter(Boolean);
  if (r.crownRule !== 'show') parts.push(`crown: ${r.crownRule}`);
  return parts.join(' · ');
}

const createRoom = () =>
  busy($('roomRulesGo'), 'Creating…', async () => {
    try {
      const room = await HostRoom.create(myName());
      state.crownName = null;
      state.role = 'host';
      state.room = room;
      room.on('change', renderLobby).on('error', (err) => toast(describeNetError(err)));
      renderLobby();
      show('lobby');
    } catch (err) {
      toast(describeNetError(err));
    }
  });


function hostStart() {
  const room = state.room;
  if (room.players.length < 2) {
    renderLobby();
    show('lobby');
    return;
  }
  const roster = cast(room.players.map((p) => ({ name: p.name, kind: p.kind === 'host' ? 'kbm' : p.kind, level: p.level, pref: p.kind === 'host' ? deviceSettings('kbm').character : p.char })));
  const r = roomRules();
  const stocks = r.stocks;
  const stage = rollStage(r.stage);
  // Rounds: a series starts with the first match (the Rematch button moves it on, see 'again').
  if (r.rounds > 1 && !state.series) state.series = { rounds: r.rounds, wins: room.players.map(() => 0), round: 1 };
  if (r.rounds <= 1) state.series = null;
  room.startMatch({ names: roster.map((p) => p.name), chars: roster.map((p) => p.char), crown: roster.findIndex((p) => p.name === state.crownName), stocks, stage, series: state.series && { rounds: state.series.rounds, round: state.series.round, wins: state.series.wins } });
  state.onScreen = [roster[0]];
  show(null);
  startMatch({ mode: 'host', room, roster: crowned(roster), you: 0, stocks, stage, rules: r.rules, stormPace: r.stormPace, crownRule: r.crownRule, onEnd: (view) => showResults(view, roster) });
}

$('startMatch').onclick = hostStart;

// ---- Online: guest ----------------------------------------------------------

function join() {
  const code = cleanCode($('joinCode').value);
  if (code.length !== CODE_LENGTH) {
    toast(`Room codes have ${CODE_LENGTH} characters.`);
    return;
  }
  busy($('joinRoom'), 'Joining…', async () => {
    try {
      const room = await ClientRoom.join(code, myName(), deviceSettings('kbm').character);
      state.role = 'client';
      state.room = room;
      state.lobby = null;
      room
        .on('lobby', (msg) => {
          state.lobby = msg;
          stopMatch();
          renderLobby();
          show('lobby');
        })
        .on('start', startAsGuest)
        .on('closed', (reason) => {
          backToMenu();
          toast(reason);
        });
      renderLobby();
      show('lobby');
    } catch (err) {
      toast(describeNetError(err));
    }
  });
}

$('joinRoom').onclick = join;
$('joinCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') join();
});

// Everything from the host is checked before use; names are only ever shown as text.
function startAsGuest(msg) {
  const names = Array.isArray(msg.names) ? msg.names.slice(0, RULES.maxPlayers).map(cleanName) : [];
  const you = Number.isInteger(msg.you) && msg.you >= 0 && msg.you < names.length ? msg.you : -1;
  if (names.length < 2 || you < 0) return;
  const stocks = Number.isInteger(msg.stocks) ? Math.max(1, Math.min(5, msg.stocks)) : RULES.stocks;
  const stage = isStageId(msg.stage) ? msg.stage : DEFAULT_STAGE;
  const chars = Array.isArray(msg.chars) ? msg.chars : [];
  const roster = names.map((name, i) => ({ name, kind: i === you ? 'kbm' : 'remote', char: CHARACTERS.includes(chars[i]) ? chars[i] : undefined, crowned: msg.crown === i }));
  state.onScreen = [roster[you]];
  // Rounds: the host's series so far (the score is counted the same way here from each result).
  const s = msg.series;
  state.series = s && Number.isInteger(s.rounds) && Number.isInteger(s.round) && Array.isArray(s.wins) ? { rounds: s.rounds, round: s.round, wins: names.map((_, i) => Number(s.wins[i]) || 0) } : null;
  show(null);
  startMatch({ mode: 'client', room: state.room, roster, you, stocks, stage, onEnd: (view) => showResults(view, roster) });
}

// ---- Lobby ------------------------------------------------------------------

function renderLobby() {
  const host = state.role === 'host';
  const room = state.room;
  if (!room) return;
  const players = (host ? room.lobbyPlayers() : state.lobby?.players ?? []).slice(0, RULES.maxPlayers);
  const you = host ? 0 : state.lobby?.you;
  $('roomCode').textContent = room.code;
  const list = $('players');
  list.replaceChildren();
  players.forEach((p, i) => {
    const tags = [];
    if (i === you) tags.push('You');
    if (p.kind === 'host') tags.push('Host');
    if (p.kind === 'bot') tags.push(`Bot · ${String(p.level ?? 'normal')}`);
    const li = playerRow(cleanName(p.name), i, tags.join(' · '));
    if (host && p.kind !== 'host') {
      const remove = document.createElement('button');
      remove.className = 'btn small ghost';
      remove.textContent = 'Remove';
      remove.onclick = () => room.remove(i);
      li.append(remove);
    }
    list.append(li);
  });
  $('hostTools').hidden = !host;
  $('addBot').disabled = players.length >= RULES.maxPlayers;
  $('lobbyRules').hidden = !host;
  $('lobbyRules').textContent = host ? `Rules: ${rulesSummary()}` : '';
  $('startMatch').hidden = !host;
  $('startMatch').disabled = players.length < 2;
  $('lobbyStatus').textContent = !host
    ? players.length
      ? 'Waiting for the host to start…'
      : 'Connecting…'
    : players.length < 2
      ? 'Waiting for friends. Add a bot to try it on your own.'
      : `${players.length} of ${RULES.maxPlayers} players.`;
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
  stopMatch();
  state.room?.close();
  state.room = null;
  state.role = null;
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
  list.replaceChildren(...order.map(({ f, i }) => playerRow(roster[i]?.name ?? '?', i, `${f.kos} KO · ${f.stocks} ${f.stocks === 1 ? 'life' : 'lives'} left`)));
  const role = state.role;
  $('again').hidden = role === 'client';
  $('again').textContent = series ? (series.over ? 'New series' : 'Next round') : role === 'host' ? 'Rematch' : 'Play again';
  $('toMenu').textContent = role === 'host' ? 'Back to lobby' : role === 'client' ? 'Leave room' : 'Menu';
  $('resultsStatus').textContent = role === 'client' ? 'Waiting for the host…' : '';
  show('results');
}

$('again').onclick = () => {
  const series = state.series;
  if (series) {
    if (series.over) Object.assign(series, { wins: series.wins.map(() => 0), round: 1, over: false });
    else series.round++;
  }
  if (state.role === 'host') {
    state.room.endMatch();
    hostStart();
  } else if (state.lastLocal) {
    playLocal(state.lastLocal.roster, state.lastLocal.stocks, state.lastLocal.stage, state.lastLocal.training, state.lastLocal.extra);
  }
};

function quit() {
  if (state.role) state.series = null; // (back to the lobby: a new series next time)
  if (state.role === 'host') {
    stopMatch();
    state.room.endMatch();
    renderLobby();
    show('lobby');
  } else if (state.role === 'client') {
    backToMenu();
  } else {
    stopMatch();
    show('menu');
  }
}

$('toMenu').onclick = quit;

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
  $('leaveMatch').textContent = state.role === 'host' ? 'Back to lobby' : state.role === 'client' ? 'Leave room' : 'Quit to menu';
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
  const health = { mode: $('dumHealth').value, value: Math.max(0, Math.min(300, Number($('dumHealthValue').value) || 0)) };
  const healthChanged = health.mode !== d.health.mode || health.value !== d.health.value;
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
for (const id of ['dumStage', 'dumCount', 'dumLevel', 'dumAttack', 'dumMelee', 'dumGun', 'dumGrenade', 'dumHealth', 'dumHealthValue']) $(id).onchange = dummiesChanged;

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
      return row(label, padButtonName(button, gp), () => startWaiting('pad', action), waiting?.kind === 'pad' && waiting.action === action, icon);
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
  root: () => (menuOpen ? $('gameMenu') : inMatchNow() ? null : document.querySelector('.screen:not([hidden])')),
  back: (el) => {
    if (el.id === 'gameMenu') closeMenu();
    else if (el.id === 'localSetup') $('setupBack').click();
    else if (el.id === 'roomRules') $('roomRulesBack').click();
  },
  busy: () => waiting?.kind === 'pad',
});
