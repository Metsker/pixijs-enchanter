import { writable } from 'svelte/store';
import type { EquipmentSlotId } from '../domain/equipment';

// A short-lived cue for the equipment column: the slot an item was just
// equipped / swapped into, so InventoryColumn can flash it. The monotonic `id`
// lets a repeat equip into the SAME slot re-trigger the flash animation.
export const equipFlash = writable<{ slot: EquipmentSlotId; id: number } | null>(null);

let counter = 0;
export function flashEquipSlot(slot: EquipmentSlotId): void {
  counter += 1;
  equipFlash.set({ slot, id: counter });
}
