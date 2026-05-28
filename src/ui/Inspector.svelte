<script lang="ts">
  import { closeInspector, inspector } from '../state/inspector';
  import { equipFromBackpack, equipped, unequipToBackpack } from '../state/inventory';
  import { backpack } from '../state/backpack';
  import { fight } from '../state/fight';
  import {
    itemEmoji,
    legalEquipmentSlots,
    stackLayerAt,
    STACK_HEIGHT,
    tierOf,
    type Item,
    type StackLayer,
  } from '../domain/item';
  import { t } from '../i18n';
  import { clickOutside } from '../utils/clickOutside';

  let hovered = $state<{ slot: number; item: Item } | null>(null);

  const TIER_COLORS: Record<number, string> = {
    1: '#9ca3af',
    2: '#22c55e',
    3: '#3b82f6',
    4: '#a855f7',
    5: '#f97316',
    6: '#ef4444',
    7: '#fbbf24',
  };

  // Slot 1 (Main) at top of the visual list, slot 6 (Utility) at bottom.
  // Reads top-to-bottom as the enchant order the player added them in.
  const stackSlots = Array.from({ length: STACK_HEIGHT }, (_, i) => i + 1);

  function enchantAt(item: Item, slotIndex1Based: number) {
    return item.enchants[slotIndex1Based - 1] ?? null;
  }

  function isFilled(item: Item, slotIndex1Based: number): boolean {
    return slotIndex1Based <= tierOf(item);
  }

  // Comparison item: for a Backpack-source inspection, find an item currently
  // equipped in any of the inspected item's legal equipment slots. If found,
  // its enchant stack renders side-by-side. Inventory-source has no
  // comparison (it IS the equipped item).
  function comparisonItem(): Item | null {
    const subject = $inspector;
    if (!subject || subject.source !== 'backpack') return null;
    const legal = legalEquipmentSlots(subject.item);
    for (const slotId of legal) {
      const eq = $equipped[slotId];
      if (eq) return eq;
    }
    return null;
  }

  const ctaLabel = $derived.by(() => {
    if (!$inspector) return '';
    return $inspector.source === 'backpack' ? t('inspector.equip') : t('inspector.unequip');
  });

  const ctaDisabledReason = $derived.by((): string | null => {
    if (!$inspector) return null;
    if ($fight.inFight) return t('inspector.cta.duringCombat');
    if ($inspector.source === 'backpack') {
      const legal = legalEquipmentSlots($inspector.item);
      const hasEmptyLegal = legal.some((slotId) => $equipped[slotId] === null);
      if (!hasEmptyLegal) return t('inspector.cta.noEmptySlot');
    }
    if ($inspector.source === 'inventory') {
      if (!$backpack.includes(null)) return t('inspector.cta.backpackFull');
    }
    return null;
  });

  function handleCta(): void {
    const subject = $inspector;
    if (!subject) return;
    if (subject.source === 'backpack') {
      if (equipFromBackpack(subject.index) !== null) closeInspector();
    } else {
      if (unequipToBackpack(subject.slotId)) closeInspector();
    }
  }

  function layerLabel(layer: StackLayer): string {
    if (layer === 'main') return t('inspector.layer.main');
    if (layer === 'utility') return t('inspector.layer.utility');
    return t('inspector.layer.unique');
  }
</script>

