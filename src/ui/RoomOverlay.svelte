<script lang="ts">
  import { completeRoom, run, startNewRun } from '../state/run';
  import { t } from '../i18n';

  function onClick(): void {
    if ($run.screen === 'run-complete' || $run.screen === 'run-lost') {
      startNewRun();
    } else {
      completeRoom();
    }
  }

  function headlineKey(): string {
    if ($run.screen === 'run-complete') return 'room.runComplete';
    if ($run.screen === 'run-lost') return 'room.runLost';
    if ($run.screen === 'fight' && $run.fightWon) return 'room.victory';
    return '';
  }

  function ctaKey(): string {
    if ($run.screen === 'run-complete' || $run.screen === 'run-lost') return 'room.newRun';
    return 'room.continue';
  }
</script>

{#if ($run.screen === 'fight' && $run.fightWon) || $run.screen === 'run-complete' || $run.screen === 'run-lost'}
  <div class="overlay">
    <div class="card">
      <h2>{t(headlineKey())}</h2>
      <button type="button" class="cta" onclick={onClick}>{t(ctaKey())}</button>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 56px 0 0 0;
    background: rgba(10, 10, 14, 0.6);
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
  }
  .card {
    background: #1c1c24;
    border: 1px solid #3a3a48;
    border-radius: 12px;
    padding: 22px 28px;
    text-align: center;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 260px;
  }
  h2 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
    color: #ffcc44;
  }
  .cta {
    appearance: none;
    background: #3a3a48;
    border: 1px solid #4a4a58;
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
    background: #4a4a58;
    border-color: #ffcc44;
  }
  .cta:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }
</style>
