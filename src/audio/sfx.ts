// Tiny Web Audio synth. Every sound effect is generated on the fly
// from one or more oscillators - no asset files. AudioContext is
// lazily created so the browser's "no audio before user gesture"
// rule doesn't throw on import; the first sfx call after a click
// brings it up.

import { writable } from 'svelte/store';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

// Persisted master volume / mute, surfaced via the TopBar toggle.
const STORAGE_KEY = 'enchanter.audio';
type AudioPrefs = { muted: boolean; volume: number };
function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
      return {
        muted: Boolean(parsed.muted),
        volume: typeof parsed.volume === 'number' ? parsed.volume : 0.4,
      };
    }
  } catch {
    // ignore - first run / disabled storage
  }
  return { muted: false, volume: 0.4 };
}
function savePrefs(p: AudioPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

export const audioPrefs = writable<AudioPrefs>(loadPrefs());

audioPrefs.subscribe((p) => {
  savePrefs(p);
  if (master) master.gain.value = p.muted ? 0 : p.volume;
});

export function toggleMute(): void {
  audioPrefs.update((p) => ({ ...p, muted: !p.muted }));
}

export function setVolume(v: number): void {
  audioPrefs.update((p) => ({ ...p, volume: Math.max(0, Math.min(1, v)) }));
}

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor =
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
      AudioContext;
    const c = new Ctor();
    master = c.createGain();
    let prefs: AudioPrefs = { muted: false, volume: 0.4 };
    audioPrefs.subscribe((p) => {
      prefs = p;
    })();
    master.gain.value = prefs.muted ? 0 : prefs.volume;
    master.connect(c.destination);
    ctx = c;
    return ctx;
  } catch {
    // No audio support - silently no-op.
    return null;
  }
}

// One-shot oscillator with linear attack and exponential release.
// `sweepTo` glides the frequency to that value over the duration
// (good for swooshes, zaps, falls).
interface ToneOpts {
  freq: number;
  dur: number;
  type?: OscillatorType;
  sweepTo?: number;
  gain?: number;
  attack?: number;
  delay?: number;
}

function tone(opts: ToneOpts): void {
  const c = ensureCtx();
  if (!c || !master) return;
  // Resume context if it was suspended (Chrome wakes it on user
  // gesture but AudioContext can be created in suspended state).
  if (c.state === 'suspended') {
    void c.resume();
  }
  const start = c.currentTime + (opts.delay ?? 0);
  const dur = Math.max(0.02, opts.dur);
  const peak = Math.max(0.0001, opts.gain ?? 0.3);
  const attack = Math.min(opts.attack ?? 0.005, dur * 0.5);

  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, start);
  if (opts.sweepTo) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, opts.sweepTo),
      start + dur,
    );
  }
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(peak, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(master);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

// Each sfx recipe is a (sometimes-stacked) tone call. Tuned by ear
// for short, punchy sounds that don't pile up muddy when combat is
// busy. Add new effects by appending to the object.
export const sfx = {
  swing(): void {
    tone({ freq: 720, sweepTo: 280, dur: 0.07, type: 'sine', gain: 0.18 });
  },
  hit(): void {
    tone({ freq: 200, sweepTo: 70, dur: 0.13, type: 'square', gain: 0.35 });
  },
  crit(): void {
    tone({ freq: 820, sweepTo: 240, dur: 0.22, type: 'sawtooth', gain: 0.4 });
    tone({ freq: 420, sweepTo: 110, dur: 0.22, type: 'square', gain: 0.25, delay: 0.01 });
  },
  kill(): void {
    // Killing blow: heavy low thump + bright shatter chime overlay so
    // it reads as "that one finished them" instead of the usual hit
    // sound playing under the enemy death wail.
    tone({ freq: 140, sweepTo: 40, dur: 0.22, type: 'square', gain: 0.45 });
    tone({ freq: 990, sweepTo: 1480, dur: 0.18, type: 'triangle', gain: 0.32, delay: 0.04 });
    tone({ freq: 1480, sweepTo: 660, dur: 0.14, type: 'sine', gain: 0.22, delay: 0.08 });
  },
  dodge(): void {
    tone({ freq: 900, sweepTo: 1400, dur: 0.08, type: 'sine', gain: 0.22 });
  },
  death(): void {
    tone({ freq: 220, sweepTo: 40, dur: 0.55, type: 'sawtooth', gain: 0.35 });
  },
  playerDeath(): void {
    tone({ freq: 180, sweepTo: 35, dur: 0.9, type: 'sawtooth', gain: 0.45 });
    tone({ freq: 90, sweepTo: 20, dur: 0.9, type: 'sine', gain: 0.3, delay: 0.05 });
  },
  coin(): void {
    tone({ freq: 1320, dur: 0.07, type: 'triangle', gain: 0.3 });
    tone({ freq: 1760, dur: 0.09, type: 'triangle', gain: 0.25, delay: 0.07 });
  },
  heal(): void {
    tone({ freq: 660, sweepTo: 990, dur: 0.14, type: 'sine', gain: 0.25 });
  },
  click(): void {
    // Soft tick: sine instead of square, lower gain, slower attack
    // so the transient isn't sharp.
    tone({ freq: 620, dur: 0.05, type: 'sine', gain: 0.08, attack: 0.012 });
  },
  buy(): void {
    tone({ freq: 880, dur: 0.08, type: 'triangle', gain: 0.25 });
    tone({ freq: 1320, dur: 0.1, type: 'triangle', gain: 0.25, delay: 0.06 });
  },
  victory(): void {
    tone({ freq: 660, dur: 0.18, type: 'triangle', gain: 0.3 });
    tone({ freq: 880, dur: 0.18, type: 'triangle', gain: 0.3, delay: 0.16 });
    tone({ freq: 1320, dur: 0.32, type: 'triangle', gain: 0.32, delay: 0.32 });
  },
  defeat(): void {
    tone({ freq: 440, dur: 0.22, type: 'sawtooth', gain: 0.3 });
    tone({ freq: 330, dur: 0.32, type: 'sawtooth', gain: 0.3, delay: 0.2 });
    tone({ freq: 220, dur: 0.5, type: 'sawtooth', gain: 0.3, delay: 0.5 });
  },
  burn(): void {
    tone({ freq: 380, sweepTo: 280, dur: 0.18, type: 'sawtooth', gain: 0.18 });
  },
  freeze(): void {
    tone({ freq: 1200, sweepTo: 600, dur: 0.14, type: 'triangle', gain: 0.22 });
  },
  shock(): void {
    tone({ freq: 1400, sweepTo: 240, dur: 0.09, type: 'square', gain: 0.28 });
  },
  poison(): void {
    tone({ freq: 360, sweepTo: 240, dur: 0.18, type: 'triangle', gain: 0.18 });
  },
  bleed(): void {
    tone({ freq: 280, sweepTo: 180, dur: 0.18, type: 'sawtooth', gain: 0.2 });
  },
};

// Status -> sfx routing so callers can play whichever the proc was.
import type { StatusType } from '../domain/enchant';
export function playStatusSfx(status: StatusType): void {
  switch (status) {
    case 'burn':
      sfx.burn();
      break;
    case 'freeze':
      sfx.freeze();
      break;
    case 'shock':
      sfx.shock();
      break;
    case 'poison':
      sfx.poison();
      break;
    case 'bleed':
      sfx.bleed();
      break;
  }
}
