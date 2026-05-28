<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Application, Text, TextStyle } from 'pixi.js';

  let { text }: { text: string } = $props();

  let container: HTMLDivElement;
  let app: Application | null = null;

  const WIDTH = 1080;
  const HEIGHT = 160;

  onMount(async () => {
    await document.fonts.load('48px "Noto Color Emoji"');

    app = new Application();
    await app.init({
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: 0x111418,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    container.appendChild(app.canvas);

    const style = new TextStyle({
      fontFamily: ['Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', 'sans-serif'],
      fontSize: 48,
      fill: '#ffffff',
    });
    const label = new Text({ text, style });
    label.x = 20;
    label.y = (HEIGHT - label.height) / 2;
    app.stage.addChild(label);
  });

  onDestroy(() => {
    app?.destroy(true, { children: true, texture: true });
    app = null;
  });
</script>

<div bind:this={container} class="pixi-wrap" style="width: {WIDTH}px; height: {HEIGHT}px;"></div>

<style>
  .pixi-wrap {
    border: 1px solid #2a2a30;
    border-radius: 4px;
    overflow: hidden;
    max-width: 100%;
  }
</style>
