import { get, writable } from 'svelte/store';
import { isItem, type Item } from '../domain/item';
import { isGem, type Gem } from '../domain/gem';
import { GEM_CATALOGUE } from '../domain/gem-catalogue';

// The bag has NO hard capacity: it grows to fit whatever the player carries.
// We keep a trailing buffer of empty slots so there is always room to add and
// always a few visible drop targets, and an initial / floor size so an empty
// bag still shows a full grid. normalizeBackpack (below) enforces both on every
// store write, so adds never fail and the grid grows dynamically.
export const BACKPACK_MIN_SLOTS = 10;
const BACKPACK_TRAILING_BUFFER = 4;

// The backpack grid now holds equipment Items AND loose Gems together (the
// former separate gemStash is gone - the backpack IS the stash). Each slot is
// an Item, a loose Gem, or empty (null). Item-only ops guard with isItem so a
// gem in the grid is never mistaken for an item; gem ops guard with isGem.
export type BackpackSlot = Item | Gem | null;

function makeInitial(): BackpackSlot[] {
  return Array.from({ length: BACKPACK_MIN_SLOTS }, () => null);
}

// Grow / trim the slot array so it always holds every item plus a trailing
// buffer of empties (and never drops below the floor). Trimming only ever
// removes trailing nulls beyond the buffer, never a filled slot.
export function normalizeBackpack(slots: BackpackSlot[]): BackpackSlot[] {
  let lastFilled = -1;
  for (let i = 0; i < slots.length; i++) if (slots[i] !== null) lastFilled = i;
  const want = Math.max(BACKPACK_MIN_SLOTS, lastFilled + 1 + BACKPACK_TRAILING_BUFFER);
  if (slots.length < want) {
    return slots.concat(Array.from({ length: want - slots.length }, () => null));
  }
  if (slots.length > want) return slots.slice(0, want);
  return slots;
}

// A writable that normalizes (grows / trims to keep the buffer) on every write,
// so every existing mutation + the save loader's backpack.set get the dynamic
// sizing for free, without touching their call sites.
function createBackpack() {
  const inner = writable<BackpackSlot[]>(makeInitial());
  return {
    subscribe: inner.subscribe,
    set: (slots: BackpackSlot[]) => inner.set(normalizeBackpack(slots)),
    update: (fn: (slots: BackpackSlot[]) => BackpackSlot[]) =>
      inner.update((slots) => normalizeBackpack(fn(slots))),
  };
}

export const backpack = createBackpack();

export function resetBackpack(): void {
  backpack.set(makeInitial());
}

// Drop placement: new acquisitions go to the first empty slot in reading order,
// appending a fresh slot if none is free (the bag is unrestricted, so an add
// never fails). Returns the index the item landed at.
export function addItem(item: Item): number {
  let placed = -1;
  backpack.update((slots) => {
    const next = slots.slice();
    let idx = next.findIndex((s) => s === null);
    if (idx === -1) {
      idx = next.length;
      next.push(null);
    }
    next[idx] = item;
    placed = idx;
    return next;
  });
  return placed;
}

// Drop a loose gem into the backpack's first empty slot (appending if needed),
// mirroring addItem. The bag is unrestricted, so the gem is never lost.
export function addGemToBackpack(gem: Gem): number {
  let placed = -1;
  backpack.update((slots) => {
    const next = slots.slice();
    let idx = next.findIndex((s) => s === null);
    if (idx === -1) {
      idx = next.length;
      next.push(null);
    }
    next[idx] = gem;
    placed = idx;
    return next;
  });
  return placed;
}

// Place a (held) gem into a SPECIFIC cell - used by the gem-drag reorder so
// dropping a gem onto a backpack cell moves it THERE, not just to "first empty".
// Any occupant (item or other gem) is displaced to the first empty cell, giving
// a swap/reflow. The held gem is NOT in the grid at call time (the drag lifted
// it out), so its vacated origin is among the empties. Returns the landing
// index, or -1 if `index` is invalid or a displaced occupant has nowhere to go.
export function placeGemAtCell(gem: Gem, index: number): number {
  let placed = -1;
  backpack.update((slots) => {
    if (index < 0 || index >= slots.length) return slots;
    const occupant = slots[index];
    const next = slots.slice();
    next[index] = gem;
    if (occupant !== null) {
      const empty = next.findIndex((s) => s === null);
      if (empty === -1) return slots; // nowhere for the displaced occupant - abort
      next[empty] = occupant;
    }
    placed = index;
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

// Apply a mutator to the loose backpack GEM with the given instance id,
// wherever it sits. Returns true if a gem with that id was found and rewritten.
// Used by the combine logic to bump a target gem's level in place.
export function updateBackpackGemById(gemId: string, mutate: (gem: Gem) => Gem): boolean {
  let found = false;
  backpack.update((slots) => {
    const idx = slots.findIndex((s) => isGem(s) && s.id === gemId);
    if (idx === -1) return slots;
    found = true;
    const next = slots.slice();
    next[idx] = mutate(slots[idx] as Gem);
    return next;
  });
  return found;
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
