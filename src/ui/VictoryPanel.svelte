<script lang="ts">
  import { paneEnter, paneLeave } from '../utils/paneTransition';
  import { revealInRail } from '../utils/revealInRail';
  import { completeRoom, run, startNewRun } from '../state/run';
  import { claimPendingRewards, pendingRewards } from '../state/rewards';
  import { inspector, inspectItem, closeInspector } from '../state/inspector';
  import { gemInspector, inspectGem } from '../state/gem-inspector';
  import type { Item } from '../domain/item';
  import type { Gem } from '../domain/gem';
  import ItemCard from './ItemCard.svelte';
  import GemCard from './GemCard.svelte';
  import { sfx } from '../audio/sfx';
  import { t } from '../i18n';

  // Fanfare once whenever this panel first appears for a given victory state.
  let lastSounded: string | null = null;
  $effect(() => {
    const cue =
      $run.screen === 'run-complete' ? 'run-complete' : $run.fightWon ? 'fight-victory' : null;
    if (cue && cue !== lastSounded) {
      lastSounded = cue;
      sfx.victory();
    } else if (!cue) {
      lastSounded = null;
    }
  });

  const isRunComplete = $derived($run.screen === 'run-complete');

  function onContinue(): void {
    claimPendingRewards();
    if (isRunComplete) {
      startNewRun();
      return;
    }
    closeInspector();
    completeRoom();
  }

  // Once every reward item and gem has been taken / equipped / scrapped, continue
  // automatically (gold is claimed on continue). `hadRewards` guards against an
  // immediate fire if a chest somehow had nothing to take; `continued` prevents a
  // double-fire before the panel unmounts.
  let hadRewards = false;
  let continued = false;
  $effect(() => {
    const left = $pendingRewards.items.length + $pendingRewards.gems.length;
    if (left > 0) {
      hadRewards = true;
    } else if (hadRewards && !continued) {
      continued = true;
      queueMicrotask(onContinue);
    }
  });

  // Reward item card -> inspect in the rail (source 'rewards', so the inspector
  // offers Take / Equip / Destroy). inspectItem toggles on a repeat tap.
  function onItemClick(item: Item): void {
    inspectItem({ source: 'rewards', item });
  }
  function isItemSelected(item: Item): boolean {
    return $inspector?.source === 'rewards' && $inspector.item.id === item.id;
  }
  function isGemSelected(gem: Gem): boolean {
    return $gemInspector?.gem.id === gem.id;
  }
</script>

<aside
  class="victory"
  aria-label={t(isRunComplete ? 'room.runComplete' : 'room.victory')}
  use:revealInRail
  in:paneEnter|global
  out:paneLeave|global
>
  <!-- Header mirrors the room panes (shop / armory / rest): emoji + title, with
       the primary action on the right where those panes put "Leave" - so the
       reward screen reads the same as every other room. -->
  <header class="head">
    <span class="emoji">🎁</span>
    <div class="title">
      <div class="name">{t(isRunComplete ? 'room.runComplete' : 'room.victory')}</div>
      <div class="gold">🪙 {$pendingRewards.gold}</div>
    </div>
    <button type="button" class="leave" onclick={onContinue}>
      {t(isRunComplete ? 'room.newRun' : 'room.continue')}
    </button>
  </header>

  <div class="body">
    {#if $pendingRewards.items.length > 0}
      <div class="group">
        <div class="group-label">{t('rewards.items')}</div>
        <div class="cards">
          {#each $pendingRewards.items as item (item.id)}
            <ItemCard
              {item}
              source="rewards"
              selected={isItemSelected(item)}
              onClick={() => onItemClick(item)}
            />
          {/each}
        </div>
      </div>
    {/if}
    {#if $pendingRewards.gems.length > 0}
      <div class="group">
        <div class="group-label">{t('rewards.gems')}</div>
        <div class="cards">
          {#each $pendingRewards.gems as gem (gem.id)}
            <GemCard {gem} selected={isGemSelected(gem)} onClick={() => inspectGem(gem)} />
          {/each}
        </div>
      </div>
    {/if}
  </div>
</aside>

<style>
  /* Reward pane - same chrome as the other rail panes. */
  .victory {
    flex: 0 0 auto;
    align-self: stretch;
    /* Every split is exactly a quarter of the screen: four tile to fill it, a
       fifth scrolls off (reached via the rail arrows). The floor keeps it usable
       where a quarter would be too narrow. */
    width: 25%;
    min-width: min(300px, 100%);
    min-height: 0;
    background: #1c1c24;
    border-left: 1px solid #3a3a48;
    display: flex;
    flex-direction: column;
    user-select: none;  }

  /* Inspector-style header: emoji + title column (name + gold badge). */
  .head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    height: 76px;
    box-sizing: border-box;
    padding: 0 14px;
    border-bottom: 1px solid #2a2a34;
  }
  .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 2rem;
    line-height: 1;
  }
  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-size: 1.1rem;
    font-weight: 600;
    color: #ffcc44;
  }
  /* Gold reward styled like the inspector's tier badge. */
  .gold {
    align-self: flex-start;
    font-size: 0.85rem;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 4px;
    border: 1px solid #5a4a2a;
    color: #ffd866;
    background: rgba(0, 0, 0, 0.3);
    font-variant-numeric: lining-nums tabular-nums;
  }

  /* Items / gems as stacked sections with wrapping card grids, like the shop. */
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

  /* Continue / New Run sits in the header, styled exactly like the room panes'
     "Leave" button (same place, same chrome). */
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
    white-space: nowrap;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .leave:hover {
    background: #4a4a58;
    border-color: #ffcc44;
  }
  .leave:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }
</style>
