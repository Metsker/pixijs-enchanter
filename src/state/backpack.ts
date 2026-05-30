import { get, writable } from 'svelte/store';
import { isItem, type Item } from '../domain/item';
import { isGem, type Gem } from '../domain/gem';
import { GEM_CATALOGUE } from '../domain/gem-catalogue';

export const BACKPACK_CAPACITY = 20;

// The backpack grid now holds equipment Items AND loose Gems together (the
// former separate gemStash is gone - the backpack IS the stash). Each slot is
// an Item, a loose Gem, or empty (null). Item-only ops guard with isItem so a
// gem in the grid is never mistaken for an item; gem ops guard with isGem.
export type BackpackSlot = Item | Gem | null;

function makeInitial(): BackpackSlot[] {
  return Array.from({ length: BACKPACK_CAPACITY }, () => null);
}

export const backpack = writable<BackpackSlot[]>(makeInitial());

export function resetBackpack(): void {
  backpack.set(makeInitial());
}

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

// Drop a loose gem into the backpack's first empty slot, mirroring addItem.
// Returns the landing index, or -1 if the backpack was full (the gem is lost,
// same policy as items).
export function addGemToBackpack(gem: Gem): number {
  let placed = -1;
  backpack.update((slots) => {
    const idx = slots.findIndex((s) => s === null);
    if (idx === -1) return slots;
    const next = slots.slice();
    next[idx] = gem;
    placed = idx;
    return next;
  });
  return placed;
}

export function removeItem(index: number): BackpackSlot {
  let removed: BackpackSlot = null;
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
// amulets) then by tier descending. Loose gems sort AFTER all items, grouped
// by gem class then role. Manual ordering survives until the next Sort click.
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

// Gems sort after every item (rank base 100), then by gem class, then role
// (effects before supports), then defId for a stable within-bucket order.
const GEM_CLASS_RANK: Record<string, number> = { weapon: 0, armor: 1, jewelry: 2 };
function gemSortKey(gem: Gem): number {
  const def = GEM_CATALOGUE[gem.defId];
  if (!def) return 100 + 99; // unknown defId sinks to the very end of the gem block
  const classRank = GEM_CLASS_RANK[def.class] ?? 9;
  const roleRank = def.role === 'effect' ? 0 : 1;
  return 100 + classRank * 10 + roleRank;
}

// Apply a mutator to the ITEM at `index`. No-op if the slot is empty or holds a
// gem (item-only). Pass `null` from the mutator to remove the item. Returns the
// new item (or null) for the caller's convenience.
export function updateItemAt(index: number, mutate: (item: Item) => Item | null): Item | null {
  let result: Item | null = null;
  backpack.update((slots) => {
    if (index < 0 || index >= slots.length) return slots;
    const current = slots[index];
    if (!isItem(current)) return slots;
    result = mutate(current);
    const next = slots.slice();
    next[index] = result;
    return next;
  });
  return result;
}

// Find a backpack ITEM by its instance id (or null if not held in the
// backpack). Used by the held-gem move logic, which addresses an item's
// origin by id so it stays correct across backpack reorders / sorts.
export function findBackpackItemById(itemId: string): Item | null {
  return get(backpack).find((s): s is Item => isItem(s) && s.id === itemId) ?? null;
}

// Apply a mutator to the backpack ITEM with the given instance id, wherever it
// currently sits. Returns true if an item with that id was found and rewritten.
// Lets the move logic write socket edits back to a backpack item it located by
// id rather than by tile index (robust to the item having been moved/sorted).
export function updateBackpackItemById(
  itemId: string,
  mutate: (item: Item) => Item,
): boolean {
  let found = false;
  backpack.update((slots) => {
    const idx = slots.findIndex((s) => isItem(s) && s.id === itemId);
    if (idx === -1) return slots;
    found = true;
    const next = slots.slice();
    next[idx] = mutate(slots[idx] as Item);
    return next;
  });
  return found;
}

// --- loose gems in the backpack ----------------------------------------

// Find a loose backpack gem by instance id (peek, no removal).
export function findBackpackGemById(gemId: string): Gem | null {
  return get(backpack).find((s): s is Gem => isGem(s) && s.id === gemId) ?? null;
}

// Pull a loose gem out of the backpack by instance id, leaving the slot empty.
// Returns the removed gem (or null if no loose gem with that id was present).
// Used when a gem is picked up for a drag.
export function removeBackpackGemById(gemId: string): Gem | null {
  let removed: Gem | null = null;
  backpack.update((slots) => {
    const idx = slots.findIndex((s) => isGem(s) && s.id === gemId);
    if (idx === -1) return slots;
    removed = slots[idx] as Gem;
    const next = slots.slice();
    next[idx] = null;
    return next;
  });
  return removed;
}

export function sortBackpack(): void {
  backpack.update((slots) => {
    const filled = slots.filter((s): s is Item | Gem => s !== null);
    filled.sort((a, b) => {
      const aIsItem = isItem(a);
      const bIsItem = isItem(b);
      // Items always rank before gems.
      if (aIsItem && !bIsItem) return -1;
      if (!aIsItem && bIsItem) return 1;
      if (aIsItem && bIsItem) {
        const ga = GROUP_RANK[groupKey(a)] ?? 99;
        const gb = GROUP_RANK[groupKey(b)] ?? 99;
        if (ga !== gb) return ga - gb;
        return b.sockets.length - a.sockets.length;
      }
      // Both gems.
      const ka = gemSortKey(a as Gem);
      const kb = gemSortKey(b as Gem);
      if (ka !== kb) return ka - kb;
      return (a as Gem).defId.localeCompare((b as Gem).defId);
    });
    const next: BackpackSlot[] = Array.from({ length: slots.length }, () => null);
    for (let i = 0; i < filled.length; i++) next[i] = filled[i];
    return next;
  });
}
