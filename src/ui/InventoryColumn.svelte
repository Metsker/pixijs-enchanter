<script lang="ts">
  import { equipped, itemDrag } from '../state/inventory';
  import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_ORDER, type EquipmentSlotId } from '../domain/equipment';
  import { itemEmoji, legalEquipmentSlots, tierOf } from '../domain/item';
  import SocketPips from './SocketPips.svelte';
  import { closeInspector, inspector, inspectItem } from '../state/inspector';
  import { gemDropZone } from '../state/gem-drag';
  import { unequipToBackpack } from '../state/inventory';
  import { disenchantEquipped } from '../state/disenchant';
  import { backpackOpen } from '../state/ui';
  import { get } from 'svelte/store';
  import { t } from '../i18n';

  // === Drag-to-unequip (FEATURE 5) =================================
  // A filled equipment slot is a drag SOURCE: drag it onto a backpack cell to
  // unequip into the bag, onto the trash to disenchant, or anywhere else to
  // cancel (no-op). Pointer-based + gated by a move threshold so a tap still
  // inspects (click fires only when no real drag happened). Mirrors the
  // Backpack item-reorder drag, including the floating ghost.
  let dragSlot = $state<EquipmentSlotId | null>(null);
  let didDrag = $state(false);
  let dragGhost = $state<{ x: number; y: number; emoji: string } | null>(null);
  let cellHot = $state(false); // a backpack cell is under the pointer
  let trashHot = $state(false); // the trash is under the pointer
  // Set when a real drag ends, so the click that fires right after pointerup
  // doesn't also open the Inspector.
  let suppressClick = false;
  let pointerStart = { x: 0, y: 0 };
  const DRAG_THRESHOLD_SQ = 100;

  function onSlotPointerDown(e: PointerEvent, slotId: EquipmentSlotId): void {
    // Only drag while the bag is open (the drop targets - cells / trash - only
    // exist then).
    if (!get(backpackOpen)) return;
    dragSlot = slotId;
    didDrag = false;
    dragGhost = null;
    pointerStart = { x: e.clientX, y: e.clientY };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture can throw for synthetic pointers; the drag still
      // works via bubbling move/up - we just lose the capture optimisation.
    }
  }

  function onSlotPointerMove(e: PointerEvent): void {
    if (dragSlot === null) return;
    if (!didDrag) {
      const dx = e.clientX - pointerStart.x;
      const dy = e.clientY - pointerStart.y;
      if (dx * dx + dy * dy <= DRAG_THRESHOLD_SQ) return;
      didDrag = true;
    }
    const item = $equipped[dragSlot];
    dragGhost = { x: e.clientX, y: e.clientY, emoji: item ? itemEmoji(item) : '' };
    const el = document.elementFromPoint(e.clientX, e.clientY);
    trashHot = !!el?.closest('[data-trash]');
    cellHot = !trashHot && !!el?.closest('[data-cell-index]');
  }

  function onSlotPointerUp(): void {
    const slotId = dragSlot;
    const wasDrag = didDrag;
    const droppedOnTrash = trashHot;
    const droppedOnCell = cellHot;
    dragSlot = null;
    didDrag = false;
    dragGhost = null;
    cellHot = false;
    trashHot = false;
    if (slotId === null || !wasDrag) return; // a tap: leave it to onclick.
    suppressClick = true; // a real drag happened: swallow the trailing click.

    if (droppedOnTrash) {
      // Disenchant the equipped item (and its gems) for crystals.
      if (disenchantEquipped(slotId)) {
        const ins = get(inspector);
        if (ins?.source === 'inventory' && ins.slotId === slotId) closeInspector();
      }
    } else if (droppedOnCell) {
      // Unequip into the bag (first empty cell; rejected if the bag is full).
      const landed = unequipToBackpack(slotId);
      if (landed !== -1) {
        const ins = get(inspector);
        if (ins?.source === 'inventory' && ins.slotId === slotId) closeInspector();
      }
    }
    // else dropped elsewhere / on another slot: no-op (item stays equipped).
  }

  // While a backpack item is dragged toward the column, every slot it could
  // legally equip into reads as a drop candidate, and the slot under the
  // pointer reads as the live target.
  function isItemDropCandidate(slotId: EquipmentSlotId): boolean {
    const d = $itemDrag;
    return !!d && legalEquipmentSlots(d.item).includes(slotId);
  }
  function isItemDropTarget(slotId: EquipmentSlotId): boolean {
    return $itemDrag?.targetSlot === slotId;
  }

  // True while a dragged gem is hovering THIS equipped item (auto-socket
  // target). gemDropZone carries `slot:<itemId>` for a valid equipped-slot
  // drop, so the slot can highlight as the live target.
  function isGemTarget(itemId: string | undefined): boolean {
    return itemId !== undefined && $gemDropZone === `slot:${itemId}`;
  }

  function isInspecting(slotId: EquipmentSlotId): boolean {
    const s = $inspector;
    return s?.source === 'inventory' && s.slotId === slotId;
  }

  function onSlotClick(slotId: EquipmentSlotId, item: ReturnType<typeof getItem>): void {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (item) inspectItem({ source: 'inventory', slotId, item });
  }

  function getItem(slotId: EquipmentSlotId) {
    return $equipped[slotId];
  }

  const TIER_COLORS: Record<number, string> = {
    1: '#9ca3af',
    2: '#22c55e',
    3: '#3b82f6',
    4: '#a855f7',
    5: '#f97316',
    6: '#ef4444',
    7: '#fbbf24',
  };
