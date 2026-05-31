import { derived, get, writable } from 'svelte/store';

// The bag is two rail panels - an Items split and a Gems split - each toggled
// independently. `toggleBag` opens/closes both together (the "open my bag"
// gesture from the TopBar 🎒 and the B key); the Inspector's toolbar opens one
// or the other directly. Loose gems and items are still one `backpack` store
// (state/backpack.ts); the splits are just filtered views of it.
export const itemsSplitOpen = writable(false);
export const gemsSplitOpen = writable(false);
// Read-only stats panel (no drop targets), so it's tracked separately from the
// bag splits and never enables the equipment drag.
export const statsSplitOpen = writable(false);

// True while either split is showing - used for the TopBar 🎒 active state and
// the equipment column's drag-to-unequip (whose drop targets live on a split).
export const bagOpen = derived(
  [itemsSplitOpen, gemsSplitOpen],
  ([$items, $gems]) => $items || $gems,
);

export function openItemsSplit(): void {
  itemsSplitOpen.set(true);
}
export function closeItemsSplit(): void {
  itemsSplitOpen.set(false);
}
export function toggleItemsSplit(): void {
  itemsSplitOpen.update((open) => !open);
}
export function openGemsSplit(): void {
  gemsSplitOpen.set(true);
}
export function closeGemsSplit(): void {
  gemsSplitOpen.set(false);
}
export function toggleGemsSplit(): void {
  gemsSplitOpen.update((open) => !open);
}
export function closeStatsSplit(): void {
  statsSplitOpen.set(false);
}
export function toggleStatsSplit(): void {
  statsSplitOpen.update((open) => !open);
}

// Toggle the whole bag: if either split is open, close both; otherwise open both.
export function toggleBag(): void {
  const anyOpen = get(itemsSplitOpen) || get(gemsSplitOpen);
  itemsSplitOpen.set(!anyOpen);
  gemsSplitOpen.set(!anyOpen);
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
