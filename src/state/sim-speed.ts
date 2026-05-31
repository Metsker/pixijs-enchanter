import { writable } from 'svelte/store';

// Battlefield simulation-speed multiplier. Cycled from the top bar between the
// SIM_SPEEDS values; the battlefield scales its combat dt by it so fights
// fast-forward (logic only - rendering stays at the display's frame rate).
// Persisted so the player's preferred pace survives reloads.
export const SIM_SPEEDS = [1, 2, 3, 5] as const;

const KEY = 'enchanter.simSpeed';

function load(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return (SIM_SPEEDS as readonly number[]).includes(v) ? v : 1;
  } catch {
    return 1; // first run / disabled storage
  }
}

export const simSpeed = writable<number>(load());

simSpeed.subscribe((s) => {
  try {
    localStorage.setItem(KEY, String(s));
  } catch {
    // ignore - disabled storage
  }
});

// Advance to the next speed, wrapping back to x1 after the top speed.
export function cycleSimSpeed(): void {
  simSpeed.update((s) => {
    const i = (SIM_SPEEDS as readonly number[]).indexOf(s);
    return SIM_SPEEDS[(i + 1) % SIM_SPEEDS.length];
  });
}

// Set an explicit speed (the Settings panel offers each as its own button).
export function setSimSpeed(s: number): void {
  if ((SIM_SPEEDS as readonly number[]).includes(s)) simSpeed.set(s);
}
