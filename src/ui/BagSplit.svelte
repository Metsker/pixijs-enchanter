<script lang="ts">
  import { get } from 'svelte/store';
  import { paneEnter, paneLeave } from '../utils/paneTransition';
  import { revealInRail } from '../utils/revealInRail';
  import { backpack, moveItem, sortBackpack } from '../state/backpack';
  import { closeItemsSplit, closeGemsSplit } from '../state/ui';
  import {
    isItem,
    itemEmoji,
    legalEquipmentSlots,
    tierOf,
    type Item,
  } from '../domain/item';
  import { isGem, type Gem, type SocketColor } from '../domain/gem';
  import { gemColor } from '../domain/gem-fit';
  import { gemDisplay, SOCKET_COLOR_HEX } from '../domain/gem-display';
  import { ownedContext, itemHint, gemHint } from '../state/loot-hints';
  import { closeInspector, inspector, inspectItem } from '../state/inspector';
  import { inspectGem, gemInspector } from '../state/gem-inspector';
  import { equipFromBackpack, equipped } from '../state/inventory';
  import { sellItemFromBackpack, sellGemFromBackpack, shopStock } from '../state/shop';
  import { itemSellValue, gemSellValue } from '../domain/shop';
  import {
    disenchantItemFromBackpack,
    destroyBackpackItemKeepGems,
    disenchantGemFromBackpack,
    itemRefund,
    gemRefund,
  } from '../state/disenchant';
  import { requestDestroy } from '../state/destroy-prompt';
  import { flashEquipSlot } from '../state/equip-feedback';
  import { EQUIPMENT_SLOT_ORDER, EQUIPMENT_SLOTS, type EquipmentSlotId } from '../domain/equipment';
  import { sfx } from '../audio/sfx';
  import SocketPips from './SocketPips.svelte';
  import { t } from '../i18n';

  const TIER_COLORS: Record<number, string> = {
    1: '#9ca3af',
    2: '#22c55e',
    3: '#3b82f6',
    4: '#a855f7',
    5: '#f97316',
    6: '#ef4444',
    7: '#33b6a6',
  };

  // Which kind this split shows. The bag is one `backpack` store; each split is
  // a filtered view of it (items, or loose gems). The bag is now a SCROLLABLE,
  // REORDERABLE vertical list of rows with inline actions (equip / sell /
  // destroy) rather than a grid of tiles - drag a row to reorder, tap it to
  // inspect, or hit a row button to act without opening the inspector.
  let { kind }: { kind: 'items' | 'gems' } = $props();
  const isItems = $derived(kind === 'items');
  const closeSplit = (): void => (kind === 'items' ? closeItemsSplit() : closeGemsSplit());

  // Gems split only: narrow to one socket colour. Items split only: narrow to one
  // equipment slot. null = all.
  let colorFilter = $state<SocketColor | null>(null);
  let typeFilter = $state<EquipmentSlotId | null>(null);
  const GEM_COLORS: SocketColor[] = ['red', 'green', 'blue'];
  const noFilter = $derived(isItems ? typeFilter === null : colorFilter === null);
  function clearFilter(): void {
    if (isItems) typeFilter = null;
    else colorFilter = null;
  }

  // The FILLED rows of this kind, each keeping its real backpack index so every
  // action / reorder addresses the right slot under the active filter. (Empties
  // aren't shown - a list has no use for blank rows.)
  const rows = $derived(
    $backpack
      .map((slot, i) => ({ slot, i }))
      .filter((c): c is { slot: Item | Gem; i: number } => {
        const { slot } = c;
        if (isItems)
          return (
            isItem(slot) && (typeFilter === null || legalEquipmentSlots(slot).includes(typeFilter))
          );
        return isGem(slot) && (colorFilter === null || gemColor(slot) === colorFilter);
      }),
  );
  const count = $derived($backpack.filter((s) => (isItems ? isItem(s) : isGem(s))).length);

  // Sell is only offered while a shop is open.
  const canSell = $derived($shopStock !== null);

  // === Reorder drag ================================================
  // Pointer-drag a row to reorder it within the bag (swap with the row dropped
  // on). A short move threshold distinguishes a drag from a tap; buttons inside
  // a row are never drag handles. Tapping (no drag) inspects the row's content.
  let dragging = $state<number | null>(null); // backpack index being dragged
  let dragOver = $state<number | null>(null); // backpack index under the pointer
  let didDrag = $state(false);
  let startX = 0;
  let startY = 0;
  const THRESHOLD_SQ = 64; // 8px

  function onRowPointerDown(e: PointerEvent, index: number): void {
    // Buttons (equip / sell / destroy) act on their own; never start a drag.
    if ((e.target as Element).closest('button')) return;
    dragging = index;
    startX = e.clientX;
    startY = e.clientY;
    didDrag = false;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture can throw for synthetic pointers; drag still works.
    }
  }

  function onRowPointerMove(e: PointerEvent): void {
    if (dragging === null) return;
    if (!didDrag) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (dx * dx + dy * dy <= THRESHOLD_SQ) return;
      didDrag = true;
    }
    const row = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>('[data-row-index]');
    dragOver = row ? Number(row.dataset.rowIndex) : null;
  }

  function onRowPointerUp(e: PointerEvent, index: number): void {
    if (e.type !== 'pointercancel' && dragging !== null) {
      if (didDrag) {
        const row = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>('[data-row-index]');
        const to = row ? Number(row.dataset.rowIndex) : NaN;
        if (Number.isInteger(to) && to !== dragging) {
          const from = dragging;
          moveItem(from, to);
          // Keep the inspector pointed at the item it was showing through the swap.
          const ins = get(inspector);
          if (ins?.source === 'backpack') {
            if (ins.index === from) syncInspectorIndex(to);
            else if (ins.index === to) syncInspectorIndex(from);
          }
        }
      } else {
        // A tap: inspect the row's content.
        const slot = $backpack[index];
        if (isItem(slot)) inspectItem({ source: 'backpack', index, item: slot });
        else if (isGem(slot)) inspectGem(slot);
      }
    }
    dragging = null;
    dragOver = null;
    didDrag = false;
  }

  function syncInspectorIndex(index: number): void {
    const now = get(backpack)[index];
    if (isItem(now)) inspector.set({ source: 'backpack', index, item: now });
    else closeInspector();
  }

  function isInspecting(index: number): boolean {
    const s = $inspector;
    return s?.source === 'backpack' && s.index === index;
  }
  function isGemInspecting(gem: Gem): boolean {
    return $gemInspector?.gem.id === gem.id && !$gemInspector?.shop;
  }

  // === Inline actions ==============================================
  // Equipping an item whose (single) legal slot is already occupied swaps with
  // the occupant, so the button reads "Swap" instead of "Equip".
  function wouldSwap(item: Item): boolean {
    const slots = legalEquipmentSlots(item);
    return slots.length > 0 && slots.every((s) => $equipped[s] !== null);
  }
  function onEquip(index: number): void {
    const item = $backpack[index];
    const swap = isItem(item) ? wouldSwap(item) : false;
    const landed = equipFromBackpack(index);
    if (landed !== null) {
      if (swap) sfx.swapItem();
      else sfx.equip();
      flashEquipSlot(landed);
      const ins = get(inspector);
      if (ins?.source === 'backpack' && ins.index === index) closeInspector();
    }
  }
  function onSellItem(index: number): void {
    sellItemFromBackpack(index);
  }
  function onDestroyItem(index: number): void {
    const slot = $backpack[index];
    if (!isItem(slot)) return;
    // An item still holding gems prompts to keep them (detach to the bag) or
    // scrap everything; otherwise it's destroyed straight away.
    if (slot.sockets.some((g) => g !== null)) {
      requestDestroy({
        item: slot,
        onKeepGems: () => destroyBackpackItemKeepGems(index),
        onDestroyAll: () => disenchantItemFromBackpack(index),
      });
      return;
    }
    disenchantItemFromBackpack(index);
  }
  function onSellGem(gem: Gem): void {
    sellGemFromBackpack(gem.id);
  }
  function onDestroyGem(gem: Gem): void {
    disenchantGemFromBackpack(gem.id);
  }

  // Readable label for an item row: its armour sub-slot or its item type.
  function itemLabel(item: Item): string {
    if (item.itemType === 'armor' && item.armorSlot) return t(`inventory.slot.${item.armorSlot}`);
    return t(`item.type.${item.itemType}`);
  }
