<script lang="ts">
  import { completeRoom } from '../state/run';
  import { itemOffer } from '../state/item-offer';
  import { inspectItem, inspector } from '../state/inspector';
  import { itemEmoji, tierOf } from '../domain/item';
  import SocketPips from './SocketPips.svelte';
  import { t } from '../i18n';

  const TIER_COLORS: Record<number, string> = {
    1: '#9ca3af',
    2: '#22c55e',
    3: '#3b82f6',
    4: '#a855f7',
    5: '#f97316',
    6: '#ef4444',
    7: '#fbbf24',
  };

  function onItemClick(index: number): void {
    const offer = $itemOffer;
    if (!offer) return;
    const item = offer.items[index];
    if (!item) return;
    inspectItem({ source: 'item-offer', index, item });
  }

  function isInspectingOffer(i: number): boolean {
    const s = $inspector;
    return s?.source === 'item-offer' && s.index === i;
  }
</script>

<section class="item-room">
  <header class="item-room-header">
    <h2>📦 {t('itemSelect.title')}</h2>
    <button type="button" class="leave" onclick={completeRoom}>{t('room.leave')}</button>
  </header>

  <p class="subtitle">{t('itemSelect.subtitle')}</p>

  {#if $itemOffer}
    {@const offer = $itemOffer}
    <div class="items-grid">
      {#each offer.items as slot, i (i)}
        {#if slot}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="item-tile"
            class:inspecting={isInspectingOffer(i)}
            data-inspector-source="item-offer"
            onclick={() => onItemClick(i)}
          >
            <span class="emoji">{itemEmoji(slot)}</span>
            <span
              class="tier"
              style="--tier-color: {TIER_COLORS[tierOf(slot)] ?? '#666'}"
            >
              T{tierOf(slot)}
            </span>
            <SocketPips item={slot} />
          </div>
        {:else}
          <div class="item-tile taken">
            <span class="taken-label">{t('itemSelect.taken')}</span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</section>

<style>
  .item-room {
    flex: 1;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(ellipse at top, rgba(255, 204, 68, 0.06) 0%, transparent 60%),
      linear-gradient(180deg, #14141a 0%, #1c1c24 100%);
    padding: 16px 20px;
    gap: 14px;
    min-height: 0;
    overflow-y: auto;
  }
  .item-room-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 600;
    color: #ddd;
  }
  h2 :global(.emoji),
  .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
  }
  .leave {
    appearance: none;
    background: #3a3a48;
    border: 1px solid #4a4a58;
    color: #fff;
    border-radius: 8px;
    padding: 10px 18px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 40px;
  }
  .leave:hover {
    background: #4a4a58;
    border-color: #ffcc44;
  }
  .subtitle {
    margin: 0;
    color: #9aa;
    font-size: 0.9rem;
  }

  .items-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(160px, 220px));
    gap: 12px;
    justify-content: center;
    margin-top: 4px;
  }
  @media (max-width: 720px) {
    .items-grid {
      grid-template-columns: 1fr;
      max-width: 320px;
      margin: 4px auto 0;
    }
  }

  .item-tile {
    position: relative;
    aspect-ratio: 1.4 / 1;
    border: 1px solid #2a2a34;
    border-radius: 8px;
    background: #14141a;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    transition: background-color 80ms ease, border-color 80ms ease,
      transform 80ms ease;
    padding: 14px;
  }
  .item-tile:hover {
    background: #1c1c24;
    border-color: #4a4a58;
    transform: translateY(-2px);
  }
  .item-tile.inspecting {
    border-color: #ffcc44;
    box-shadow: inset 0 0 0 1px #ffcc44;
  }
  .item-tile.taken {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .item-tile .emoji {
    font-size: 2.6rem;
    line-height: 1;
  }
  .item-tile .tier {
    font-size: 0.85rem;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid var(--tier-color, #666);
    color: var(--tier-color, #999);
    background: rgba(0, 0, 0, 0.3);
    font-variant-numeric: lining-nums;
  }
  .taken-label {
    color: #555;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
</style>
