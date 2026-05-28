<script lang="ts">
  import TopBar from './ui/TopBar.svelte';
  import Battlefield from './ui/Battlefield.svelte';
</script>

<div class="app">
  <TopBar />
  <Battlefield />
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
</style>
