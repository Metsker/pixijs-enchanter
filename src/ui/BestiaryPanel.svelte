<script lang="ts">
  // Bestiary: dossiers for enemies the player has encountered. The threat detail
  // that used to clutter the map (resistances, weaknesses, ailment immunity)
  // lives here now; the map just shows enemy icons. Un-met enemies show as
  // locked silhouettes so there's a sense of discovery (docs/decisions-that-matter).
  import { paneEnter, paneLeave } from '../utils/paneTransition';
  import { revealInRail } from '../utils/revealInRail';
  import { closeBestiarySplit } from '../state/ui';
  import { encounteredEnemies } from '../state/bestiary';
  import { COMMONS, ELITES, LICH } from '../domain/enemy-catalogue';
  import { threatTags, DAMAGE_TYPE_EMOJI, type ThreatTag } from '../domain/enemy-threat';
  import { t } from '../i18n';

  // Catalogue order: commons, elites, then the boss. The pane lists ONLY
  // enemies the player has actually defeated, so it starts empty and grows -
  // un-met foes are never previewed here (they show as "?" on the map).
  const ALL_ENEMIES = [...COMMONS, ...ELITES, LICH];

  const known = $derived(ALL_ENEMIES.filter((e) => $encounteredEnemies.has(e.id)));

  function tagText(tag: ThreatTag): string {
    return t(tag.labelKey, tag.param ? { type: tag.param, status: tag.param } : {});
  }

  const pct = (f: number): string => `${Math.round(f * 100)}%`;
</script>

<aside
  class="bestiary"
  aria-label={t('bestiary.title')}
  use:revealInRail
  in:paneEnter|global
  out:paneLeave|global
>
  <header class="toolbar" data-pane-header>
    <h2><span class="head-emoji">📖</span> {t('bestiary.title')}</h2>
    <button type="button" class="close" aria-label={t('bestiary.close')} onclick={closeBestiarySplit}>✕</button>
  </header>

  <div class="body">
    {#if known.length === 0}
      <p class="empty">{t('bestiary.empty')}</p>
    {:else}
      <p class="progress">{t('bestiary.count', { count: known.length })}</p>
      {#each known as enemy (enemy.id)}
        {@const tags = threatTags(enemy)}
        <section class="entry">
          <header class="entry-head">
            <span class="entry-emoji">{enemy.emoji}</span>
            <div class="entry-title">
              <div class="entry-name">{t(enemy.nameKey)}</div>
              <div class="entry-kind">{t(`map.kind.${enemy.kind}`)}</div>
            </div>
          </header>
          <div class="stats">
            <span class="stat" title={t('stats.maxHp')}>❤️ {enemy.hp}</span>
            <span class="stat" title={t('stats.damage')}>⚔️ {enemy.damage} {DAMAGE_TYPE_EMOJI[enemy.damageType]}</span>
            <span class="stat" title={t('bestiary.stat.interval')}>⏱️ {enemy.interval}s</span>
            {#if enemy.dodge > 0}
              <span class="stat" title={t('stats.dodge')}>💨 {pct(enemy.dodge)}</span>
            {/if}
            {#if enemy.resist > 0}
              <span class="stat" title={t('stats.resist')}>🪨 {pct(enemy.resist)}</span>
            {/if}
          </div>
          {#if tags.length > 0}
            <ul class="traits">
              {#each tags as tag}
                <li><span class="trait-emoji">{tag.emoji}</span> {tagText(tag)}</li>
              {/each}
            </ul>
          {:else}
            <p class="no-traits">{t('bestiary.noTraits')}</p>
          {/if}
        </section>
      {/each}
    {/if}
  </div>
</aside>

<style>
  .bestiary {
    flex: 0 0 auto;
    align-self: stretch;
    width: 25%;
    min-width: min(300px, 100%);
    min-height: 0;
    background: var(--pane-glass);
    backdrop-filter: blur(12px) saturate(1.15);
    -webkit-backdrop-filter: blur(12px) saturate(1.15);
    border-left: 1px solid #28383d;
    display: flex;
    flex-direction: column;
    user-select: none;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 76px;
    box-sizing: border-box;
    padding: 0 14px;
    border-bottom: 1px solid #18262a;
  }
  .toolbar h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #c0cdcd;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .head-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 2rem;
    line-height: 1;
  }
  .close {
    appearance: none;
    background: #18262a;
    border: 1px solid #28383d;
    color: #c0cdcd;
    border-radius: 6px;
    width: 32px;
    height: 32px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .close:hover {
    background: #28383d;
  }
  .close:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .progress {
    margin: 0 0 2px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6f7d7d;
  }
  .empty {
    margin: 8px 2px;
    font-size: 0.85rem;
    color: #7c8a8a;
    line-height: 1.4;
  }

  .entry {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 8px;
    background: #0c1517;
    border: 1px solid #152124;
  }
  .entry-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .entry-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.8rem;
    line-height: 1;
  }
  .entry-title {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .entry-name {
    font-size: 1rem;
    font-weight: 600;
    color: #dde7e7;
  }
  .entry-kind {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6f7d7d;
  }

  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 0.82rem;
    color: #aab6b6;
    font-variant-numeric: lining-nums tabular-nums;
  }
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .traits {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .traits li {
    font-size: 0.82rem;
    color: #c4d0d0;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .trait-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
  }
  .no-traits {
    margin: 0;
    font-size: 0.8rem;
    color: #7c8a8a;
    font-style: italic;
  }
</style>
