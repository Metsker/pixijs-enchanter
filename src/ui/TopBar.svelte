<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { get } from 'svelte/store';
  import { topbar } from '../state/topbar';
  import { backpackOpen, toggleBackpack } from '../state/ui';
  import { audioPrefs, sfx, toggleMute } from '../audio/sfx';
  import { clearSave } from '../state/save';
  import { startNewRun } from '../state/run';
  import { t } from '../i18n';

  // Restart uses a two-click confirm so a stray tap doesn't wipe a
  // run mid-play. First click arms the button (icon flips to ⚠️ and
  // hover text changes); a second click within 3s commits, otherwise
  // the armed state auto-clears.
  let confirmingRestart = $state(false);
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;

  function onRestartClick(): void {
    if (confirmingRestart) {
      confirmingRestart = false;
      if (confirmTimer) clearTimeout(confirmTimer);
      confirmTimer = null;
      clearSave();
      startNewRun();
      return;
    }
    confirmingRestart = true;
    if (confirmTimer) clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      confirmingRestart = false;
      confirmTimer = null;
    }, 3000);
  }

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
  <div class="counters">
    <div class="counter gold" class:pop={goldPop} title={t('topbar.gold')}>
      <span class="emoji">🪙</span>
      <span class="value">{Math.round($goldDisplay)}</span>
    </div>
    <div class="counter" title={t('topbar.crystals')}>
      <span class="emoji">💎</span>
      <span class="value">{$topbar.crystals}</span>
    </div>
    <div class="counter" title={t('topbar.emptyScrolls')}>
      <span class="emoji">📜</span>
      <span class="value">{$topbar.emptyScrolls}</span>
    </div>
    <div class="counter" title={t('topbar.seals')}>
      <span class="emoji">🔒</span>
      <span class="value">{$topbar.seals}</span>
    </div>
  </div>

  <div class="progress">
    {t('topbar.actFloor', { act: $topbar.act, floor: $topbar.floor })}
  </div>

  <button
    type="button"
    class="backpack-toggle"
    class:armed={confirmingRestart}
    aria-label={confirmingRestart ? t('topbar.confirmRestart') : t('topbar.restart')}
    title={confirmingRestart ? t('topbar.confirmRestart') : t('topbar.restart')}
    onclick={onRestartClick}
  >
    <span class="emoji">{confirmingRestart ? '⚠️' : '🔄'}</span>
  </button>

  <button
    type="button"
    class="backpack-toggle"
    aria-label={t('topbar.toggleMute')}
    aria-pressed={$audioPrefs.muted}
    onclick={toggleMute}
    title={t('topbar.toggleMute')}
  >
    <span class="emoji">{$audioPrefs.muted ? '🔇' : '🔊'}</span>
  </button>

  <button
    type="button"
    class="backpack-toggle"
    class:active={$backpackOpen}
    aria-label={t('topbar.toggleBackpack')}
    aria-pressed={$backpackOpen}
    onclick={toggleBackpack}
  >
    <span class="emoji">🎒</span>
  </button>
</header>

<style>
  .topbar {
    flex: 0 0 auto;
    height: 56px;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0 0.75rem;
    background: #1c1c24;
    border-bottom: 1px solid #2a2a34;
    user-select: none;
  }

  /* Tighter spacing on landscape-mobile so all counters + progress + the
     backpack toggle stay on one row without horizontal scrolling. */
  @media (max-width: 900px) {
    .topbar {
      gap: 0.75rem;
      padding: 0 0.5rem;
    }
    .counters {
      gap: 0.75rem;
    }
  }

  .counters {
    display: flex;
    align-items: center;
    gap: 1.25rem;
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
    color: #ddd;
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
      color: #ddd;
      text-shadow: none;
    }
    45% {
      transform: scale(1.35);
      color: #ffe066;
      text-shadow: 0 0 14px rgba(255, 204, 68, 0.85);
    }
    100% {
      transform: scale(1);
      color: #ddd;
      text-shadow: none;
    }
  }

  .progress {
    margin-left: auto;
    font-size: 1.05rem;
    color: #9aa;
    font-variant-numeric: lining-nums tabular-nums;
  }

  .backpack-toggle {
    appearance: none;
    background: transparent;
    border: 1px solid #2a2a34;
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
    background: #2a2a34;
  }

  .backpack-toggle.active {
    background: #3a3a48;
    border-color: #ffcc44;
  }

  .backpack-toggle.armed {
    background: #4a2424;
    border-color: #ef4444;
  }

  .backpack-toggle:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }
</style>
