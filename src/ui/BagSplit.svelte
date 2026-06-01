<script lang="ts">
  import { paneEnter, paneLeave } from '../utils/paneTransition';
  import { revealInRail } from '../utils/revealInRail';
  import { backpack, moveItem, sortBackpack } from '../state/backpack';
  import { closeItemsSplit, closeGemsSplit } from '../state/ui';
  import { isItem, itemEmoji, legalEquipmentSlots, tierOf, type Item } from '../domain/item';
  import { isGem, type Gem, type SocketColor } from '../domain/gem';
  import { gemColor } from '../domain/gem-fit';
  import { gemDisplay, SOCKET_COLOR_HEX } from '../domain/gem-display';
  import SocketPips from './SocketPips.svelte';
  import { startGemDrag, gemDropZone } from '../state/gem-drag';
  import { inspectGem, closeGemInspector } from '../state/gem-inspector';
  import { socketGemIntoItem } from '../state/gem-move';
  import { equipFromBackpack, equipFromBackpackToSlot, equipped, itemDrag, itemFitsSlot } from '../state/inventory';
  import { EQUIPMENT_SLOT_ORDER, EQUIPMENT_SLOTS, type EquipmentSlotId } from '../domain/equipment';
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

  import { get } from 'svelte/store';
  import { closeInspector, inspector, inspectItem } from '../state/inspector';

  // Which kind this split shows. The bag is one `backpack` store; each split is
  // a filtered view of it (items, or loose gems = the stash). Mounted once per
  // kind in App.svelte and gated by its own open store.
  let { kind }: { kind: 'items' | 'gems' } = $props();
  const isItems = $derived(kind === 'items');
  const closeSplit = (): void => (kind === 'items' ? closeItemsSplit() : closeGemsSplit());
  // Filled cells of this kind (for the header count).
  const count = $derived($backpack.filter((s) => (isItems ? isItem(s) : isGem(s))).length);

  // Gems split only: narrow the grid to one socket colour (null = all colours).
  let colorFilter = $state<SocketColor | null>(null);
  const GEM_COLORS: SocketColor[] = ['red', 'green', 'blue'];

  // Items split only: narrow the grid to one equipment slot (null = all). One
  // chip per slot, matching the equipment bar - an item matches when that slot
  // is one of its legal slots (so an armour piece filters by its own slot).
  let typeFilter = $state<EquipmentSlotId | null>(null);

  // Whether the "All" chip is active, and a clear, for this split's filter.
  const noFilter = $derived(isItems ? typeFilter === null : colorFilter === null);
  function clearFilter(): void {
    if (isItems) typeFilter = null;
    else colorFilter = null;
  }

  // Cells of this kind plus empty cells (shared free slots), in slot order. Each
  // keeps its real backpack index, so drag / reorder / combine / equip / trash
  // all still address the right slot under the filter. In the gems split a
  // colour filter hides non-matching gems (empties stay as drop targets).
  const tabCells = $derived(
    $backpack
      .map((slot, i) => ({ slot, i }))
      .filter(({ slot }) => {
        if (slot === null) return true;
        if (isItems)
          return isItem(slot) && (typeFilter === null || legalEquipmentSlots(slot).includes(typeFilter));
        if (!isGem(slot)) return false;
        return colorFilter === null || gemColor(slot) === colorFilter;
      }),
  );

  // Render a CLEAN rectangular grid that tracks the pane size on BOTH axes:
  // columns AUTO-FILL the width (more columns as the pane widens, constant tile
  // size) and rows are sized to the available HEIGHT, so the visible cell count
  // fills the panel and only scrolls once the contents exceed it. We measure the
  // realised column count + how many tiles fit the height, and complete the last
  // row to the column count (padding with non-interactive fillers if the active
  // filter leaves too few real cells), so the grid is never ragged.
  const MIN_ROWS = 2;
  let gridEl = $state<HTMLDivElement>();
  let cols = $state(2);
  let rows = $state(MIN_ROWS);
  $effect(() => {
    const el = gridEl;
    if (!el) return;
    // Re-measure on resize (the pane flex-grows / shrinks as panes open + close
    // and the viewport changes).
    const measure = (): void => {
      const cs = getComputedStyle(el);
      const c = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
      if (c > 0) cols = c;
      // Square tiles, so a cell's height is its width; count how many rows of
      // them (plus the row gap) fit the grid's content height.
      const cell = el.querySelector('.cell');
      const tile = cell ? cell.getBoundingClientRect().height : 0;
      const gap = parseFloat(cs.rowGap) || 0;
      const avail =
        el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      if (tile > 0 && avail > 0) {
        rows = Math.max(MIN_ROWS, Math.floor((avail + gap) / (tile + gap)));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });
  const grid = $derived.by(() => {
    let lastFilled = -1;
    tabCells.forEach((c, idx) => {
      if (c.slot !== null) lastFilled = idx;
    });
    const c = Math.max(1, cols);
    // Fill the visible area (cols x rows), and grow to hold every filled cell -
    // always a whole number of rows, so the last row is never ragged.
    const need = Math.max(c * rows, Math.ceil((lastFilled + 1) / c) * c);
    const cells = tabCells.slice(0, need);
    return { cells, fillers: need - cells.length };
  });

  let dragging = $state<number | null>(null);
  let dragOver = $state<number | null>(null);
  let didDrag = $state(false);
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
      // Drag to move/socket/combine; a tap opens the gem inspector, a
      // double-tap sockets it into the selected (inspected) item.
      startGemDrag({ kind: 'backpack', gemId: slot.id }, e, () => onGemTap(slot));
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
    const dragged = $backpack[dragging];

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

  function onPointerUp(e: PointerEvent): void {
    if (dragging !== null && e.type !== 'pointercancel') {
      if (didDrag) {
        const idx = dragging;
        const dragged = $backpack[idx];
        // Decide the drop from the ACTUAL release point - re-hit-testing here
        // rather than trusting the targetSlot / dragOver captured during the last
        // pointermove. The browser coalesces / throttles move events, so on a real
        // drag the final move ONTO the slot can fail to fire, leaving targetSlot
        // stale and the drop a silent no-op ("won't accept it"). The gem-drag
        // controller already re-tests on up; this brings the item drag in line.
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const slotEl = isItem(dragged) ? el?.closest<HTMLElement>('[data-slot-id]') : null;
        const slotId = slotEl?.dataset.slotId as EquipmentSlotId | undefined;

        if (slotId && isItem(dragged) && itemFitsSlot(dragged, slotId)) {
          // Dropped on a compatible equipment slot: equip it there.
          if (equipFromBackpackToSlot(idx, slotId) !== null) {
            // The source tile now holds the displaced item (or is empty); keep the
            // Inspector pointed at whatever sits there now.
            const ins = get(inspector);
            if (ins?.source === 'backpack' && ins.index === idx) {
              const now = get(backpack)[idx];
              if (isItem(now)) inspector.set({ source: 'backpack', index: idx, item: now });
              else closeInspector();
            }
          }
        } else {
          // Not over a compatible slot: a bag reorder if released over another cell.
          const cellEl = el?.closest<HTMLElement>('[data-cell-index]');
          const to = cellEl ? Number(cellEl.dataset.cellIndex) : NaN;
          if (Number.isInteger(to) && to !== idx) {
            moveItem(idx, to);
            // Inspector follows the swap: if it pointed at one of the swapped
            // tiles, flip its index to where its item now lives.
            const ins = get(inspector);
            if (ins?.source === 'backpack') {
              const slots = get(backpack);
              if (ins.index === idx) {
                const moved = slots[to];
                if (isItem(moved)) inspector.set({ source: 'backpack', index: to, item: moved });
                else closeInspector();
              } else if (ins.index === to) {
                const moved = slots[idx];
                if (isItem(moved)) inspector.set({ source: 'backpack', index: idx, item: moved });
                else closeInspector();
              }
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
    itemDrag.set(null);
  }

  // A loose gem: a tap opens (toggles) the gem inspector IMMEDIATELY; a quick
  // second tap on the same gem sockets it into the SELECTED (inspected) item's
  // first open matching socket. The inspector is a side pane now (not a modal
  // covering the bag), so the second tap still lands on the gem - no need to
  // delay the first tap to disambiguate, which is what made open/close laggy.
  let lastGemTap: { id: string; t: number } | null = null;
  const GEM_DBL_MS = 250;
  function onGemTap(gem: Gem): void {
    const now = Date.now();
    if (lastGemTap && lastGemTap.id === gem.id && now - lastGemTap.t < GEM_DBL_MS) {
      lastGemTap = null;
      if (equipGemIntoSelected(gem)) closeGemInspector();
      return;
    }
    lastGemTap = { id: gem.id, t: now };
    inspectGem(gem);
  }

  // Socket `gem` into the currently inspected item (its first open colour-matched
  // socket), if one is open. Returns whether it socketed; false when nothing
  // editable is selected or no matching socket is free.
  function equipGemIntoSelected(gem: Gem): boolean {
    const ins = get(inspector);
    if (!ins || (ins.source !== 'inventory' && ins.source !== 'backpack' && ins.source !== 'rewards')) {
      return false;
    }
    const color = gemColor(gem);
    if (!color) return false;
    const item = ins.item;
    const hasSlot = item.sockets.some((s, i) => s === null && item.socketColors[i] === color);
    return hasSlot ? socketGemIntoItem(gem, item) : false;
  }

  // Double-click a backpack ITEM: equip it into its first EMPTY legal slot (only
  // when one is free - no swap on double-click). Loose gems use onGemTap above.
  function onItemDblClick(index: number): void {
    const slot = $backpack[index];
    if (!isItem(slot)) return;
    const eq = get(equipped);
    const hasEmpty = legalEquipmentSlots(slot).some((s) => eq[s] === null);
    if (!hasEmpty) return;
    const landed = equipFromBackpack(index);
    if (landed !== null) {
      const now = get(equipped)[landed];
      if (now) inspector.set({ source: 'inventory', slotId: landed, item: now });
    }
  }

  function isInspecting(i: number): boolean {
    const s = $inspector;
    return s?.source === 'backpack' && s.index === i;
  }
</script>

<!-- A bag split: items or gems. The gems panel root carries data-gem-stash so a
     gem dragged onto its empty space un-sockets / stashes (cell drops still
     combine / reorder - the gem-drag hit-test checks cells first). Mounted per
     kind and gated by the parent (App.svelte). -->
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
        <button
          type="button"
          class="btn icon"
          aria-label={t('backpack.close')}
          onclick={closeSplit}
        >
          ✕
        </button>
      </div>
    </header>

    <!-- Filter row: item-type chips on the Items split, socket-colour dots on
         the Gems split. "All" clears the filter. -->
    <div class="gem-filters" role="group" aria-label={t('backpack.filter.all')}>
      <button
        type="button"
        class="gem-filter all"
        class:active={noFilter}
        onclick={clearFilter}
      >
        {t('backpack.filter.all')}
      </button>
      {#if isItems}
        {#each EQUIPMENT_SLOT_ORDER as slot (slot)}
          <button
            type="button"
            class="gem-filter type-chip"
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
            class="gem-filter dot"
            class:active={colorFilter === c}
            style="--c: {SOCKET_COLOR_HEX[c]}"
            aria-label={c}
            aria-pressed={colorFilter === c}
            onclick={() => (colorFilter = colorFilter === c ? null : c)}
          ></button>
        {/each}
      {/if}
    </div>

    <div class="grid" role="grid" bind:this={gridEl}>
      {#each grid.cells as { slot, i } (i)}
        {@const gem = isGem(slot) ? gemDisplay(slot) : null}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="cell"
          role="gridcell"
          tabindex={slot ? 0 : -1}
          class:dragging={didDrag && dragging === i}
          class:over={dragOver === i && didDrag && dragging !== i}
          class:stash-armed={!isItems && $gemDropZone === `backpack-cell:${i}`}
          class:combine-armed={isGem(slot) && $gemDropZone === `combine:${slot.id}`}
          class:gem-tile={gem !== null}
          class:inspecting={isInspecting(i)}
          style={gem ? `--gem-color: ${SOCKET_COLOR_HEX[gem.color]}` : ''}
          title={isItem(slot)
            ? t(`item.type.${slot.itemType}`)
            : gem
              ? `${gem.name} - ${gem.summary}`
              : ''}
          data-cell-index={i}
          data-inspector-source="backpack"
          onpointerdown={(e) => onPointerDown(e, i)}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
          ondblclick={() => onItemDblClick(i)}
        >
          {#if isItem(slot)}
            <span class="emoji">{itemEmoji(slot)}</span>
            <span
              class="tier"
              style="--tier-color: {TIER_COLORS[tierOf(slot)] ?? '#5c6a6a'}"
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
        style="--tier-color: {TIER_COLORS[tierOf(ghostItem)] ?? '#5c6a6a'}"
      >
        T{tierOf(ghostItem)}
      </span>
      <SocketPips item={ghostItem} />
    </div>
  {/if}

<style>
  /* In-rail bag panel: a fixed-width flex column stretched to the rail's full
     height, snapping as the player scrolls/swipes. (Was a centered modal.) */
  .backpack {
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
    user-select: none;
    touch-action: none;  }

  /* On short landscape viewports the grid cells can squeeze; trim chrome and
     let the grid scroll vertically if all rows don't fit. */
  @media (max-height: 500px) {
    .grid {
      gap: 4px;
      padding: 8px;
    }
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

  /* Filter row: item-type chips (items) or socket-colour dots (gems). */
  .gem-filters {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 12px 0;
  }
  .gem-filter {
    appearance: none;
    background: #0f181b;
    border: 1px solid #18262a;
    color: #7f8e8e;
    border-radius: 6px;
    cursor: pointer;
    min-height: 28px;
    transition: border-color 100ms ease, background-color 100ms ease;
  }
  .gem-filter.all {
    padding: 4px 10px;
    font-size: 0.78rem;
    font-weight: 600;
  }
  .gem-filter.dot {
    width: 28px;
    padding: 0;
    background:
      radial-gradient(circle at center, var(--c) 0 9px, transparent 10px),
      #0f181b;
  }
  .gem-filter.type-chip {
    width: 30px;
    padding: 0;
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1rem;
    line-height: 1;
  }
  .gem-filter:hover {
    border-color: #374d52;
    color: #bbc8c8;
  }
  .gem-filter.active {
    border-color: #3cc7b8;
    color: #3cc7b8;
    box-shadow: inset 0 0 0 1px #3cc7b8;
  }
  .gem-filter:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }

  .grid {
    display: grid;
    /* Auto-fill: columns scale with the pane width, tiles keep a constant size
       (~120-150px). The row-completion logic above measures the realised count. */
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 6px;
    padding: 12px;
    /* Fill the panel and scroll internally so the trash / sell / hint stay
       pinned at the bottom of the bag panel. */
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    align-content: start;
  }

  .cell {
    position: relative;
    aspect-ratio: 1 / 1;
    border: 1px solid #18262a;
    border-radius: 8px;
    background: #0c1517;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 80ms ease, border-color 80ms ease, opacity 80ms ease;
  }
  /* Row-completing filler: looks like a faint empty slot but isn't a real
     backpack cell (no index / handlers), so it just keeps the grid rectangular. */
  .cell.filler {
    opacity: 0.3;
    background: #080f11;
    cursor: default;
  }
  .cell.dragging {
    opacity: 0.3;
  }
  .cell.over {
    background: #18262a;
    border-color: #3cc7b8;
  }
  /* Armed while a dragged gem hovers the grid: the whole backpack reads as a
     stash drop target. */
  .cell.stash-armed {
    border-color: #3cc7b8;
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
    border-color: #3cc7b8;
    box-shadow: inset 0 0 0 1px #3cc7b8;
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
    border: 1px solid var(--tier-color, #5c6a6a);
    color: var(--tier-color, #849393);
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

  .drag-ghost {
    position: fixed;
    width: 88px;
    height: 88px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 200;
    background: #0c1517;
    border: 1px solid #3cc7b8;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6);
    opacity: 0.95;
  }
</style>
