<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { settingsOpen, closeSettings } from '../state/ui';
  import { settings, setDifficulty, type Difficulty } from '../state/settings';
  import { startNewRun } from '../state/run';
  import { requestConfirm } from '../state/confirm';
  import { audioPrefs, toggleMute } from '../audio/sfx';
  import { simSpeed, SIM_SPEEDS, setSimSpeed } from '../state/sim-speed';
  import { clearSave } from '../state/save';
  import { t } from '../i18n';

  // The difficulty choices, in ascending order. Each carries its own
  // label + one-line description so the panel explains what the
  // multiplier does without surfacing the raw numbers.
  const OPTIONS: { id: Difficulty; emoji: string }[] = [
    { id: 'relaxed', emoji: '🍃' },
    { id: 'easy', emoji: '🌱' },
    { id: 'normal', emoji: '⚔️' },
    { id: 'hard', emoji: '💀' },
  ];

  function onPick(id: Difficulty): void {
    // Difficulty is LOCKED at run start, so a change only bites on a new run -
    // just record the choice (the panel's note explains it applies next run). No
    // restart prompt on change; the explicit "Restart run" button below is the
    // deliberate way to start over now.
    setDifficulty(id);
  }

  // Restart from Settings: confirm first (close the panel so the modal isn't
  // hidden behind it), then wipe the save + start a fresh run.
  function onRestart(): void {
    closeSettings();
    requestConfirm({
      title: t('settings.restart.title'),
      body: t('settings.restartRun.body'),
      confirmLabel: t('settings.restart.confirm'),
      tone: 'danger',
      onConfirm: () => {
        clearSave();
        startNewRun();
      },
    });
  }

  // ESC closes the panel (matches ConfirmModal's capture behaviour).
  function onKeyDown(e: KeyboardEvent): void {
    if (!$settingsOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSettings();
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

{#if $settingsOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scrim" transition:fade={{ duration: 120 }} onclick={closeSettings}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="modal"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label={t('settings.title')}
      transition:scale={{ duration: 150, start: 0.94 }}
      onclick={(e) => e.stopPropagation()}
    >
      <header class="head">
        <h3>{t('settings.title')}</h3>
        <button
          type="button"
          class="close"
          aria-label={t('settings.close')}
          onclick={closeSettings}
        >
          ✕
        </button>
      </header>

      <div class="body">
        <h4 class="section">{t('settings.difficulty')}</h4>
        <div class="options" role="radiogroup" aria-label={t('settings.difficulty')}>
          {#each OPTIONS as opt (opt.id)}
            <button
              type="button"
              class="option"
              class:selected={$settings.difficulty === opt.id}
              role="radio"
              aria-checked={$settings.difficulty === opt.id}
              onclick={() => onPick(opt.id)}
            >
              <span class="opt-emoji">{opt.emoji}</span>
              <span class="opt-text">
                <span class="opt-name">{t(`settings.difficulty.${opt.id}`)}</span>
                <span class="opt-desc">{t(`settings.difficulty.${opt.id}.desc`)}</span>
              </span>
            </button>
          {/each}
        </div>
        <p class="note">{t('settings.note')}</p>

        <h4 class="section">{t('settings.sound')}</h4>
        <button
          type="button"
          class="option"
          aria-pressed={!$audioPrefs.muted}
          onclick={toggleMute}
        >
          <span class="opt-emoji">{$audioPrefs.muted ? '🔇' : '🔊'}</span>
          <span class="opt-text">
            <span class="opt-name">{t('settings.sound')}</span>
            <span class="opt-desc">
              {$audioPrefs.muted ? t('settings.sound.off') : t('settings.sound.on')}
            </span>
          </span>
        </button>

        <h4 class="section">{t('settings.fightSpeed')}</h4>
        <div class="speed-row" role="radiogroup" aria-label={t('settings.fightSpeed')}>
          {#each SIM_SPEEDS as s (s)}
            <button
              type="button"
              class="speed-btn"
              class:selected={$simSpeed === s}
              role="radio"
              aria-checked={$simSpeed === s}
              onclick={() => setSimSpeed(s)}
            >
              {s}×
            </button>
          {/each}
        </div>
        <p class="note">{t('settings.fightSpeed.desc')}</p>

        <button type="button" class="option danger" onclick={onRestart}>
          <span class="opt-emoji">🔄</span>
          <span class="opt-text">
            <span class="opt-name">{t('settings.restartRun')}</span>
            <span class="opt-desc">{t('settings.restartRun.desc')}</span>
          </span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(6, 6, 10, 0.62);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    backdrop-filter: blur(2px);
  }
  .modal {
    width: min(460px, 100%);
    /* Taller now that it carries sound / speed / restart - cap to the viewport
       and let the body scroll so it never overflows a short screen. */
    max-height: calc(100dvh - 32px);
    background: #1c1c24;
    border: 1px solid #3a3a48;
    border-radius: 12px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
    user-select: none;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px;
    border-bottom: 1px solid #2a2a34;
  }
  .head h3 {
    margin: 0;
    flex: 1;
    font-size: 1.05rem;
    font-weight: 600;
    color: #eee;
  }
  .close {
    appearance: none;
    background: transparent;
    border: 1px solid #2a2a34;
    color: #ddd;
    border-radius: 6px;
    width: 30px;
    height: 30px;
    cursor: pointer;
  }
  .close:hover {
    background: #2a2a34;
  }
  .body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }
  .section {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #8a8a9a;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .option {
    appearance: none;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    background: #14141a;
    border: 1px solid #2a2a34;
    border-radius: 10px;
    padding: 12px 14px;
    cursor: pointer;
    color: inherit;
    min-height: 44px;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .option:hover {
    background: #1f1f28;
  }
  .option.selected {
    background: #2a2a34;
    border-color: #ffcc44;
  }
  .option:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }
  .opt-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.6rem;
    line-height: 1;
    flex: 0 0 auto;
  }
  .opt-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .opt-name {
    font-size: 0.98rem;
    font-weight: 600;
    color: #eee;
  }
  .option.selected .opt-name {
    color: #ffcc44;
  }
  .opt-desc {
    font-size: 0.82rem;
    color: #9aa;
    line-height: 1.35;
  }
  .note {
    margin: 0;
    font-size: 0.8rem;
    color: #8a8a9a;
    line-height: 1.4;
    border-top: 1px solid #2a2a34;
    padding-top: 12px;
  }

  /* Fight-speed: a segmented row of multiplier buttons. */
  .speed-row {
    display: flex;
    gap: 8px;
  }
  .speed-btn {
    flex: 1;
    appearance: none;
    background: #14141a;
    border: 1px solid #2a2a34;
    border-radius: 10px;
    padding: 12px;
    color: #cdd;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    min-height: 44px;
    font-variant-numeric: lining-nums tabular-nums;
    transition: background-color 100ms ease, border-color 100ms ease, color 100ms ease;
  }
  .speed-btn:hover {
    background: #1f1f28;
  }
  .speed-btn.selected {
    background: #2a2a34;
    border-color: #ffcc44;
    color: #ffcc44;
  }
  .speed-btn:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }

  /* Destructive restart row: red-tinted variant of the option row. */
  .option.danger {
    border-color: #5a2a2a;
  }
  .option.danger .opt-name {
    color: #e88;
  }
  .option.danger:hover {
    background: #2a1414;
  }
</style>
