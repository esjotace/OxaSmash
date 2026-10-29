"""Synthesize the game's sound effects into public/sounds/*.wav (mono, 22050 Hz, 16-bit).

Every sound is built here from noise, tones, envelopes and filters, so there's nothing to license
and any sound can be reshaped by editing its recipe below and rerunning:

  python tools/make_sounds.py            # all of them
  python tools/make_sounds.py shot-big   # just one
"""
import sys
import wave
from pathlib import Path

import numpy as np

RATE = 22050
OUT = Path(__file__).resolve().parent.parent / "public" / "sounds"
rng = np.random.default_rng(7)


def t(seconds):
    return np.arange(int(RATE * seconds)) / RATE


def noise(seconds):
    return rng.uniform(-1, 1, int(RATE * seconds))


def env(seconds, attack=0.002, decay=0.1):
    """Quick rise, then an exponential fall (decay = time to fall to ~37%)."""
    x = t(seconds)
    rise = np.clip(x / max(attack, 1e-4), 0, 1)
    return rise * np.exp(-np.maximum(x - attack, 0) / decay)


def svf(x, cutoff, q=0.7, mode="lp"):
    """State-variable filter; cutoff can be a number or a per-sample array (for sweeps)."""
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    low = band = 0.0
    out = np.empty_like(x)
    damp = 1 / q
    for i, s in enumerate(x):
        f = 2 * np.sin(np.pi * min(cutoff[i], RATE / 6) / RATE)
        high = s - low - damp * band
        band += f * high
        low += f * band
        out[i] = low if mode == "lp" else band if mode == "bp" else high
    return out


def sweep(f0, f1, seconds, curve=1.0):
    """A sine gliding from f0 to f1 Hz."""
    k = (t(seconds) / seconds) ** curve
    freq = f0 + (f1 - f0) * k
    return np.sin(2 * np.pi * np.cumsum(freq) / RATE)


def tone(freq, seconds, shape="sine"):
    ph = 2 * np.pi * freq * t(seconds)
    if shape == "square":
        return np.sign(np.sin(ph)) * 0.6
    if shape == "tri":
        return 2 / np.pi * np.arcsin(np.sin(ph))
    return np.sin(ph)


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def at(seconds, x):
    """Delay a sound by `seconds`."""
    return np.concatenate([np.zeros(int(RATE * seconds)), x])


def drive(x, amount):
    """Soft distortion: thicker, punchier."""
    return np.tanh(x * amount) / np.tanh(amount)


# --- Recipes ------------------------------------------------------------------------------------

def swing(seconds, f0, f1, q):
    n = noise(seconds)
    shape = np.sin(np.pi * np.clip(t(seconds) / seconds, 0, 1)) ** 1.5
    return svf(n, np.linspace(f0, f1, len(n)), q, "bp") * shape * 2.2


