// Rest-action handlers. Used by the Inspector when the current screen is a
// Rest room. Per CONTEXT.md the Workbench is "the Rest-time replacement for
// the Inspector"; this codebase merges the two into one Inspector panel
// that grows an action column during Rest, so this module no longer owns a
// separate workbench-open store - it just exposes the actions.

import { get } from 'svelte/store';
import { inspector } from './inspector';
import { updateItemAt } from './backpack';
import { updateEquippedAt } from './inventory';
import { itemPoolFor, pickRandomEnchant } from '../domain/random';
import { isSealed, stackLayerAt, type Item } from '../domain/item';
import type { EnchantLayer } from '../domain/enchant';
import { refundCrystals, spendCrystals, spendSeals, topbar } from './topbar';
import type { InspectorSubject } from './inspector';

// Placeholder costs - tunable later.
export const ADD_ROLL_COST = 30;
export const REROLL_ALL_COST = 50;
export const LOCK_SELECTED_SEAL_COST = 1;
export const LOCK_SELECTED_CRYSTAL_COST = 10;
export const DISENCHANT_REFUND_PER_SLOT = 15;
// Destroy refunds a bit more per slot than slot-by-slot Disenchant, so
// scrapping a finished item is meaningfully better than tediously popping
// each enchant individually.
export const DESTROY_REFUND_PER_SLOT = 20;

function applyMutation(subject: InspectorSubject, mutate: (item: Item) => Item | null): Item | null {
  const next = subject.source === 'backpack'
    ? updateItemAt(subject.index, mutate)
    : updateEquippedAt(subject.slotId, mutate);
  if (next === null) {
    inspector.set(null);
  } else {
    inspector.set({ ...subject, item: next } as InspectorSubject);
  }
  return next;
}

// === Add (Roll) =====================================================
export function canAddRoll(item: Item): boolean {
  return item.enchants.length < 6;
}

export function doAddRoll(): void {
  const subject = get(inspector);
  if (!subject || !canAddRoll(subject.item)) return;
  if (!spendCrystals(ADD_ROLL_COST)) return;
  applyMutation(subject, (item) => {
    const nextSlot = item.enchants.length + 1;
    const layer = stackLayerAt(nextSlot) as EnchantLayer;
    const pool = itemPoolFor(item.itemType);
    return { ...item, enchants: [...item.enchants, pickRandomEnchant(pool, layer)] };
  });
}

// === Reroll All =====================================================
export function canRerollAll(item: Item): boolean {
  return item.enchants.length > 0;
}

export function doRerollAll(): void {
  const subject = get(inspector);
  if (!subject || !canRerollAll(subject.item)) return;
  if (!spendCrystals(REROLL_ALL_COST)) return;
  applyMutation(subject, (item) => {
    const pool = itemPoolFor(item.itemType);
    const enchants = item.enchants.map((current, i) => {
      const slot = i + 1;
      if (isSealed(item, slot)) return current;
      return pickRandomEnchant(pool, stackLayerAt(slot) as EnchantLayer);
    });
    return { ...item, enchants };
  });
}

// === Lock selected (single-step now: pass the slot) =================
export function canLockSelected(item: Item, slot: number | null): boolean {
  if (slot === null) return false;
  if (slot < 1 || slot > item.enchants.length) return false;
  if (isSealed(item, slot)) return false;
  return true;
}

export function doLockSelected(slot: number): void {
  const subject = get(inspector);
  if (!subject || !canLockSelected(subject.item, slot)) return;

  const tb = get(topbar);
  if (tb.seals < LOCK_SELECTED_SEAL_COST || tb.crystals < LOCK_SELECTED_CRYSTAL_COST) return;
  spendSeals(LOCK_SELECTED_SEAL_COST);
  spendCrystals(LOCK_SELECTED_CRYSTAL_COST);

  applyMutation(subject, (item) => {
    const sealedSlots = [...(item.sealedSlots ?? []), slot].sort((a, b) => a - b);
    return { ...item, sealedSlots };
  });
}

// === Disenchant top =================================================
export function canDisenchantTop(item: Item): boolean {
  if (item.enchants.length === 7) return false;
  // T0 (empty husk) - allow Disenchant to remove the item entirely.
  if (item.enchants.length === 0) return true;
  for (let i = item.enchants.length; i >= 1; i--) {
    if (!isSealed(item, i)) return true;
  }
  return false;
}

export function disenchantTopRefund(item: Item): number {
  return canDisenchantTop(item) ? DISENCHANT_REFUND_PER_SLOT : 0;
}

export function doDisenchantTop(): void {
  const subject = get(inspector);
  if (!subject || !canDisenchantTop(subject.item)) return;
  // T0 husk: just delete the item, no refund.
  if (subject.item.enchants.length === 0) {
    applyMutation(subject, () => null);
    return;
  }
  let popSlot = -1;
  for (let i = subject.item.enchants.length; i >= 1; i--) {
    if (!isSealed(subject.item, i)) {
      popSlot = i;
      break;
    }
  }
  if (popSlot === -1) return;
  refundCrystals(DISENCHANT_REFUND_PER_SLOT);
  applyMutation(subject, (item) => {
    const enchants = item.enchants.slice();
    enchants.splice(popSlot - 1, 1);
    const sealedSlots = (item.sealedSlots ?? [])
      .filter((s) => s !== popSlot)
      .map((s) => (s > popSlot ? s - 1 : s));
    if (enchants.length === 0) return null;
    return { ...item, enchants, sealedSlots };
  });
}

// === Destroy ========================================================
export function destroyRefund(item: Item): number {
  return item.enchants.length * DESTROY_REFUND_PER_SLOT;
}

export function doDestroy(): void {
  const subject = get(inspector);
  if (!subject) return;
  refundCrystals(destroyRefund(subject.item));
  applyMutation(subject, () => null);
}
