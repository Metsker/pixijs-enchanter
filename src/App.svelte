<script lang="ts">
  import { onMount, untrack, tick } from 'svelte';
  import TopBar from './ui/TopBar.svelte';
  import Battlefield from './ui/Battlefield.svelte';
  import BagSplit from './ui/BagSplit.svelte';
  import StatsSplit from './ui/StatsSplit.svelte';
  import VictoryPanel from './ui/VictoryPanel.svelte';
  import Inspector from './ui/Inspector.svelte';
  import GemInspector from './ui/GemInspector.svelte';
  import Map from './ui/Map.svelte';
  import ShopRoom from './ui/ShopRoom.svelte';
  import RestRoom from './ui/RestRoom.svelte';
  import RoomOverlay from './ui/RoomOverlay.svelte';
  import ItemSelect from './ui/ItemSelect.svelte';
  import ConfirmModal from './ui/ConfirmModal.svelte';
  import DestroyPrompt from './ui/DestroyPrompt.svelte';
  import Settings from './ui/Settings.svelte';
  import { toggleBag, itemsSplitOpen, gemsSplitOpen, statsSplitOpen } from './state/ui';
  import { run } from './state/run';
  import { inspector } from './state/inspector';
  import { gemInspector } from './state/gem-inspector';
  import { sfx } from './audio/sfx';
  import { loadSave, startAutoSave } from './state/save';
  import { activeGemDrag } from './state/gem-drag';
  import { gemDisplay } from './domain/gem-display';
  import { t } from './i18n';

  // Load any prior run before the subscribers attach so the first
  // save (debounced 600ms after mount) just rewrites the same state.
  loadSave();
  startAutoSave();

  onMount(() => {
    function isEditable(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditable(e.target)) return;
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        toggleBag();
      }
    };

    // Global UI click sound: matches buttons + the project's other
    // interactive primitives (map node, backpack cell, inspector
    // enchant cell, shop / item-offer tile). Sold / taken tiles and
    // non-clickable inspector cells are excluded so a click on a
    // dead-end target stays silent. Buttons with their own sfx
    // (Buy / pick / coin) layer on top - sfx.click is a 40ms tick.
    const CLICK_SELECTOR =
      'button, .node.reachable, .item-tile:not(.sold):not(.taken), .cell.clickable, [data-cell-index]';
    const onClick = (e: MouseEvent) => {
      const target = e.target;
      // Element (not HTMLElement) so SVG children of map nodes
      // bubble through to a .closest match on the parent <g>.
      if (!(target instanceof Element)) return;
      const el = target.closest(CLICK_SELECTOR);
      if (!el) return;
      if (el.tagName === 'BUTTON' && (el as HTMLButtonElement).disabled) return;
      sfx.click();
    };
    document.addEventListener('click', onClick, true);

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onClick, true);
    };
  });

  // === Rail panel ordering =========================================
  // The rail renders open panels in the ORDER THE PLAYER OPENED THEM, left to
  // right: `panelOrder` keeps each open panel's key, dropping closed ones and
  // appending newly opened ones (so a closed-then-reopened panel moves to the
  // end / right).
  type PanelKey = 'victory' | 'inspector' | 'gem' | 'items' | 'gems' | 'stats';
  const PANEL_KEYS: PanelKey[] = ['victory', 'inspector', 'gem', 'items', 'gems', 'stats'];

  const panelOpen = $derived<Record<PanelKey, boolean>>({
    victory: ($run.screen === 'fight' && $run.fightWon) || $run.screen === 'run-complete',
    inspector: $inspector !== null,
    gem: $gemInspector !== null,
    items: $itemsSplitOpen,
    gems: $gemsSplitOpen,
    stats: $statsSplitOpen,
  });

  // The shop and the Armory are themselves part of the pane layout (left-aligned
  // "room" panes), so on those screens the rail flows in from the left instead
  // of overlaying a full-stage room. Map / battle keep their full-stage room +
  // right overlay.
  const isShop = $derived($run.screen === 'shop');
  const isArmory = $derived($run.screen === 'item-select');
  const isRest = $derived($run.screen === 'rest');
  const isFlow = $derived(isShop || isArmory || isRest);

  let panelOrder = $state<PanelKey[]>([]);
  $effect(() => {
    const open = panelOpen;
    untrack(() => {
      // Newly-opened panels go to the END (right); already-open panels keep
      // their relative order; closed ones drop out.
      const kept = panelOrder.filter((k) => open[k]);
      const added = PANEL_KEYS.filter((k) => open[k] && !panelOrder.includes(k));
      panelOrder = [...kept, ...added];
    });
  });

  // Soft open / close cue whenever the number of open rail panes changes (a
  // reorder swaps without changing the count, so it stays quiet here).
  let prevPanelCount = 0;
  $effect(() => {
    const count = panelOrder.length;
    untrack(() => {
      if (count > prevPanelCount) sfx.uiOpen();
      else if (count < prevPanelCount) sfx.uiClose();
      prevPanelCount = count;
    });
  });

  // === Rail step-arrows ============================================
  // The rail does not free-scroll; when the open panes overflow the stage these
  // edge arrows step it by exactly ONE pane. canLeft / canRight gate which arrow
  // shows (and whether there's any overflow), re-measured on scroll, on resize,
  // and whenever the open set changes.
  let railEl = $state<HTMLDivElement>();
  let canLeft = $state(false);
  let canRight = $state(false);
  function measureRail(): void {
    const el = railEl;
    if (!el) return;
    canLeft = el.scrollLeft > 1;
    canRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
  }
  // Each pane's scroll offset within the rail (the scrollLeft that aligns it to
  // the start), via rects so it's robust to the rail's positioning.
  function paneOffsets(): number[] {
    const el = railEl;
    if (!el) return [];
    const railLeft = el.getBoundingClientRect().left;
    return [...el.children].map((c) =>
      Math.round(c.getBoundingClientRect().left - railLeft + el.scrollLeft),
    );
  }
  function scrollRail(dir: 1 | -1, behavior: ScrollBehavior = 'smooth'): void {
    const el = railEl;
    if (!el) return;
    const offsets = paneOffsets();
    const cur = el.scrollLeft;
    const eps = 2;
    const target =
      dir > 0
        ? offsets.find((o) => o > cur + eps) ?? el.scrollWidth
        : [...offsets].reverse().find((o) => o < cur - eps) ?? 0;
    el.scrollTo({ left: target, behavior });
  }
  $effect(() => {
    const el = railEl;
    if (!el) return;
    // Touch panelOrder / isShop so this re-runs (and re-measures) when the open
    // set changes - panes added, removed, or swapped between flow + overlay.
    void panelOrder;
    void isFlow;
    measureRail();
    const ro = new ResizeObserver(measureRail);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    el.addEventListener('scroll', measureRail, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', measureRail);
    };
  });

  // === Drag-to-reorder splits ======================================
  // Drag a pane by its header (any element marked [data-pane-header]) to move it
  // among the other open panes: as the pointer crosses a neighbour's centre we
  // swap the two in panelOrder, and the keyed {#each} re-renders in the new
  // order. (The keyed list is also what makes animate:flip a drop-in for the
  // polish phase.) The flow "room" panes (shop / armory / rest) aren't in
  // panelOrder, so they stay pinned first and aren't draggable.
  let reorderKey = $state<PanelKey | null>(null);
  let reorderStart: { x: number; y: number; key: PanelKey } | null = null;

  // Resolve which open pane a header belongs to: walk up to the rail's direct
  // child, then map its DOM index to panelOrder (offsetting any leading flow
  // room, which isn't in panelOrder).
  function paneKeyFromHeader(header: Element): PanelKey | null {
    const rail = railEl;
    if (!rail) return null;
    let node: Element | null = header;
    while (node && node.parentElement !== rail) node = node.parentElement;
    if (!node) return null;
    const kids = [...rail.children];
    const orderIndex = kids.indexOf(node) - (kids.length - panelOrder.length);
    return orderIndex >= 0 ? panelOrder[orderIndex] ?? null : null;
  }

  function onReorderDown(e: PointerEvent): void {
    if (!(e.target instanceof Element)) return;
    const header = e.target.closest('[data-pane-header]');
    if (!header || e.target.closest('button')) return; // buttons aren't handles
    const key = paneKeyFromHeader(header);
    if (key) reorderStart = { x: e.clientX, y: e.clientY, key };
  }

  // An element's x within the rail's scroll CONTENT (scroll-independent), so a
  // reorder FLIP animates the order change without fighting a simultaneous
  // pagination scroll.
  function railContentLeft(el: HTMLElement): number {
    const rail = railEl;
    if (!rail) return el.getBoundingClientRect().left;
    return el.getBoundingClientRect().left + rail.scrollLeft - rail.getBoundingClientRect().left;
  }

  // Slide an element from its previous content-x to its new one (FLIP), so a
  // reorder swap animates instead of jumping. A per-element timer clears the
  // inline styles and guards against overlapping FLIPs.
  const flipTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
  function flipX(el: HTMLElement, firstContentLeft: number): void {
    const dx = firstContentLeft - railContentLeft(el);
    if (Math.abs(dx) < 1) return;
    const prev = flipTimers.get(el);
    if (prev) clearTimeout(prev);
    el.style.transition = 'none';
    el.style.transform = `translateX(${dx}px)`;
    void el.offsetWidth; // force reflow so the next change animates from here
    el.style.transition = 'transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1)';
    el.style.transform = 'translateX(0)';
    flipTimers.set(
      el,
      setTimeout(() => {
        el.style.transition = '';
        el.style.transform = '';
        flipTimers.delete(el);
      }, 240),
    );
  }

  function swapPanes(a: number, b: number): void {
    const kids = railEl ? ([...railEl.children] as HTMLElement[]) : [];
    const flowOffset = kids.length - panelOrder.length;
    const elA = kids[flowOffset + a];
    const elB = kids[flowOffset + b];
    const firstA = elA ? railContentLeft(elA) : 0;
    const firstB = elB ? railContentLeft(elB) : 0;
    const next = panelOrder.slice();
    [next[a], next[b]] = [next[b], next[a]];
    panelOrder = next;
    sfx.swap();
    // FLIP the two swapped panes by their CONTENT delta - scroll-independent, so
    // it composes cleanly with a simultaneous pagination scroll.
    if (elA && elB) {
      void tick().then(() => {
        flipX(elA, firstA);
        flipX(elB, firstB);
      });
    }
  }

  // The rail child element backing an open pane key (for the drag "lift").
  function railChildForKey(key: PanelKey): HTMLElement | null {
    const rail = railEl;
    if (!rail) return null;
    const kids = [...rail.children] as HTMLElement[];
    const flowOffset = kids.length - panelOrder.length;
    return kids[flowOffset + panelOrder.indexOf(key)] ?? null;
  }
  let liftedEl: HTMLElement | null = null;

  // Swap the dragged pane with whichever neighbour's centre the pointer (at x)
  // has crossed. Called on pointer move and on each auto-scroll frame.
  function reorderSwapAt(x: number): void {
    if (reorderKey === null || !railEl) return;
    const kids = [...railEl.children];
    const flowOffset = kids.length - panelOrder.length;
    const i = panelOrder.indexOf(reorderKey);
    if (i < 0) return;
    if (i > 0) {
      const r = kids[flowOffset + i - 1]?.getBoundingClientRect();
      if (r && x < r.left + r.width / 2) {
        swapPanes(i, i - 1);
        return;
      }
    }
    if (i < panelOrder.length - 1) {
      const r = kids[flowOffset + i + 1]?.getBoundingClientRect();
      if (r && x > r.left + r.width / 2) swapPanes(i, i + 1);
    }
  }

  // Edge auto-scroll while dragging: when the dragged pane is held near a rail
  // edge (and the panes overflow), the rail steps one whole SECTION toward that
  // edge - snapping exactly like the arrow buttons, never a partial offset - and
  // the dragged pane is re-placed against the pointer over the revealed pane. A
  // rAF loop paces the steps so holding at the edge advances section by section.
  let reorderPointerX = 0;
  let autoScrollDir = 0;
  let autoScrollRaf: number | null = null;
  let lastStepAt = 0;
  const EDGE_ZONE = 64;
  const STEP_MS = 350; // pace between section steps while held at an edge

  function autoScrollStep(ts: number): void {
    if (reorderKey === null || autoScrollDir === 0) {
      autoScrollRaf = null;
      return;
    }
    if (ts - lastStepAt >= STEP_MS) {
      // Smoothly page one section toward the edge (the pagination animation),
      // and swap the dragged pane one slot that way - the swap FLIPs by its
      // content delta, so it slides cleanly over the scroll without fighting it.
      reorderSwapAt(reorderPointerX);
      scrollRail(autoScrollDir as 1 | -1);
      lastStepAt = ts;
    }
    autoScrollRaf = requestAnimationFrame(autoScrollStep);
  }

  function updateAutoScroll(x: number): void {
    const rail = railEl;
    if (!rail) return;
    const rect = rail.getBoundingClientRect();
    const dir = x < rect.left + EDGE_ZONE ? -1 : x > rect.right - EDGE_ZONE ? 1 : 0;
    if (dir !== autoScrollDir) {
      autoScrollDir = dir;
      lastStepAt = 0; // entering an edge -> the first section step fires at once
    }
    if (autoScrollDir !== 0 && autoScrollRaf === null) {
      autoScrollRaf = requestAnimationFrame(autoScrollStep);
    }
  }

  function onReorderMove(e: PointerEvent): void {
    // Arm only past a small threshold, so a tap on the header isn't a drag.
    if (reorderStart && reorderKey === null) {
      const dx = e.clientX - reorderStart.x;
      const dy = e.clientY - reorderStart.y;
      if (dx * dx + dy * dy < 36) return;
      reorderKey = reorderStart.key;
      sfx.pickUp();
      liftedEl = railChildForKey(reorderKey);
      liftedEl?.classList.add('reorder-lift');
    }
    if (reorderKey === null) return;
    e.preventDefault();
    reorderPointerX = e.clientX;
    updateAutoScroll(e.clientX);
    // In the middle, reordering follows the pointer directly; at an edge the
    // section-step loop drives it instead, so the rail stays snapped.
    if (autoScrollDir === 0) reorderSwapAt(e.clientX);
  }

  function onReorderUp(): void {
    const wasDragging = reorderKey !== null;
    reorderStart = null;
    reorderKey = null;
    autoScrollDir = 0;
    if (autoScrollRaf !== null) {
      cancelAnimationFrame(autoScrollRaf);
      autoScrollRaf = null;
    }
    liftedEl?.classList.remove('reorder-lift');
    liftedEl = null;
    if (wasDragging) sfx.drop();
  }

  $effect(() => {
    const el = railEl;
    if (!el) return;
    el.addEventListener('pointerdown', onReorderDown);
    document.addEventListener('pointermove', onReorderMove);
    document.addEventListener('pointerup', onReorderUp);
    document.addEventListener('pointercancel', onReorderUp);
    return () => {
      el.removeEventListener('pointerdown', onReorderDown);
      document.removeEventListener('pointermove', onReorderMove);
      document.removeEventListener('pointerup', onReorderUp);
      document.removeEventListener('pointercancel', onReorderUp);
    };
  });
