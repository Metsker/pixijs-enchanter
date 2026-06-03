<script lang="ts">
  // Post-fight damage attribution (docs/decisions-that-matter.md). Reads the
  // snapshot published on victory / defeat and shows where damage came from and
  // what hurt - so build decisions become legible after the fact.
  import { fightBreakdown } from '../state/fight-stats';
  import { t } from '../i18n';

  const bd = $derived($fightBreakdown);

  function pct(amount: number, total: number): number {
    return total > 0 ? Math.round((amount / total) * 100) : 0;
  }
  function fmt(n: number): string {
    return Math.round(n).toLocaleString();
  }
</script>

{#if bd && (bd.dealt.length > 0 || bd.taken.length > 0)}
  <div class="breakdown">
    <div class="bd-title">{t('breakdown.title')}</div>

    {#if bd.dealt.length > 0}
      <div class="bd-group">
        <div class="bd-head">
          <span>{t('breakdown.dealt')}</span>
          <span class="bd-total">{fmt(bd.totalDealt)}</span>
        </div>
        {#each bd.dealt as row (row.label)}
          <div class="bd-row">
            <span class="bd-emoji">{row.emoji}</span>
            <span class="bd-name">{row.label}</span>
            <span class="bd-bar">
              <span class="bd-fill dealt" style="width:{pct(row.amount, bd.totalDealt)}%"></span>
            </span>
            <span class="bd-amt">{fmt(row.amount)}</span>
          </div>
        {/each}
      </div>
    {/if}

    {#if bd.taken.length > 0}
      <div class="bd-group">
        <div class="bd-head">
          <span>{t('breakdown.taken')}</span>
          <span class="bd-total">{fmt(bd.totalTaken)}</span>
        </div>
        {#each bd.taken as row (row.label)}
          <div class="bd-row">
            <span class="bd-emoji">{row.emoji}</span>
            <span class="bd-name">{row.label}</span>
            <span class="bd-bar">
              <span class="bd-fill taken" style="width:{pct(row.amount, bd.totalTaken)}%"></span>
            </span>
            <span class="bd-amt">{fmt(row.amount)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .breakdown {
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-align: left;
  }
  .bd-title {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6f7d7d;
  }
  .bd-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bd-head {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    font-weight: 600;
    color: #aab;
    margin-bottom: 2px;
  }
  .bd-total {
    font-variant-numeric: lining-nums tabular-nums;
    color: #cdd;
  }
  .bd-row {
    display: grid;
    grid-template-columns: 1.3em minmax(4.5em, auto) 1fr 3.6em;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
  }
  .bd-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 0.95rem;
    line-height: 1;
    text-align: center;
  }
  .bd-name {
    color: #9fb0b0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bd-bar {
    height: 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }
  .bd-fill {
    display: block;
    height: 100%;
    border-radius: 4px;
  }
  .bd-fill.dealt {
    background: #3cc7b8;
  }
  .bd-fill.taken {
    background: #ef4444;
  }
  .bd-amt {
    text-align: right;
    font-variant-numeric: lining-nums tabular-nums;
    color: #cdd;
  }
</style>
