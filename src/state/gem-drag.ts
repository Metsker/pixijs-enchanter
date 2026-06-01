import { get, writable } from 'svelte/store';
import type { Gem } from '../domain/gem';
import { isGem } from '../domain/gem';
import type { Item } from '../domain/item';
import { gemColor, gemFitsSocketAt } from '../domain/gem-fit';
import { equipped } from './inventory';
import type { EquipmentSlotId } from '../domain/equipment';
import { backpack, findBackpackItemById } from './backpack';
import { findRewardItemById } from './rewards';
import {
  canCombine,
  cancelHeld,
  combineIntoBackpackGem,
  combineIntoSocket,
  heldGem,
  pickUpFromBackpack,
  pickUpFromSocket,
  placeHeldGemIntoBackpackCell,
  placeHeldIntoItemFirstEmpty,
  placeIntoSocket,
  placeIntoStash,
} from './gem-move';
import { disenchantHeldGem } from './disenchant';
import { sellHeldGem } from './shop';

// === Pointer-driven gem drag-and-drop ================================
//
// A thin pointer layer over the tested heldGem engine (gem-move.ts). A drag
// begins on pointer-down over a gem (a socketed gem or a loose backpack gem)
// and is GATED by a small move threshold so a tap doesn't start a drag - the
// pickUp only fires once the pointer has actually moved. While dragging, a
// single floating ghost (the gem emoji) follows the pointer (rendered once in
// App.svelte from `activeGemDrag`) and the drop zone under the pointer is
// highlighted. On pointer-up we hit-test elementFromPoint and route:
//
//   - a socket cell ([data-gem-socket] + item id + index) -> placeIntoSocket
//   - an equipped item slot ([data-slot-id]) -> auto-socket into its first
//     empty compatible socket (placeHeldIntoItemFirstEmpty), else reject
//   - a backpack cell ([data-cell-index]) or the Gems split's padding
//     ([data-gem-stash]) -> placeIntoStash (the backpack is the stash)
//   - anything else -> cancelHeld (return the gem to its origin)
//
// All swap / write-back / Inspector-sync logic lives in gem-move; this module
// never duplicates it.

// Where a drag was initiated from. Mirrors the heldGem origin kinds.
export type GemDragSource =
  | { kind: 'socket'; item: Item; index: number }
  | { kind: 'backpack'; gemId: string };

// Snapshot the live ghost needs: the dragged gem and the current pointer
// position. `valid` flags whether the drop zone under the pointer would accept
// the gem, so the ghost / zone can read as a go / no-go.
export interface ActiveGemDrag {
  gem: Gem;
  x: number;
  y: number;
  valid: boolean;
}

// Null until the move threshold is crossed (the pickUp has fired). The ghost
// overlay in App.svelte subscribes to this.
export const activeGemDrag = writable<ActiveGemDrag | null>(null);

// The data-attribute id of the drop zone currently under the pointer, so a
// cell / slot can highlight itself while armed. Format: `socket:<itemId>:<i>`,
// `slot:<slotId>`, `stash`, `backpack`, or null for no valid zone.
export const gemDropZone = writable<string | null>(null);

// 10px threshold (squared), matching Backpack.svelte's item-reorder drag, so a
// click with minor jitter is treated as a tap rather than a drag.
const DRAG_THRESHOLD_SQ = 100;

interface DragSession {
  source: GemDragSource;
  startX: number;
  startY: number;
  pickedUp: boolean;
  pointerId: number;
  // Invoked on pointer-up if the gesture never crossed the drag threshold (a
  // tap, not a drag) - lets a call site open the gem inspector on tap while the
  // same press still starts a drag once it moves.
  onTap?: () => void;
}

let session: DragSession | null = null;

// Resolve an item by id across the equipped slots, the backpack, and the
// victory chest (reward items are editable in the Inspector), so a drop onto a
// socket / slot can locate the live item to edit.
function resolveItemById(itemId: string): Item | null {
  const eq = get(equipped);
  for (const eqItem of Object.values(eq)) {
    if (eqItem && eqItem.id === itemId) return eqItem;
  }
  return findBackpackItemById(itemId) ?? findRewardItemById(itemId);
}