{#if $inspector}
  {@const subject = $inspector}
  {@const compare = comparisonItem()}
  <aside
    class="inspector"
    class:with-compare={compare !== null}
    aria-label={t('inspector.title')}
    use:clickOutside={{
      onOutside: closeInspector,
      ignoreSelectors: ['[data-inspector-source]'],
    }}
  >
    <header class="header">
      <span class="emoji">{itemEmoji(subject.item)}</span>
      <div class="title">
        <div class="kind">{t(`item.type.${subject.item.itemType}`)}</div>
        <div class="tier" style="--tier-color: {TIER_COLORS[tierOf(subject.item)] ?? '#666'}">
          {t('inspector.tier', { tier: tierOf(subject.item) })}
        </div>
      </div>
      <button
        type="button"
        class="close"
        aria-label={t('inspector.close')}
        onclick={closeInspector}
      >
        ✕
      </button>
    </header>

    {#snippet stackColumn(item: Item, label: string | null)}
      <div class="stack-col">
        {#if label}<div class="stack-label">{label}</div>{/if}
        <div class="stack">
          {#each stackSlots as slotIndex (slotIndex)}
            {@const layer = stackLayerAt(slotIndex)}
            {@const filled = isFilled(item, slotIndex)}
            {@const enchant = enchantAt(item, slotIndex)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="cell"
              class:filled
              class:hovered={hovered?.slot === slotIndex && hovered?.item.id === item.id}
              onmouseenter={() => (hovered = { slot: slotIndex, item })}
              onmouseleave={() => (hovered = null)}
            >
              <span class="cell-emoji">
                {#if filled && enchant}{enchant.emoji}{:else}·{/if}
              </span>
              <span class="cell-name">
                {#if filled && enchant}
                  {t(enchant.nameKey)}
                {:else}
                  {t('inspector.empty', { layer: layerLabel(layer) })}
                {/if}
              </span>
              <span
                class="cell-layer"
                class:main={layer === 'main'}
                class:utility={layer === 'utility'}
              >
                {layerLabel(layer)}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/snippet}

    <div class="stacks">
      {@render stackColumn(subject.item, compare ? t('inspector.stack.inspected') : null)}
      {#if compare}
        {@render stackColumn(compare, t('inspector.stack.equipped'))}
      {/if}
    </div>

    <div class="hint">
      {#if hovered === null}
        <div class="hint-prompt">{t('inspector.hint.prompt')}</div>
      {:else}
        {@const layer = stackLayerAt(hovered.slot)}
        {@const enchant = enchantAt(hovered.item, hovered.slot)}
        {#if isFilled(hovered.item, hovered.slot) && enchant}
          <div class="hint-header">
            <span class="emoji">{enchant.emoji}</span>
            <div>
              <div class="hint-name">{t(enchant.nameKey)}</div>
              <div class="hint-meta">
                {layerLabel(layer)} · {enchant.pools.map((p) => t(`enchant.pool.${p}`)).join(' / ')}
              </div>
            </div>
          </div>
          <div class="hint-desc">{t(enchant.descriptionKey)}</div>
        {:else}
          <div class="hint-empty">{t('inspector.hint.emptyCell', { layer: layerLabel(layer) })}</div>
        {/if}
      {/if}
    </div>

    <footer class="footer">
      <button
        type="button"
        class="cta"
        disabled={ctaDisabledReason !== null}
        title={ctaDisabledReason ?? ''}
        onclick={handleCta}
      >
        {ctaLabel}
      </button>
    </footer>
  </aside>
{/if}

<style>
  .inspector {
    position: fixed;
    top: 56px;
    right: 0;
    bottom: 0;
    width: 360px;
    max-width: calc(100vw - 16px);
    background: #1c1c24;
    border-left: 1px solid #2a2a34;
    box-shadow: -18px 0 40px rgba(0, 0, 0, 0.45);
    z-index: 90;
    display: flex;
    flex-direction: column;
    user-select: none;
    transition: width 180ms ease;
  }
  .inspector.with-compare {
    width: 560px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 12px 14px;
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
    font-size: 0.95rem;
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

  .stacks {
    flex: 1;
    display: flex;
    gap: 12px;
    padding: 12px;
    overflow-y: auto;
    min-height: 0;
  }
  .stack-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .stack-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #788;
    padding: 0 2px;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .cell {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border: 1px solid #2a2a34;
    border-radius: 6px;
    background: #14141a;
    transition: background-color 80ms ease, border-color 80ms ease;
  }
  .cell:not(.filled) {
    opacity: 0.55;
  }
  .cell.hovered {
    border-color: #ffcc44;
    background: #1f1f28;
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

  .hint {
    border-top: 1px solid #2a2a34;
    padding: 12px 14px;
    min-height: 110px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hint-prompt {
    color: #788;
    font-size: 0.85rem;
    font-style: italic;
  }
  .hint-header {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .hint-header .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.6rem;
  }
  .hint-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: #eee;
  }
  .hint-meta {
    font-size: 0.75rem;
    color: #9aa;
  }
  .hint-desc {
    font-size: 0.85rem;
    color: #ccc;
    line-height: 1.45;
  }
  .hint-empty {
    color: #788;
    font-size: 0.85rem;
  }

  .footer {
    padding: 12px 14px;
    border-top: 1px solid #2a2a34;
  }
  .cta {
    width: 100%;
    appearance: none;
    background: #3a3a48;
    border: 1px solid #4a4a58;
    color: #fff;
    border-radius: 8px;
    padding: 12px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .cta:hover:not(:disabled) {
    background: #4a4a58;
    border-color: #ffcc44;
  }
  .cta:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .cta:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }
</style>
