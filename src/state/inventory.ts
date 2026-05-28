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
  cancelDisplacementPick();
}

// === Displacement picker ============================================
// When an equip would have to displace one of several legal occupied
// slots (rings, dual weapons), the picker holds the pending item and
// the candidate slots. InventoryColumn renders the candidate slots
// as highlighted clickable targets; clicking one resolves the pick.
export interface DisplacementPick {
  item: Item;
  legalSlots: EquipmentSlotId[];
  // Run after the swap to place the displaced item somewhere
  // appropriate to the original source (backpack tile, chest, etc.).
  placeDisplaced: (displaced: Item) => void;
}

export const displacementPick = writable<DisplacementPick | null>(null);

export function cancelDisplacementPick(): void {
  displacementPick.set(null);
}

export function resolveDisplacementPick(
  slotId: EquipmentSlotId,
): EquipmentSlotId | null {
  const pick = get(displacementPick);
  if (!pick) return null;
  if (!pick.legalSlots.includes(slotId)) return null;
  const currentEquipped = get(equipped);
  const old = currentEquipped[slotId];
  if (!old) return null;
  pick.placeDisplaced(old);
  equipped.update((eq) => ({ ...eq, [slotId]: pick.item }));
  displacementPick.set(null);
  return slotId;
}

// Equip from the Backpack. Tries the FIRST EMPTY legal slot in
// canonical order; if none is free and there are multiple legal
// slots (rings, dual weapons), starts a displacement picker so the
// player chooses which to swap with. Single-slot items (helm,
// chest, etc.) skip the picker and swap in-place. The displaced
// item lands in the same backpack tile the new one came from.
export function equipFromBackpack(backpackIndex: number): EquipmentSlotId | null {
  const item = get(backpack)[backpackIndex];
  if (!item) return null;
  const legalList = legalEquipmentSlots(item);
  const legal = new Set(legalList);
  const currentEquipped = get(equipped);

  for (const slotId of EQUIPMENT_SLOT_ORDER) {
    if (!legal.has(slotId)) continue;
    if (currentEquipped[slotId] !== null) continue;
    removeItem(backpackIndex);
    equipped.update((eq) => ({ ...eq, [slotId]: item }));
    return slotId;
  }

  const occupied = legalList.filter((s) => currentEquipped[s] !== null);
  const placeIntoBackpackSource = (old: Item): void => {
    backpack.update((slots) => {
      const next = slots.slice();
      next[backpackIndex] = old;
      return next;
    });
  };

  // Multi-slot all-occupied: defer to the player via the picker so
  // they choose ring1 vs ring2 / weapon vs offhand explicitly. The
  // backpack tile keeps the new item until resolve; the placeDisplaced
  // callback overwrites it with the displaced item in one shot, so a
  // cancel cleanly leaves the new item in place.
  if (legalList.length > 1 && occupied.length === legalList.length) {
    displacementPick.set({
      item,
      legalSlots: occupied,
      placeDisplaced: placeIntoBackpackSource,
    });
    return null;
  }

  // Single legal slot occupied: forced swap, no choice.
  for (const slotId of EQUIPMENT_SLOT_ORDER) {
    if (!legal.has(slotId)) continue;
    const old = currentEquipped[slotId];
    if (!old) continue;
    placeIntoBackpackSource(old);
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
