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
  import { gemDisplay } from '../domain/gem-display';
  import { startGemDrag, gemDropZone } from '../state/gem-drag';
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
    }
    ghostPos = { x: e.clientX, y: e.clientY };
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest<HTMLElement>('[data-cell-index]');
    dragOver = cell ? Number(cell.dataset.cellIndex) : null;
  }

  function onPointerUp(): void {
    if (dragging !== null) {
      if (didDrag) {
        if (dragOver !== null && dragging !== dragOver) {
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

    <div class="grid" role="grid">
      {#each $backpack as slot, i (i)}
        {@const gem = isGem(slot) ? gemDisplay(slot) : null}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="cell"
          role="gridcell"
          tabindex={slot ? 0 : -1}
          class:dragging={didDrag && dragging === i}
          class:over={dragOver === i && didDrag && dragging !== i}
          class:stash-armed={$gemDropZone === 'stash'}
          class:gem-tile={gem !== null}
          class:inspecting={isInspecting(i)}
          style={gem ? `--gem-color: ${gem.role === 'effect' ? '#f6a' : '#6ad'}` : ''}
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
          {:else if gem}
            <span class="emoji">{gem.emoji}</span>
            <span
              class="gem-badge"
              class:effect={gem.role === 'effect'}
              class:support={gem.role === 'support'}
              title={`${gem.name} - ${gem.summary}`}
            >💠</span>
          {/if}
        </div>
      {/each}
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
