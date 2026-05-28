<script lang="ts">
  import PixiCanvas from './lib/PixiCanvas.svelte';

  const sample = '⚔️ 💎 🔥 🧝 💀 🧙 🐂 🦅 🟢 ❄️ ⚡ 🩸 ☠️';
</script>

<main>
  <h1>Enchanter</h1>

  <section>
    <h2>DOM emoji (via CSS font-family)</h2>
    <p class="emoji big">{sample}</p>
  </section>

  <section>
    <h2>Pixi canvas emoji (via TextStyle)</h2>
    <PixiCanvas text={sample} />
  </section>

  <p class="hint">
    Both rows must render the same coloured glyphs. If the Pixi row falls back
    to monochrome boxes, the font did not finish loading before the Text was
    constructed - check the console.
  </p>
</main>

<style>
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }
  h1 {
    margin: 0 0 1.5rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
    font-weight: 500;
    color: #9aa;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  section {
    margin-bottom: 2rem;
  }
  .big {
    font-size: 3rem;
    margin: 0;
    line-height: 1.3;
  }
  .hint {
    color: #788;
    font-size: 0.9rem;
    border-left: 2px solid #2a2a30;
    padding-left: 0.75rem;
  }
</style>