RECIPES = {
    # Swings: a whoosh, light ones short and bright, heavy ones longer and deeper.
    "swing-light": lambda: swing(0.16, 900, 3800, 1.6),
    "swing-heavy": lambda: swing(0.3, 250, 1400, 1.2) + svf(noise(0.3), 180, 0.8) * env(0.3, 0.08, 0.12) * 0.6,
    # Hits.
    "hit-blunt": lambda: drive(mix(sweep(150, 45, 0.16, 0.5) * env(0.16, 0.001, 0.06), svf(noise(0.08), 900) * env(0.08, 0.001, 0.02) * 1.2), 2.5),
    "hit-cut": lambda: mix(
        svf(noise(0.12), 4500, 1.2, "bp") * env(0.12, 0.001, 0.03) * 1.6,
        (tone(2300, 0.2) + 0.6 * tone(3700, 0.2)) * env(0.2, 0.001, 0.05) * 0.18,
        sweep(180, 70, 0.08) * env(0.08, 0.001, 0.03) * 0.6,
    ),
    "hit-stab": lambda: mix(
        svf(noise(0.08), 1400, 2.0, "bp") * env(0.08, 0.001, 0.018) * 1.8,
        sweep(260, 90, 0.07) * env(0.07, 0.001, 0.025) * 0.8,
    ),
    # Guns.
    "shot-small": lambda: drive(mix(
        noise(0.012) * 1.0,
        svf(noise(0.18), 2600) * env(0.18, 0.001, 0.035),
        sweep(220, 70, 0.06) * env(0.06, 0.001, 0.025) * 0.8,
    ), 2.0),
    "shot-big": lambda: drive(mix(
        noise(0.015),
        svf(noise(0.4), 1600) * env(0.4, 0.001, 0.09) * 1.3,
        sweep(120, 38, 0.25) * env(0.25, 0.001, 0.08) * 1.2,
    ), 3.0),
    "shot-sniper": lambda: drive(mix(
        svf(noise(0.02), 3000, 0.7, "hp") * 1.4,
        svf(noise(0.25), 2200) * env(0.25, 0.001, 0.05) * 1.1,
        sweep(160, 40, 0.3) * env(0.3, 0.001, 0.09),
        # The echo rolling off across the stage.
        at(0.11, svf(noise(0.9), 500) * env(0.9, 0.02, 0.25) * 0.5),
        at(0.27, svf(noise(0.6), 350) * env(0.6, 0.02, 0.2) * 0.25),
    ), 2.5),
    # The frying pan: a hollow cartoon BONK, the ring bending down.
    "hit-bonk": lambda: drive(mix(
        sum(sweep(560 * r, 430 * r, 0.45, 0.4) * env(0.45, 0.001, d) * a for r, d, a in [(1, 0.2, 0.7), (2.05, 0.1, 0.3), (3.7, 0.05, 0.18)]),
        sweep(160, 55, 0.12, 0.5) * env(0.12, 0.001, 0.04) * 0.8,
    ), 1.8),
    # The wet fish: a sharp slap, then a little splat.
    "hit-slap": lambda: mix(
        svf(noise(0.08), 2600, 0.6, "bp") * env(0.08, 0.001, 0.012) * 2.2,
        at(0.015, svf(noise(0.16), 1100, 0.8) * env(0.16, 0.01, 0.04) * 0.7),
    ),
    # The anvil: a big, heavy CLONK, ringing low.
    "hit-clonk": lambda: drive(mix(
        sum(tone(240 * r, 0.9) * env(0.9, 0.001, d) * a for r, d, a in [(1, 0.35, 0.8), (2.32, 0.2, 0.45), (4.1, 0.1, 0.3), (6.7, 0.05, 0.2)]),
        sweep(130, 38, 0.25, 0.5) * env(0.25, 0.001, 0.08) * 1.4,
        noise(0.01) * 0.9,
    ), 2.2),
    # A critical hit (the full bat, the keyboard's big phrase): a home-run crack. A sharp wooden
    # crack, a bright metallic PING ringing out, a deep thump, and echoes.
    "critical": lambda: (lambda x: mix(x, at(0.11, x * 0.35), at(0.23, x * 0.15)))(drive(mix(
        svf(noise(0.05), 3800, 0.9, "bp") * env(0.05, 0.0005, 0.01) * 2.5,
        sum(tone(1560 * r, 1.0) * env(1.0, 0.001, d) * a for r, d, a in [(1, 0.4, 0.7), (1.5, 0.25, 0.35), (2.4, 0.15, 0.3), (3.9, 0.07, 0.2)]),
        sweep(180, 45, 0.3, 0.5) * env(0.3, 0.001, 0.09) * 1.3,
    ), 1.6)),
    # The bow: a low pluck of the string.
    "bow": lambda: mix(sweep(220, 160, 0.3, 0.3) * env(0.3, 0.001, 0.08) * 0.8, svf(noise(0.05), 1800, 1, "bp") * env(0.05, 0.001, 0.01) * 0.8),
    # The railgun: a rising whine, then a sharp electric crack.
    "zap": lambda: drive(mix(sweep(900, 4200, 0.12, 0.6) * env(0.12, 0.01, 0.2) * 0.4, at(0.1, svf(noise(0.35), 3000, 1, "hp") * env(0.35, 0.001, 0.08) * 1.4), at(0.1, sweep(1800, 300, 0.3) * env(0.3, 0.001, 0.1) * 0.6)), 2),
    # Fire staff flames: a soft roaring puff.
    "flame": lambda: svf(noise(0.18), 900, 0.6) * env(0.18, 0.02, 0.06) * 1.2,
    # Money: ka-ching.
    "coin": lambda: np.concatenate([tone(1900, 0.05, "tri") * env(0.05, 0.002, 0.03), (tone(2500, 0.25, "tri") + tone(3800, 0.25) * 0.3) * env(0.25, 0.002, 0.1)]) * 0.5,
    # The frying pan's powered hit: the critical, pitched up.
    "hit-crit-high": lambda: (lambda x: np.interp(np.arange(0, len(x), 1.35), np.arange(len(x)), x))(RECIPES["critical"]()),
    # A shot ringing off the frying pan.
    "ting": lambda: mix(tone(2700, 0.4) * env(0.4, 0.001, 0.09) * 0.6, tone(5300, 0.2) * env(0.2, 0.001, 0.04) * 0.3, noise(0.004) * 0.5),
    # A bite (the ham, the carrot): three quick crunches.
    "chomp": lambda: mix(*[at(k * 0.07, svf(noise(0.06), 1500 - k * 300, 0.9, "bp") * env(0.06, 0.002, 0.015) * (1.6 - k * 0.3)) for k in range(3)]),
    # Bullets landing: a ricochet tick on walls, a dull thud on people.
    "impact-wall": lambda: mix(
        svf(noise(0.03), 5000, 1.5, "bp") * env(0.03, 0.001, 0.006) * 1.4,
        sweep(3400, 1900, 0.16, 0.6) * env(0.16, 0.002, 0.05) * 0.22,
    ),
    "impact-body": lambda: mix(
        svf(noise(0.07), 700) * env(0.07, 0.001, 0.018) * 1.6,
        sweep(110, 60, 0.08) * env(0.08, 0.001, 0.03) * 0.7,
    ),
    "explosion": lambda: drive(mix(
        noise(0.02) * 1.2,
        svf(noise(1.4), np.linspace(2500, 200, int(RATE * 1.4))) * env(1.4, 0.005, 0.35) * 1.6,
        sweep(70, 28, 0.8, 0.5) * env(0.8, 0.005, 0.3) * 1.3,
    ), 3.5),
    # Blocks and parries, the trident's chain: metal on metal.
    "clang": lambda: mix(
        sum(tone(820 * r, 0.45) * env(0.45, 0.001, d) * a for r, d, a in [(1, 0.18, 0.5), (2.76, 0.12, 0.35), (5.4, 0.07, 0.25), (8.93, 0.04, 0.2)]),
        noise(0.006) * 0.8,
    ),
    "hiss": lambda: svf(noise(0.7), 3500, 0.7, "hp") * env(0.7, 0.05, 0.25) * 0.8,
    "warp": lambda: (sweep(300, 1600, 0.35, 0.7) * (1 + 0.4 * tone(28, 0.35)) + 0.3 * sweep(900, 2600, 0.35)) * env(0.35, 0.01, 0.2) * 0.45,
    "throw": lambda: swing(0.22, 500, 2200, 1.4) * 0.9,
    "pickup": lambda: np.concatenate([tone(660, 0.06, "tri") * env(0.06, 0.003, 0.04), tone(990, 0.1, "tri") * env(0.1, 0.003, 0.06)]) * 0.5,
    "reload": lambda: mix(
        svf(noise(0.02), 4000, 1, "bp") * env(0.02, 0.001, 0.004) * 1.4,
        at(0.09, svf(noise(0.08), 2500, 0.8, "bp") * env(0.08, 0.005, 0.02) * 0.7),
        at(0.2, svf(noise(0.02), 3500, 1, "bp") * env(0.02, 0.001, 0.004) * 1.6),
    ),
    # Announcements and your own screen.
    "ui-beep": lambda: tone(880, 0.12) * env(0.12, 0.004, 0.06) * 0.5,
    "ui-go": lambda: (tone(880, 0.35) + tone(1320, 0.35) * 0.7 + tone(1760, 0.35) * 0.3) * env(0.35, 0.004, 0.15) * 0.35,
    "ui-storm": lambda: np.concatenate([tone(f, 0.22, "tri") * env(0.22, 0.01, 0.2) for f in (620, 470, 620, 470)]) * 0.45,
    "ko": lambda: drive(mix(
        svf(noise(0.9), np.linspace(3000, 150, int(RATE * 0.9))) * env(0.9, 0.003, 0.2) * 1.3,
        sweep(400, 40, 0.7, 0.6) * env(0.7, 0.003, 0.25),
    ), 2.5),
    "ui-game": lambda: np.concatenate([(tone(f, 0.16) + tone(f * 1.5, 0.16) * 0.5) * env(0.16, 0.004, 0.12) for f in (523, 659, 784)] + [(tone(1047, 0.5) + tone(1568, 0.5) * 0.5) * env(0.5, 0.004, 0.25)]) * 0.35,
}


def save(name, x):
    x = np.asarray(x, dtype=float)
    # Fade the last few ms out (no click), then normalise to just under full scale.
    fade = min(len(x), int(RATE * 0.01))
    x[-fade:] *= np.linspace(1, 0, fade)
    x = x / (np.max(np.abs(x)) or 1) * 0.89
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


if __name__ == "__main__":
    names = sys.argv[1:] or list(RECIPES)
    for name in names:
        save(name, RECIPES[name]())
        print(f"{name}.wav")
