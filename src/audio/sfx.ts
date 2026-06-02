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
    // Triangle instead of square, lower gain, slightly slower attack
    // - same low-thump shape but no longer dominates the mix.
    tone({ freq: 200, sweepTo: 70, dur: 0.13, type: 'triangle', gain: 0.18, attack: 0.01 });
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
    // Triangle fall with a slower attack so the wail is mellower.
    tone({ freq: 220, sweepTo: 40, dur: 0.55, type: 'triangle', gain: 0.18, attack: 0.03 });
  },
  playerDeath(): void {
    tone({ freq: 180, sweepTo: 35, dur: 0.9, type: 'triangle', gain: 0.22, attack: 0.04 });
    tone({ freq: 90, sweepTo: 20, dur: 0.9, type: 'sine', gain: 0.16, attack: 0.04, delay: 0.05 });
  },
  coin(): void {
    tone({ freq: 1320, dur: 0.07, type: 'triangle', gain: 0.3 });
    tone({ freq: 1760, dur: 0.09, type: 'triangle', gain: 0.25, delay: 0.07 });
  },
  crystal(): void {
    // Crystal chime: glassier + airier than the coin (pure sines, brighter
    // notes) so earned crystals read distinct from gold.
    tone({ freq: 1568, dur: 0.08, type: 'sine', gain: 0.24 });
    tone({ freq: 2349, dur: 0.13, type: 'sine', gain: 0.17, delay: 0.06 });
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
  // --- UI feel: soft, low-gain so they sit under everything else ---
  uiOpen(): void {
    // A pane slides in: short rising sine.
    tone({ freq: 480, sweepTo: 780, dur: 0.09, type: 'sine', gain: 0.07, attack: 0.008 });
  },
  uiClose(): void {
    // A pane leaves: falling counterpart.
    tone({ freq: 540, sweepTo: 320, dur: 0.08, type: 'sine', gain: 0.06, attack: 0.008 });
  },
  pickUp(): void {
    // Grab a pane to reorder: a small lift.
    tone({ freq: 440, sweepTo: 640, dur: 0.06, type: 'triangle', gain: 0.1 });
  },
  drop(): void {
    // Release the reordered pane: a settle.
    tone({ freq: 560, sweepTo: 320, dur: 0.07, type: 'triangle', gain: 0.12 });
  },
  swap(): void {
    // Panes cross during a reorder: a faint tick (fires per swap, kept tiny).
    tone({ freq: 680, dur: 0.03, type: 'sine', gain: 0.05, attack: 0.004 });
  },
  equip(): void {
    // Gear locks into a slot: a low thunk + a bright confirm chime.
    tone({ freq: 300, sweepTo: 200, dur: 0.09, type: 'triangle', gain: 0.22, attack: 0.005 });
    tone({ freq: 860, sweepTo: 1180, dur: 0.12, type: 'sine', gain: 0.18, delay: 0.05 });
  },
  swapItem(): void {
    // Two items trade places in a slot: thunk, a quick return tone, then a chime.
    tone({ freq: 300, sweepTo: 200, dur: 0.08, type: 'triangle', gain: 0.2 });
    tone({ freq: 560, sweepTo: 820, dur: 0.1, type: 'triangle', gain: 0.18, delay: 0.06 });
    tone({ freq: 1100, dur: 0.08, type: 'sine', gain: 0.14, delay: 0.13 });
  },
  victory(): void {
    tone({ freq: 660, dur: 0.18, type: 'triangle', gain: 0.3 });
    tone({ freq: 880, dur: 0.18, type: 'triangle', gain: 0.3, delay: 0.16 });
    tone({ freq: 1320, dur: 0.32, type: 'triangle', gain: 0.32, delay: 0.32 });
  },
  defeat(): void {
    // Soften the lose fanfare: triangle instead of sawtooth, lower
    // gain, slower attack on each note.
    tone({ freq: 440, dur: 0.22, type: 'triangle', gain: 0.14, attack: 0.02 });
    tone({ freq: 330, dur: 0.32, type: 'triangle', gain: 0.14, attack: 0.02, delay: 0.2 });
    tone({ freq: 220, dur: 0.5, type: 'triangle', gain: 0.14, attack: 0.02, delay: 0.5 });
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
  // Gem-proc effect sounds. Short + distinct so they read over the auto-attack
  // without piling up muddy when several procs fire. Gains kept deliberately
  // low (softer than the core attack / kill sounds) so a busy proc build
  // doesn't drown out the combat it sits over.
  zap(): void {
    // strike-line: Chain Lightning / Vault Strike
    tone({ freq: 1500, sweepTo: 320, dur: 0.1, type: 'square', gain: 0.12 });
    tone({ freq: 2200, sweepTo: 900, dur: 0.06, type: 'sawtooth', gain: 0.07, delay: 0.01 });
  },
  nova(): void {
    // expanding-ring: Frost Nova / Soul Reap / Retaliate / Searing Aura
    tone({ freq: 160, sweepTo: 60, dur: 0.2, type: 'square', gain: 0.12 });
    tone({ freq: 520, sweepTo: 180, dur: 0.14, type: 'triangle', gain: 0.07, delay: 0.01 });
  },
  meteorHit(): void {
    // falling-body: Meteor - a falling whistle then an impact thud.
    tone({ freq: 880, sweepTo: 120, dur: 0.26, type: 'sine', gain: 0.1 });
    tone({ freq: 90, sweepTo: 40, dur: 0.18, type: 'square', gain: 0.2, delay: 0.2 });
  },
  orb(): void {
    // drifting-orb: Spirit Bolt - a soft eerie rise.
    tone({ freq: 520, sweepTo: 940, dur: 0.16, type: 'sine', gain: 0.1 });
  },
  whirl(): void {
    // orbiting-sprite: Whirlblade - a quick metallic swish.
    tone({ freq: 300, sweepTo: 820, dur: 0.1, type: 'sawtooth', gain: 0.08 });
  },
  shimmer(): void {
    // shield: Bulwark - a glassy up-chime.
    tone({ freq: 760, sweepTo: 1280, dur: 0.16, type: 'triangle', gain: 0.11 });
  },
  powerup(): void {
    // buff: Time Warp - a quick rising two-note.
    tone({ freq: 620, dur: 0.08, type: 'triangle', gain: 0.11 });
    tone({ freq: 990, dur: 0.1, type: 'triangle', gain: 0.11, delay: 0.07 });
  },
};

// Proc visual -> sfx routing, so the proc engine plays the right sound when a
// gem proc fires. The `glow` procs (heal / shield / buff / gold) play their own
// sound inline, so they are not routed here.
export function playProcSfx(visual: string): void {
  switch (visual) {
    case 'strike-line':
      sfx.zap();
      break;
    case 'expanding-ring':
      sfx.nova();
      break;
    case 'falling-body':
      sfx.meteorHit();
      break;
    case 'drifting-orb':
      sfx.orb();
      break;
    case 'orbiting-sprite':
      sfx.whirl();
      break;
  }
}

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
