<script lang="ts">
  import { onMount } from 'svelte';
  import TopBar from './ui/TopBar.svelte';
  import InventoryColumn from './ui/InventoryColumn.svelte';
  import Battlefield from './ui/Battlefield.svelte';
  import Backpack from './ui/Backpack.svelte';
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
  import { toggleBackpack } from './state/ui';
  import { run } from './state/run';
  import { sfx } from './audio/sfx';
  import { loadSave, startAutoSave } from './state/save';
  import { activeGemDrag } from './state/gem-drag';
  import { gemDisplay } from './domain/gem-display';

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
        toggleBackpack();
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
</script>

<div class="app">
  <TopBar />
  <main class="play-area">
    <InventoryColumn />
    {#if $run.screen === 'item-select'}
      <ItemSelect />
    {:else if $run.screen === 'map' || $run.screen === 'run-complete'}
      <Map />
    {:else if $run.screen === 'fight' || $run.screen === 'run-lost'}
      <Battlefield />
    {:else if $run.screen === 'shop'}
      <ShopRoom />
    {:else if $run.screen === 'rest'}
      <RestRoom />
    {/if}
  </main>
  <Backpack />
  <Inspector />
  <GemInspector />
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
