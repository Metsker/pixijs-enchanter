import { writable } from 'svelte/store';

// Player-chosen difficulty. Per docs/adr/0009, this is a SETTING - it
// persists across runs and lives in its OWN localStorage key, separate
// from the run save (so startNewRun must not touch it). The active run
// captures (locks) this value at run start; changing it mid-run only
// affects the next run.
export type Difficulty = 'relaxed' | 'easy' | 'normal' | 'hard';

export interface DifficultyMultipliers {
  hp: number;
  damage: number;
  resist: number;
  interval: number; // >1 = slower attacks, <1 = faster
}

// Placeholder multipliers from ADR 0009. Resist is a multiplier applied
// to the enemy's catalogue resist (clamped at a sane cap when baked).
const MULTIPLIERS: Record<Difficulty, DifficultyMultipliers> = {
  relaxed: { hp: 0.5, damage: 0.5, resist: 0.25, interval: 1.3 },
  easy: { hp: 0.75, damage: 0.75, resist: 0.5, interval: 1.15 },
  normal: { hp: 1, damage: 1, resist: 1, interval: 1 },
  hard: { hp: 1.4, damage: 1.4, resist: 1.5, interval: 0.85 },
};

export function multipliersFor(difficulty: Difficulty): DifficultyMultipliers {
  return MULTIPLIERS[difficulty];
}

interface Settings {
  difficulty: Difficulty;
}

const SETTINGS_KEY = 'enchanter.settings';
const DEFAULT_DIFFICULTY: Difficulty = 'normal';

function isDifficulty(v: unknown): v is Difficulty {
  return v === 'relaxed' || v === 'easy' || v === 'normal' || v === 'hard';
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { difficulty?: unknown };
      if (isDifficulty(data?.difficulty)) {
        return { difficulty: data.difficulty };
      }
    }
  } catch {
    // localStorage disabled / corrupt blob - fall back to default.
  }
  return { difficulty: DEFAULT_DIFFICULTY };
}

export const settings = writable<Settings>(loadSettings());

// Persist on every change to the settings' own key. This subscription
// runs for the life of the page; the first (synchronous) call re-writes
// the loaded value, which is harmless.
settings.subscribe((s) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // localStorage disabled / quota exceeded - silently skip.
  }
});

export function setDifficulty(difficulty: Difficulty): void {
  settings.set({ difficulty });
}
