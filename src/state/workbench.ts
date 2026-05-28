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
import { playerEnchants } from './player-profile';
import type { InspectorSubject } from './inspector';

// Crystal Affinity multiplier on refunds (Disenchant / Destroy).
// Stacks additively across every equipped crystal-affinity enchant.
function crystalRefundMul(): number {
  let mul = 1;
  for (const enchant of get(playerEnchants)) {
    for (const eff of enchant.effects) {
      if (eff.kind === 'crystal-affinity') mul += eff.fraction;
    }
  }
  return mul;
}

// Placeholder costs - tunable later.
export const ADD_ROLL_COST = 30;
export const REROLL_ALL_COST = 50;
export const LOCK_SELECTED_SEAL_COST = 1;
export const LOCK_SELECTED_CRYSTAL_COST = 10;
export const REROLL_LAYER_SEAL_COST = 1;
export const REROLL_LAYER_CRYSTAL_COST = 30;
export const REMOVE_SELECTED_SEAL_COST = 1;
export const REMOVE_SELECTED_CRYSTAL_COST = 15;
export const DISENCHANT_REFUND_PER_SLOT = 15;
// Destroy refunds more per slot than Disenchant - it's the only action that
// actually removes the item (frees the inventory / backpack slot and clears
// sealed slots). Slot-by-slot Disenchant leaves a T0 husk behind.
export const DESTROY_REFUND_PER_SLOT = 25;
// A non-empty husk Destroy bonus: destroying a T0 husk still pays this baseline
// so emptying-then-destroying isn't strictly worse than destroying outright.
export const DESTROY_BASE_REFUND = 5;

function applyMutation(subject: InspectorSubject, mutate: (item: Item) => Item | null): Item | null {
  let next: Item | null;
  if (subject.source === 'backpack') {
    next = updateItemAt(subject.index, mutate);
  } else if (subject.source === 'inventory') {
    next = updateEquippedAt(subject.slotId, mutate);
  } else {
    // Shop subjects aren't mutated through the workbench (Rest actions only
    // run in Rest rooms; shop items live in Shop rooms). Defensive no-op.
    return null;
  }
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

// === Reroll Mains / Reroll Utilities ================================
// Per-layer variant of Reroll All: rerolls just the unsealed slots
// whose stack-layer matches the requested layer. Slot 1 / 3 / 5 are
// main; 2 / 4 / 6 are utility.
export function canRerollLayer(item: Item, layer: EnchantLayer): boolean {
  for (let slot = 1; slot <= item.enchants.length; slot++) {
    if (isSealed(item, slot)) continue;
    if ((stackLayerAt(slot) as EnchantLayer) === layer) return true;
  }
  return false;
}

function doRerollLayer(layer: EnchantLayer): void {
  const subject = get(inspector);
  if (!subject || !canRerollLayer(subject.item, layer)) return;
  const tb = get(topbar);
  if (tb.seals < REROLL_LAYER_SEAL_COST || tb.crystals < REROLL_LAYER_CRYSTAL_COST) return;
  spendSeals(REROLL_LAYER_SEAL_COST);
  spendCrystals(REROLL_LAYER_CRYSTAL_COST);
  applyMutation(subject, (item) => {
    const pool = itemPoolFor(item.itemType);
    const enchants = item.enchants.map((current, i) => {
      const slot = i + 1;
      if (isSealed(item, slot)) return current;
      const slotLayer = stackLayerAt(slot) as EnchantLayer;
      if (slotLayer !== layer) return current;
      return pickRandomEnchant(pool, slotLayer);
    });
    return { ...item, enchants };
  });
}

export function doRerollMains(): void {
  doRerollLayer('main');
}

export function doRerollUtilities(): void {
  doRerollLayer('utility');
}

// === Remove selected ================================================
// Pops the specifically-selected slot (rather than the top one
// Disenchant grabs). Sealed slots are protected. The item demotes
// in tier; later slots shift up by one. No refund - the cost of
// the seal + crystals is the player's payment for the precision.
export function canRemoveSelected(item: Item, slot: number | null): boolean {
  if (slot === null) return false;
  if (slot < 1 || slot > item.enchants.length) return false;
  if (isSealed(item, slot)) return false;
  return true;
}

export function doRemoveSelected(slot: number): void {
  const subject = get(inspector);
  if (!subject || !canRemoveSelected(subject.item, slot)) return;
  const tb = get(topbar);
  if (tb.seals < REMOVE_SELECTED_SEAL_COST || tb.crystals < REMOVE_SELECTED_CRYSTAL_COST) return;
  spendSeals(REMOVE_SELECTED_SEAL_COST);
  spendCrystals(REMOVE_SELECTED_CRYSTAL_COST);
  applyMutation(subject, (item) => {
    const enchants = item.enchants.slice();
    enchants.splice(slot - 1, 1);
    const sealedSlots = (item.sealedSlots ?? [])
      .filter((s) => s !== slot)
      .map((s) => (s > slot ? s - 1 : s));
    return { ...item, enchants, sealedSlots };
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
  // T0 husk has nothing to pop; only Destroy removes the item entirely.
  if (item.enchants.length === 0) return false;
  for (let i = item.enchants.length; i >= 1; i--) {
    if (!isSealed(item, i)) return true;
  }
  return false;
}

export function disenchantTopRefund(item: Item): number {
  return canDisenchantTop(item) ? Math.round(DISENCHANT_REFUND_PER_SLOT * crystalRefundMul()) : 0;
}

export function doDisenchantTop(): void {
  const subject = get(inspector);
  if (!subject || !canDisenchantTop(subject.item)) return;
  let popSlot = -1;
  for (let i = subject.item.enchants.length; i >= 1; i--) {
    if (!isSealed(subject.item, i)) {
      popSlot = i;
      break;
    }
  }
  if (popSlot === -1) return;
  refundCrystals(Math.round(DISENCHANT_REFUND_PER_SLOT * crystalRefundMul()));
  applyMutation(subject, (item) => {
    const enchants = item.enchants.slice();
    enchants.splice(popSlot - 1, 1);
    const sealedSlots = (item.sealedSlots ?? [])
      .filter((s) => s !== popSlot)
      .map((s) => (s > popSlot ? s - 1 : s));
    // Item stays as a T0 husk when fully disenchanted - only Destroy removes
    // it entirely. Re-Enchant fills it from scratch.
    return { ...item, enchants, sealedSlots };
  });
}

// === Destroy ========================================================
export function destroyRefund(item: Item): number {
  return Math.round(
    (DESTROY_BASE_REFUND + item.enchants.length * DESTROY_REFUND_PER_SLOT) *
      crystalRefundMul(),
  );
}

export function doDestroy(): void {
  const subject = get(inspector);
  if (!subject) return;
  refundCrystals(destroyRefund(subject.item));
  applyMutation(subject, () => null);
}
