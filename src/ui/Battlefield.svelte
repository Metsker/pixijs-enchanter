<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Battlefield } from '../pixi/battlefield';

  let container: HTMLDivElement;
  let battlefield: Battlefield | null = null;

  onMount(async () => {
    battlefield = new Battlefield();
    await battlefield.init(container);
  });

  onDestroy(() => {
    battlefield?.destroy();
    battlefield = null;
  });
</script>

<div bind:this={container} class="battlefield"></div>

<style>
  .battlefield {
    width: 100%;
    height: 100dvh;
    overflow: hidden;
  }
</style>
