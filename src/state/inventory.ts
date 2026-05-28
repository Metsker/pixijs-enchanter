import { get, writable } from 'svelte/store';
import {
  EQUIPMENT_SLOT_ORDER,
  type EquipmentSlotId,
} from '../domain/equipment';
import { legalEquipmentSlots, type Item } from '../domain/item';
import { addItem, backpack, removeItem } from './backpack';

export type EquippedItems = Record<EquipmentSlotId, Item | null>;

function makeInitial(): EquippedItems {
  return Object.fromEntries(
    EQUIPMENT_SLOT_ORDER.map((slotId) => [slotId, null]),
  ) as EquippedItems;
}

export const equipped = writable<EquippedItems>(makeInitial());

export function resetEquipped(): void {
  equipped.set(makeInitial());
}

// Equip from the Backpack. Tries the FIRST EMPTY legal slot in
// canonical order first; if none is free, swaps in-place with the
// first legal occupied slot (the displaced item lands in the same
// backpack index the new one came from - one tile toggle, no
// backpack-space requirement). Returns the slot it landed in.
export function equipFromBackpack(backpackIndex: number): EquipmentSlotId | null {
  const item = get(backpack)[backpackIndex];
  if (!item) return null;
  const legal = new Set(legalEquipmentSlots(item));
  const currentEquipped = get(equipped);

  for (const slotId of EQUIPMENT_SLOT_ORDER) {
    if (!legal.has(slotId)) continue;
    if (currentEquipped[slotId] !== null) continue;
    removeItem(backpackIndex);
    equipped.update((eq) => ({ ...eq, [slotId]: item }));
    return slotId;
  }

  // Swap path: displaced item slides into the source backpack slot.
  for (const slotId of EQUIPMENT_SLOT_ORDER) {
    if (!legal.has(slotId)) continue;
    const old = currentEquipped[slotId];
    if (!old) continue;
    backpack.update((slots) => {
      const next = slots.slice();
      next[backpackIndex] = old;
      return next;
    });
    equipped.update((eq) => ({ ...eq, [slotId]: item }));
    return slotId;
  }
  return null;
}

// Equip an item that doesn't live in the Backpack (chest, item-
// offer, shop's Buy and Equip). Tries an empty legal slot first;
// otherwise swaps with the first legal occupied slot and stows the
// displaced item in the first empty Backpack tile. If every legal
// slot is occupied AND the Backpack is full, returns null.
export function equipItemDirect(item: Item): EquipmentSlotId | null {
  const legal = new Set(legalEquipmentSlots(item));
  const currentEquipped = get(equipped);

  for (const slotId of EQUIPMENT_SLOT_ORDER) {
    if (!legal.has(slotId)) continue;
    if (currentEquipped[slotId] !== null) continue;
    equipped.update((eq) => ({ ...eq, [slotId]: item }));
    return slotId;
  }

  if (!get(backpack).includes(null)) return null;
  for (const slotId of EQUIPMENT_SLOT_ORDER) {
    if (!legal.has(slotId)) continue;
    const old = currentEquipped[slotId];
    if (!old) continue;
    addItem(old);
    equipped.update((eq) => ({ ...eq, [slotId]: item }));
    return slotId;
  }
  return null;
}

// True when an item from the Backpack can land somewhere - always
// the case when the item has at least one legal slot, since the
// swap path uses the source backpack tile as the displaced item's
// home.
export function canEquipFromBackpack(item: Item): boolean {
  return legalEquipmentSlots(item).length > 0;
}

// True when an off-backpack item (chest / shop / item-offer) can
// land. Either there's a legal empty slot, or the Backpack has
// room for a displaced item.
export function canEquipDirect(item: Item): boolean {
  const legal = legalEquipmentSlots(item);
  if (legal.length === 0) return false;
  const eq = get(equipped);
  for (const slot of legal) if (eq[slot] === null) return true;
  return get(backpack).includes(null);
}

// Apply a mutator to the item in `slotId`. Pass `null` from the mutator to
// unequip (slot becomes empty). Returns the new item (or null).
export function updateEquippedAt(
  slotId: EquipmentSlotId,
  mutate: (item: Item) => Item | null,
): Item | null {
  let result: Item | null = null;
  equipped.update((eq) => {
    const current = eq[slotId];
    if (!current) return eq;
    result = mutate(current);
    return { ...eq, [slotId]: result };
  });
  return result;
}

// Unequip per CONTEXT.md § Inventory: the item returns to the Backpack;
// refused if the Backpack is full. Returns the backpack index the item
// landed at, or -1 on refusal.
export function unequipToBackpack(slotId: EquipmentSlotId): number {
  const currentEquipped = get(equipped);
  const item = currentEquipped[slotId];
  if (!item) return -1;

  if (!get(backpack).includes(null)) return -1;

  equipped.update((eq) => ({ ...eq, [slotId]: null }));
  return addItem(item);
}
