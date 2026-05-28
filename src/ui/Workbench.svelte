<script lang="ts">
  import { onMount } from 'svelte';
  import {
    armed,
    armLock,
    canAddRoll,
    canDisenchantTop,
    canLockAny,
    canRerollAll,
    closeWorkbench,
    commitLock,
    disarmAction,
    doAddRoll,
    doDestroy,
    doDisenchantTop,
    doRerollAll,
    workbench,
  } from '../state/workbench';
  import {
    isSealed,
    itemEmoji,
    stackLayerAt,
    STACK_HEIGHT,
    tierOf,
    type Item,
    type StackLayer,
  } from '../domain/item';
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

  const stackSlots = Array.from({ length: STACK_HEIGHT }, (_, i) => i + 1);

  function layerLabel(layer: StackLayer): string {
    if (layer === 'main') return t('inspector.layer.main');
    if (layer === 'utility') return t('inspector.layer.utility');
    return t('inspector.layer.unique');
  }

  function isFilled(item: Item, slot: number): boolean {
    return slot <= tierOf(item);
  }

  function enchantAt(item: Item, slot: number) {
    return item.enchants[slot - 1] ?? null;
  }

  function onCellClick(slot: number): void {
    const subject = $workbench;
    if (!subject) return;
    if ($armed === 'lock') {
      if (slot > tierOf(subject.item)) return;
      if (isSealed(subject.item, slot)) return;
      commitLock(slot);
    }
  }

  function cellIsLegalForArmed(item: Item, slot: number): boolean {
    if ($armed !== 'lock') return false;
    return slot <= tierOf(item) && !isSealed(item, slot);
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!$workbench) return;
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if ($armed !== null) disarmAction();
      else closeWorkbench();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

