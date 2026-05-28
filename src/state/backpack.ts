import { writable } from 'svelte/store';
import type { Item } from '../domain/item';

export const BACKPACK_CAPACITY = 20;

function makeInitial(): (Item | null)[] {
  return Array.from({ length: BACKPACK_CAPACITY }, () => null);
}

export const backpack = writable<(Item | null)[]>(makeInitial());

// Drop placement: new acquisitions go to the first empty slot in reading
// order. Returns the index the item landed at, or -1 if the Backpack was
// full (per spec the dropped item is destroyed with no refund or
// notification).
export function addItem(item: Item): number {
  let placed = -1;
  backpack.update((slots) => {
    const idx = slots.findIndex((s) => s === null);
    if (idx === -1) return slots;
    const next = slots.slice();
    next[idx] = item;
    placed = idx;
    return next;
  });
  return placed;
}

export function removeItem(index: number): Item | null {
  let removed: Item | null = null;
  backpack.update((slots) => {
    if (index < 0 || index >= slots.length) return slots;
    removed = slots[index];
    if (removed === null) return slots;
    const next = slots.slice();
    next[index] = null;
    return next;
  });
  return removed;
}

// Drop onto an occupied cell swaps the two; drop onto an empty cell moves the
// tile there (which, for slice-swap purposes, is the same as swapping with
// null).
export function moveItem(from: number, to: number): void {
  if (from === to) return;
  backpack.update((slots) => {
    if (from < 0 || from >= slots.length || to < 0 || to >= slots.length) return slots;
    const next = slots.slice();
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  });
}

// Sort groups by item type (weapons, shields, armor by sub-slot, rings,
// amulets) then by tier descending. Manual ordering survives until the next
// Sort click.
const GROUP_RANK: Record<string, number> = {
  weapon: 0,
  shield: 1,
  helm: 2,
  chest: 3,
  gloves: 4,
  boots: 5,
  ring: 6,
  amulet: 7,
};

function groupKey(item: Item): string {
  if (item.itemType === 'armor' && item.armorSlot) return item.armorSlot;
  return item.itemType;
}

// Apply a mutator to the item at `index`. Pass `null` from the mutator to
// remove the item (slot becomes empty). Returns the new item (or null) for
// the caller's convenience.
export function updateItemAt(index: number, mutate: (item: Item) => Item | null): Item | null {
  let result: Item | null = null;
  backpack.update((slots) => {
    if (index < 0 || index >= slots.length) return slots;
    const current = slots[index];
    if (!current) return slots;
    result = mutate(current);
    const next = slots.slice();
    next[index] = result;
    return next;
  });
  return result;
}

export function sortBackpack(): void {
  backpack.update((slots) => {
    const filled = slots.filter((s): s is Item => s !== null);
    filled.sort((a, b) => {
      const ga = GROUP_RANK[groupKey(a)] ?? 99;
      const gb = GROUP_RANK[groupKey(b)] ?? 99;
      if (ga !== gb) return ga - gb;
      return b.enchants.length - a.enchants.length;
    });
    const next: (Item | null)[] = Array.from({ length: slots.length }, () => null);
    for (let i = 0; i < filled.length; i++) next[i] = filled[i];
    return next;
  });
}
