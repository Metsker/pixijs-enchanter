import { writable } from 'svelte/store';
import type { Item } from '../domain/item';
import type { EquipmentSlotId } from '../domain/equipment';

export type InspectorSubject =
  | { source: 'inventory'; slotId: EquipmentSlotId; item: Item }
  | { source: 'backpack'; index: number; item: Item }
  | { source: 'shop'; index: number; item: Item; price: number }
  | { source: 'rewards'; item: Item }
  | { source: 'item-offer'; index: number; item: Item };

export const inspector = writable<InspectorSubject | null>(null);

export function inspectItem(subject: InspectorSubject): void {
  inspector.set(subject);
}

export function closeInspector(): void {
  inspector.set(null);
}