</script>

<aside class="inventory" aria-label="Inventory">
  {#each EQUIPMENT_SLOT_ORDER as slotId (slotId)}
    {@const slot = EQUIPMENT_SLOTS[slotId]}
    {@const item = $equipped[slotId]}
    {#if item}
      <button
        type="button"
        class="slot filled"
        class:inspecting={isInspecting(slotId)}
        class:gem-target={isGemTarget(item.id)}
        class:item-drop-candidate={isItemDropCandidate(slotId)}
        class:item-drop-target={isItemDropTarget(slotId)}
        class:dragging={didDrag && dragSlot === slotId}
        title={t(slot.nameKey)}
        data-inspector-source="inventory"
        data-slot-id={slotId}
        onclick={() => onSlotClick(slotId, item)}
        onpointerdown={(e) => onSlotPointerDown(e, slotId)}
        onpointermove={onSlotPointerMove}
        onpointerup={onSlotPointerUp}
        onpointercancel={onSlotPointerUp}
      >
        <span class="emoji">{itemEmoji(item)}</span>
        <span class="tier" style="--tier-color: {TIER_COLORS[tierOf(item)] ?? '#666'}">
          T{tierOf(item)}
        </span>
        <SocketPips item={item} />
      </button>
    {:else}
      <div
        class="slot"
        class:item-drop-candidate={isItemDropCandidate(slotId)}
        class:item-drop-target={isItemDropTarget(slotId)}
        title={t(slot.nameKey)}
        data-slot-id={slotId}
      >
        <span class="emoji">{slot.emoji}</span>
      </div>
    {/if}
  {/each}
</aside>

{#if dragGhost && didDrag}
  <div
    class="unequip-ghost"
    class:over-trash={trashHot}
    style="left: {dragGhost.x}px; top: {dragGhost.y}px;"
    aria-hidden="true"
  >
    <span class="emoji">{dragGhost.emoji}</span>
  </div>
{/if}

<style>
  .inventory {
    position: relative;
    /* Sit above the Backpack scrim (z 95) so the column is never visually
       darkened or blurred when the Backpack opens. */
    z-index: 96;
    flex: 0 0 auto;
    width: 80px;
    /* Grid with 9 equal rows so all slots always fit the available height
       regardless of viewport - prevents overflow on landscape mobile. */
    display: grid;
    grid-template-rows: repeat(9, 1fr);
    gap: 8px;
    padding: 12px 8px;
    background: #1c1c24;
    border-right: 1px solid #2a2a34;
    user-select: none;
  }

  .slot {
    position: relative;
    min-height: 0;
    border: 1px solid #2a2a34;
    border-radius: 8px;
    background: #14141a;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.4;
    transition: opacity 100ms ease, border-color 100ms ease, background-color 100ms ease;
  }

  .slot.filled {
    appearance: none;
    cursor: pointer;
    color: inherit;
    opacity: 1;
    border-color: #3a3a48;
    padding: 0;
    /* Suppress touch gestures so a touch drag isn't stolen by scroll / pan. */
    touch-action: none;
  }
  .slot.filled.dragging {
    opacity: 0.3;
  }
  .slot.filled:hover {
    background: #20202a;
    border-color: #ffcc44;
  }
  .slot.filled:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }
  .slot.filled.inspecting {
    border-color: #ffcc44;
    box-shadow: inset 0 0 0 1px #ffcc44;
  }
  /* Live auto-socket target while a compatible gem is dragged over this
     equipped item. */
  .slot.filled.gem-target {
    border-color: #ffcc44;
    box-shadow: inset 0 0 0 2px #ffcc44;
    background: #2a2410;
  }
  /* Drag-to-equip: every slot a dragged backpack item could legally go into
     reads as a candidate; the slot under the pointer is the live target.
     Green, to distinguish from the gold gem-socket and blue picker hues. */
  .slot.item-drop-candidate {
    opacity: 1;
    border-color: #5a8c66;
  }
  .slot.item-drop-target {
    opacity: 1;
    border-color: #7ddc8c;
    box-shadow: inset 0 0 0 2px #7ddc8c;
    background: #16241a;
  }
  .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.6rem;
    line-height: 1;
  }

  /* Short landscape viewports: nine slots have to fit in less vertical
     space, so shrink padding / gap / emoji size. The grid layout above
     auto-divides the column height into 9 rows, so we don't need a
     min-height override - just trim the chrome. */
  @media (max-height: 500px) {
    .inventory {
      width: 64px;
      padding: 6px 4px;
      gap: 4px;
    }
    .emoji {
      font-size: 1.3rem;
    }
    .tier {
      font-size: 0.65rem;
      padding: 0 3px;
    }
  }

  .tier {
    position: absolute;
    top: 3px;
    right: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1;
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid var(--tier-color, #666);
    color: var(--tier-color, #999);
    background: rgba(0, 0, 0, 0.4);
    font-variant-numeric: lining-nums;
  }

  /* Floating ghost while an equipped item is dragged out to the bag / trash.
     Mirrors the Backpack drag-ghost; turns red over the trash. */
  .unequip-ghost {
    position: fixed;
    width: 72px;
    height: 72px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 200;
    background: #14141a;
    border: 1px solid #ffcc44;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6);
    opacity: 0.95;
  }
  .unequip-ghost.over-trash {
    border-color: #ef4444;
    box-shadow: 0 12px 28px rgba(120, 0, 0, 0.6);
  }
</style>
