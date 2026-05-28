<script lang="ts">
  import { onMount } from 'svelte';
  import TopBar from './ui/TopBar.svelte';
  import InventoryColumn from './ui/InventoryColumn.svelte';
  import Battlefield from './ui/Battlefield.svelte';
  import Backpack from './ui/Backpack.svelte';
  import Inspector from './ui/Inspector.svelte';
  import Map from './ui/Map.svelte';
  import ShopRoom from './ui/ShopRoom.svelte';
  import RestRoom from './ui/RestRoom.svelte';
  import RoomOverlay from './ui/RoomOverlay.svelte';
  import { toggleBackpack } from './state/ui';
  import { run } from './state/run';

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

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
</script>

<div class="app">
  <TopBar />
  <main class="play-area">
    <InventoryColumn />
    {#if $run.screen === 'map' || $run.screen === 'run-complete'}
      <Map />
    {:else if $run.screen === 'fight'}
      <Battlefield />
    {:else if $run.screen === 'shop'}
      <ShopRoom />
    {:else if $run.screen === 'rest'}
      <RestRoom />
    {/if}
  </main>
  <Backpack />
  <Inspector />
  <RoomOverlay />
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
</style>