{#if $workbench}
  {@const subject = $workbench}
  {@const item = subject.item}
  <div class="scrim"></div>
  <div class="workbench" role="dialog" aria-modal="false" aria-label={t('workbench.title')}>
    <header class="header">
      <span class="emoji">{itemEmoji(item)}</span>
      <div class="title">
        <div class="kind">{t(`item.type.${item.itemType}`)}</div>
        <div class="tier" style="--tier-color: {TIER_COLORS[tierOf(item)] ?? '#666'}">
          {t('inspector.tier', { tier: tierOf(item) })}
        </div>
      </div>
      <button
        type="button"
        class="close"
        aria-label={t('workbench.close')}
        onclick={closeWorkbench}
      >
        ✕
      </button>
    </header>

    <div class="body">
      <div class="stack">
        {#each stackSlots as slot (slot)}
          {@const layer = stackLayerAt(slot)}
          {@const filled = isFilled(item, slot)}
          {@const enchant = enchantAt(item, slot)}
          {@const sealed = isSealed(item, slot)}
          {@const legal = cellIsLegalForArmed(item, slot)}
          {@const dimmed = $armed !== null && !legal}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="cell"
            class:filled
            class:sealed
            class:legal
            class:dimmed
            onclick={() => onCellClick(slot)}
          >
            <span class="cell-emoji">{filled && enchant ? enchant.emoji : '·'}</span>
            <span class="cell-name">
              {#if filled && enchant}
                {t(enchant.nameKey)}
              {:else}
                {t('inspector.empty', { layer: layerLabel(layer) })}
              {/if}
            </span>
            <span class="cell-layer" class:main={layer === 'main'} class:utility={layer === 'utility'}>
              {layerLabel(layer)}
            </span>
            {#if sealed}
              <span class="seal-badge" aria-label="Sealed">🔒</span>
            {/if}
          </div>
        {/each}
      </div>

      <div class="actions">
        <button
          type="button"
          class="action"
          disabled={!canAddRoll(item)}
          title={canAddRoll(item) ? '' : t('workbench.add.maxed')}
          onclick={doAddRoll}
        >
          {t('workbench.action.add')}
        </button>
        <button
          type="button"
          class="action"
          disabled={!canRerollAll(item)}
          onclick={doRerollAll}
        >
          {t('workbench.action.rerollAll')}
        </button>
        <button type="button" class="action" disabled title={t('workbench.notYet')}>
          {t('workbench.action.rerollMains')}
        </button>
        <button type="button" class="action" disabled title={t('workbench.notYet')}>
          {t('workbench.action.rerollUtilities')}
        </button>
        <button type="button" class="action" disabled title={t('workbench.notYet')}>
          {t('workbench.action.transfer')}
        </button>
        <button
          type="button"
          class="action"
          disabled={!canDisenchantTop(item)}
          onclick={doDisenchantTop}
        >
          {t('workbench.action.disenchantTop')}
        </button>
        <button type="button" class="action" disabled title={t('workbench.notYet')}>
          {t('workbench.action.removeSelected')}
        </button>
        <button
          type="button"
          class="action"
          class:armed={$armed === 'lock'}
          disabled={!canLockAny(item)}
          onclick={armLock}
        >
          {t('workbench.action.lockSelected')}
        </button>
        <button type="button" class="action destroy" onclick={doDestroy}>
          {t('workbench.action.destroy')}
        </button>
      </div>
    </div>

    {#if $armed === 'lock'}
      <footer class="armed-bar">
        {t('workbench.armedLock')}
        <button type="button" class="disarm" onclick={disarmAction}>
          {t('workbench.disarm')}
        </button>
      </footer>
    {/if}
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 56px 0 0 0;
    background: rgba(8, 8, 12, 0.6);
    z-index: 95;
    backdrop-filter: blur(2px);
  }
  .workbench {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 640px;
    max-width: calc(100vw - 32px);
    max-height: calc(100dvh - 96px);
    background: #1c1c24;
    border: 1px solid #3a3a48;
    border-radius: 12px;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.6);
    z-index: 100;
    display: flex;
    flex-direction: column;
    user-select: none;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 14px 16px;
    border-bottom: 1px solid #2a2a34;
  }
  .header .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.8rem;
    line-height: 1;
  }
  .title {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kind {
    font-size: 1rem;
    font-weight: 600;
    color: #ddd;
  }
  .tier {
    align-self: flex-start;
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--tier-color, #666);
    color: var(--tier-color, #999);
    background: rgba(0, 0, 0, 0.3);
  }
  .close {
    appearance: none;
    background: transparent;
    border: 1px solid #2a2a34;
    color: #ddd;
    border-radius: 6px;
    width: 32px;
    height: 32px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .close:hover {
    background: #2a2a34;
  }

  .body {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    padding: 16px;
    min-height: 0;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 5px;
    overflow-y: auto;
  }
  .cell {
    position: relative;
    display: grid;
    grid-template-columns: 28px 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid #2a2a34;
    border-radius: 6px;
    background: #14141a;
    transition: background-color 80ms ease, border-color 80ms ease, opacity 80ms ease;
  }
  .cell:not(.filled) {
    opacity: 0.55;
  }
  .cell.sealed {
    border-style: dashed;
    border-color: #5a5a64;
  }
  .cell.legal {
    cursor: pointer;
    border-color: #ffcc44;
    background: #1f1f28;
  }
  .cell.legal:hover {
    background: #2a2a34;
  }
  .cell.dimmed {
    opacity: 0.3;
  }
  .cell-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.3rem;
    line-height: 1;
    justify-self: center;
  }
  .cell-name {
    font-size: 0.85rem;
    color: #ddd;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cell-layer {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 5px;
    border-radius: 4px;
    border: 1px solid #2a2a34;
  }
  .cell-layer.main {
    color: #ffd866;
    border-color: #5a4c1e;
  }
  .cell-layer.utility {
    color: #88c8ff;
    border-color: #2a4760;
  }
  .seal-badge {
    position: absolute;
    bottom: -4px;
    right: -4px;
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 0.95rem;
    background: #14141a;
    border-radius: 50%;
    padding: 0 2px;
    line-height: 1;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .action {
    appearance: none;
    background: #2a2a34;
    border: 1px solid #3a3a48;
    color: #ddd;
    border-radius: 6px;
    padding: 9px 12px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    min-height: 38px;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .action:hover:not(:disabled) {
    background: #3a3a48;
    border-color: #ffcc44;
  }
  .action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .action.destroy {
    background: #3a1a1a;
    border-color: #8a3a3a;
    color: #ff8888;
  }
  .action.destroy:hover {
    background: #5a2424;
    border-color: #cc4444;
  }
  .action.armed {
    background: #4a4a14;
    border-color: #ffcc44;
    color: #ffcc44;
  }

  .armed-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 16px;
    border-top: 1px solid #2a2a34;
    background: #14141a;
    color: #ffcc44;
    font-size: 0.85rem;
  }
  .disarm {
    appearance: none;
    background: #2a2a34;
    border: 1px solid #3a3a48;
    color: #ddd;
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
  }
  .disarm:hover {
    background: #3a3a48;
  }
</style>
