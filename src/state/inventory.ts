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

// Equip flow Path A per CONTEXT.md § Equip flow: take the item out of the
// Backpack and place it in the FIRST EMPTY legal slot in canonical order
// (weapon, offhand, helm, chest, gloves, boots, ring1, ring2, amulet).
// Returns the slot it landed in, or null if no legal slot is empty (Path B
// displacement picker is deferred).
export function equipFromBackpack(backpackIndex: number): EquipmentSlotId | null {
  const item = get(backpack)[backpackIndex];
  if (!item) return null;
  return equipIntoFirstEmpty(item, () => removeItem(backpackIndex));
}

// Equip an item that doesn't live in the Backpack yet (e.g. straight from
// the victory chest). Returns the slot id on success, or null if every
// legal slot is occupied.
export function equipItemDirect(item: Item): EquipmentSlotId | null {
  return equipIntoFirstEmpty(item, () => undefined);
}

function equipIntoFirstEmpty(
  item: Item,
  onSuccess: () => void,
): EquipmentSlotId | null {
  const legal = new Set(legalEquipmentSlots(item));
  const currentEquipped = get(equipped);
  for (const slotId of EQUIPMENT_SLOT_ORDER) {
    if (!legal.has(slotId)) continue;
    if (currentEquipped[slotId] !== null) continue;
    onSuccess();
    equipped.update((eq) => ({ ...eq, [slotId]: item }));
    return slotId;
  }
  return null;
}

export function hasEmptyLegalSlot(item: Item): boolean {
  const legal = new Set(legalEquipmentSlots(item));
  const currentEquipped = get(equipped);
  for (const slotId of EQUIPMENT_SLOT_ORDER) {
    if (legal.has(slotId) && currentEquipped[slotId] === null) return true;
  }
  return false;
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
