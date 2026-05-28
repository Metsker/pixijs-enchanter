<script lang="ts">
  import { equipped } from '../state/inventory';
  import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_ORDER } from '../domain/equipment';
  import { t } from '../i18n';
</script>

<aside class="inventory" aria-label="Inventory">
  {#each EQUIPMENT_SLOT_ORDER as slotId (slotId)}
    {@const slot = EQUIPMENT_SLOTS[slotId]}
    {@const item = $equipped[slotId]}
    <div class="slot" class:filled={item !== null} title={t(slot.nameKey)}>
      <span class="emoji">{slot.emoji}</span>
    </div>
  {/each}
</aside>

<style>
  .inventory {
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
    flex: 1 1 0;
    min-height: 56px;
    border: 1px solid #2a2a34;
    border-radius: 8px;
    background: #14141a;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.4;
    transition: opacity 100ms ease, border-color 100ms ease;
  }

  .slot.filled {
    opacity: 1;
    border-color: #3a3a48;
  }

  .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.6rem;
    line-height: 1;
  }
</style>
