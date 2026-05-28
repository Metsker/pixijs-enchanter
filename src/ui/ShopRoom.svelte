<script lang="ts">
  import { completeRoom } from '../state/run';
  import { buyCrystalPack, buyEmptyScroll, buySeal, shopStock } from '../state/shop';
  import { topbar } from '../state/topbar';
  import { backpack } from '../state/backpack';
  import { inspectItem, inspector } from '../state/inspector';
  import { itemEmoji, tierOf } from '../domain/item';
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
    const stock = $shopStock;
    if (!stock) return;
    const slot = stock.items[index];
    if (!slot) return;
    inspectItem({ source: 'shop', index, item: slot.item, price: slot.price });
  }

  function isInspectingShop(i: number): boolean {
    const s = $inspector;
    return s?.source === 'shop' && s.index === i;
  }
</script>

<section class="shop">
  <header class="shop-header">
    <h2>🛒 {t('map.kind.shop')}</h2>
    <button type="button" class="leave" onclick={completeRoom}>{t('room.leave')}</button>
  </header>

  {#if $shopStock}
    {@const stock = $shopStock}
    <div class="shop-body">
      <div class="items">
        <div class="items-label">{t('shop.items')}</div>
        <div class="items-grid">
          {#each stock.items as slot, i (i)}
            {#if slot}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="item-tile"
                class:inspecting={isInspectingShop(i)}
                data-inspector-source="shop"
                onclick={() => onItemClick(i)}
              >
                <span class="emoji">{itemEmoji(slot.item)}</span>
                <span
                  class="tier"
                  style="--tier-color: {TIER_COLORS[tierOf(slot.item)] ?? '#666'}"
                >
                  T{tierOf(slot.item)}
                </span>
                <span class="price">🪙 {slot.price}</span>
              </div>
            {:else}
              <div class="item-tile sold">
                <span class="sold-label">{t('shop.sold')}</span>
              </div>
            {/if}
          {/each}
        </div>
      </div>

      <div class="consumables">
        <div class="items-label">{t('shop.consumables')}</div>

        <button
          type="button"
          class="consumable"
          disabled={stock.emptyScrolls.remaining <= 0 || $topbar.gold < stock.emptyScrolls.unitPrice}
          onclick={buyEmptyScroll}
        >
          <div class="row">
            <span class="emoji">📜</span>
            <span class="name">{t('topbar.emptyScrolls')}</span>
            <span class="stock">×{stock.emptyScrolls.remaining}</span>
          </div>
          <div class="price">🪙 {stock.emptyScrolls.unitPrice}</div>
        </button>

        <button
          type="button"
          class="consumable"
          disabled={stock.seals.remaining <= 0 || $topbar.gold < stock.seals.unitPrice}
          onclick={buySeal}
        >
          <div class="row">
            <span class="emoji">🔒</span>
            <span class="name">{t('topbar.seals')}</span>
            <span class="stock">×{stock.seals.remaining}</span>
          </div>
          <div class="price">🪙 {stock.seals.unitPrice}</div>
        </button>

        <button
          type="button"
          class="consumable"
          disabled={stock.crystals.remaining <= 0 ||
            $topbar.gold < Math.min(stock.crystals.perPackSize, stock.crystals.remaining) * stock.crystals.pricePerCrystal}
          onclick={buyCrystalPack}
        >
          <div class="row">
            <span class="emoji">💎</span>
            <span class="name">
              {t('shop.crystalPack', { n: Math.min(stock.crystals.perPackSize, stock.crystals.remaining) })}
            </span>
            <span class="stock">×{stock.crystals.remaining} left</span>
          </div>
          <div class="price">
            🪙 {Math.min(stock.crystals.perPackSize, stock.crystals.remaining) * stock.crystals.pricePerCrystal}
          </div>
        </button>
      </div>
    </div>
  {/if}
</section>

<style>
  .shop {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: radial-gradient(ellipse at top, #1a1e28 0%, #0a0a0e 70%);
    padding: 16px 20px;
    gap: 16px;
    min-height: 0;
    overflow-y: auto;
  }
  .shop-header {
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

  .shop-body {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 16px;
    min-height: 0;
  }
  .items-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #788;
    margin-bottom: 8px;
  }
  .items-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
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
    gap: 4px;
    cursor: pointer;
    transition: background-color 80ms ease, border-color 80ms ease;
    padding: 10px;
  }
  .item-tile:hover {
    background: #1c1c24;
    border-color: #4a4a58;
  }
  .item-tile.inspecting {
    border-color: #ffcc44;
    box-shadow: inset 0 0 0 1px #ffcc44;
  }
  .item-tile.sold {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .item-tile .emoji {
    font-size: 2rem;
    line-height: 1;
  }
  .item-tile .tier {
    font-size: 0.7rem;
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid var(--tier-color, #666);
    color: var(--tier-color, #999);
    background: rgba(0, 0, 0, 0.3);
  }
  .item-tile .price {
    font-size: 0.85rem;
    color: #ffd866;
  }
  .sold-label {
    color: #555;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .consumables {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .consumable {
    appearance: none;
    background: #14141a;
    border: 1px solid #2a2a34;
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    color: #ddd;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 6px;
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
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row .emoji {
    font-size: 1.3rem;
  }
  .row .name {
    flex: 1;
    font-size: 0.9rem;
  }
  .row .stock {
    font-size: 0.75rem;
    color: #788;
  }
  .consumable .price {
    font-size: 0.85rem;
    color: #ffd866;
  }
</style>
