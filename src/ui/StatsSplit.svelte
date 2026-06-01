<script lang="ts">
  import { paneEnter, paneLeave } from '../utils/paneTransition';
  import { revealInRail } from '../utils/revealInRail';
  import { playerProfile } from '../state/player-profile';
  import { closeStatsSplit } from '../state/ui';
  import { t } from '../i18n';

  // Live combat stat block, derived from the equipped items' resolved gems
  // (player-profile.ts re-derives on every equip / socket change), so the panel
  // updates the moment the player's gear or gems change.
  const attack = $derived($playerProfile.attack);
  const defence = $derived($playerProfile.defence);

  // Attacks per second reads more naturally than seconds-per-attack.
  const attackSpeed = $derived(attack.interval > 0 ? 1 / attack.interval : 0);

  const pct = (f: number): string => `${Math.round(f * 100)}%`;
  const num = (n: number): string => parseFloat(n.toFixed(2)).toString();

  // Per-type resists that are actually present (non-empty), for the list below.
  const resists = $derived(
    Object.entries(defence.resists).filter(([, v]) => (v ?? 0) > 0) as [string, number][],
  );
</script>

<aside
  class="stats"
  aria-label={t('stats.title')}
  use:revealInRail
  in:paneEnter|global
  out:paneLeave|global
>
  <header class="toolbar" data-pane-header>
    <h2><span class="head-emoji">📊</span> {t('stats.title')}</h2>
    <button type="button" class="close" aria-label={t('stats.close')} onclick={closeStatsSplit}>✕</button>
  </header>

  <div class="body">
    <section class="group">
      <div class="group-label">{t('stats.offense')}</div>
      <div class="row"><span class="k">⚔️ {t('stats.damage')}</span><span class="v">{Math.round(attack.damage)} {attack.type}</span></div>
      <div class="row"><span class="k">⚡ {t('stats.attackSpeed')}</span><span class="v">{num(attackSpeed)}/s</span></div>
      <div class="row"><span class="k">🎯 {t('stats.crit')}</span><span class="v">{pct(attack.critChance)}</span></div>
      <div class="row"><span class="k">💥 {t('stats.critDmg')}</span><span class="v">×{num(attack.critMultiplier)}</span></div>
      {#if attack.lifesteal > 0}
        <div class="row"><span class="k">🩸 {t('stats.lifesteal')}</span><span class="v">{pct(attack.lifesteal)}</span></div>
      {/if}
    </section>

    <section class="group">
      <div class="group-label">{t('stats.defense')}</div>
      <div class="row"><span class="k">❤️ {t('stats.maxHp')}</span><span class="v">{defence.maxHp}</span></div>
      {#if defence.hpRegenPerSec > 0}
        <div class="row"><span class="k">♻️ {t('stats.regen')}</span><span class="v">{num(defence.hpRegenPerSec)}/s</span></div>
      {/if}
      {#if defence.damageReduction > 0}
        <div class="row"><span class="k">🛡️ {t('stats.dr')}</span><span class="v">{pct(defence.damageReduction)}</span></div>
      {/if}
      {#if defence.dodge > 0}
        <div class="row"><span class="k">💨 {t('stats.dodge')}</span><span class="v">{pct(defence.dodge)}</span></div>
      {/if}
      {#if defence.thornsFlat > 0}
        <div class="row"><span class="k">🌵 {t('stats.thorns')}</span><span class="v">{Math.round(defence.thornsFlat)}</span></div>
      {/if}
      {#each resists as [type, value] (type)}
        <div class="row"><span class="k">🧪 {t('stats.resist')} {type}</span><span class="v">{pct(value)}</span></div>
      {/each}
    </section>
  </div>
</aside>

<style>
  .stats {
    flex: 0 0 auto;
    align-self: stretch;
    /* Every split is exactly a quarter of the screen: four tile to fill it, a
       fifth scrolls off (reached via the rail arrows). The floor keeps it usable
       where a quarter would be too narrow. */
    width: 25%;
    min-width: min(300px, 100%);
    min-height: 0;
    background: var(--pane-glass);
    backdrop-filter: blur(12px) saturate(1.15);
    -webkit-backdrop-filter: blur(12px) saturate(1.15);
    border-left: 1px solid #28383d;
    display: flex;
    flex-direction: column;
    user-select: none;  }
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
    gap: 16px;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .group-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6f7d7d;
    margin-bottom: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 8px;
    border-radius: 6px;
    background: #0c1517;
    border: 1px solid #152124;
  }
  .k {
    color: #aab6b6;
    font-size: 0.9rem;
  }
  .v {
    color: #dde7e7;
    font-weight: 600;
    font-variant-numeric: lining-nums tabular-nums;
  }
</style>
