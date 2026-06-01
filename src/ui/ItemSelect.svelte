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
     same flat chrome (#121d20, #28383d divider). */
  .armory {
    flex: 0 0 auto;
    align-self: stretch;
    width: 25%;
    min-width: min(300px, 100%);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--pane-glass);
    backdrop-filter: blur(12px) saturate(1.15);
    -webkit-backdrop-filter: blur(12px) saturate(1.15);
    border-right: 1px solid #28383d;
    user-select: none;  }
  .armory-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    height: 76px;
    box-sizing: border-box;
    padding: 0 14px;
    border-bottom: 1px solid #18262a;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #c0cdcd;
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
    background: #28383d;
    border: 1px solid #374d52;
    color: #fff;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 36px;
  }
  .leave:hover {
    background: #374d52;
    border-color: #3cc7b8;
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
    color: #91a1a1;
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
    border: 1px solid #18262a;
    border-radius: 8px;
    background: #080f11;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.4;
    color: #4c5858;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
</style>
