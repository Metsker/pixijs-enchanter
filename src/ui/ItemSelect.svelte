<script lang="ts">
  import { paneEnter } from '../utils/paneTransition';
  import { completeRoom } from '../state/run';
  import { itemOffer } from '../state/item-offer';
  import { inspectItem, inspector } from '../state/inspector';
  import ItemCard from './ItemCard.svelte';
  import { t } from '../i18n';

  // The Armory is a left-aligned pane (same layout as the shop): a header over a
  // section of offered items in a wrapping card grid. Tapping a card opens the
  // in-rail inspector (source 'item-offer', whose CTA picks it); picking advances.
  function onItemClick(index: number): void {
    const item = $itemOffer?.items[index];
    if (item) inspectItem({ source: 'item-offer', index, item });
  }

  function isInspectingOffer(i: number): boolean {
    const s = $inspector;
    return s?.source === 'item-offer' && s.index === i;
  }
</script>

<section class="armory" in:paneEnter|global>
  <header class="armory-head">
    <h2><span class="head-emoji">📦</span> {t('itemSelect.title')}</h2>
    <button type="button" class="leave" onclick={completeRoom}>{t('room.leave')}</button>
  </header>

  {#if $itemOffer}
    {@const offer = $itemOffer}
    <div class="body">
      <div class="group">
        <p class="subtitle">{t('itemSelect.subtitle')}</p>
        <div class="cards">
          {#each offer.items as slot, i (i)}
            {#if slot}
              <ItemCard
                item={slot}
                source="item-offer"
                selected={isInspectingOffer(i)}
                onClick={() => onItemClick(i)}
              />
            {:else}
              <div class="taken">{t('itemSelect.taken')}</div>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  /* Left-aligned Armory pane: a quarter of the screen like every other split,
     same flat chrome (#1c1c24, #3a3a48 divider). */
  .armory {
    flex: 0 0 auto;
    align-self: stretch;
    width: 25%;
    min-width: min(300px, 100%);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #1c1c24;
    border-right: 1px solid #3a3a48;
    user-select: none;  }
  .armory-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    height: 76px;
    box-sizing: border-box;
    padding: 0 14px;
    border-bottom: 1px solid #2a2a34;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #ddd;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .head-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 2rem;
    line-height: 1;
  }
  .leave {
    appearance: none;
    background: #3a3a48;
    border: 1px solid #4a4a58;
    color: #fff;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 36px;
  }
  .leave:hover {
    background: #4a4a58;
    border-color: #ffcc44;
  }

  /* Same layout as the shop: a scrolling body with a section (intro + a card
     grid that wraps horizontally). */
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 12px 10px;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .subtitle {
    margin: 0;
    color: #9aa;
    font-size: 0.85rem;
    line-height: 1.35;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
  }
  .taken {
    aspect-ratio: 1 / 1;
    border: 1px solid #2a2a34;
    border-radius: 8px;
    background: #101015;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.4;
    color: #555;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
</style>
