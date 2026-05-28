import { writable } from 'svelte/store';
import type { Enchantment, EnchantLayer, EnchantPool } from '../domain/enchant';
import type { Item } from '../domain/item';

export const BACKPACK_CAPACITY = 20;

// Step 6 placeholder enchants. They satisfy the Enchantment type but use the
// only effect kind we model so far (damage-add) regardless of pool, so they
// can populate items without throwing off combat. The real catalogue (54
// entries from docs/enchant-catalogue.md) lands in a later step alongside
// the full set of EnchantEffect variants.
function mk(id: string, name: string, emoji: string, pool: EnchantPool, layer: EnchantLayer): Enchantment {
  return {
    id,
    name,
    emoji,
    pool,
    layer,
    effect: { kind: 'damage-add', amount: 1, type: 'physical' },
  };
}

const SHARPNESS = mk('sharpness', 'Sharpness', '⚔️', 'weapons', 'main');
const PYROCLASM = mk('pyroclasm', 'Pyroclasm', '🔥', 'weapons', 'main');
const SWIFT = mk('swift', 'Swift', '💨', 'weapons', 'utility');
const PRECISION = mk('precision', 'Precision', '🎯', 'weapons', 'utility');
const VITALITY = mk('vitality', 'Vitality', '❤️', 'armor', 'main');
const DODGE = mk('dodge', 'Dodge', '🌀', 'armor', 'main');
const THORNS = mk('thorns', 'Thorns', '🌹', 'armor', 'utility');
const REGENERATION = mk('regeneration', 'Regeneration', '✨', 'jewelry', 'main');

const starterItems: Item[] = [
  { id: 'wpn-1', itemType: 'weapon', enchants: [SHARPNESS, SWIFT] },
  { id: 'wpn-2', itemType: 'weapon', enchants: [PYROCLASM, SHARPNESS, PRECISION] },
  { id: 'shd-1', itemType: 'shield', enchants: [VITALITY] },
  { id: 'amr-helm', itemType: 'armor', armorSlot: 'helm', enchants: [VITALITY, THORNS] },
  { id: 'amr-chest', itemType: 'armor', armorSlot: 'chest', enchants: [VITALITY, DODGE, THORNS] },
  { id: 'amr-boots', itemType: 'armor', armorSlot: 'boots', enchants: [DODGE] },
  { id: 'ring-1', itemType: 'ring', enchants: [REGENERATION, PRECISION] },
  { id: 'amu-1', itemType: 'amulet', enchants: [PRECISION] },
];

function makeInitial(): (Item | null)[] {
  const slots: (Item | null)[] = Array.from({ length: BACKPACK_CAPACITY }, () => null);
  for (let i = 0; i < starterItems.length && i < slots.length; i++) {
    slots[i] = starterItems[i];
  }
  return slots;
}

export const backpack = writable<(Item | null)[]>(makeInitial());

// Drop placement: new acquisitions go to the first empty slot in reading
// order. Returns true if placed, false if the Backpack was full (per spec
// the dropped item is destroyed with no refund or notification).
export function addItem(item: Item): boolean {
  let placed = false;
  backpack.update((slots) => {
    const idx = slots.findIndex((s) => s === null);
    if (idx === -1) return slots;
    const next = slots.slice();
    next[idx] = item;
    placed = true;
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
