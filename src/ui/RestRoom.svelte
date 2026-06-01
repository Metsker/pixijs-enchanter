<script lang="ts">
  import { paneEnter } from '../utils/paneTransition';
  import { completeRoom } from '../state/run';
  import { canCraftGem, craftGem, CRAFT_COST } from '../state/rest';
  import { topbar } from '../state/topbar';
  import { t } from '../i18n';

  // Left-aligned Rest pane (same layout as the shop / armory): a header over a
  // single Craft action that rolls a random gem into the bag for crystals. The
  // loose gems live in the Gems bag, not here.
  const affordable = $derived($topbar.crystals >= CRAFT_COST);

  function onCraft(): void {
    if (!canCraftGem()) return;
    craftGem();
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
  </div>
</section>

<style>
  /* Left-aligned Rest pane: a quarter of the screen like every other split,
     same flat chrome (#1f1811, #3e2e22 divider). */
  .rest {
    flex: 0 0 auto;
    align-self: stretch;
    width: 25%;
    min-width: min(300px, 100%);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #1f1811;
    border-right: 1px solid #3e2e22;
    user-select: none;  }
  .rest-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    height: 76px;
    box-sizing: border-box;
    padding: 0 14px;
    border-bottom: 1px solid #2b2018;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #d8cab2;
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
    background: #3e2e22;
    border: 1px solid #53402e;
    color: #fff;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 36px;
  }
  .leave:hover {
    background: #53402e;
    border-color: #ecb44a;
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
    color: #a89a83;
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
    border-color: #ecb44a;
  }
  .craft:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .craft:focus-visible {
    outline: 2px solid #ecb44a;
    outline-offset: 2px;
  }
  .craft-hint {
    margin: 0;
    font-size: 0.78rem;
    color: #8a7d67;
    line-height: 1.35;
  }
</style>
