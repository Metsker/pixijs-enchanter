<script lang="ts">
  import { equipped } from '../state/inventory';
  import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_ORDER, type EquipmentSlotId } from '../domain/equipment';
  import { itemEmoji, tierOf } from '../domain/item';
  import { inspector, inspectItem } from '../state/inspector';
  import { t } from '../i18n';

  function isInspecting(slotId: EquipmentSlotId): boolean {
    const s = $inspector;
    return s?.source === 'inventory' && s.slotId === slotId;
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
        title={t(slot.nameKey)}
        data-inspector-source="inventory"
        data-slot-id={slotId}
        onclick={() => inspectItem({ source: 'inventory', slotId, item })}
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
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 8px;
    background: #1c1c24;
    border-right: 1px solid #2a2a34;
    user-select: none;
  }

  .slot {
    position: relative;
    flex: 1 1 0;
    min-height: 56px;
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

  .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.6rem;
    line-height: 1;
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
