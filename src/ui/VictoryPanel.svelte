<script lang="ts">
  import { get } from 'svelte/store';
  import { paneEnter, paneLeave } from '../utils/paneTransition';
  import { revealInRail } from '../utils/revealInRail';
  import { completeRoom, run, startNewRun } from '../state/run';
  import { victoryHaul } from '../state/rewards';
  import { inspector, inspectItem } from '../state/inspector';
  import { gemInspector, inspectGem } from '../state/gem-inspector';
  import { equipped } from '../state/inventory';
  import { backpack } from '../state/backpack';
  import { findOwnedGemById } from '../state/gem-move';
  import { EQUIPMENT_SLOT_ORDER } from '../domain/equipment';
  import { isItem, type Item } from '../domain/item';
  import { isGem, type Gem } from '../domain/gem';
  import ItemCard from './ItemCard.svelte';
  import GemCard from './GemCard.svelte';
  import FightBreakdown from './FightBreakdown.svelte';
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

  // The haul was already claimed into the bag the instant the fight was won, so
  // there's nothing to "take" here - this panel is a read-only summary. The gold
  // header + item / gem cards read from the snapshot; Continue just advances.
  const haul = $derived($victoryHaul);

  function onContinue(): void {
    if (isRunComplete) {
      startNewRun();
      return;
    }
    completeRoom(); // clears the haul (back to the map) and advances
  }

  // The loot already lives in the bag (or got equipped). Resolve each summary
  // card to its live owner by id and open the right inspector there - so the
  // summary stays interactive (equip / disenchant / socket from the bag).
  function onItemClick(item: Item): void {
    const eq = get(equipped);
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      const it = eq[slot];
      if (it && it.id === item.id) {
        inspectItem({ source: 'inventory', slotId: slot, item: it });
        return;
      }
    }
    const bag = get(backpack);
    const idx = bag.findIndex((s) => isItem(s) && s.id === item.id);
    if (idx !== -1) inspectItem({ source: 'backpack', index: idx, item: bag[idx] as Item });
  }
  function isItemSelected(item: Item): boolean {
    return $inspector != null && $inspector.item.id === item.id;
  }

  // Resolve the gem to its live instance (loose in the bag, or socketed in owned
  // gear). A gem combined away no longer resolves, so its card is inert.
  function onGemClick(gem: Gem): void {
    const loose = get(backpack).find((s): s is Gem => isGem(s) && s.id === gem.id);
    const fresh = loose ?? findOwnedGemById(gem.id);
    if (fresh) inspectGem(fresh);
  }
  function isGemSelected(gem: Gem): boolean {
    return $gemInspector?.gem.id === gem.id;
  }

  // Live status of a haul entry, so the summary distinguishes loot still sitting
  // in the bag from loot the player has since equipped / socketed (or scrapped).
  function itemStatus(item: Item): 'equipped' | 'bag' | 'gone' {
    if (Object.values($equipped).some((it) => it && it.id === item.id)) return 'equipped';
    if ($backpack.some((s) => isItem(s) && s.id === item.id)) return 'bag';
    return 'gone';
  }
  function gemStatus(gem: Gem): 'socketed' | 'bag' | 'gone' {
    if ($backpack.some((s) => isGem(s) && s.id === gem.id)) return 'bag';
    for (const it of Object.values($equipped)) {
      if (it && it.sockets.some((s) => s?.id === gem.id)) return 'socketed';
    }
    for (const s of $backpack) {
      if (isItem(s) && s.sockets.some((g) => g?.id === gem.id)) return 'socketed';
    }
    return 'gone';
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
      <div class="gold">🪙 {haul?.gold ?? 0}</div>
    </div>
    <button type="button" class="leave" onclick={onContinue}>
      {t(isRunComplete ? 'room.newRun' : 'room.continue')}
    </button>
  </header>

  <div class="body">
    <!-- Interactive summary: everything here is already in the bag. The hint
         glow on each card flags what's worth equipping / combining / socketing;
         tapping a card inspects the now-owned item / gem. -->
    {#if haul && (haul.items.length > 0 || haul.gems.length > 0)}
      <p class="claimed-note">{t('rewards.claimed')}</p>
    {/if}
    {#if haul && haul.items.length > 0}
      <div class="group">
        <div class="group-label">{t('rewards.items')}</div>
        <div class="cards">
          {#each haul.items as item (item.id)}
            {@const st = itemStatus(item)}
            <div class="haul-cell" class:used={st === 'equipped'} class:gone={st === 'gone'}>
              <ItemCard
                {item}
                source="victory"
                showHint={st === 'bag'}
                selected={isItemSelected(item)}
                onClick={() => onItemClick(item)}
              />
              {#if st === 'equipped'}<span class="status-tag equipped">{t('rewards.equipped')}</span>{/if}
              {#if st === 'gone'}<span class="status-tag gone">{t('rewards.gone')}</span>{/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
    {#if haul && haul.gems.length > 0}
      <div class="group">
        <div class="group-label">{t('rewards.gems')}</div>
        <div class="cards">
          {#each haul.gems as gem (gem.id)}
            {@const st = gemStatus(gem)}
            <div class="haul-cell" class:used={st === 'socketed'} class:gone={st === 'gone'}>
              <GemCard
                {gem}
                showHint={st === 'bag'}
                selected={isGemSelected(gem)}
                onClick={() => onGemClick(gem)}
              />
              {#if st === 'socketed'}<span class="status-tag socketed">{t('rewards.socketed')}</span>{/if}
              {#if st === 'gone'}<span class="status-tag gone">{t('rewards.gone')}</span>{/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <FightBreakdown />
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
    background: var(--pane-glass);
    backdrop-filter: blur(12px) saturate(1.15);
    -webkit-backdrop-filter: blur(12px) saturate(1.15);
    border-left: 1px solid #28383d;
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
    border-bottom: 1px solid #18262a;
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
    color: #3cc7b8;
  }
  /* Gold reward styled like the inspector's tier badge. */
  .gold {
    align-self: flex-start;
    font-size: 0.85rem;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 4px;
    border: 1px solid #5a4a2a;
    color: #70ddd0;
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
    color: #6f7d7d;
  }
  /* "Added to your bag" note - reassures that the loot is already claimed. */
  .claimed-note {
    margin: 0;
    font-size: 0.82rem;
    color: #8aa;
    line-height: 1.35;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
  }

  /* A haul entry: the card plus an overlaid status ribbon. The card stretches to
     fill the grid cell; once equipped / socketed (or scrapped) the card dims so
     the still-in-bag loot reads as the actionable set, but the ribbon stays
     crisp on top. */
  .haul-cell {
    position: relative;
    display: block;
  }
  .haul-cell :global(.item-card),
  .haul-cell :global(.gem-card) {
    width: 100%;
  }
  .haul-cell.used :global(.item-card),
  .haul-cell.used :global(.gem-card) {
    opacity: 0.6;
  }
  .haul-cell.gone :global(.item-card),
  .haul-cell.gone :global(.gem-card) {
    opacity: 0.35;
  }
  .status-tag {
    position: absolute;
    bottom: 5px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 7px;
    border-radius: 999px;
    white-space: nowrap;
    pointer-events: none;
  }
  .status-tag.equipped,
  .status-tag.socketed {
    color: #04201d;
    background: #3cc7b8;
  }
  .status-tag.gone {
    color: #f0c8c8;
    background: #6a2a2a;
  }

  /* Continue / New Run sits in the header, styled exactly like the room panes'
     "Leave" button (same place, same chrome). */
  .leave {
    appearance: none;
    background: #28383d;
    border: 1px solid #374d52;
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
    background: #374d52;
    border-color: #3cc7b8;
  }
  .leave:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }
</style>
