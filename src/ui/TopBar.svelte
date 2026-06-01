<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { get } from 'svelte/store';
  import { topbar } from '../state/topbar';
  import {
    itemsSplitOpen,
    gemsSplitOpen,
    statsSplitOpen,
    toggleItemsSplit,
    toggleGemsSplit,
    toggleStatsSplit,
    settingsOpen,
    openSettings,
  } from '../state/ui';
  import InventoryColumn from './InventoryColumn.svelte';
  import { sfx } from '../audio/sfx';
  import { t } from '../i18n';

  // Gold ticks up smoothly when claimed from the victory chest (and on
  // any other change too). Round on render so the counter shows whole
  // coins throughout the tween. The pop fires at the START of the
  // tween so the bounce telegraphs that gold is about to arrive,
  // riding the count-up rather than punctuating the end.
  const goldDisplay = tweened(get(topbar).gold, { duration: 800, easing: cubicOut });
  let goldPop = $state(false);
  let prevGoldTarget = get(topbar).gold;
  let popTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const target = $topbar.gold;
    if (target === prevGoldTarget) return;
    const increased = target > prevGoldTarget;
    prevGoldTarget = target;
    if (popTimer) clearTimeout(popTimer);
    goldPop = true;
    if (increased) sfx.coin();
    popTimer = setTimeout(() => {
      goldPop = false;
      popTimer = null;
    }, 320);
    goldDisplay.set(target);
  });
</script>

<header class="topbar">
  <!-- LEFT: panel toggles + settings. -->
  <div class="zone left">
    <button
      type="button"
      class="backpack-toggle"
      class:active={$itemsSplitOpen}
      aria-label={t('topbar.toggleItems')}
      aria-pressed={$itemsSplitOpen}
      onclick={toggleItemsSplit}
      title={t('topbar.toggleItems')}
    >
      <span class="emoji">🎒</span>
    </button>
    <button
      type="button"
      class="backpack-toggle"
      class:active={$gemsSplitOpen}
      aria-label={t('topbar.toggleGems')}
      aria-pressed={$gemsSplitOpen}
      onclick={toggleGemsSplit}
      title={t('topbar.toggleGems')}
    >
      <span class="emoji">💠</span>
    </button>
    <button
      type="button"
      class="backpack-toggle"
      class:active={$statsSplitOpen}
      aria-label={t('topbar.toggleStats')}
      aria-pressed={$statsSplitOpen}
      onclick={toggleStatsSplit}
      title={t('topbar.toggleStats')}
    >
      <span class="emoji">📊</span>
    </button>
    <button
      type="button"
      class="backpack-toggle"
      class:active={$settingsOpen}
      aria-label={t('topbar.settings')}
      aria-pressed={$settingsOpen}
      onclick={openSettings}
      title={t('topbar.settings')}
    >
      <span class="emoji">⚙️</span>
    </button>
  </div>

  <!-- CENTER: the equipment row, pinned to the exact centre of the screen. -->
  <InventoryColumn />

  <!-- RIGHT: run progress + the gold / crystal counters. -->
  <div class="zone right">
    <div class="progress">
      {t('topbar.actFloor', { act: $topbar.act, floor: $topbar.floor })}
    </div>
    <div class="counter gold" class:pop={goldPop} title={t('topbar.gold')}>
      <span class="emoji">🪙</span>
      <span class="value">{Math.round($goldDisplay)}</span>
    </div>
    <div class="counter" title={t('topbar.crystals')}>
      <span class="emoji">💎</span>
      <span class="value">{$topbar.crystals}</span>
    </div>
  </div>
</header>

<style>
  .topbar {
    flex: 0 0 auto;
    /* Taller to give the inline equipment slots room to breathe. */
    min-height: 84px;
    /* Three tracks with equal side columns, so the centre (auto) track - the
       equipment row - sits at the EXACT middle of the screen regardless of how
       wide the left / right groups are. */
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 1rem;
    padding: 0 0.75rem;
    background: #121d20;
    border-bottom: 1px solid #18262a;
    user-select: none;
  }

  /* The two flanking groups. min-width:0 lets them shrink rather than shoving
     the centred inventory off-axis. */
  .zone {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .zone.left {
    justify-self: start;
    gap: 0.5rem;
  }
  .zone.right {
    justify-self: end;
    gap: 1.25rem;
  }

  /* Tighter spacing on landscape-mobile so the groups stay on one row. */
  @media (max-width: 900px) {
    .topbar {
      gap: 0.5rem;
      padding: 0 0.5rem;
    }
    .zone.right {
      gap: 0.75rem;
    }
  }

  .counter {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-variant-numeric: tabular-nums;
  }

  .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.4rem;
    line-height: 1;
  }

  .value {
    font-size: 1.3rem;
    font-weight: 600;
    color: #c0cdcd;
    font-variant-numeric: lining-nums tabular-nums;
    display: inline-block;
    transform-origin: center;
  }

  .counter.gold.pop .value {
    animation: gold-pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .counter.gold.pop .emoji {
    animation: gold-pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes gold-pop {
    0% {
      transform: scale(1);
      color: #c0cdcd;
      text-shadow: none;
    }
    45% {
      transform: scale(1.35);
      color: #ffe066;
      text-shadow: 0 0 14px rgba(255, 204, 68, 0.85);
    }
    100% {
      transform: scale(1);
      color: #c0cdcd;
      text-shadow: none;
    }
  }

  .progress {
    font-size: 1.05rem;
    color: #91a1a1;
    font-variant-numeric: lining-nums tabular-nums;
    white-space: nowrap;
  }

  .backpack-toggle {
    appearance: none;
    background: transparent;
    border: 1px solid #18262a;
    border-radius: 8px;
    color: inherit;
    padding: 0 0.6rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    transition: background-color 100ms ease, border-color 100ms ease;
  }

  .backpack-toggle:hover {
    background: #18262a;
  }

  .backpack-toggle.active {
    background: #28383d;
    border-color: #3cc7b8;
  }

  .backpack-toggle:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }
</style>
