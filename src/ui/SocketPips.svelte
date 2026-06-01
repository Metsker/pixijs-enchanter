<script lang="ts">
  // A vertical stack of small colored bars on an item tile, one per gem socket,
  // tinted by each socket's colour. A filled socket shows its colour solid; an
  // empty socket is dimmed. Self-positions against a position:relative tile.
  import type { Item } from '../domain/item';
  import { SOCKET_COLOR_HEX } from '../domain/gem-display';

  let { item }: { item: Item } = $props();
</script>

<span class="pips" aria-hidden="true">
  {#each item.socketColors as color, i (i)}
    <span
      class="pip"
      class:empty={item.sockets[i] == null}
      style="--c: {SOCKET_COLOR_HEX[color] ?? '#6f6456'}"
    ></span>
  {/each}
</span>

<style>
  .pips {
    position: absolute;
    left: 4px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 2px;
    pointer-events: none;
  }
  .pip {
    width: 7px;
    height: 12px;
    border-radius: 2px;
    background: var(--c, #6f6456);
    box-shadow: 0 0 3px var(--c, #6f6456);
  }
  .pip.empty {
    opacity: 0.28;
    box-shadow: none;
  }
</style>
