<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  // Custom pop-in/out: preserves the .backpack's translate(-50%, -50%)
  // centering transform while animating scale and opacity. svelte's built-in
  // `scale` transition replaces transform entirely and would un-center us.
  function popPanel(_node: Element, { duration = 180 }: { duration?: number } = {}) {
    return {
      duration,
      easing: cubicOut,
      css: (t: number) => `
        transform: translate(-50%, -50%) scale(${0.94 + 0.06 * t});
        opacity: ${t};
      `,
    };
  }
  import { backpack, moveItem, sortBackpack } from '../state/backpack';
  import { backpackOpen, toggleBackpack } from '../state/ui';
  import { isItem, itemEmoji, tierOf, type Item } from '../domain/item';
  import { isGem } from '../domain/gem';
  import { gemDisplay, SOCKET_COLOR_HEX } from '../domain/gem-display';
  import SocketPips from './SocketPips.svelte';
  import { startGemDrag, gemDropZone } from '../state/gem-drag';
  import { equipFromBackpackToSlot, itemDrag, itemFitsSlot } from '../state/inventory';
  import { disenchantItemFromBackpack, gemRefund, itemRefund } from '../state/disenchant';
  import type { EquipmentSlotId } from '../domain/equipment';
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

  import { get } from 'svelte/store';
  import { closeInspector, inspector, inspectItem } from '../state/inspector';

  // Bag tabs: the grid filters to items or gems. Empty cells show in BOTH tabs
  // as free drop targets (a slot is shared - either type can fill it), and the
  // drag logic still addresses cells by their real backpack index, so reorder /
  // combine / equip / trash all keep working under the filter.
  let activeTab = $state<'items' | 'gems'>('items');
  const itemCount = $derived($backpack.filter((s) => isItem(s)).length);
  const gemCount = $derived($backpack.filter((s) => isGem(s)).length);

  // Cells matching the active tab plus empty cells (shared free slots), in slot
  // order. Each keeps its real backpack index, so drag / reorder / combine /
  // equip all still address the right slot under the filter.
  const tabCells = $derived(
    $backpack
      .map((slot, i) => ({ slot, i }))
      .filter(({ slot }) =>
        slot === null || (activeTab === 'items' ? isItem(slot) : isGem(slot)),
      ),
  );

  // Render a CLEAN rectangular grid: complete rows of 4, at least 16 cells (4
  // rows). We show every matching item plus enough empty slots to fill those
  // rows, hiding only the trailing empties beyond - so the bag never shows a
  // ragged extra cell. If the active type leaves too few real cells, pad with
  // non-interactive fillers so the rows stay complete.
  const GRID_COLS = 4;
  const MIN_CELLS = 16;
  const grid = $derived.by(() => {
    let lastFilled = -1;
    tabCells.forEach((c, idx) => {
      if (c.slot !== null) lastFilled = idx;
    });
    const need = Math.max(MIN_CELLS, Math.ceil((lastFilled + 1) / GRID_COLS) * GRID_COLS);
    const cells = tabCells.slice(0, need);
    return { cells, fillers: need - cells.length };
  });

  let dragging = $state<number | null>(null);
  let dragOver = $state<number | null>(null);
  let didDrag = $state(false);
  // True while a dragged backpack ITEM hovers the trash slot (so the trash
  // lights up for an item drag, mirroring gemDropZone for a gem drag).
  let trashHot = $state(false);
  let ghostPos = $state<{ x: number; y: number } | null>(null);
  let pointerStart = { x: 0, y: 0 };
  // 10px threshold: clicks with minor jitter won't trigger drag visuals.
  const DRAG_THRESHOLD_SQ = 100;

  function onPointerDown(e: PointerEvent, index: number): void {
    const slot = $backpack[index];
    if (slot === null) return;
    // A loose gem in the grid drags via the global gem-drag controller (it
    // can drop onto sockets / equipped items / back into the backpack). Items
    // keep the local reorder drag below.
    if (isGem(slot)) {
      startGemDrag({ kind: 'backpack', gemId: slot.id }, e);
      return;
    }
    dragging = index;
    pointerStart = { x: e.clientX, y: e.clientY };
    didDrag = false;
    ghostPos = null; // gated: appears only once the threshold is crossed
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture can throw if the pointer isn't an active hardware
      // pointer (e.g. synthesised by automated tests). Drag still works via
      // bubbling pointermove/up; this just loses the capture optimisation.
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (dragging === null) return;
    if (!didDrag) {
      const dx = e.clientX - pointerStart.x;
      const dy = e.clientY - pointerStart.y;
      if (dx * dx + dy * dy <= DRAG_THRESHOLD_SQ) return;
      didDrag = true;
      // Real drag now: if this tile holds an equippable item, arm the
      // drag-to-equip highlight on the equipment column.
      const dragged = $backpack[dragging];
      if (isItem(dragged)) itemDrag.set({ item: dragged, targetSlot: null });
    }
    ghostPos = { x: e.clientX, y: e.clientY };
    const el = document.elementFromPoint(e.clientX, e.clientY);

    // Trash: an item dragged onto the trash slot will be disenchanted on drop.
    const dragged = $backpack[dragging];
    if (el?.closest('[data-trash]') && isItem(dragged)) {
      trashHot = true;
      itemDrag.update((d) => (d ? { ...d, targetSlot: null } : d));
      dragOver = null;
      return;
    }
    trashHot = false;

    // An equipment slot the dragged item is legal for takes priority over a
    // backpack reorder target.
    const slotEl = el?.closest<HTMLElement>('[data-slot-id]');
    if (slotEl && isItem(dragged)) {
      const slotId = slotEl.dataset.slotId as EquipmentSlotId;
      if (itemFitsSlot(dragged, slotId)) {
        itemDrag.update((d) => (d ? { ...d, targetSlot: slotId } : d));
        dragOver = null;
        return;
      }
    }
    itemDrag.update((d) => (d ? { ...d, targetSlot: null } : d));

    const cell = el?.closest<HTMLElement>('[data-cell-index]');
    dragOver = cell ? Number(cell.dataset.cellIndex) : null;
  }

  function onPointerUp(): void {
    if (dragging !== null) {
      if (didDrag) {
        const equipTarget = get(itemDrag)?.targetSlot ?? null;
        if (trashHot && isItem($backpack[dragging])) {
          // Dropped on the trash: disenchant the item (and its gems) for
          // crystals. Close the Inspector if it was showing this tile.
          const idx = dragging;
          if (disenchantItemFromBackpack(idx)) {
            const ins = get(inspector);
            if (ins?.source === 'backpack' && ins.index === idx) closeInspector();
          }
        } else if (equipTarget) {
          // Dropped on a compatible equipment slot: equip it there.
          const idx = dragging;
          if (equipFromBackpackToSlot(idx, equipTarget) !== null) {
            // The source tile now holds the displaced item (or is empty);
            // keep the Inspector pointed at whatever sits there now.
            const ins = get(inspector);
            if (ins?.source === 'backpack' && ins.index === idx) {
              const now = get(backpack)[idx];
              if (isItem(now)) inspector.set({ source: 'backpack', index: idx, item: now });
              else closeInspector();
            }
          }
        } else if (dragOver !== null && dragging !== dragOver) {
          const from = dragging;
          const to = dragOver;
          moveItem(from, to);
          // Inspector follows the swap: if it pointed at one of the
          // swapped tiles, flip its index to where its item now lives.
          // Otherwise the inspecting border stays on the wrong tile.
          const ins = get(inspector);
          if (ins?.source === 'backpack') {
            const slots = get(backpack);
            if (ins.index === from) {
              const moved = slots[to];
              if (isItem(moved)) inspector.set({ source: 'backpack', index: to, item: moved });
              else closeInspector();
            } else if (ins.index === to) {
              const moved = slots[from];
              if (isItem(moved)) inspector.set({ source: 'backpack', index: from, item: moved });
              else closeInspector();
            }
          }
        }
      } else {
        // No drag - treat as a tile click: open the Inspector. Only items are
        // inspectable; gems never reach here (they start a gem-drag instead).
        const item = $backpack[dragging];
        if (isItem(item)) {
          inspectItem({ source: 'backpack', index: dragging, item });
        }
      }
    }
    dragging = null;
    dragOver = null;
    ghostPos = null;
    didDrag = false;
    trashHot = false;
    itemDrag.set(null);
  }

  function isInspecting(i: number): boolean {
    const s = $inspector;
    return s?.source === 'backpack' && s.index === i;
  }
