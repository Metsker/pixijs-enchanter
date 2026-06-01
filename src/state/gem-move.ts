import { get, writable } from 'svelte/store';
import type { Gem } from '../domain/gem';
import { gemLevel } from '../domain/gem';
import { isItem, type Item } from '../domain/item';
import { gemColor, gemFitsSocketAt } from '../domain/gem-fit';
import { equipped, updateEquippedAt } from './inventory';
import {
  backpack,
  findBackpackGemById,
  findBackpackItemById,
  placeGemAtCell,
  updateBackpackGemById,
  updateBackpackItemById,
} from './backpack';
import { inspector, type InspectorSubject } from './inspector';
import { addGemToStash, removeGemFromStashById } from './gem-stash';

// === Held-gem move / reorder ========================================
//
// Picking a gem up lifts it out of its origin (a socket, leaving null behind,
// or the stash, removing it) into `heldGem`. Placing it drops it into a target
// socket: an empty socket simply takes it; an occupied socket SWAPS - the old
// occupant flows back to the held gem's origin (the socket it came from, or
// the stash). Cancelling returns the held gem to its origin untouched.
//
// A gem may only enter a socket whose COLOUR matches the gem's colour
// (gemFitsSocketAt); a colour mismatch is a no-op (the gem stays held).
//
// All socket edits are written back immutably to wherever the item lives -
// the equipped store (so playerEffects / playerProcs / playerProfile, all
// derived from `equipped`, re-derive) or the backpack - and the open Inspector
// subject is kept in sync so its rendered sockets match.

export type HeldFrom =
  | { kind: 'stash' }
  | { kind: 'socket'; itemId: string; index: number };

export interface HeldGem {
  gem: Gem;
  from: HeldFrom;
}

export const heldGem = writable<HeldGem | null>(null);

// Drop any held gem WITHOUT trying to return it to an origin. Used on a full
// run wipe (startNewRun), where the origin item and the stash are being reset
// anyway - cancelHeld would otherwise dump the gem into the freshly-reset
// stash and leak it into the new run.
export function resetHeldGem(): void {
  heldGem.set(null);
}

// Place the held gem into a SPECIFIC backpack cell (drag-reorder within the
// bag). The gem was already lifted out of its origin by the pickup, so dropping
// it onto an empty cell moves it there, and onto an occupied cell swaps the
// occupant into the vacated space. Returns true if it landed.
export function placeHeldGemIntoBackpackCell(index: number): boolean {
  const held = get(heldGem);
  if (!held) return false;
  if (placeGemAtCell(held.gem, index) === -1) return false;
  heldGem.set(null);
  return true;
}

// --- item write-back ----------------------------------------------------

// Rewrite `item`'s socket list and persist the result to wherever the item
// currently lives, keeping the open Inspector subject pointed at the fresh
// item. We locate the item BY ID against the equipped slots and the backpack
// store (not the inspector subject), so an edit lands on the right store even
// when the currently-inspected item is a DIFFERENT one - which happens during
// a cross-item move (pick from item A, switch the Inspector to item B, place,
// and the displaced occupant flows back to A). An item not found in either
// store is edited only on the returned value (no store touched) so callers
// stay total.
//
function writeBackSockets(item: Item, sockets: (Gem | null)[]): Item {
  return writeItem({ ...item, sockets });
}

// Persist a fully-updated Item (any fields) to wherever it lives, keeping the
// open Inspector in sync. Used by writeBackSockets and by editors that change
// more than the socket list in one step - e.g. adding a socket, which appends
// to socketColors AND sockets together, so both must land in one transition
// (see rest.ts § addSocketToItem).
//
// We locate the item BY ID against the equipped slots and the backpack store
// (not the inspector subject), so an edit lands on the right store even when
// the currently-inspected item is a DIFFERENT one. An item not found in either
// store is edited only on the returned value (no store touched) so callers
// stay total.
export function writeItem(next: Item): Item {
  // Equipped: find the slot holding this item id and mutate it there. This
  // re-derives playerEffects / playerProcs / playerProfile.
  const eq = get(equipped);
  for (const [slotId, eqItem] of Object.entries(eq)) {
    if (eqItem && eqItem.id === next.id) {
      updateEquippedAt(slotId as keyof typeof eq, () => next);
      syncInspector(next);
      return next;
    }
  }

  // Backpack: find the tile holding this item id (wherever it sits) and mutate
  // it there. By-id so it works for any backpack item, not just the inspected
  // one, and survives backpack reorders / sorts mid-move.
  if (updateBackpackItemById(next.id, () => next)) {
    syncInspector(next);
    return next;
  }

  // Fallback: not in a known editable location. Still keep the inspector in
  // sync if it is showing this item, so the UI doesn't go stale.
  syncInspector(next);
  return next;
}

