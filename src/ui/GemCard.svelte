<script lang="ts">
  // Shared gem card (Shop). Matches the bag's loose-gem cell - a square tile
  // ringed in the gem's socket colour, emoji centred, level badge in the corner -
  // plus an optional gold price. The name lives in the gem inspector (tap to
  // open); the title tooltip carries it on hover. "selected" adds a gold inset
  // ring while keeping the colour border.
  import { gemDisplay, SOCKET_COLOR_HEX } from '../domain/gem-display';
  import type { Gem } from '../domain/gem';

  let {
    gem,
    price,
    selected = false,
    onClick,
  }: {
    gem: Gem;
    price?: number;
    selected?: boolean;
    onClick: () => void;
  } = $props();

  const gd = $derived(gemDisplay(gem));
</script>

<button
  type="button"
  class="gem-card"
  class:selected
  style="--gem-color: {gd ? SOCKET_COLOR_HEX[gd.color] : '#666'}"
  title={gd ? `${gd.name} - ${gd.summary}` : ''}
  onclick={onClick}
>
  <span class="emoji">{gd?.emoji ?? '💠'}</span>
  {#if gd && gd.level > 1}<span class="level">Lv{gd.level}</span>{/if}
  {#if price !== undefined}
    <span class="price">🪙 {price}</span>
  {/if}
</button>

<style>
  .gem-card {
    position: relative;
    aspect-ratio: 1 / 1;
    appearance: none;
    border: 1px solid var(--gem-color, #6ad);
    border-radius: 8px;
    background: #14141a;
    box-shadow: inset 0 0 0 1px var(--gem-color, #6ad);
    color: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 80ms ease, box-shadow 80ms ease;
  }
  .gem-card:hover {
    background: #1c1c24;
  }
  /* Selected: gold inset ring; the gem-colour border stays visible. */
  .gem-card.selected {
    box-shadow: inset 0 0 0 2px #ffcc44;
  }
  .gem-card:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }
  .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 2rem;
    line-height: 1;
    pointer-events: none;
  }
  .level {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1;
    padding: 1px 4px;
    border-radius: 4px;
    color: #f0e0ff;
    background: rgba(124, 58, 200, 0.85);
    border: 1px solid #c084fc;
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
    color: #ffd866;
    font-variant-numeric: lining-nums tabular-nums;
    pointer-events: none;
  }
</style>
