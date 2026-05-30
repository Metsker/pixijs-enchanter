<script lang="ts">
  import {
    displacementPick,
    equipped,
    resolveDisplacementPick,
  } from '../state/inventory';
  import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_ORDER, type EquipmentSlotId } from '../domain/equipment';
  import { itemEmoji, tierOf } from '../domain/item';
  import { inspector, inspectItem } from '../state/inspector';
  import { gemDropZone } from '../state/gem-drag';
  import { t } from '../i18n';

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

  // Picker mode: when displacementPick is set, certain slots become
  // highlighted swap-targets. Clicking a target resolves the pick;
  // any other slot click stays a normal inspect.
  function isPickTarget(slotId: EquipmentSlotId): boolean {
    return $displacementPick?.legalSlots.includes(slotId) ?? false;
  }

  function onSlotClick(slotId: EquipmentSlotId, item: ReturnType<typeof getItem>): void {
    if ($displacementPick && isPickTarget(slotId)) {
      const landed = resolveDisplacementPick(slotId);
      if (landed !== null) {
        const next = $equipped[landed];
        if (next) inspector.set({ source: 'inventory', slotId: landed, item: next });
      }
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
    {@const pickTarget = isPickTarget(slotId)}
    {#if item}
      <button
        type="button"
        class="slot filled"
        class:inspecting={isInspecting(slotId)}
        class:pick-target={pickTarget}
        class:gem-target={isGemTarget(item.id)}
        title={t(slot.nameKey)}
        data-inspector-source="inventory"
        data-slot-id={slotId}
        onclick={() => onSlotClick(slotId, item)}
      >
        <span class="emoji">{itemEmoji(item)}</span>
        <span class="tier" style="--tier-color: {TIER_COLORS[tierOf(item)] ?? '#666'}">
          T{tierOf(item)}
        </span>
      </button>
    {:else}
      <div class="slot" title={t(slot.nameKey)}>
        <span class="emoji">{slot.emoji}</span>
      </div>
    {/if}
  {/each}
</aside>

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
  .slot.pick-target {
    animation: pick-pulse 900ms ease-in-out infinite;
    border-color: #88c8ff;
  }
  @keyframes pick-pulse {
    0%, 100% {
      box-shadow: inset 0 0 0 1px #88c8ff, 0 0 0 0 rgba(136, 200, 255, 0.6);
    }
    50% {
      box-shadow: inset 0 0 0 1px #88c8ff, 0 0 0 6px rgba(136, 200, 255, 0);
    }
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
</style>