// Repoint the open Inspector subject at `item` if it is currently showing the
// same item id, so its rendered sockets reflect the edit.
function syncInspector(item: Item): void {
  inspector.update((subj): InspectorSubject | null => {
    if (!subj || subj.item.id !== item.id) return subj;
    return { ...subj, item };
  });
}

// --- pick up ------------------------------------------------------------

// Pick the gem out of `item`'s socket `index`, leaving null behind. No-op if
// the socket is empty or a gem is already held.
export function pickUpFromSocket(item: Item, index: number): void {
  if (get(heldGem)) return;
  const gem = item.sockets[index];
  if (!gem) return;
  const sockets = item.sockets.slice();
  sockets[index] = null;
  writeBackSockets(item, sockets);
  heldGem.set({ gem, from: { kind: 'socket', itemId: item.id, index } });
}

// Pick a loose gem out of the stash. No-op if a gem is already held or the id
// isn't in the stash.
export function pickUpFromStash(gemId: string): void {
  if (get(heldGem)) return;
  const gem = removeGemFromStashById(gemId);
  if (!gem) return;
  heldGem.set({ gem, from: { kind: 'stash' } });
}

// Pick a loose gem out of the backpack (which is now the stash). Identical to
// pickUpFromStash - removeGemFromStashById already targets the backpack - but
// named for the drag layer's source kind for clarity at the call site.
export function pickUpFromBackpack(gemId: string): void {
  pickUpFromStash(gemId);
}

// --- place --------------------------------------------------------------

// Return the held gem's displaced occupant to the held gem's origin. The
// origin socket may belong to `placedItem` (reorder within one item), in which
// case we write into the already-updated socket list; otherwise we resolve the
// origin item by id from the equipped / backpack stores.
function returnOccupantToOrigin(
  occupant: Gem,
  from: HeldFrom,
  placedItem: Item,
  placedSockets: (Gem | null)[],
): void {
  if (from.kind === 'stash') {
    addGemToStash(occupant);
    return;
  }
  // from.kind === 'socket'
  if (from.itemId === placedItem.id) {
    // Same item (reorder): drop the occupant into the origin socket of the
    // socket list we're about to write back.
    placedSockets[from.index] = occupant;
    return;
  }
  // Different item: resolve and edit it independently.
  const originItem = findItemById(from.itemId);
  if (!originItem) {
    // Origin item is gone (shouldn't happen mid-move); stash the occupant so
    // it isn't lost.
    addGemToStash(occupant);
    return;
  }
  const originSockets = originItem.sockets.slice();
  originSockets[from.index] = occupant;
  writeBackSockets(originItem, originSockets);
}

// Place the held gem into `item`'s socket `index`. Rejected (gem stays held)
// if no gem is held or the gem's colour doesn't match that socket. An empty
// target socket takes the gem; an occupied one swaps, sending the occupant
// back to the held gem's origin.
export function placeIntoSocket(item: Item, index: number): void {
  const held = get(heldGem);
  if (!held) return;
  if (!gemFitsSocketAt(held.gem, item, index)) return; // colour mismatch: reject.

  const sockets = item.sockets.slice();
  const occupant = sockets[index] ?? null;
  sockets[index] = held.gem;

  if (occupant) {
    returnOccupantToOrigin(occupant, held.from, item, sockets);
  }

  writeBackSockets(item, sockets);
  heldGem.set(null);
}

// Place the held gem into the stash (un-socket it). No-op if nothing is held.
export function placeIntoStash(): void {
  const held = get(heldGem);
  if (!held) return;
  addGemToStash(held.gem);
  heldGem.set(null);
}

// One-shot: pull the gem out of `item`'s socket `index` straight into the bag -
// the inverse of socketing (the gem inspector's Unsocket button). Persists for
// equipped / backpack / reward items via writeBackSockets. No-op on an empty
// socket. The bag is unrestricted, so it always lands.
export function unsocketGemToBag(item: Item, index: number): boolean {
  const gem = item.sockets[index];
  if (!gem) return false;
  const sockets = item.sockets.slice();
  sockets[index] = null;
  writeBackSockets(item, sockets);
  addGemToStash(gem);
  return true;
}

// --- combine (level up) -------------------------------------------------
//
// Dropping a held gem onto ANOTHER gem of the same defId combines them
// additively: the target gem's level becomes targetLevel + heldLevel, and the
// held gem is consumed. The held gem was already lifted out of its origin by
// the pickup, so consuming it is just clearing `heldGem`. This overrides the
// normal swap / stash behaviour, but only when defIds match (see FEATURE 1).

