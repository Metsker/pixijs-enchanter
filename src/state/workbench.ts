import { get, writable } from 'svelte/store';
import { run } from './run';
import type { InspectorSubject } from './inspector';
import { inspectItem } from './inspector';
import { updateItemAt } from './backpack';
import { updateEquippedAt } from './inventory';
import { itemPoolFor, pickRandomEnchant } from '../domain/random';
import { isSealed, stackLayerAt, STACK_HEIGHT, type Item } from '../domain/item';
import type { EnchantLayer } from '../domain/enchant';
import { refundCrystals, spendCrystals, spendSeals, topbar } from './topbar';

// Cost tuning placeholders - the catalogue note says numbers tune during
// playtesting; locked here for step 10.
const ADD_ROLL_COST = 30;
const REROLL_ALL_COST = 50;
const LOCK_SELECTED_CRYSTAL_COST = 10;
const DISENCHANT_REFUND_PER_SLOT = 15;
const DESTROY_REFUND_PER_SLOT = 15;

export type ArmedAction = 'lock' | null;

export const workbench = writable<InspectorSubject | null>(null);
export const armed = writable<ArmedAction>(null);

export function openWorkbench(subject: InspectorSubject): void {
  workbench.set(subject);
  armed.set(null);
}

export function closeWorkbench(): void {
  workbench.set(null);
  armed.set(null);
}

// Router: items clicked during a Rest room open the Workbench instead of the
// Inspector (per CONTEXT.md § Inspector: "Inside a Rest room the Inspector
// is replaced by the Workbench").
export function clickItem(subject: InspectorSubject): void {
  const r = get(run);
  if (r.screen === 'rest') {
    openWorkbench(subject);
  } else {
    inspectItem(subject);
  }
}

function applyMutation(subject: InspectorSubject, mutate: (item: Item) => Item | null): Item | null {
  let next: Item | null = null;
  if (subject.source === 'backpack') {
    next = updateItemAt(subject.index, mutate);
  } else {
    next = updateEquippedAt(subject.slotId, mutate);
  }

  if (next === null) {
    // Item was destroyed / depleted to tier 0 - close the workbench.
    closeWorkbench();
  } else {
    // Refresh the subject's item reference so the UI rerenders.
    workbench.set({ ...subject, item: next } as InspectorSubject);
  }
  return next;
}

// === Add (Roll) =====================================================
// Promote the item by one Tier, filling the new slot with a random enchant
// of the alternation-determined layer for that slot. Illegal at tier 6 per
// CONTEXT.md ("already maxed").
export function canAddRoll(item: Item): boolean {
  return item.enchants.length < 6;
}

export function doAddRoll(): void {
  const subject = get(workbench);
  if (!subject || !canAddRoll(subject.item)) return;
  if (!spendCrystals(ADD_ROLL_COST)) return;

  applyMutation(subject, (item) => {
    const nextSlot = item.enchants.length + 1; // 1-indexed
    const layer = stackLayerAt(nextSlot) as EnchantLayer;
    const pool = itemPoolFor(item.itemType);
    const newEnchant = pickRandomEnchant(pool, layer);
    return { ...item, enchants: [...item.enchants, newEnchant] };
  });
}

// === Reroll All =====================================================
// Reroll EVERY enchant on the item; skip sealed slots. Crystals only
// (no Seal cost - that's Reroll Mains/Utilities).
export function canRerollAll(item: Item): boolean {
  return item.enchants.length > 0;
}

export function doRerollAll(): void {
  const subject = get(workbench);
  if (!subject || !canRerollAll(subject.item)) return;
  if (!spendCrystals(REROLL_ALL_COST)) return;

  applyMutation(subject, (item) => {
    const pool = itemPoolFor(item.itemType);
    const enchants = item.enchants.map((current, i) => {
      const slot = i + 1;
      if (isSealed(item, slot)) return current;
      const layer = stackLayerAt(slot) as EnchantLayer;
      return pickRandomEnchant(pool, layer);
    });
    return { ...item, enchants };
  });
}

// === Lock selected (multi-step) =====================================
// Arm the action; player then clicks a non-sealed cell to seal it.
// Costs 1 Seal + crystals on commit.
export function canLockAny(item: Item): boolean {
  return item.enchants.some((_, i) => !isSealed(item, i + 1));
}

export function armLock(): void {
  const subject = get(workbench);
  if (!subject || !canLockAny(subject.item)) return;
  armed.set('lock');
}

export function disarmAction(): void {
  armed.set(null);
}

export function commitLock(slotIndex1Based: number): void {
  const subject = get(workbench);
  if (!subject) return;
  if (slotIndex1Based < 1 || slotIndex1Based > subject.item.enchants.length) return;
  if (isSealed(subject.item, slotIndex1Based)) return;

  // Check both costs upfront before consuming either, so a partial spend
  // can't leave the player short.
  const tb = get(topbar);
  if (tb.seals < 1 || tb.crystals < LOCK_SELECTED_CRYSTAL_COST) {
    armed.set(null);
    return;
  }
  spendSeals(1);
  spendCrystals(LOCK_SELECTED_CRYSTAL_COST);

  applyMutation(subject, (item) => {
    const sealedSlots = [...(item.sealedSlots ?? []), slotIndex1Based].sort((a, b) => a - b);
    return { ...item, sealedSlots };
  });
  armed.set(null);
}

// === Disenchant top =================================================
// Pop the topmost UNSEALED enchant; refund crystals proportional. Tier
// drops by 1; if it hits 0 the item is deleted entirely.
export function canDisenchantTop(item: Item): boolean {
  // Tier 7 not supported here (per spec, only Destroy clears the Unique cell).
  if (item.enchants.length === 0) return false;
  if (item.enchants.length === 7) return false;
  // Need at least one unsealed slot in the 6-stack.
  for (let i = item.enchants.length; i >= 1; i--) {
    if (!isSealed(item, i)) return true;
  }
  return false;
}

export function doDisenchantTop(): void {
  const subject = get(workbench);
  if (!subject || !canDisenchantTop(subject.item)) return;

  // Find topmost unsealed slot index (1-indexed).
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
    // Sealed indices above the popped slot shift down by 1.
    const sealedSlots = (item.sealedSlots ?? [])
      .filter((s) => s !== popSlot)
      .map((s) => (s > popSlot ? s - 1 : s));
    if (enchants.length === 0) return null; // Item destroyed.
    return { ...item, enchants, sealedSlots };
  });
}

// === Destroy ========================================================
// Scrap the entire item including any sealed slots; refund crystals equal
// to disenchanting every slot.
export function doDestroy(): void {
  const subject = get(workbench);
  if (!subject) return;
  const slots = subject.item.enchants.length;
  refundCrystals(slots * DESTROY_REFUND_PER_SLOT);
  applyMutation(subject, () => null);
}
