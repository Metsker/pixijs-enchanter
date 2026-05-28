<script lang="ts">
  import { backpack, moveItem, sortBackpack } from '../state/backpack';
  import { backpackOpen, toggleBackpack } from '../state/ui';
  import { itemEmoji, tierOf } from '../domain/item';
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

  let dragging = $state<number | null>(null);
  let dragOver = $state<number | null>(null);

  function onPointerDown(e: PointerEvent, index: number): void {
    if ($backpack[index] === null) return;
    dragging = index;
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
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest<HTMLElement>('[data-cell-index]');
    dragOver = cell ? Number(cell.dataset.cellIndex) : null;
  }

  function onPointerUp(): void {
    if (dragging !== null && dragOver !== null && dragging !== dragOver) {
      moveItem(dragging, dragOver);
    }
    dragging = null;
    dragOver = null;
  }
</script>

{#if $backpackOpen}
  <div class="backpack" role="dialog" aria-modal="false" aria-label={t('backpack.title')}>
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
      {#each $backpack as item, i (i)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="cell"
          role="gridcell"
          tabindex={item ? 0 : -1}
          class:dragging={dragging === i}
          class:over={dragOver === i && dragging !== null && dragging !== i}
          data-cell-index={i}
          onpointerdown={(e) => onPointerDown(e, i)}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
        >
          {#if item}
            <span class="emoji">{itemEmoji(item)}</span>
            <span
              class="tier"
              style="--tier-color: {TIER_COLORS[tierOf(item)] ?? '#666'}"
            >
              T{tierOf(item)}
            </span>
          {/if}
        </div>
      {/each}
    </div>

    <footer class="hint">{t('backpack.hint')}</footer>
  </div>
{/if}

<style>
  .backpack {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 480px;
    max-width: calc(100vw - 32px);
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
    font-size: 0.7rem;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    border: 1px solid var(--tier-color, #666);
    color: var(--tier-color, #999);
    background: rgba(0, 0, 0, 0.4);
    pointer-events: none;
  }

  .hint {
    padding: 8px 14px 12px;
    font-size: 0.8rem;
    color: #788;
  }
</style>
