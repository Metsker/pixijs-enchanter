import { writable } from 'svelte/store';

export const backpackOpen = writable(false);

export function toggleBackpack(): void {
  backpackOpen.update((open) => !open);
}
