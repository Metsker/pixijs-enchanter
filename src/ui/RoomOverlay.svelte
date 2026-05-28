<script lang="ts">
  import { completeRoom, run, startNewRun } from '../state/run';
  import {
    claimPendingRewards,
    pendingRewards,
    resetPendingRewards,
  } from '../state/rewards';
  import { inspector, inspectItem, closeInspector } from '../state/inspector';
  import { itemEmoji, tierOf, type Item } from '../domain/item';
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

  const showChest = $derived(
    ($run.screen === 'fight' && $run.fightWon) || $run.screen === 'run-complete',
  );

  function onContinue(): void {
    if ($run.screen === 'run-complete') {
      claimPendingRewards();
      startNewRun();
      return;
    }
    if ($run.screen === 'run-lost') {
      resetPendingRewards();
      startNewRun();
      return;
    }
    claimPendingRewards();
    closeInspector();
    completeRoom();
  }

  function headlineKey(): string {
    if ($run.screen === 'run-complete') return 'room.runComplete';
    if ($run.screen === 'run-lost') return 'room.runLost';
    if ($run.screen === 'fight' && $run.fightWon) return 'room.victory';
    return '';
  }

  function ctaKey(): string {
    if ($run.screen === 'run-complete' || $run.screen === 'run-lost') return 'room.newRun';
    return 'room.continue';
  }

  function onItemClick(item: Item): void {
    const current = $inspector;
    // Toggle off if same reward item is already open.
    if (current?.source === 'rewards' && current.item.id === item.id) {
      closeInspector();
      return;
    }
    inspectItem({ source: 'rewards', item });
  }

  function isInspecting(item: Item): boolean {
    return $inspector?.source === 'rewards' && $inspector.item.id === item.id;
  }
</script>

{#if showChest || $run.screen === 'run-lost'}
  <div class="overlay">
    <div class="card" class:lost={$run.screen === 'run-lost'}>
      <h2>{t(headlineKey())}</h2>

      {#if showChest}
        <div class="chest" aria-label={t('rewards.chest')}>
          <span class="chest-emoji">🎁</span>
          <div class="gold">
            <span class="gold-emoji">🪙</span>
            <span class="gold-value">{$pendingRewards.gold}</span>
          </div>

          {#if $pendingRewards.items.length > 0}
            <div class="items" role="list" aria-label={t('rewards.items')}>
              {#each $pendingRewards.items as item (item.id)}
                <button
                  type="button"
                  class="item-tile"
                  class:inspecting={isInspecting(item)}
                  data-inspector-source="rewards"
                  style="--tier-color: {TIER_COLORS[tierOf(item)] ?? '#666'}"
                  onclick={() => onItemClick(item)}
                  aria-label={t('rewards.itemAria', { tier: tierOf(item) })}
                >
                  <span class="item-emoji">{itemEmoji(item)}</span>
                  <span class="item-tier">T{tierOf(item)}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <button type="button" class="cta" onclick={onContinue}>{t(ctaKey())}</button>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 56px 0 0 0;
    background: rgba(10, 10, 14, 0.6);
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
  }
  .card {
    background: #1c1c24;
    border: 1px solid #3a3a48;
    border-radius: 12px;
    padding: 22px 28px;
    text-align: center;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 320px;
    max-width: min(640px, 92vw);
  }
  h2 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
    color: #ffcc44;
  }
  .card.lost h2 {
    color: #ef4444;
  }

  .chest {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .chest-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 3.8rem;
    line-height: 1;
  }
  .gold {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-variant-numeric: lining-nums tabular-nums;
  }
  .gold-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.4rem;
    line-height: 1;
  }
  .gold-value {
    font-size: 1.5rem;
    font-weight: 600;
    color: #ffcc44;
  }
  .items {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    padding-top: 4px;
  }
  .item-tile {
    appearance: none;
    width: 64px;
    height: 64px;
    border-radius: 8px;
    background: #14141a;
    border: 1px solid var(--tier-color, #2a2a34);
    color: inherit;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 4px;
    transition: background-color 100ms ease, border-color 100ms ease,
      transform 100ms ease;
  }
  .item-tile:hover {
    background: #1f1f28;
    transform: translateY(-1px);
  }
  .item-tile.inspecting {
    box-shadow: inset 0 0 0 2px #ffcc44;
  }
  .item-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.8rem;
    line-height: 1;
  }
  .item-tier {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--tier-color, #aaa);
    font-variant-numeric: lining-nums;
  }
  .cta {
    appearance: none;
    background: #3a3a48;
    border: 1px solid #4a4a58;
    color: #fff;
    border-radius: 8px;
    padding: 12px 20px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .cta:hover {
    background: #4a4a58;
    border-color: #ffcc44;
  }
  .cta:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }
</style>
