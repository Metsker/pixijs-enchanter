// Bestiary: the set of enemy ids the player has ENCOUNTERED (fought at least
// once). Permanent meta-knowledge - it persists across runs (like settings),
// so the dossier fills in as you play and is never wiped by startNewRun.
//
// This is the "progressive information" half of the threat design
// (docs/decisions-that-matter.md): the map shows WHAT you'll face (enemy
// icons), and the Bestiary pane shows what you KNOW about a foe once you have
// met it - resistances, weaknesses, ailment immunity, etc.

import { writable } from 'svelte/store';

const BESTIARY_KEY = 'enchanter.bestiary';

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(BESTIARY_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.filter((x) => typeof x === 'string'));
    }
  } catch {
    // localStorage disabled / corrupt blob - start with an empty bestiary.
  }
  return new Set();
}

export const encounteredEnemies = writable<Set<string>>(load());

// Persist on every change (fires once on init to write the loaded value back).
encounteredEnemies.subscribe((s) => {
  try {
    localStorage.setItem(BESTIARY_KEY, JSON.stringify([...s]));
  } catch {
    // localStorage disabled / quota exceeded - silently skip.
  }
});

// Mark enemy ids as encountered. Returns a NEW Set on change so Svelte
// subscribers fire (mutating the existing Set in place would not).
export function recordEncounter(ids: string[]): void {
  encounteredEnemies.update((s) => {
    let changed = false;
    for (const id of ids) {
      if (!s.has(id)) {
        s.add(id);
        changed = true;
      }
    }
    return changed ? new Set(s) : s;
  });
}
