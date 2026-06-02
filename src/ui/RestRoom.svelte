<script lang="ts">
  import { paneEnter } from '../utils/paneTransition';
  import { completeRoom } from '../state/run';
  import { canCraftGem, craftGem, CRAFT_COST } from '../state/rest';
  import { topbar } from '../state/topbar';
  import { gemDisplay, SOCKET_COLOR_HEX } from '../domain/gem-display';
  import { inspectGem, gemInspector } from '../state/gem-inspector';
  import type { Gem } from '../domain/gem';
  import { t } from '../i18n';

  // Left-aligned Rest pane (same layout as the shop / armory): a header over a
  // single Craft action that rolls a random gem into the bag for crystals. The
  // loose gems live in the Gems bag, not here.
  const affordable = $derived($topbar.crystals >= CRAFT_COST);

  // Gems rolled during THIS rest visit, newest first. They also land in the Gems
  // bag (craftGem stashes them); listing them here - the same row a gem shows in
  // the bag - lets the player see what each craft produced and tap to inspect.
  let crafted = $state<Gem[]>([]);

  function onCraft(): void {
    if (!canCraftGem()) return;
    const gem = craftGem();
    if (gem) crafted = [gem, ...crafted];
  }

  function isInspecting(gem: Gem): boolean {
    return $gemInspector?.gem.id === gem.id && !$gemInspector?.shop;
  }
</script>

<section class="rest" in:paneEnter|global>
  <header class="rest-head">
    <h2><span class="head-emoji">🔥</span> {t('rest.title')}</h2>
    <button type="button" class="leave" onclick={completeRoom}>{t('room.leave')}</button>
  </header>

  <div class="body">
    <p class="subtitle">{t('rest.tagline')}</p>

    <div class="group">
      <button
        type="button"
        class="craft"
        disabled={!affordable}
        title={affordable ? t('rest.craft.hint') : t('rest.craft.notEnough')}
        onclick={onCraft}
      >
        {t('rest.craft', { cost: CRAFT_COST })}
      </button>
      <p class="craft-hint">{t('rest.craft.hint')}</p>
    </div>

    <!-- Gems crafted this visit, newest first - the same row a gem shows in the
         bag (colour-edge + emoji + name + level + role). Tap one to inspect it. -->
    {#if crafted.length > 0}
      <div class="group">
        <div class="crafted-head">{t('rest.crafted')} ({crafted.length})</div>
        <ul class="crafted-list" role="list">
          {#each crafted as gem (gem.id)}
            {@const gd = gemDisplay(gem)}
            <li>
              <button
                type="button"
                class="gem-row"
                class:inspecting={isInspecting(gem)}
                style="--gem-color: {gd ? SOCKET_COLOR_HEX[gd.color] : '#5c6a6a'}"
                title={t('rest.stash.inspect')}
                onclick={() => inspectGem(gem)}
              >
                <span class="gem-emoji">{gd?.emoji ?? '💠'}</span>
                <span class="gem-main">
                  <span class="gem-name">{gd?.name ?? gem.defId}</span>
                  {#if gd && gd.level > 1}<span class="gem-level">Lv{gd.level}</span>{/if}
                  <span
                    class="gem-role"
                    class:effect={gd?.role === 'effect'}
                    class:support={gd?.role === 'support'}
                  >
                    {gd?.role === 'support' ? t('gemInspector.role.support') : t('gemInspector.role.effect')}
                  </span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</section>

<style>
  /* Left-aligned Rest pane: a quarter of the screen like every other split,
     same flat chrome (#121d20, #28383d divider). */
  .rest {
    flex: 0 0 auto;
    align-self: stretch;
    width: 25%;
    min-width: min(300px, 100%);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--pane-glass);
    backdrop-filter: blur(12px) saturate(1.15);
    -webkit-backdrop-filter: blur(12px) saturate(1.15);
    border-right: 1px solid #28383d;
    user-select: none;  }
  .rest-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    height: 76px;
    box-sizing: border-box;
    padding: 0 14px;
    border-bottom: 1px solid #18262a;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #c0cdcd;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .head-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 2rem;
    line-height: 1;
  }
  .leave {
    appearance: none;
    background: #28383d;
    border: 1px solid #374d52;
    color: #fff;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 36px;
  }
  .leave:hover {
    background: #374d52;
    border-color: #3cc7b8;
  }

  /* Same layout as the shop: a scrolling body with sections. */
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 12px 10px;
  }
  .subtitle {
    margin: 0;
    color: #91a1a1;
    font-size: 0.85rem;
    line-height: 1.35;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Craft action: crystal-tinted, distinct from the grey CTAs. */
  .craft {
    width: 100%;
    appearance: none;
    background: #2a2018;
    border: 1px solid #5a4a30;
    color: #ffd28a;
    border-radius: 8px;
    padding: 14px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 48px;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .craft:hover:not(:disabled) {
    background: #3a2c1c;
    border-color: #3cc7b8;
  }
  .craft:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .craft:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }
  .craft-hint {
    margin: 0;
    font-size: 0.78rem;
    color: #768585;
    line-height: 1.35;
  }

  /* Crafted-this-visit list: the same gem row the bag uses (colour-edge button +
     emoji + name + level + role), so a freshly rolled gem reads identically here
     and in the Gems bag. */
  .crafted-head {
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6f7d7d;
  }
  .crafted-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .crafted-list li {
    list-style: none;
  }
  .gem-row {
    width: 100%;
    appearance: none;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding: 8px 10px;
    border: 1px solid #18262a;
    border-left: 3px solid var(--gem-color, #6ad);
    border-radius: 8px;
    background: #0c1517;
    color: inherit;
    cursor: pointer;
    transition: border-color 100ms ease, background-color 100ms ease, box-shadow 100ms ease;
  }
  /* Hover recolours the top/right/bottom edges only, leaving the gem-colour left
     edge intact (matches the bag's gem rows). */
  .gem-row:hover {
    background: #0f181b;
    border-top-color: #374d52;
    border-right-color: #374d52;
    border-bottom-color: #374d52;
  }
  .gem-row.inspecting {
    border-color: #3cc7b8;
    box-shadow: inset 0 0 0 1px #3cc7b8;
  }
  .gem-row:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }
  .gem-emoji {
    flex: none;
    min-width: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.6rem;
    line-height: 1;
  }
  .gem-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .gem-name {
    min-width: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #dde7e7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gem-level {
    flex: none;
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    color: #f0e0ff;
    background: rgba(124, 58, 200, 0.85);
    border: 1px solid #c084fc;
    font-variant-numeric: lining-nums;
  }
  .gem-role {
    flex: none;
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    border-radius: 999px;
    font-weight: 700;
  }
  .gem-role.effect {
    color: #ffd0e6;
    background: rgba(255, 102, 170, 0.18);
    border: 1px solid #f6a;
  }
  .gem-role.support {
    color: #cfe6ff;
    background: rgba(102, 170, 221, 0.18);
    border: 1px solid #6ad;
  }
</style>
