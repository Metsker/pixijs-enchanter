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
    flex: 1;
    min-height: 0;
    overflow: hidden;
    /* Two stacked backgrounds, behind the (transparent) Pixi canvas:
       1. Radial vignette - corners darken, centre clear.
       2. Top-to-bottom gradient for depth.
       The Pixi-rendered characters draw opaquely on top of both, so they
       are NOT darkened by the vignette - only the empty background space is. */
    background:
      radial-gradient(
        ellipse 80% 80% at center,
        transparent 50%,
        rgba(0, 0, 0, 0.6) 100%
      ),
      linear-gradient(180deg, #2a2438 0%, #15131e 60%, #0a0810 100%);
  }
</style>