</script>

<div class="app">
  <TopBar />
  <main class="play-area">
    <!-- The stage holds the room at full size; the panel rail OVERLAYS it from
         the right (like the battle / victory overlay) so opening panels never
         resizes the map or battlefield. Panels are fixed-width snap panels that
         scroll/swipe horizontally. True popups (Settings / Confirm / Destroy /
         defeat) stay overlaid below. -->
    <div class="stage" class:flow={isFlow}>
      {#if !isFlow}
        <div class="room">
          {#if $run.screen === 'map' || $run.screen === 'run-complete'}
            <Map />
          {:else if $run.screen === 'fight' || $run.screen === 'run-lost'}
            <Battlefield />
          {/if}
        </div>
      {/if}
      <div class="rail" class:reordering={reorderKey !== null} bind:this={railEl}>
        {#if isShop}<ShopRoom />{/if}
        {#if isArmory}<ItemSelect />{/if}
        {#if isRest}<RestRoom />{/if}
        {#each panelOrder as key (key)}
          {#if key === 'victory'}
            <VictoryPanel />
          {:else if key === 'inspector'}
            <Inspector />
          {:else if key === 'gem'}
            <GemInspector />
          {:else if key === 'items'}
            <BagSplit kind="items" />
          {:else if key === 'gems'}
            <BagSplit kind="gems" />
          {:else if key === 'stats'}
            <StatsSplit />
          {/if}
        {/each}
      </div>
      <!-- Step-arrows shown only when the rail overflows; each click advances by
           exactly one pane (free dragging / wheel scroll is disabled). -->
      {#if canLeft}
        <button
          type="button"
          class="rail-arrow left"
          aria-label={t('rail.scrollPrev')}
          onclick={() => scrollRail(-1)}
        >‹</button>
      {/if}
      {#if canRight}
        <button
          type="button"
          class="rail-arrow right"
          aria-label={t('rail.scrollNext')}
          onclick={() => scrollRail(1)}
        >›</button>
      {/if}
    </div>
  </main>
  <RoomOverlay />
  <ConfirmModal />
  <DestroyPrompt />
  <Settings />

  <!-- Single floating ghost for the active gem drag. Mounted once at the app
       root, driven by the gem-drag controller; follows the pointer and reads
       go / no-go from `valid`. -->
  {#if $activeGemDrag}
    {@const gd = gemDisplay($activeGemDrag.gem)}
    <div
      class="gem-drag-ghost"
      class:invalid={!$activeGemDrag.valid}
      style="left: {$activeGemDrag.x}px; top: {$activeGemDrag.y}px;"
      aria-hidden="true"
    >
      <span class="gem-drag-emoji">{gd?.emoji ?? '💎'}</span>
    </div>
  {/if}
  <a
    class="version"
    href="https://github.com/Metsker/pixijs-enchanter/commit/{__COMMIT__}"
    target="_blank"
    rel="noopener"
    title="View commit {__COMMIT__} on GitHub"
  >
    {__VERSION__}
  </a>
</div>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    height: 100%;
    overflow: hidden;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100dvh;
  }

  .play-area {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  /* The stage holds the room full-size; the panel rail overlays it. */
  .stage {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
  }

  /* The room always fills the stage - it never shrinks when panels open, so the
     map / battlefield stay put under the overlay. */
  .room {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    min-height: 0;
  }

  /* The panel rail OVERLAYS the room from the LEFT (just right of the equipment
     column). Open panes tile the stage Niri-style: they flex-grow to fill the
     full width, and only once too many are open to fit at their floor width does
     the rail scroll horizontally (scroll-snapping on X). Vertical scrolling is
     each panel's own job. */
  .rail {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    display: flex;
    /* No free scroll: the rail overflows only when too many panes are open, and
       it is then stepped one pane at a time by the edge arrows (still scrollable
       programmatically via scrollTo). */
    overflow-x: hidden;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    /* The rail spans the whole stage so panes can flex-grow to fill it, but it
       is click-through: only the panes capture pointer events, so the room shows
       and stays interactive wherever the panes don't reach - the empty half
       beside a single (max 50vw) pane, or the whole stage with none open. */
    pointer-events: none;
  }
  /* Pane headers double as drag handles for reordering the splits. */
  :global([data-pane-header]) {
    cursor: grab;
  }
  .rail.reordering :global([data-pane-header]) {
    cursor: grabbing;
  }
  /* While reordering, drive scroll ourselves (section steps) - mandatory snap
     would re-snap on every pane swap and fight the drag. */
  .rail.reordering {
    scroll-snap-type: none;
  }
  /* The pane being dragged reads as "lifted" above its neighbours (no transform,
     so it never fights the FLIP slide). */
  .rail :global(.reorder-lift) {
    position: relative;
    z-index: 5;
    outline: 2px solid #ffcc44;
    outline-offset: -2px;
    box-shadow: 0 10px 34px rgba(0, 0, 0, 0.55);
  }
  .rail > :global(*) {
    pointer-events: auto;
    /* Include each pane's 1px border in its 50% width, so two half-stage panes
       sum to exactly the stage (otherwise the 2px of borders overflow + scroll). */
    box-sizing: border-box;
  }

  /* Shop screen: the shop is a left-aligned pane group, so the rail flows in
     from the left (no full-stage room to overlay) and panes scroll together. */
  .stage.flow .rail {
    position: static;
    flex: 1 1 auto;
    max-width: none;
  }

  /* Edge step-arrows over the rail (only mounted when it overflows). Vertically
     centred so they clear each pane's header / close button. */
  .rail-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 11;
    width: 34px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
    appearance: none;
    border: 1px solid #3a3a48;
    background: rgba(20, 20, 26, 0.92);
    color: #ddd;
    font-size: 1.7rem;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.55);
    transition: background-color 100ms ease, border-color 100ms ease, color 100ms ease;
  }
  .rail-arrow.left {
    left: 0;
    border-left: none;
    border-radius: 0 10px 10px 0;
  }
  .rail-arrow.right {
    right: 0;
    border-right: none;
    border-radius: 10px 0 0 10px;
  }
  .rail-arrow:hover {
    background: rgba(42, 42, 52, 0.96);
    border-color: #ffcc44;
    color: #ffcc44;
  }
  .rail-arrow:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }

  .version {
    position: fixed;
    right: 6px;
    bottom: 4px;
    z-index: 200;
    font-size: 0.7rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: #555;
    text-decoration: none;
    background: rgba(10, 10, 14, 0.6);
    padding: 1px 6px;
    border-radius: 4px;
    pointer-events: auto;
    user-select: none;
  }
  .version:hover {
    color: #ffcc44;
  }

  .gem-drag-ghost {
    position: fixed;
    width: 56px;
    height: 56px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 300;
    background: #14141a;
    border: 2px solid #ffcc44;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6);
    opacity: 0.96;
  }
  /* No-go: the gem can't drop where the pointer currently is. */
  .gem-drag-ghost.invalid {
    border-color: #c55;
    opacity: 0.8;
  }
  .gem-drag-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.8rem;
    line-height: 1;
  }
</style>
