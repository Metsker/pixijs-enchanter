import { get, writable } from 'svelte/store';
import {
  EQUIPMENT_SLOT_ORDER,
  type EquipmentSlotId,
} from '../domain/equipment';
import { legalEquipmentSlots, type Item } from '../domain/item';
import { addItem, backpack, removeItem } from './backpack';

export type EquippedItems = Record<EquipmentSlotId, Item | null>;

const initial: EquippedItems = Object.fromEntries(
  EQUIPMENT_SLOT_ORDER.map((slotId) => [slotId, null]),
) as EquippedItems;

export const equipped = writable<EquippedItems>(initial);

// Equip flow Path A per CONTEXT.md § Equip flow: take the item out of the
// Backpack and place it in the FIRST EMPTY legal slot in canonical order
// (weapon, offhand, helm, chest, gloves, boots, ring1, ring2, amulet).
// Returns the slot it landed in, or null if no legal slot is empty (Path B
// displacement picker is deferred).
export function equipFromBackpack(backpackIndex: number): EquipmentSlotId | null {
  const item = get(backpack)[backpackIndex];
  if (!item) return null;

  const legal = new Set(legalEquipmentSlots(item));
  const currentEquipped = get(equipped);

  for (const slotId of EQUIPMENT_SLOT_ORDER) {
    if (!legal.has(slotId)) continue;
    if (currentEquipped[slotId] !== null) continue;

    // Remove from backpack first, then equip - both updates run synchronously
    // so subscribers see a consistent post-state.
    removeItem(backpackIndex);
    equipped.update((eq) => ({ ...eq, [slotId]: item }));
    return slotId;
  }

  return null;
}

// Unequip per CONTEXT.md § Inventory: the item returns to the Backpack;
// refused if the Backpack is full. Returns true on success.
export function unequipToBackpack(slotId: EquipmentSlotId): boolean {
  const currentEquipped = get(equipped);
  const item = currentEquipped[slotId];
  if (!item) return false;

  if (!get(backpack).includes(null)) return false;

  equipped.update((eq) => ({ ...eq, [slotId]: null }));
  addItem(item);
  return true;
}
