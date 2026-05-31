<script lang="ts">
  import { completeRoom } from '../state/run';
  import { buyCrystalPack, shopStock } from '../state/shop';
  import { topbar } from '../state/topbar';
  import { inspectItem, inspector } from '../state/inspector';
  import { inspectShopGem, gemInspector } from '../state/gem-inspector';
  import ItemCard from './ItemCard.svelte';
  import GemCard from './GemCard.svelte';
  import { t } from '../i18n';

  // The shop is part of the pane layout: a left-aligned pane with stacked
  // sections (items / gems / consumables), each a wrapping card grid. Cards open
  // the in-rail inspector when tapped (buying happens from its footer); the
  // detail panes flow in to the right.
  function onItemClick(index: number): void {
    const slot = $shopStock?.items[index];
    if (slot) inspectItem({ source: 'shop', index, item: slot.item, price: slot.price });
  }
  function isInspectingShop(i: number): boolean {
    const s = $inspector;
    return s?.source === 'shop' && s.index === i;
  }

  function onGemClick(index: number): void {
    const slot = $shopStock?.gems[index];
    if (slot) inspectShopGem(slot.gem, index, slot.price);
  }
  function isInspectingGem(i: number): boolean {
    return $gemInspector?.shop?.index === i;
  }
</script>

<section class="shop">
  <header class="shop-head">
    <h2><span class="head-emoji">🛒</span> {t('map.kind.shop')}</h2>
    <button type="button" class="leave" onclick={completeRoom}>{t('room.leave')}</button>
  </header>

  {#if $shopStock}
    {@const stock = $shopStock}
    <div class="body">
      <div class="group">
        <div class="group-label">{t('shop.items')}</div>
        <div class="cards">
          {#each stock.items as slot, i (i)}
            {#if slot}
              <ItemCard
                item={slot.item}
                price={slot.price}
                source="shop"
                selected={isInspectingShop(i)}
                onClick={() => onItemClick(i)}
              />
            {:else}
              <div class="sold">{t('shop.sold')}</div>
            {/if}
          {/each}
        </div>
      </div>

      <div class="group">
        <div class="group-label">{t('shop.gems')}</div>
        <div class="cards">
          {#each stock.gems as slot, i (i)}
            {#if slot}
              <GemCard
                gem={slot.gem}
                price={slot.price}
                selected={isInspectingGem(i)}
                onClick={() => onGemClick(i)}
              />
            {:else}
              <div class="sold">{t('shop.sold')}</div>
            {/if}
          {/each}
        </div>
      </div>

      <div class="group">
        <div class="group-label">{t('shop.consumables')}</div>
        <div class="cards">
          <button
            type="button"
            class="consumable"
            disabled={stock.crystals.remaining <= 0 ||
              $topbar.gold <
                Math.min(stock.crystals.perPackSize, stock.crystals.remaining) *
                  stock.crystals.pricePerCrystal}
            onclick={buyCrystalPack}
          >
            <span class="emoji">💎</span>
            <span class="name">
              {t('shop.crystalPack', {
                n: Math.min(stock.crystals.perPackSize, stock.crystals.remaining),
              })}
            </span>
            <span class="stock">×{stock.crystals.remaining}</span>
            <span class="price">
              🪙 {Math.min(stock.crystals.perPackSize, stock.crystals.remaining) *
                stock.crystals.pricePerCrystal}
            </span>
          </button>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  /* Left-aligned shop pane: a header over stacked card sections. Matches the
     other rail panes' chrome (flat #1c1c24, #3a3a48 divider). */
  .shop {
    flex: 0 0 auto;
    align-self: stretch;
    /* A quarter of the screen like every other split. */
    width: 25%;
    min-width: min(300px, 100%);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #1c1c24;
    border-right: 1px solid #3a3a48;
    user-select: none;
    scroll-snap-align: start;
  }
  .shop-head {
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

  /* Stacked sections (items / gems / consumables), each a horizontal card grid
     that wraps - the whole pane scrolls vertically. */
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
  .group-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #788;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
  }

  .sold {
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

  /* Crystal pack as a square card matching the item / gem cards in the grid. */
  .consumable {
    appearance: none;
    aspect-ratio: 1 / 1;
    border: 1px solid #2a2a34;
    border-radius: 8px;
    background: #14141a;
    color: #ddd;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 8px;
    transition: background-color 80ms ease, border-color 80ms ease;
  }
  .consumable:hover:not(:disabled) {
    background: #1c1c24;
    border-color: #ffcc44;
  }
  .consumable:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .consumable .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.8rem;
    line-height: 1;
  }
  .consumable .name {
    font-size: 0.74rem;
    color: #bbc;
    text-align: center;
    line-height: 1.1;
  }
  .consumable .stock {
    font-size: 0.68rem;
    color: #788;
  }
  .consumable .price {
    font-size: 1rem;
    font-weight: 600;
    color: #ffd866;
    font-variant-numeric: lining-nums tabular-nums;
  }
</style>