// What the gem under the pointer would do if dropped here, used both to set the
// ghost's valid flag during the move and to route on pointer-up. Returns a
// resolved target plus a `valid` flag (a stash drop is always valid; a socket
// drop is valid only if the gem's colour matches that socket; a slot drop is
// valid only if the item has an empty socket of the gem's colour).
type DropTarget =
  // A socket holding a same-defId gem: combine (level up) overrides swap.
  | { kind: 'combine-socket'; item: Item; index: number; valid: true }
  // A backpack cell holding a same-defId loose gem: combine (level up).
  | { kind: 'combine-backpack'; gemId: string; valid: true }
  | { kind: 'socket'; item: Item; index: number; valid: boolean }
  | { kind: 'slot'; item: Item; valid: boolean }
  | { kind: 'trash'; valid: true }
  // The shop's Sell drop-zone: sell the gem for gold (only present while shopping).
  | { kind: 'sell'; valid: true }
  // A specific backpack cell: move/reorder the gem THERE (not "first empty").
  | { kind: 'backpack-cell'; index: number; valid: true }
  | { kind: 'stash'; valid: true }
  | { kind: 'none' };

function hitTest(x: number, y: number, gem: Gem): DropTarget {
  const el = document.elementFromPoint(x, y);
  if (!el) return { kind: 'none' };

  // Trash cell: disenchant for crystals (FEATURE 2). Highest priority so a
  // trash tile is never mistaken for a backpack cell.
  if ((el as Element).closest('[data-trash]')) {
    return { kind: 'trash', valid: true };
  }

  // Shop Sell drop-zone (gold). Only rendered while a shop is open.
  if ((el as Element).closest('[data-sell]')) {
    return { kind: 'sell', valid: true };
  }

  // Socket cell: explicit gem-socket marker carrying its item id + index.
  const socketEl = (el as Element).closest<HTMLElement>('[data-gem-socket]');
  if (socketEl) {
    const itemId = socketEl.dataset.itemId ?? '';
    const index = Number(socketEl.dataset.socketIndex);
    const item = resolveItemById(itemId);
    if (item && Number.isInteger(index)) {
      // Same-defId occupant -> combine (level up) instead of swap.
      const occupant = item.sockets[index];
      if (occupant && canCombine(gem, occupant)) {
        return { kind: 'combine-socket', item, index, valid: true };
      }
      return { kind: 'socket', item, index, valid: gemFitsSocketAt(gem, item, index) };
    }
  }

  // Equipped item slot: auto-socket into its first empty compatible socket.
  const slotEl = (el as Element).closest<HTMLElement>('[data-slot-id]');
  if (slotEl) {
    const slotId = (slotEl.dataset.slotId ?? '') as EquipmentSlotId;
    const eqItem = get(equipped)[slotId];
    if (eqItem) {
      const color = gemColor(gem);
      const hasEmptyFit =
        color !== null &&
        eqItem.sockets.some((s, i) => s === null && eqItem.socketColors[i] === color);
      return { kind: 'slot', item: eqItem, valid: hasEmptyFit };
    }
  }

  // Backpack cell: a same-defId loose gem -> combine; otherwise -> stash. Only
  // cells inside the Gems split ([data-gem-stash]) count - the Items split shows
  // the SAME shared empty slots, so without this gate a gem would target (and
  // highlight) the identical cell index in both bags at once.
  const cellEl = (el as Element).closest<HTMLElement>('[data-cell-index]');
  if (cellEl && cellEl.closest('[data-gem-stash]')) {
    const cellIndex = Number(cellEl.dataset.cellIndex);
    const slot = Number.isInteger(cellIndex) ? get(backpack)[cellIndex] : null;
    if (isGem(slot) && canCombine(gem, slot)) {
      return { kind: 'combine-backpack', gemId: slot.id, valid: true };
    }
    // Move the gem into THIS cell (reorder within the bag), displacing any
    // occupant. Falls back to a generic stash drop if the index is malformed.
    if (Number.isInteger(cellIndex)) {
      return { kind: 'backpack-cell', index: cellIndex, valid: true };
    }
    return { kind: 'stash', valid: true };
  }

  // Gems-split panel padding (not a specific cell): drop to un-socket / stash.
  // Checked AFTER cells so a drop onto a gem cell still combines / reorders.
  if ((el as Element).closest('[data-gem-stash]')) {
    return { kind: 'stash', valid: true };
  }

  return { kind: 'none' };
}

function zoneIdOf(target: DropTarget): string | null {
  switch (target.kind) {
    case 'combine-socket':
      return `socket:${target.item.id}:${target.index}`;
    case 'combine-backpack':
      return `combine:${target.gemId}`;
    case 'socket':
      return `socket:${target.item.id}:${target.index}`;
    case 'slot':
      return `slot:${target.item.id}`;
    case 'trash':
      return 'trash';
    case 'sell':
      return 'sell';
    case 'backpack-cell':
      // Carry the cell index so ONLY the hovered cell highlights (like the item
      // drag's per-cell `dragOver`), not every cell sharing a generic 'stash' id.
      return `backpack-cell:${target.index}`;
    case 'stash':
      return 'stash';
    case 'none':
      return null;
  }
}

