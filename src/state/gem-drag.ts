import { get, writable } from 'svelte/store';
import type { Gem } from '../domain/gem';
import type { Item } from '../domain/item';
import { gemFitsSocketOf } from '../domain/gem-fit';
import { equipped } from './inventory';
import type { EquipmentSlotId } from '../domain/equipment';
import { findBackpackItemById } from './backpack';
import {
  cancelHeld,
  heldGem,
  pickUpFromBackpack,
  pickUpFromSocket,
  placeHeldIntoItemFirstEmpty,
  placeIntoSocket,
  placeIntoStash,
} from './gem-move';

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
//   - a backpack cell ([data-cell-index]) or the Inspector stash
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
}

let session: DragSession | null = null;

// Resolve an item by id across the equipped slots and the backpack, so a drop
// onto a socket / slot can locate the live item to edit.
function resolveItemById(itemId: string): Item | null {
  const eq = get(equipped);
  for (const eqItem of Object.values(eq)) {
    if (eqItem && eqItem.id === itemId) return eqItem;
  }
  return findBackpackItemById(itemId);
}

// What the gem under the pointer would do if dropped here, used both to set the
// ghost's valid flag during the move and to route on pointer-up. Returns a
// resolved target plus a `valid` flag (a stash drop is always valid; a socket /
// slot drop is valid only if the gem's class fits).
type DropTarget =
  | { kind: 'socket'; item: Item; index: number; valid: boolean }
  | { kind: 'slot'; item: Item; valid: boolean }
  | { kind: 'stash'; valid: true }
  | { kind: 'none' };

function hitTest(x: number, y: number, gem: Gem): DropTarget {
  const el = document.elementFromPoint(x, y);
  if (!el) return { kind: 'none' };

  // Socket cell: explicit gem-socket marker carrying its item id + index.
  const socketEl = (el as Element).closest<HTMLElement>('[data-gem-socket]');
  if (socketEl) {
    const itemId = socketEl.dataset.itemId ?? '';
    const index = Number(socketEl.dataset.socketIndex);
    const item = resolveItemById(itemId);
    if (item && Number.isInteger(index)) {
      return { kind: 'socket', item, index, valid: gemFitsSocketOf(gem, item) };
    }
  }

  // Inspector stash strip: drop to un-socket / stash.
  if ((el as Element).closest('[data-gem-stash]')) {
    return { kind: 'stash', valid: true };
  }

  // Equipped item slot: auto-socket into its first empty compatible socket.
  const slotEl = (el as Element).closest<HTMLElement>('[data-slot-id]');
  if (slotEl) {
    const slotId = (slotEl.dataset.slotId ?? '') as EquipmentSlotId;
    const eqItem = get(equipped)[slotId];
    if (eqItem) {
      const hasEmptyFit =
        gemFitsSocketOf(gem, eqItem) && eqItem.sockets.some((s) => s === null);
      return { kind: 'slot', item: eqItem, valid: hasEmptyFit };
    }
  }

  // Backpack cell (item or gem) -> stash the gem into the backpack.
  if ((el as Element).closest('[data-cell-index]')) {
    return { kind: 'stash', valid: true };
  }

  return { kind: 'none' };
}

function zoneIdOf(target: DropTarget): string | null {
  switch (target.kind) {
    case 'socket':
      return `socket:${target.item.id}:${target.index}`;
    case 'slot':
      return `slot:${target.item.id}`;
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
  const valid = target.kind !== 'none' && (target.kind === 'stash' || target.valid);
  gemDropZone.set(valid ? zoneIdOf(target) : null);
  activeGemDrag.set({ gem: held.gem, x: e.clientX, y: e.clientY, valid });
}

function onPointerUp(e: PointerEvent): void {
  if (!session || e.pointerId !== session.pointerId) return;
  const didPickUp = session.pickedUp;
  endSession();
  if (!didPickUp) return; // a tap, not a drag - leave it to the element's own handler.

  const held = get(heldGem);
  if (!held) return;

  const target = hitTest(e.clientX, e.clientY, held.gem);
  switch (target.kind) {
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
export function startGemDrag(source: GemDragSource, e: PointerEvent): void {
  // If a drag is somehow already live, tear it down first.
  if (session) endSession();
  // Don't start a second drag while a gem is already held by some other path.
  if (get(heldGem)) return;

  session = {
    source,
    startX: e.clientX,
    startY: e.clientY,
    pickedUp: false,
    pointerId: e.pointerId,
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
