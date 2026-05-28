<script lang="ts">
  import TopBar from './ui/TopBar.svelte';
  import InventoryColumn from './ui/InventoryColumn.svelte';
  import Battlefield from './ui/Battlefield.svelte';
</script>

<div class="app">
  <TopBar />
  <main class="play-area">
    <InventoryColumn />
    <Battlefield />
  </main>
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