// True if the held gem can combine into `target` (same defId, distinct
// instances). Order-independent so the drag layer can pre-check a drop.
export function canCombine(held: Gem, target: Gem): boolean {
  return held.id !== target.id && held.defId === target.defId;
}

// Combine the held gem into the gem occupying `item`'s socket `index`. No-op
// (returns false) if nothing is held, the socket is empty, or the defIds
// differ. On success the socket gem levels up and the held gem is consumed.
export function combineIntoSocket(item: Item, index: number): boolean {
  const held = get(heldGem);
  if (!held) return false;
  const target = item.sockets[index];
  if (!target || !canCombine(held.gem, target)) return false;

  const sockets = item.sockets.slice();
  sockets[index] = { ...target, level: gemLevel(target) + gemLevel(held.gem) };
  writeBackSockets(item, sockets);
  heldGem.set(null);
  return true;
}

// Combine the held gem into a loose backpack gem by instance id. No-op
// (returns false) if nothing is held, the target isn't in the backpack, or the
// defIds differ. On success the backpack gem levels up and the held gem is
// consumed.
export function combineIntoBackpackGem(targetGemId: string): boolean {
  const held = get(heldGem);
  if (!held) return false;
  const target = findBackpackGemById(targetGemId);
  if (!target || !canCombine(held.gem, target)) return false;

  updateBackpackGemById(targetGemId, (g) => ({
    ...g,
    level: gemLevel(g) + gemLevel(held.gem),
  }));
  heldGem.set(null);
  return true;
}

// Auto-socket: place the held gem into `item`'s FIRST EMPTY socket whose
// COLOUR matches the gem, then return true. If no empty socket of the gem's
// colour exists, the placement is rejected: the held gem is returned to its
// origin (cancelHeld) and false is returned. Drives the "drag a gem onto an
// equipped item slot" interaction (decision 2).
export function placeHeldIntoItemFirstEmpty(item: Item): boolean {
  const held = get(heldGem);
  if (!held) return false;
  const color = gemColor(held.gem);
  if (!color) {
    cancelHeld();
    return false;
  }
  const emptyIndex = item.sockets.findIndex(
    (s, i) => s === null && item.socketColors[i] === color,
  );
  if (emptyIndex === -1) {
    cancelHeld();
    return false;
  }
  placeIntoSocket(item, emptyIndex);
  return true;
}

// Return the held gem to wherever it was picked up from, undoing the pickup.
export function cancelHeld(): void {
  const held = get(heldGem);
  if (!held) return;
  if (held.from.kind === 'stash') {
    addGemToStash(held.gem);
  } else {
    const originItem = findItemById(held.from.itemId);
    if (originItem) {
      const sockets = originItem.sockets.slice();
      sockets[held.from.index] = held.gem;
      writeBackSockets(originItem, sockets);
    } else {
      // Origin item vanished: park the gem in the stash rather than lose it.
      addGemToStash(held.gem);
    }
  }
  heldGem.set(null);
}

// --- helpers ------------------------------------------------------------

// Find an item by id across the equipped slots and the backpack store.
// Addressed by id (not by inspector subject / tile index) so an origin item
// stays resolvable after the Inspector has switched to a different item during
// a cross-item move. Returns null if the item is in neither store.
function findItemById(itemId: string): Item | null {
  const eq = get(equipped);
  for (const eqItem of Object.values(eq)) {
    if (eqItem && eqItem.id === itemId) return eqItem;
  }
  return findBackpackItemById(itemId);
}

// --- direct socketing (gem inspector "Fits these items" -> Insert) ----------
//
// A non-drag path: socket a gem straight into a target item from the gem
// inspector, without going through heldGem (so it can never strand a held gem).

// Every item the player OWNS and can edit: equipped + backpack. Shop / item-
// offer items are excluded - they aren't owned, and writeItem can't persist
// edits to them - so the inspector only offers Insert for these.
function ownedItems(): Item[] {
  const out: Item[] = [];
  for (const it of Object.values(get(equipped))) if (it) out.push(it);
  for (const s of get(backpack)) if (isItem(s)) out.push(s);
  return out;
}

// Pull a gem (by instance id) out of wherever it currently lives - a loose
// backpack gem, or a socket of any owned item - returning it (or null if not
// found). The origin store is updated in place.
function takeGemFromAnySource(gemId: string): Gem | null {
  const fromBag = removeGemFromStashById(gemId);
  if (fromBag) return fromBag;
  for (const item of ownedItems()) {
    const idx = item.sockets.findIndex((s) => s?.id === gemId);
    if (idx !== -1) {
      const gem = item.sockets[idx] as Gem;
      const sockets = item.sockets.slice();
      sockets[idx] = null;
      writeBackSockets(item, sockets);
      return gem;
    }
  }
  return null;
}

