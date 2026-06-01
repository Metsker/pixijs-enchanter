<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { ShaderBackground } from '../pixi/shaderBackground';
  import type { BackgroundVariant } from '../pixi/shaders/backgroundShaders';

  // Drop this inside any positioned scene container; it fills the parent and
  // sits behind the content (z-index 0, click-through). `variant` selects the
  // procedural look from backgroundShaders.ts.
  let { variant = 'map' }: { variant?: BackgroundVariant } = $props();

  let container: HTMLDivElement;
  let bg: ShaderBackground | null = null;

  onMount(async () => {
    bg = new ShaderBackground();
    await bg.init(container, variant);
  });

  onDestroy(() => {
    bg?.destroy();
    bg = null;
  });
</script>

<div bind:this={container} class="shader-bg" aria-hidden="true"></div>

<style>
  .shader-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .shader-bg :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
