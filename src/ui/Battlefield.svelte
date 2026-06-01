<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Battlefield } from '../pixi/battlefield';
  import ShaderBackground from './ShaderBackground.svelte';

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

<div class="battlefield">
  <!-- Procedural backdrop behind the (transparent) fighters canvas. A separate
       cheap canvas (resolution 1, 60fps) so it never competes with the
       retina-rendered combat for GPU. -->
  <ShaderBackground variant="battle" />
  <div bind:this={container} class="fighters"></div>
</div>

<style>
  .battlefield {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    /* Positioning context for the two stacked layers (procedural ShaderBackground
       at z-index 0, the fighters canvas at z-index 1). */
    position: relative;
    /* Fallback shown only if the procedural backdrop's WebGL is unavailable: a
       radial vignette over a top-to-bottom purple gradient (the look the shader
       reproduces, with motion). */
    background:
      radial-gradient(
        ellipse 80% 80% at center,
        transparent 50%,
        rgba(0, 0, 0, 0.6) 100%
      ),
      linear-gradient(180deg, #2a2438 0%, #15131e 60%, #0a0810 100%);
  }

  /* The fighters' Pixi canvas mounts here, above the backdrop. The characters
     draw opaquely on top, so the moving backdrop only shows in empty space. */
  .fighters {
    position: absolute;
    inset: 0;
    z-index: 1;
  }
</style>
