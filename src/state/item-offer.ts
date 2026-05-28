import { get, writable } from 'svelte/store';
import type { Item } from '../domain/item';
import { equipItemDirect, hasEmptyLegalSlot } from './inventory';
import { closeInspector, inspector } from './inspector';

// A pick-1-or-more item-select room. The starter "Armory" room uses
// three T1 weapons; later rooms can reuse the same component for
// reward picks (e.g. 3 T3 armor pieces after a boss). Items are
// rolled at map generation and passed in via openItemOffer.
export interface ItemOffer {
  items: (Item | null)[];
}

export const itemOffer = writable<ItemOffer | null>(null);

export function openItemOffer(items: Item[]): void {
  itemOffer.set({ items: items.slice() });
}

export function closeItemOffer(): void {
  itemOffer.set(null);
}

export function canPickItem(index: number): boolean {
  const offer = get(itemOffer);
  if (!offer) return false;
  const item = offer.items[index];
  if (!item) return false;
  return hasEmptyLegalSlot(item);
}

// Equip the item at `index` into the first empty legal slot and blank
// the offer slot. Returns the slot the item landed in, or null if no
// legal slot was free.
export function pickItem(index: number): string | null {
  const offer = get(itemOffer);
  if (!offer) return null;
  const item = offer.items[index];
  if (!item) return null;

  const landed = equipItemDirect(item);
  if (landed === null) return null;

  itemOffer.update((s) => {
    if (!s) return s;
    const items = s.items.slice();
    items[index] = null;
    return { ...s, items };
  });

  // If the Inspector was pointed at this offer slot, close it - the
  // item now lives in the Inventory slot it landed in.
  const ins = get(inspector);
  if (ins?.source === 'item-offer' && ins.index === index) closeInspector();

  return landed;
}