</script>

{#if $backpackOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="backpack-scrim"
    transition:fade={{ duration: 150 }}
    onclick={toggleBackpack}
  ></div>
  <div
    class="backpack"
    role="dialog"
    aria-modal="false"
    aria-label={t('backpack.title')}
    transition:popPanel
  >
    <header class="toolbar">
      <h2>{t('backpack.title')}</h2>
      <div class="actions">
        <button type="button" class="btn" onclick={sortBackpack}>{t('backpack.sort')}</button>
        <button
          type="button"
          class="btn icon"
          aria-label={t('backpack.close')}
          onclick={toggleBackpack}
        >
          ✕
        </button>
      </div>
    </header>

    <div class="tabs" role="tablist">
      <button
        type="button"
        class="tab"
        class:active={activeTab === 'items'}
        role="tab"
        aria-selected={activeTab === 'items'}
        onclick={() => (activeTab = 'items')}
      >
        {t('backpack.tab.items')} ({itemCount})
      </button>
      <button
        type="button"
        class="tab"
        class:active={activeTab === 'gems'}
        role="tab"
        aria-selected={activeTab === 'gems'}
        onclick={() => (activeTab = 'gems')}
      >
        {t('backpack.tab.gems')} ({gemCount})
      </button>
    </div>

    <div class="grid" role="grid">
      {#each grid.cells as { slot, i } (i)}
        {@const gem = isGem(slot) ? gemDisplay(slot) : null}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="cell"
          role="gridcell"
          tabindex={slot ? 0 : -1}
          class:dragging={didDrag && dragging === i}
          class:over={dragOver === i && didDrag && dragging !== i}
          class:stash-armed={$gemDropZone === 'stash'}
          class:combine-armed={isGem(slot) && $gemDropZone === `combine:${slot.id}`}
          class:gem-tile={gem !== null}
          class:inspecting={isInspecting(i)}
          style={gem ? `--gem-color: ${SOCKET_COLOR_HEX[gem.color]}` : ''}
          title={isItem(slot)
            ? `🗑️ 💎 ${itemRefund(slot)}`
            : isGem(slot)
              ? `${gem?.name ?? ''} - ${gem?.summary ?? ''} · 🗑️ 💎 ${gemRefund(slot)}`
              : ''}
          data-cell-index={i}
          data-inspector-source="backpack"
          onpointerdown={(e) => onPointerDown(e, i)}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
        >
          {#if isItem(slot)}
            <span class="emoji">{itemEmoji(slot)}</span>
            <span
              class="tier"
              style="--tier-color: {TIER_COLORS[tierOf(slot)] ?? '#666'}"
            >
              T{tierOf(slot)}
            </span>
            <SocketPips item={slot} />
          {:else if gem}
            <span class="emoji">{gem.emoji}</span>
            <span
              class="gem-badge"
              class:effect={gem.role === 'effect'}
              class:support={gem.role === 'support'}
            >💠</span>
            {#if gem.level > 1}
              <span class="gem-level">Lv{gem.level}</span>
            {/if}
          {/if}
        </div>
      {/each}
      <!-- Fillers complete the last row when the active tab's real cells don't
           fill it. Non-interactive (no index / handlers). -->
      {#each Array(grid.fillers) as _, fi (fi)}
        <div class="cell filler" aria-hidden="true"></div>
      {/each}
    </div>

    <!-- Trash slot (disenchant): drop a gem or item here to scrap it for
         crystals instantly (FEATURE 2). Separate from the 20 grid slots. -->
    <div
      class="trash"
      class:trash-armed={$gemDropZone === 'trash' || trashHot}
      data-trash
      title={t('backpack.trash.hint')}
    >
      <span class="trash-emoji">🗑️</span>
      <span class="trash-label">{t('backpack.trash')}</span>
    </div>

    <footer class="hint">{t('backpack.hint')}</footer>
  </div>

  {#if dragging !== null && ghostPos && isItem($backpack[dragging])}
    {@const ghostItem = $backpack[dragging] as Item}
    <div
      class="drag-ghost"
      style="left: {ghostPos.x}px; top: {ghostPos.y}px;"
      aria-hidden="true"
    >
      <span class="emoji">{itemEmoji(ghostItem)}</span>
      <span
        class="tier"
        style="--tier-color: {TIER_COLORS[tierOf(ghostItem)] ?? '#666'}"
      >
        T{tierOf(ghostItem)}
      </span>
      <SocketPips item={ghostItem} />
    </div>
  {/if}
{/if}

<style>
  .backpack-scrim {
    position: fixed;
    top: 56px; /* below the TopBar */
    bottom: 0;
    left: 80px; /* clear the InventoryColumn */
    right: 0;
    background: rgba(8, 8, 12, 0.45);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 95;
  }
  .backpack {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(480px, 90vw);
    max-height: calc(100dvh - 96px);
    background: #1c1c24;
    border: 1px solid #3a3a48;
    border-radius: 12px;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
    z-index: 100;
    display: flex;
    flex-direction: column;
    user-select: none;
    touch-action: none;
  }

  /* On short landscape viewports the grid cells can squeeze; cap the
     panel height and let the grid scroll vertically if all 5 rows don't
     fit. */
  @media (max-height: 500px) {
    .backpack {
      max-height: calc(100dvh - 72px);
    }
    .grid {
      gap: 4px;
      padding: 8px;
      overflow-y: auto;
      min-height: 0;
    }
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid #2a2a34;
  }

  .toolbar h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: #ddd;
  }

  .actions {
    display: flex;
    gap: 6px;
  }

  .btn {
    appearance: none;
    background: #2a2a34;
    border: 1px solid #3a3a48;
    color: #ddd;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 0.85rem;
    cursor: pointer;
    min-height: 32px;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .btn:hover {
    background: #3a3a48;
  }
  .btn.icon {
    padding: 0;
    width: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .btn:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }

  .tabs {
    display: flex;
    gap: 4px;
    padding: 8px 12px 0;
  }
  .tab {
    appearance: none;
    flex: 1;
    background: #181820;
    border: 1px solid #2a2a34;
    border-bottom: none;
    color: #99a;
    border-radius: 8px 8px 0 0;
    padding: 8px 10px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 34px;
    transition: background-color 100ms ease, color 100ms ease;
  }
  .tab:hover {
    background: #20202a;
    color: #ccd;
  }
  .tab.active {
    background: #2a2a34;
    color: #ffcc44;
    border-color: #3a3a48;
  }
  .tab:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    padding: 12px;
  }

  .cell {
    position: relative;
    aspect-ratio: 1 / 1;
    border: 1px solid #2a2a34;
    border-radius: 8px;
    background: #14141a;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 80ms ease, border-color 80ms ease, opacity 80ms ease;
  }
  /* Row-completing filler: looks like a faint empty slot but isn't a real
     backpack cell (no index / handlers), so it just keeps the grid rectangular. */
  .cell.filler {
    opacity: 0.3;
    background: #101015;
    cursor: default;
  }
  .cell.dragging {
    opacity: 0.3;
  }
  .cell.over {
    background: #2a2a34;
    border-color: #ffcc44;
  }
  /* Armed while a dragged gem hovers the grid: the whole backpack reads as a
     stash drop target. */
  .cell.stash-armed {
    border-color: #ffcc44;
    box-shadow: inset 0 0 0 1px rgba(255, 204, 68, 0.4);
  }
  /* Combine target: a same-defId gem cell under a dragged gem. Purple to read
     as a level-up, distinct from the gold stash highlight. */
  .cell.combine-armed {
    border-color: #c084fc;
    box-shadow: inset 0 0 0 2px #c084fc;
    background: #241a2e;
  }
  /* A cell holding a loose gem: a role-tinted ring distinguishes it from an
     item tile without resorting to a T# tier badge. */
  .cell.gem-tile {
    border-color: var(--gem-color, #6ad);
    box-shadow: inset 0 0 0 1px var(--gem-color, #6ad);
  }
  .cell.inspecting {
    border-color: #ffcc44;
    box-shadow: inset 0 0 0 1px #ffcc44;
  }

  .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.8rem;
    line-height: 1;
    pointer-events: none;
  }

  .tier {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1;
    padding: 2px 5px;
    border-radius: 4px;
    border: 1px solid var(--tier-color, #666);
    color: var(--tier-color, #999);
    background: rgba(0, 0, 0, 0.4);
    pointer-events: none;
    font-variant-numeric: lining-nums;
  }

  /* Gem marker: a small badge in the corner (NOT a tier badge), tinted by the
     gem's role so a loose gem reads distinctly from an item at a glance. */
  .gem-badge {
    position: absolute;
    top: 3px;
    right: 3px;
    font-size: 0.7rem;
    line-height: 1;
    pointer-events: none;
    filter: drop-shadow(0 0 2px #6ad);
  }
  .gem-badge.effect {
    filter: drop-shadow(0 0 3px #f6a);
  }
  .gem-badge.support {
    filter: drop-shadow(0 0 3px #6ad);
  }

  /* Combine level badge on a loose gem tile (shown only when level > 1). */
  .gem-level {
    position: absolute;
    bottom: 3px;
    left: 3px;
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    color: #f0e0ff;
    background: rgba(124, 58, 200, 0.85);
    border: 1px solid #c084fc;
    pointer-events: none;
    font-variant-numeric: lining-nums;
  }

  /* Trash / disenchant slot. Separate from the grid, visually distinct (red),
     lights up while a gem or item is dragged over it. */
  .trash {
    margin: 0 12px 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
    border: 1px dashed #5a2a2a;
    border-radius: 8px;
    background: #1a1012;
    color: #e88;
    user-select: none;
  }
  .trash-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.4rem;
    line-height: 1;
    pointer-events: none;
  }
  .trash-label {
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    pointer-events: none;
  }
  .trash.trash-armed {
    border-style: solid;
    border-color: #ef4444;
    background: #2a1414;
    box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.6);
  }

  .hint {
    padding: 8px 14px 12px;
    font-size: 0.8rem;
    color: #788;
  }

  .drag-ghost {
    position: fixed;
    width: 88px;
    height: 88px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 200;
    background: #14141a;
    border: 1px solid #ffcc44;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6);
    opacity: 0.95;
  }
</style>