function onPointerMove(e: PointerEvent): void {
  if (!session || e.pointerId !== session.pointerId) return;

  if (!session.pickedUp) {
    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;
    if (dx * dx + dy * dy <= DRAG_THRESHOLD_SQ) return;
    // Threshold crossed: lift the gem out of its origin now.
    if (session.source.kind === 'socket') {
      pickUpFromSocket(session.source.item, session.source.index);
    } else {
      pickUpFromBackpack(session.source.gemId);
    }
    if (!get(heldGem)) {
      // Pickup failed (e.g. empty socket / id gone). Abort the session.
      endSession();
      return;
    }
    session.pickedUp = true;
  }

  const held = get(heldGem);
  if (!held) return;
  const target = hitTest(e.clientX, e.clientY, held.gem);
  const valid = target.kind !== 'none' && target.valid;
  gemDropZone.set(valid ? zoneIdOf(target) : null);
  activeGemDrag.set({ gem: held.gem, x: e.clientX, y: e.clientY, valid });
}

function onPointerUp(e: PointerEvent): void {
  if (!session || e.pointerId !== session.pointerId) return;
  const didPickUp = session.pickedUp;
  const onTap = session.onTap;
  endSession();
  if (!didPickUp) {
    // A tap, not a drag (the gem was never lifted): fire the tap action - e.g.
    // open the gem inspector - instead of moving anything.
    onTap?.();
    return;
  }

  const held = get(heldGem);
  if (!held) return;

  const target = hitTest(e.clientX, e.clientY, held.gem);
  switch (target.kind) {
    case 'combine-socket':
      // Same-defId occupant: combine (level up). Falls back to a cancel if the
      // combine somehow can't apply (gem stays safe in its origin).
      if (!combineIntoSocket(target.item, target.index)) cancelHeld();
      break;
    case 'combine-backpack':
      if (!combineIntoBackpackGem(target.gemId)) cancelHeld();
      break;
    case 'socket':
      // placeIntoSocket itself rejects a class mismatch (gem stays held), so
      // fall through to a cancel if the drop wasn't valid.
      if (target.valid) placeIntoSocket(target.item, target.index);
      else cancelHeld();
      break;
    case 'slot':
      // Auto-socket; placeHeldIntoItemFirstEmpty returns the gem to origin if
      // there's no empty compatible socket.
      placeHeldIntoItemFirstEmpty(target.item);
      break;
    case 'trash':
      // Disenchant the held gem for crystals (FEATURE 2). The gem was already
      // lifted out of its origin, so disenchantHeldGem just consumes + refunds.
      disenchantHeldGem();
      break;
    case 'sell':
      // Sell the held gem to the shop for gold (the gem was already lifted out).
      sellHeldGem();
      break;
    case 'backpack-cell':
      // Reorder within the bag: move the gem into this specific cell.
      if (!placeHeldGemIntoBackpackCell(target.index)) cancelHeld();
      break;
    case 'stash':
      placeIntoStash();
      break;
    case 'none':
      cancelHeld();
      break;
  }
}

function endSession(): void {
  session = null;
  activeGemDrag.set(null);
  gemDropZone.set(null);
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  document.removeEventListener('pointercancel', onPointerUp);
}

// Begin a gem drag from `source` on pointer-down. No gem is lifted until the
// move threshold is crossed (so a tap is not a drag). Returns nothing; the
// document-level move / up listeners drive the rest.
export function startGemDrag(source: GemDragSource, e: PointerEvent, onTap?: () => void): void {
  // If a drag is somehow already live, tear it down first.
  if (session) endSession();
  // A held gem with no live session is a STRANDED leftover - a previous drag
  // whose pointerup never arrived (released off-window, an interrupted gesture,
  // or a dev-time HMR reload that reset `session` but not `heldGem`). Left as-is
  // it blocks every future drag: the gem appears to "lift" but nothing follows
  // the pointer. Recover by returning it to its origin, then start fresh.
  if (get(heldGem)) {
    cancelHeld();
    if (get(heldGem)) return; // cancelHeld should clear it; bail defensively if not.
  }

  session = {
    source,
    startX: e.clientX,
    startY: e.clientY,
    pickedUp: false,
    pointerId: e.pointerId,
    onTap,
  };
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
}

// True while a gem drag is in progress (the gem has actually been lifted). Lets
// UI suppress competing interactions (e.g. tap-to-inspect) during a drag.
export function isGemDragActive(): boolean {
  return session?.pickedUp ?? false;
}
