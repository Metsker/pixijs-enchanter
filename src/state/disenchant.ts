// Disenchant (FEATURE 2: the bag's trash slot). Dropping a gem or an item on
// the 🗑️ trash destroys it INSTANTLY (no confirmation) for crystals. This is a
// general action - NOT Rest-gated - so it lives in its own state module rather
// than in rest.ts. Crystals come back via topbar.refundCrystals.
//
// Refund formulas (placeholders, tuned alongside rest.ts's DESTROY_REFUND):
//   gem  -> DESTROY_REFUND * gemLevel               (a Lv3 gem refunds 3x)
//   item -> itemBaseRefund(tier) + Σ gem refunds    (destroy EVERYTHING: the
//           item AND every gem still socketed in it)
//   itemBaseRefund(tier) = ITEM_REFUND_PER_TIER * tier

import { get } from 'svelte/store';
import { gemLevel, type Gem } from '../domain/gem';
import { isItem, tierOf, type Item } from '../domain/item';
import { addGemToBackpack, backpack, removeBackpackGemById, removeItem } from './backpack';
import { equipped, updateEquippedAt } from './inventory';
import { heldGem, writeItem } from './gem-move';
import { DESTROY_REFUND } from './rest';
import { refundCrystals } from './topbar';
import { inspector } from './inspector';
import { gemInspector } from './gem-inspector';
import type { EquipmentSlotId } from '../domain/equipment';

// Destroying an item / gem from ANYWHERE (bag row, equipment drag, an inspector
// button, the destroy prompt) routes through the functions below, so closing the
// matching inspector here covers every path at once: a pane never lingers showing
// a thing that no longer exists.
function closeItemInspectorIf(itemId: string): void {
  if (get(inspector)?.item.id === itemId) inspector.set(null);
}
function closeGemInspectorIf(gemIds: Set<string>): void {
  const showing = get(gemInspector)?.gem.id;
  if (showing && gemIds.has(showing)) gemInspector.set(null);
}
// The ids of every gem socketed in `item` (for closing a gem inspector that is
// showing one of them when the whole item is scrapped).
function socketedGemIds(item: Item): Set<string> {
  return new Set(item.sockets.filter((g): g is Gem => g !== null).map((g) => g.id));
}

// Crystal value of an item's bare tier (before its socketed gems are added).
export const ITEM_REFUND_PER_TIER = 10;

// Crystals returned for scrapping a single gem (scales with its level).
export function gemRefund(gem: Gem): number {
  return DESTROY_REFUND * gemLevel(gem);
}

// Crystals returned for scrapping an item: its tier value plus every gem still
// socketed in it (user chose DESTROY EVERYTHING - the gems go too).
export function itemRefund(item: Item): number {
  const base = ITEM_REFUND_PER_TIER * tierOf(item);
  const gems = item.sockets.reduce((sum, s) => sum + (s ? gemRefund(s) : 0), 0);
  return base + gems;
}

// Disenchant a loose gem sitting in the backpack, by instance id. Removes it
// and refunds crystals. Returns true if a gem was found + scrapped.
export function disenchantGemFromBackpack(gemId: string): boolean {
  const removed = removeBackpackGemById(gemId);
  if (!removed) return false;
  refundCrystals(gemRefund(removed));
  closeGemInspectorIf(new Set([gemId]));
  return true;
}

// Disenchant a gem that is SOCKETED in an owned item: clear its socket (persisted
// via writeItem, so the equipped / backpack store + any open inspector re-derive)
// and refund its crystal value. The gem is DESTROYED, not returned to the bag -
// that distinguishes it from Unsocket. Returns false on an empty socket.
export function disenchantSocketedGem(item: Item, index: number): boolean {
  const gem = item.sockets[index];
  if (!gem) return false;
  const sockets = item.sockets.slice();
  sockets[index] = null;
  writeItem({ ...item, sockets });
  refundCrystals(gemRefund(gem));
  closeGemInspectorIf(new Set([gem.id]));
  return true;
}

// Disenchant the currently HELD gem (it was already lifted out of its origin by
// the drag pickup). Refunds crystals and consumes the gem. Returns true if a
// gem was held.
export function disenchantHeldGem(): boolean {
  const held = get(heldGem);
  if (!held) return false;
  refundCrystals(gemRefund(held.gem));
  heldGem.set(null);
  closeGemInspectorIf(new Set([held.gem.id]));
  return true;
}

// Disenchant the item at backpack `index` (and its socketed gems). Refunds the
// combined crystal value and clears the tile. Returns true if an item was
// scrapped.
export function disenchantItemFromBackpack(index: number): boolean {
  const slot = get(backpack)[index];
  if (!isItem(slot)) return false;
  const refund = itemRefund(slot);
  removeItem(index);
  refundCrystals(refund);
  closeItemInspectorIf(slot.id);
  closeGemInspectorIf(socketedGemIds(slot)); // its gems go too
  return true;
}

// --- "keep the gems" destroy --------------------------------------------
//
// When the player destroys an item that still holds gems, they can choose to
// SAVE the gems: each socketed gem drops loose into the backpack, then only the
// bare frame is scrapped (so the crystal refund is the tier value alone, since
// the gems weren't melted down).

// Pull every gem out of `item` into the backpack's loose slots.
function detachGemsToBackpack(item: Item): void {
  for (const gem of item.sockets) if (gem) addGemToBackpack(gem);
}

const bareFrameRefund = (item: Item): number => ITEM_REFUND_PER_TIER * tierOf(item);

// Destroy a backpack item but KEEP its gems (detach to the bag first). Frees the
// item's tile first so a detached gem can reuse it if the bag is otherwise full.
export function destroyBackpackItemKeepGems(index: number): boolean {
  const item = get(backpack)[index];
  if (!isItem(item)) return false;
  removeItem(index);
  detachGemsToBackpack(item);
  refundCrystals(bareFrameRefund(item));
  closeItemInspectorIf(item.id);
  // The gems are KEPT (detached to the bag), so a gem inspector showing one of
  // them stays open - that gem still exists.
  return true;
}

// Disenchant the item equipped in `slotId` (and its socketed gems). Refunds the
// combined crystal value and empties the slot. Returns true if an item was
// scrapped.
export function disenchantEquipped(slotId: EquipmentSlotId): boolean {
  const item = get(equipped)[slotId];
  if (!item) return false;
  const refund = itemRefund(item);
  updateEquippedAt(slotId, () => null);
  refundCrystals(refund);
  closeItemInspectorIf(item.id);
  closeGemInspectorIf(socketedGemIds(item)); // its gems go too
  return true;
}