// Find a gem the player owns by instance id: a loose backpack gem, or one
// socketed in any owned item. Used to refresh the gem inspector after a combine
// and to resolve combine targets / sources.
export function findOwnedGemById(gemId: string): Gem | null {
  const bagGem = findBackpackGemById(gemId);
  if (bagGem) return bagGem;
  for (const item of ownedItems()) {
    const g = item.sockets.find((s) => s?.id === gemId);
    if (g) return g;
  }
  return null;
}

// Socket `gem` into `targetItem`'s first empty colour-matched socket, pulling it
// out of its current home first. Drives the gem inspector's "Fits these items
// -> Insert" action. Returns true if it landed; on failure the gem is parked in
// the stash so it can never be lost. Only OWNED targets persist - callers gate
// the Insert button to those.
export function socketGemIntoItem(gem: Gem, targetItem: Item): boolean {
  const color = gemColor(gem);
  if (!color) return false;
  const removed = takeGemFromAnySource(gem.id);
  if (!removed) return false;
  // Re-resolve the target by id (it may have just been mutated if `gem` was
  // socketed in it), then drop into its first empty matching socket.
  const fresh = findItemById(targetItem.id) ?? targetItem;
  const idx = fresh.sockets.findIndex((s, i) => s === null && fresh.socketColors[i] === color);
  if (idx === -1) {
    addGemToStash(removed);
    return false;
  }
  const sockets = fresh.sockets.slice();
  sockets[idx] = removed;
  writeBackSockets(fresh, sockets);
  return true;
}

// Socket a loose BAG gem into a SPECIFIC socket index of an owned item - the
// non-drag path behind the item inspector's "tap an empty socket -> pick a gem"
// dropdown. Rejected (returns false) if the gem isn't loose in the bag, the
// target socket is filled, or the gem's colour doesn't match that socket. On
// success the gem leaves the bag and lands in exactly that socket.
export function socketBagGemIntoSocket(gem: Gem, targetItem: Item, index: number): boolean {
  const color = gemColor(gem);
  if (!color) return false;
  const fresh = findItemById(targetItem.id) ?? targetItem;
  if (index < 0 || index >= fresh.sockets.length) return false;
  if (fresh.sockets[index] !== null) return false; // socket must be empty
  if (fresh.socketColors[index] !== color) return false; // colour must match
  const removed = removeGemFromStashById(gem.id);
  if (!removed) return false; // not a loose bag gem
  const sockets = fresh.sockets.slice();
  sockets[index] = removed;
  writeBackSockets(fresh, sockets);
  return true;
}

// --- combine two owned gems (gem inspector "Combine to level up") -----------
//
// A non-drag combine: merge the gem `sourceId` INTO `targetId` (same defId,
// distinct instances, both owned). The target's level rises by the source's
// level and the source is consumed from wherever it lives. Mirrors the additive
// drag-combine (combineIntoSocket / combineIntoBackpackGem) but addresses both
// gems by id so the inspector can drive it from its "Combine" buttons.

// Raise the level of the owned gem `gemId` by `plus`, wherever it lives (a loose
// bag gem, or socketed in an owned item). Returns true if it was found + bumped.
function bumpOwnedGemLevel(gemId: string, plus: number): boolean {
  if (updateBackpackGemById(gemId, (g) => ({ ...g, level: gemLevel(g) + plus }))) return true;
  for (const item of ownedItems()) {
    const idx = item.sockets.findIndex((s) => s?.id === gemId);
    if (idx !== -1) {
      const sockets = item.sockets.slice();
      const g = sockets[idx] as Gem;
      sockets[idx] = { ...g, level: gemLevel(g) + plus };
      writeBackSockets(item, sockets);
      return true;
    }
  }
  return false;
}

// Combine `sourceId` into `targetId`. Returns the leveled-up target gem on
// success (so the caller can re-point the inspector at it), or null if the
// combine couldn't apply (different defId, missing gem, etc.). On failure no
// state is changed; on a partial failure the pulled source is parked in the bag
// so it is never lost.
export function combineGems(targetId: string, sourceId: string): Gem | null {
  if (targetId === sourceId) return null;
  const target = findOwnedGemById(targetId);
  const source = findOwnedGemById(sourceId);
  if (!target || !source || target.defId !== source.defId) return null;
  const removed = takeGemFromAnySource(sourceId);
  if (!removed) return null;
  if (!bumpOwnedGemLevel(targetId, gemLevel(removed))) {
    addGemToStash(removed); // target vanished mid-combine - don't lose the source
    return null;
  }
  return findOwnedGemById(targetId);
}
