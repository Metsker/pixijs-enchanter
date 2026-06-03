<script lang="ts">
  import { run, startNewRun } from '../state/run';
  import { resetPendingRewards } from '../state/rewards';
  import FightBreakdown from './FightBreakdown.svelte';
  import { sfx } from '../audio/sfx';
  import { t } from '../i18n';

  // Defeat is the one end-state that stays a centered popup (it has no rewards to
  // inspect, and it blocks the run). Victory / run-complete are rail panels now
  // (VictoryPanel), so their reward cards open the in-rail inspector.
  let sounded = false;
  $effect(() => {
    if ($run.screen === 'run-lost') {
      if (!sounded) {
        sounded = true;
        sfx.defeat();
      }
    } else {
      sounded = false;
    }
  });

  function onNewRun(): void {
    resetPendingRewards();
    startNewRun();
  }
</script>

{#if $run.screen === 'run-lost'}
  <div class="overlay">
    <div class="card lost">
      <h2>{t('room.runLost')}</h2>
      <FightBreakdown />
      <button type="button" class="cta" onclick={onNewRun}>{t('room.newRun')}</button>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    /* Full-screen veil - covers the floating top bar too (z-index 80 > the bar's
       30), so defeat blocks the whole app. */
    inset: 0;
    background: rgba(10, 10, 14, 0.6);
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
  }
  .card {
    background: #121d20;
    border: 1px solid #28383d;
    border-radius: 12px;
    padding: 22px 28px;
    text-align: center;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 280px;
  }
  h2 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
    color: #ef4444;
  }
  .cta {
    appearance: none;
    background: #28383d;
    border: 1px solid #374d52;
    color: #fff;
    border-radius: 8px;
    padding: 12px 20px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .cta:hover {
    background: #374d52;
    border-color: #3cc7b8;
  }
  .cta:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }
</style>