</script>

<!-- A bag split: items or gems, as a scrollable + reorderable vertical list. The
     gems list root carries data-gem-stash so a gem dragged out of a socket (in
     the inspector) can be dropped here to stash it. -->
<div
  class="backpack"
  class:bag-items={isItems}
  class:bag-gems={!isItems}
  role="dialog"
  aria-label={t(isItems ? 'backpack.tab.items' : 'backpack.tab.gems')}
  data-gem-stash={isItems ? null : ''}
  use:revealInRail
  in:paneEnter|global
  out:paneLeave|global
>
  <header class="toolbar" data-pane-header>
    <h2>
      <span class="head-emoji">{isItems ? '🎒' : '💠'}</span>
      {t(isItems ? 'backpack.tab.items' : 'backpack.tab.gems')} ({count})
    </h2>
    <div class="actions">
      <button type="button" class="btn" onclick={sortBackpack}>{t('backpack.sort')}</button>
      <button type="button" class="btn icon" aria-label={t('backpack.close')} onclick={closeSplit}>
        ✕
      </button>
    </div>
  </header>

  <!-- Filter row: item-type chips (items) or socket-colour dots (gems). -->
  <div class="filters" role="group" aria-label={t('backpack.filter.all')}>
    <button type="button" class="filter all" class:active={noFilter} onclick={clearFilter}>
      {t('backpack.filter.all')}
    </button>
    {#if isItems}
      {#each EQUIPMENT_SLOT_ORDER as slot (slot)}
        <button
          type="button"
          class="filter type-chip"
          class:active={typeFilter === slot}
          title={t(EQUIPMENT_SLOTS[slot].nameKey)}
          aria-label={t(EQUIPMENT_SLOTS[slot].nameKey)}
          aria-pressed={typeFilter === slot}
          onclick={() => (typeFilter = typeFilter === slot ? null : slot)}
        >
          {EQUIPMENT_SLOTS[slot].emoji}
        </button>
      {/each}
    {:else}
      {#each GEM_COLORS as c (c)}
        <button
          type="button"
          class="filter dot"
          class:active={colorFilter === c}
          style="--c: {SOCKET_COLOR_HEX[c]}"
          aria-label={c}
          aria-pressed={colorFilter === c}
          onclick={() => (colorFilter = colorFilter === c ? null : c)}
        ></button>
      {/each}
    {/if}
  </div>

  <div class="list" role="list">
    {#each rows as { slot, i } (i)}
      {#if isItem(slot)}
        {@const ih = itemHint(slot, $ownedContext)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="row"
          class:dragging={didDrag && dragging === i}
          class:over={dragOver === i && didDrag && dragging !== i}
          class:inspecting={isInspecting(i)}
          role="listitem"
          data-row-index={i}
          onpointerdown={(e) => onRowPointerDown(e, i)}
          onpointermove={onRowPointerMove}
          onpointerup={(e) => onRowPointerUp(e, i)}
          onpointercancel={(e) => onRowPointerUp(e, i)}
        >
          <span class="row-gutter"><SocketPips item={slot} inline /></span>
          <span class="row-emoji">{itemEmoji(slot)}</span>
          <div class="row-main">
            <span class="row-name">{itemLabel(slot)}</span>
            <span class="tier" style="--tier-color: {TIER_COLORS[tierOf(slot)] ?? '#5c6a6a'}">
              T{tierOf(slot)}
            </span>
            {#if ih}
              <span
                class="hint-badge"
                class:hint-new={ih === 'new'}
                class:hint-upgrade={ih === 'upgrade'}
                title={t(`hint.item.${ih}`)}
              >{ih === 'new' ? '✦' : '↑'}</span>
            {/if}
          </div>
          <div class="row-acts">
            <button type="button" class="act equip" onclick={() => onEquip(i)}>
              {wouldSwap(slot) ? t('inspector.swap') : t('inspector.equip')}
            </button>
            {#if canSell}
              <button type="button" class="act icon" aria-label={t('inspector.sell', { price: itemSellValue(slot) })} title={t('inspector.sell', { price: itemSellValue(slot) })} onclick={() => onSellItem(i)}>🪙</button>
            {/if}
            <button type="button" class="act danger disenchant" aria-label={t('inspector.disenchant', { refund: itemRefund(slot) })} title={t('inspector.disenchant', { refund: itemRefund(slot) })} onclick={() => onDestroyItem(i)}>✕ 💎 {itemRefund(slot)}</button>
          </div>
        </div>
      {:else if isGem(slot)}
        {@const gd = gemDisplay(slot)}
        {@const gh = gemHint(slot, $ownedContext)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="row gem"
          class:dragging={didDrag && dragging === i}
          class:over={dragOver === i && didDrag && dragging !== i}
          class:inspecting={isGemInspecting(slot)}
          role="listitem"
          data-row-index={i}
          style="--gem-color: {gd ? SOCKET_COLOR_HEX[gd.color] : '#5c6a6a'}"
          onpointerdown={(e) => onRowPointerDown(e, i)}
          onpointermove={onRowPointerMove}
          onpointerup={(e) => onRowPointerUp(e, i)}
          onpointercancel={(e) => onRowPointerUp(e, i)}
        >
          <span class="row-emoji">{gd?.emoji ?? '💠'}</span>
          <div class="row-main">
            <span class="row-name">{gd?.name ?? slot.defId}</span>
            {#if gd && gd.level > 1}<span class="gem-level">Lv{gd.level}</span>{/if}
            <span class="row-role" class:effect={gd?.role === 'effect'} class:support={gd?.role === 'support'}>
              {gd?.role === 'support' ? t('gemInspector.role.support') : t('gemInspector.role.effect')}
            </span>
            {#if gh.combine}<span class="hint-badge combine" title={t('hint.gem.combine')}>⊕</span>{/if}
            {#if gh.socket}<span class="hint-badge socket" title={t('hint.gem.socket')}>◈</span>{/if}
          </div>
          <div class="row-acts">
            {#if canSell}
              <button type="button" class="act icon" aria-label={t('gemInspector.sell', { price: gemSellValue(slot) })} title={t('gemInspector.sell', { price: gemSellValue(slot) })} onclick={() => onSellGem(slot)}>🪙</button>
            {/if}
            <button type="button" class="act danger disenchant" aria-label={t('gemInspector.disenchant', { refund: gemRefund(slot) })} title={t('gemInspector.disenchant', { refund: gemRefund(slot) })} onclick={() => onDestroyGem(slot)}>✕ 💎 {gemRefund(slot)}</button>
          </div>
        </div>
      {/if}
    {/each}
    {#if rows.length === 0}
      <p class="empty">{isItems ? t('bag.empty.items') : t('bag.empty.gems')}</p>
    {/if}
  </div>
</div>

<style>
  /* In-rail bag panel: a fixed-width flex column stretched to the rail's full
     height, snapping as the player scrolls/swipes. */
  .backpack {
    flex: 0 0 auto;
    align-self: stretch;
    width: 25%;
    min-width: min(300px, 100%);
    min-height: 0;
    background: var(--pane-glass);
    backdrop-filter: blur(12px) saturate(1.15);
    -webkit-backdrop-filter: blur(12px) saturate(1.15);
    border-left: 1px solid #28383d;
    display: flex;
    flex-direction: column;
    user-select: none;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 76px;
    box-sizing: border-box;
    padding: 0 14px;
    border-bottom: 1px solid #18262a;
  }
  .toolbar h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: #c0cdcd;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .head-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 2rem;
    line-height: 1;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .btn {
    appearance: none;
    background: #18262a;
    border: 1px solid #28383d;
    color: #c0cdcd;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 0.85rem;
    cursor: pointer;
    min-height: 32px;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .btn:hover {
    background: #28383d;
  }
  .btn.icon {
    padding: 0;
    width: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .btn:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }

  .filters {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 12px 0;
  }
  .filter {
    appearance: none;
    background: #0f181b;
    border: 1px solid #18262a;
    color: #7f8e8e;
    border-radius: 6px;
    cursor: pointer;
    min-height: 28px;
    transition: border-color 100ms ease, background-color 100ms ease;
  }
  .filter.all {
    padding: 4px 10px;
    font-size: 0.78rem;
    font-weight: 600;
  }
  .filter.dot {
    width: 28px;
    padding: 0;
    background: radial-gradient(circle at center, var(--c) 0 9px, transparent 10px), #0f181b;
  }
  .filter.type-chip {
    width: 30px;
    padding: 0;
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1rem;
    line-height: 1;
  }
  .filter:hover {
    border-color: #374d52;
    color: #bbc8c8;
  }
  .filter.active {
    border-color: #3cc7b8;
    color: #3cc7b8;
    box-shadow: inset 0 0 0 1px #3cc7b8;
  }
  .filter:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }

  /* The list fills the panel and scrolls internally. */
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
  }
  .empty {
    margin: 8px 4px;
    color: #647171;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  /* A bag row: socket gutter | emoji | main | actions. Item sockets draw as a
     vertical pip strip in the left gutter (same as everywhere else), which can
     make a many-socket row taller; a min-height keeps small items + every gem
     row uniform. Touch-action none so a vertical drag reorders rather than
     scrolling the list. */
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding: 8px 10px;
    border: 1px solid #18262a;
    border-radius: 8px;
    background: #0c1517;
    cursor: grab;
    touch-action: none;
    transition: border-color 100ms ease, background-color 100ms ease, opacity 100ms ease,
      box-shadow 100ms ease;
  }
  /* Left gutter holding the vertical socket pips (item rows only - gems have no
     sockets, so their rows omit it and the emoji sits flush left). */
  .row-gutter {
    flex: none;
    width: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .row:hover {
    background: #0f181b;
    border-color: #374d52;
  }
  /* A gem row reads its socket colour on the left edge. */
  .row.gem {
    border-left: 3px solid var(--gem-color, #6ad);
  }
  .row.dragging {
    opacity: 0.4;
    cursor: grabbing;
  }
  .row.over {
    border-color: #3cc7b8;
    box-shadow: inset 0 0 0 1px #3cc7b8;
  }
  .row.inspecting {
    border-color: #3cc7b8;
    box-shadow: inset 0 0 0 1px #3cc7b8;
  }
  .row-emoji {
    flex: none;
    /* At least 30px so names line up, but it GROWS to fit a wide emoji glyph
       (inline-flex, content-sized) so the glyph never spills onto the name. */
    min-width: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.6rem;
    line-height: 1;
    pointer-events: none;
  }
  /* One-line row body: name + tier/level + role + hint badges. Details (sockets,
     descriptions) live in the inspector, not here. */
  .row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    pointer-events: none;
  }
  .row-name {
    font-size: 1rem;
    font-weight: 600;
    color: #dde7e7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tier {
    flex: none;
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1;
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid var(--tier-color, #5c6a6a);
    color: var(--tier-color, #849393);
    background: rgba(0, 0, 0, 0.4);
    font-variant-numeric: lining-nums;
  }
  .gem-level {
    flex: none;
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    color: #f0e0ff;
    background: rgba(124, 58, 200, 0.85);
    border: 1px solid #c084fc;
    font-variant-numeric: lining-nums;
  }
  .hint-badge {
    flex: none;
    font-size: 0.66rem;
    line-height: 1;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-weight: 700;
  }
  .hint-badge.hint-new {
    color: #07120b;
    background: #4caf6a;
  }
  .hint-badge.hint-upgrade {
    color: #1a1205;
    background: #e0a93f;
  }
  .hint-badge.combine {
    color: #f0e0ff;
    background: #7c3ac8;
  }
  .hint-badge.socket {
    color: #04201d;
    background: #3cc7b8;
  }
  .row-role {
    flex: none;
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    border-radius: 999px;
    font-weight: 700;
  }
  .row-role.effect {
    color: #ffd0e6;
    background: rgba(255, 102, 170, 0.18);
    border: 1px solid #f6a;
  }
  .row-role.support {
    color: #cfe6ff;
    background: rgba(102, 170, 221, 0.18);
    border: 1px solid #6ad;
  }

  /* Inline action buttons in a HORIZONTAL row on the right (matching the item
     inspector's slim ⇄ / ✕ socket buttons). They capture their own pointer
     events; the rest of the row is the drag / tap handle. */
  .row-acts {
    flex: none;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 4px;
  }
  .act {
    appearance: none;
    border: 1px solid #28383d;
    background: #121d20;
    color: #c0cdcd;
    border-radius: 6px;
    padding: 0 10px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 32px;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background-color 100ms ease, border-color 100ms ease, color 100ms ease;
  }
  /* Icon-only action (sell / destroy): a slim square, like the socket ✕. */
  .act.icon {
    width: 32px;
    padding: 0;
    font-size: 0.95rem;
    line-height: 1;
  }
  .act:hover {
    background: #18262a;
    border-color: #3cc7b8;
  }
  .act:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }
  .act.equip {
    background: #28383d;
    color: #fff;
  }
  .act.equip:hover {
    background: #374d52;
  }
  .act.danger {
    border-color: #3a2326;
    background: #160d0f;
    color: #d98a8a;
  }
  /* Disenchant now shows its crystal refund inline (✕ 💎 N), so it is a
     text-width button (not the slim icon square) - keep its digits lined. */
  .act.disenchant {
    font-variant-numeric: lining-nums tabular-nums;
  }
  .act.danger:hover {
    background: #2a1417;
    border-color: #c44;
    color: #f0a8a8;
  }
</style>
