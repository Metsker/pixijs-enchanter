import { writable } from 'svelte/store';

export const backpackOpen = writable(false);

export function toggleBackpack(): void {
  backpackOpen.update((open) => !open);
}

// Settings overlay (difficulty picker). Opened from the TopBar gear
// button.
export const settingsOpen = writable(false);

export function openSettings(): void {
  settingsOpen.set(true);
}

export function closeSettings(): void {
  settingsOpen.set(false);
}
