<script lang="ts">
  import { enterRoom, run } from '../state/run';
  import { reachableFrom, type MapNode, type RoomKind } from '../domain/map';
  import { t } from '../i18n';

  const VIEW_W = 1000;
  // Per-floor spacing in viewBox units, held CONSTANT so the gap between
  // floors never compresses as the act grows. The total canvas height scales
  // with the floor count, and the map scrolls instead of shrinking to fit.
  // 90 ≈ the original 8-floor look (800 / (8 + 1)).
  const FLOOR_SPACING = 90;
  const NODE_R = 26;

  // Tall canvas: one constant-height row per floor (+1 for top/bottom margin).
  const viewH = $derived(FLOOR_SPACING * ($run.map.floors + 1));

  const ROOM_EMOJI: Record<RoomKind, string> = {
    'item-select': '📦',
    common: '⚔️',
    elite: '💀',
    shop: '🪙',
    rest: '🔥',
    boss: '👑',
    secret: '❓',
  };

  // Position each node: floor 1 at bottom, boss at top; spread nodes on each
  // floor evenly across the width. Spacing is fixed (FLOOR_SPACING), so the
  // canvas is as tall as the run is long.
  const positions = $derived.by(() => {
    const map = $run.map;
    const byFloor = new Map<number, MapNode[]>();
    for (const node of map.nodes) {
      if (!byFloor.has(node.floor)) byFloor.set(node.floor, []);
      byFloor.get(node.floor)!.push(node);
    }
    const out = new Map<string, { x: number; y: number }>();
    for (const [floor, nodes] of byFloor) {
      const y = viewH - floor * FLOOR_SPACING;
      const xSpacing = VIEW_W / (nodes.length + 1);
      nodes.forEach((n, i) => out.set(n.id, { x: xSpacing * (i + 1), y }));
    }
    return out;
  });

  const reachable = $derived(
    new Set(reachableFrom($run.map, $run.lastCompletedRoomId).map((n) => n.id)),
  );

  // Camera: keep the reachable frontier in view. The player starts at the
  // bottom (floor 1) and climbs; this scrolls the container so the next
  // pickable rooms stay centred as the run progresses.
  let scrollEl = $state<HTMLDivElement>();
  $effect(() => {
    const r = reachable;
    const pos = positions;
    const el = scrollEl;
    if (!el || el.clientWidth === 0) return;
    let top = Infinity;
    let bot = -Infinity;
    for (const id of r) {
      const p = pos.get(id);
      if (!p) continue;
      top = Math.min(top, p.y);
      bot = Math.max(bot, p.y);
    }
    if (!Number.isFinite(top)) return;
    const scale = el.clientWidth / VIEW_W;
    const centre = ((top + bot) / 2) * scale;
    // Jump instantly - the map opens already framed on the frontier. The
    // reachable set only changes between map visits (completing a room leaves
    // the screen), so there's nothing to animate; a smooth scroll here just
    // reads as an unwanted lurch from the top on entry.
    el.scrollTo({ top: Math.max(0, centre - el.clientHeight / 2), behavior: 'instant' });
  });

  function onNodeClick(node: MapNode): void {
    if (!reachable.has(node.id)) return;
    enterRoom(node.id);
  }

  function nodeFill(node: MapNode): string {
    if (node.id === $run.lastCompletedRoomId) return '#444';
    if (reachable.has(node.id)) return '#1c1c24';
    return '#0e0e12';
  }
  function nodeStroke(node: MapNode): string {
    if (reachable.has(node.id)) return '#ffcc44';
    if (node.id === $run.lastCompletedRoomId) return '#888';
    return '#3a3a48';
  }
  function nodeOpacity(node: MapNode): number {
    if (reachable.has(node.id)) return 1;
    if (node.id === $run.lastCompletedRoomId) return 0.6;
    return 0.4;
  }
</script>

<section class="map" aria-label={t('map.title')}>
  <div class="map-scroll" bind:this={scrollEl}>
    <svg viewBox="0 0 {VIEW_W} {viewH}" preserveAspectRatio="xMidYMid meet">
    <!-- Edges -->
    {#each $run.map.nodes as parent (parent.id)}
      {@const p = positions.get(parent.id)}
      {#if p}
        {#each parent.children as childId (childId)}
          {@const c = positions.get(childId)}
          {#if c}
            <line
              x1={p.x}
              y1={p.y}
              x2={c.x}
              y2={c.y}
              stroke="#2a2a34"
              stroke-width="2"
            />
          {/if}
        {/each}
      {/if}
    {/each}

    <!-- Nodes -->
    {#each $run.map.nodes as node (node.id)}
      {@const p = positions.get(node.id)}
      {#if p}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <g
          transform="translate({p.x},{p.y})"
          class="node"
          class:reachable={reachable.has(node.id)}
          opacity={nodeOpacity(node)}
          onclick={() => onNodeClick(node)}
          role={reachable.has(node.id) ? 'button' : undefined}
          tabindex={reachable.has(node.id) ? 0 : undefined}
          aria-label={t(`map.kind.${node.kind}`)}
        >
          <circle r={NODE_R} fill={nodeFill(node)} stroke={nodeStroke(node)} stroke-width="2.5" />
          <foreignObject x={-NODE_R} y={-NODE_R} width={NODE_R * 2} height={NODE_R * 2}>
            <div class="emoji-host">{ROOM_EMOJI[node.kind]}</div>
          </foreignObject>
        </g>
      {/if}
    {/each}
  </svg>
  </div>

  <div class="legend">
    {#each Object.entries(ROOM_EMOJI) as [kind, em]}
      <span class="legend-item">
        <span class="legend-emoji">{em}</span>
        {t(`map.kind.${kind}`)}
      </span>
    {/each}
  </div>
</section>

<style>
  .map {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, #0a0a0e 0%, #14141a 100%);
    padding: 12px;
    gap: 12px;
  }

  /* Scroll viewport: fills the available space; the SVG inside is as tall as
     the run is long, so the column scrolls vertically. */
  .map-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
  /* width:100% + height:auto lets the viewBox aspect ratio set the height, so
     each floor keeps a constant on-screen gap and tall maps overflow + scroll. */
  svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .node {
    transition: opacity 120ms ease;
  }
  .node.reachable {
    cursor: pointer;
  }
  .node.reachable:hover circle {
    fill: #2a2a34;
  }

  .emoji-host {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.8rem;
    line-height: 1;
    pointer-events: none;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    padding: 8px 10px;
    border-top: 1px solid #2a2a34;
    color: #aab;
    font-size: 0.85rem;
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .legend-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.1rem;
  }
</style>
