import { get, writable } from 'svelte/store';
import type { Gem } from '../domain/gem';
import type { Item } from '../domain/item';
import { gemFitsSocketOf } from '../domain/gem-fit';
import { equipped, updateEquippedAt } from './inventory';
import { updateItemAt } from './backpack';
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
// A gem may only enter a socket whose item class matches the gem's class
// (gemFitsSocketOf); a class mismatch is a no-op (the gem stays held).
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

// --- item write-back ----------------------------------------------------

// Rewrite `item`'s socket list and persist the result to wherever the item
// currently lives, keeping the open Inspector subject pointed at the fresh
// item. We locate the item by id against the equipped slots and the open
// inspector subject; an item not found in either is edited in place only on
// the returned value (no store touched) so callers stay total.
function writeBackSockets(item: Item, sockets: (Gem | null)[]): Item {
  const next: Item = { ...item, sockets };

  // Equipped: find the slot holding this item id and mutate it there. This
  // re-derives playerEffects / playerProcs / playerProfile.
  const eq = get(equipped);
  for (const [slotId, eqItem] of Object.entries(eq)) {
    if (eqItem && eqItem.id === item.id) {
      updateEquippedAt(slotId as keyof typeof eq, () => next);
      syncInspector(next);
      return next;
    }
  }

  // Backpack: find the tile holding this item id and mutate it there.
  const subj = get(inspector);
  if (subj && subj.source === 'backpack' && subj.item.id === item.id) {
    updateItemAt(subj.index, () => next);
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
// if no gem is held or the gem's class doesn't fit the item. An empty target
// socket takes the gem; an occupied one swaps, sending the occupant back to
// the held gem's origin.
export function placeIntoSocket(item: Item, index: number): void {
  const held = get(heldGem);
  if (!held) return;
  if (!gemFitsSocketOf(held.gem, item)) return; // class mismatch: reject.

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

// Find an item by id across the equipped slots and the open inspector subject
// (which covers a backpack item being edited). Returns null if not found.
function findItemById(itemId: string): Item | null {
  const eq = get(equipped);
  for (const eqItem of Object.values(eq)) {
    if (eqItem && eqItem.id === itemId) return eqItem;
  }
  const subj = get(inspector);
  if (subj && subj.item.id === itemId) return subj.item;
  return null;
}
