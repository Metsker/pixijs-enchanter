import { get, writable } from 'svelte/store';
import type { Item } from '../domain/item';
import type { EquipmentSlotId } from '../domain/equipment';

export type InspectorSubject =
  | { source: 'inventory'; slotId: EquipmentSlotId; item: Item }
  | { source: 'backpack'; index: number; item: Item }
  | { source: 'shop'; index: number; item: Item; price: number }
  | { source: 'item-offer'; index: number; item: Item };

export const inspector = writable<InspectorSubject | null>(null);

// Open the item inspector for `subject` - or, if it's already showing that same
// item, close it (a second click on the same entry toggles it off). Internal
// re-targeting after actions uses `inspector.set` directly, so it never toggles.
export function inspectItem(subject: InspectorSubject): void {
  const current = get(inspector);
  if (current && current.item.id === subject.item.id) {
    inspector.set(null);
    return;
  }
  inspector.set(subject);
}

export function closeInspector(): void {
  inspector.set(null);
}
