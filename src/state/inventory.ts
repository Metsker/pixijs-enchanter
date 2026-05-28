import { writable } from 'svelte/store';
import { EQUIPMENT_SLOT_ORDER, type EquipmentSlotId } from '../domain/equipment';
import type { Item } from '../domain/item';

export type EquippedItems = Record<EquipmentSlotId, Item | null>;

const initial: EquippedItems = Object.fromEntries(
  EQUIPMENT_SLOT_ORDER.map((slotId) => [slotId, null]),
) as EquippedItems;

export const equipped = writable<EquippedItems>(initial);
