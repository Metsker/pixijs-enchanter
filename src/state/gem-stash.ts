import { get, writable } from 'svelte/store';
import type { Gem } from '../domain/gem';

// The gem stash: un-socketed gems the player owns but hasn't placed in any
// item. Gems live here between being pulled out of a socket and dropped into
// another (or crafted at Rest, a later phase). Order is insertion order; the
// UI can sort for display. Distinct from sockets, which belong to items.
export const gemStash = writable<Gem[]>([]);

export function resetStash(): void {
  gemStash.set([]);
}

// Drop a loose gem into the stash (e.g. pulled from a socket, or crafted).
export function addGemToStash(gem: Gem): void {
  gemStash.update((gems) => [...gems, gem]);
}

// Pull a specific gem out of the stash by its instance id, returning it (or
// null if it wasn't there). Used when the player picks a stash gem up to move
// it into a socket.
export function removeGemFromStashById(gemId: string): Gem | null {
  let removed: Gem | null = null;
  gemStash.update((gems) => {
    const idx = gems.findIndex((g) => g.id === gemId);
    if (idx === -1) return gems;
    removed = gems[idx];
    return [...gems.slice(0, idx), ...gems.slice(idx + 1)];
  });
  return removed;
}

// Peek a stash gem by id without removing it.
export function findStashGem(gemId: string): Gem | null {
  return get(gemStash).find((g) => g.id === gemId) ?? null;
}
