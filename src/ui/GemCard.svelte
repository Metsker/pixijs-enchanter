<script lang="ts">
  // Shared gem card (Shop). Matches the bag's loose-gem cell - a square tile
  // ringed in the gem's socket colour, emoji centred, level badge in the corner -
  // plus an optional gold price. The name lives in the gem inspector (tap to
  // open); the title tooltip carries it on hover. "selected" adds a gold inset
  // ring while keeping the colour border.
  import { gemDisplay, SOCKET_COLOR_HEX } from '../domain/gem-display';
  import type { Gem } from '../domain/gem';
  import { ownedContext, gemHint } from '../state/loot-hints';
  import { t } from '../i18n';

  let {
    gem,
    price,
    selected = false,
    showHint = true,
    onClick,
  }: {
    gem: Gem;
    price?: number;
    selected?: boolean;
    // Flag whether this gem combines with / fits the player's gear. On by
    // default for loot surfaces (shop / victory / bag).
    showHint?: boolean;
    onClick: () => void;
  } = $props();

  const gd = $derived(gemDisplay(gem));
  // { combine, socket } - either, both, or neither may be set.
  const hint = $derived(showHint ? gemHint(gem, $ownedContext) : { combine: false, socket: false });
</script>

<button
  type="button"
  class="gem-card"
  class:selected
  class:hint-combine={hint.combine}
  class:hint-socket={hint.socket && !hint.combine}
  style="--gem-color: {gd ? SOCKET_COLOR_HEX[gd.color] : '#5c6a6a'}"
  title={gd ? `${gd.name} - ${gd.summary}` : ''}
  onclick={onClick}
>
  <span class="emoji">{gd?.emoji ?? '💠'}</span>
  {#if gd && gd.level > 1}<span class="level">Lv{gd.level}</span>{/if}
  {#if hint.combine || hint.socket}
    <span class="hints">
      {#if hint.combine}
        <span class="hint-badge combine" title={t('hint.gem.combine')} aria-label={t('hint.gem.combine')}>⊕</span>
      {/if}
      {#if hint.socket}
        <span class="hint-badge socket" title={t('hint.gem.socket')} aria-label={t('hint.gem.socket')}>◈</span>
      {/if}
    </span>
  {/if}
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
    background: #0c1517;
    box-shadow: inset 0 0 0 1px var(--gem-color, #6ad);
    color: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 80ms ease, box-shadow 80ms ease;
  }
  .gem-card:hover {
    background: #121d20;
  }
  /* Selected: gold inset ring; the gem-colour border stays visible. */
  .gem-card.selected {
    box-shadow: inset 0 0 0 2px #3cc7b8;
  }
  .gem-card:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }
  /* Loot hints: an outer glow on top of the gem-colour ring. Combine (purple,
     a level-up is possible) outranks socket (teal, it fits your gear) for the
     glow; both badges still show. The selected ring overrides both. */
  .gem-card.hint-combine:not(.selected) {
    box-shadow: inset 0 0 0 1px var(--gem-color, #6ad), 0 0 12px -2px rgba(192, 132, 252, 0.85);
  }
  .gem-card.hint-socket:not(.selected) {
    box-shadow: inset 0 0 0 1px var(--gem-color, #6ad), 0 0 12px -2px rgba(60, 199, 184, 0.8);
  }
  .hints {
    position: absolute;
    top: 3px;
    left: 3px;
    display: flex;
    gap: 2px;
    pointer-events: none;
  }
  .hint-badge {
    font-size: 0.66rem;
    line-height: 1;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-weight: 700;
  }
  .hint-badge.combine {
    color: #f0e0ff;
    background: #7c3ac8;
  }
  .hint-badge.socket {
    color: #04201d;
    background: #3cc7b8;
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
    color: #70ddd0;
    font-variant-numeric: lining-nums tabular-nums;
    pointer-events: none;
  }
</style>
