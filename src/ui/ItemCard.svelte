<script lang="ts">
  // Shared item card (Shop, Armory). Matches the bag's cell look - a square tile
  // with the emoji centred, the tier badge in the top-right corner, and socket
  // pips - plus an optional gold price and a "selected" ring when its inspector
  // is open.
  import { itemEmoji, tierOf, type Item } from '../domain/item';
  import SocketPips from './SocketPips.svelte';

  const TIER_COLORS: Record<number, string> = {
    1: '#9ca3af',
    2: '#22c55e',
    3: '#3b82f6',
    4: '#a855f7',
    5: '#f97316',
    6: '#ef4444',
    7: '#33b6a6',
  };

  let {
    item,
    price,
    selected = false,
    source,
    onClick,
  }: {
    item: Item;
    price?: number;
    selected?: boolean;
    source?: string;
    onClick: () => void;
  } = $props();
</script>

<button
  type="button"
  class="item-card"
  class:selected
  data-inspector-source={source}
  onclick={onClick}
>
  <span class="emoji">{itemEmoji(item)}</span>
  <span class="tier" style="--tier-color: {TIER_COLORS[tierOf(item)] ?? '#5c6a6a'}">
    T{tierOf(item)}
  </span>
  <SocketPips {item} />
  {#if price !== undefined}
    <span class="price">🪙 {price}</span>
  {/if}
</button>

<style>
  .item-card {
    position: relative;
    aspect-ratio: 1 / 1;
    appearance: none;
    border: 1px solid #18262a;
    border-radius: 8px;
    background: #0c1517;
    color: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 80ms ease, border-color 80ms ease, box-shadow 80ms ease;
  }
  .item-card:hover {
    background: #121d20;
    border-color: #374d52;
  }
  .item-card.selected {
    border-color: #3cc7b8;
    box-shadow: inset 0 0 0 1px #3cc7b8;
  }
  .item-card:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }
  .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 2rem;
    line-height: 1;
    pointer-events: none;
  }
  .tier {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1;
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid var(--tier-color, #5c6a6a);
    color: var(--tier-color, #849393);
    background: rgba(0, 0, 0, 0.4);
    font-variant-numeric: lining-nums;
    pointer-events: none;
  }
  .price {
    position: absolute;
    bottom: 4px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 0.92rem;
    font-weight: 600;
    color: #70ddd0;
    font-variant-numeric: lining-nums tabular-nums;
    pointer-events: none;
  }
</style>
