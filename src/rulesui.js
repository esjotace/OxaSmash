// The rules picker on the rule screens (online rooms and Bot match share one; Same screen has its
// own): a preset (the duel modes, but Crowd's Choice) or Custom rules, which opens the custom
// section (what's in play, the crown, the storm). A preset only decides what's in play; lives,
// rounds, the storm and the crown stay as set (1 GUN. 2 FISTS. 3 LIVES also sets 3 lives).
// Whatever's picked is remembered on this device for next time.
import { DUEL_MODES } from './net/duels.js';
import { getStage } from './sim/stage.js';

export const PRESETS = Object.keys(DUEL_MODES).filter((k) => k !== 'crowd');
const SWITCHES = ['melee', 'ranged', 'thrown', 'items'];
const PRESET_LIVES = { onegun: 3 };

// What's in play under a preset (everything on, but what it turns off) and its extras.
export function presetRules(preset) {
  const r = DUEL_MODES[preset]?.rules ?? {};
  return { melee: true, ranged: true, thrown: true, items: true, ...r };
}

// prefix: the ids' start ('room' or 'rule'): <prefix>Presets, <prefix>Custom (the <details>),
// <prefix>Melee... <prefix>Lives, <prefix>Rounds, <prefix>Stage, <prefix>Crown, <prefix>Storm.
// storeKey: where it's remembered. onChange(): after any change.
export function rulesPicker(prefix, storeKey, onChange = () => {}) {
  const $ = (name) => document.getElementById(`${prefix}${name}`);
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  let preset = 'normal';

  const chips = $('Presets');
  const chip = (key, text, title) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.preset = key;
    b.textContent = text;
    b.title = title;
    b.onclick = () => pick(key, true);
    return b;
  };
  chips.replaceChildren(...PRESETS.map((k) => chip(k, DUEL_MODES[k].name, DUEL_MODES[k].text)), chip('custom', 'Custom rules ▾', 'Choose what’s in play yourself'));

  // A preset: its switches shown (Custom starts from them); Custom: the custom section opens.
  function pick(key, byHand = false) {
    preset = PRESETS.includes(key) || key === 'custom' ? key : 'normal';
    for (const b of chips.children) b.classList.toggle('on', b.dataset.preset === preset);
    if (preset !== 'custom') {
      const r = presetRules(preset);
      for (const s of SWITCHES) $(cap(s)).checked = r[s];
      if (byHand && PRESET_LIVES[preset]) $('Lives').value = String(PRESET_LIVES[preset]);
    } else if (byHand) $('Custom').open = true;
    if (byHand) changed();
  }

  // A stage without a storm (La Bajaita, La Azotea): the storm starts switched off (it can be put
  // back on).
  $('Stage').addEventListener('change', () => {
    if (getStage($('Stage').value)?.noStorm) $('Storm').value = 'off';
  });

  // Changing what's in play by hand: Custom rules.
  for (const s of SWITCHES) $(cap(s)).addEventListener('change', () => pick('custom'));
  for (const name of ['Lives', 'Rounds', 'Stage', 'Crown', 'Storm', ...SWITCHES.map(cap)]) $(name)?.addEventListener('change', changed);

  function changed() {
    try {
      const saved = { preset, lives: $('Lives').value, rounds: $('Rounds').value, stage: $('Stage').value, crown: $('Crown').value, storm: $('Storm').value };
      for (const s of SWITCHES) saved[s] = $(cap(s)).checked;
      localStorage.setItem(storeKey, JSON.stringify(saved));
    } catch {
      // (Storage blocked: just not remembered.)
    }
    onChange();
  }

  // Last time's choices, if any (only values the selects actually have).
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) ?? 'null');
    if (saved) {
      const set = (name, value) => {
        const el = $(name);
        if (el && value !== undefined && [...el.options].some((o) => o.value === String(value))) el.value = String(value);
      };
      set('Lives', saved.lives);
      set('Rounds', saved.rounds);
      set('Stage', saved.stage);
      set('Crown', saved.crown);
      set('Storm', saved.storm);
      for (const s of SWITCHES) if (typeof saved[s] === 'boolean') $(cap(s)).checked = saved[s];
      pick(saved.preset);
    } else pick('normal');
  } catch {
    pick('normal');
  }

  return {
    // Pick a preset, as if clicked.
    set(key) {
      pick(key, true);
    },
    // The rules as picked: what's in play (the preset's, or the custom switches), and the preset.
    read() {
      const rules = preset === 'custom' ? Object.fromEntries(SWITCHES.map((s) => [s, $(cap(s)).checked])) : presetRules(preset);
      return { preset, rules };
    },
  };
}
