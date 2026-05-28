<script lang="ts">
  import { topbar } from '../state/topbar';
  import { backpackOpen, toggleBackpack } from '../state/ui';
  import { t } from '../i18n';
</script>

<header class="topbar">
  <div class="counters">
    <div class="counter" title={t('topbar.gold')}>
      <span class="emoji">🪙</span>
      <span class="value">{$topbar.gold}</span>
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
    font-size: 1rem;
    color: #ddd;
  }

  .progress {
    margin-left: auto;
    font-size: 0.95rem;
    color: #9aa;
    font-variant-numeric: tabular-nums;
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

  .backpack-toggle:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }
</style>
