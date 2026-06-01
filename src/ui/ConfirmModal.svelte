<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { cancelConfirm, confirmRequest, resolveConfirm } from '../state/confirm';
  import { t } from '../i18n';

  // ESC cancels; Enter commits. Confirm modals capture input (docs/ux.md
  // § Confirm modals), so we listen on the window while one is open.
  function onKeyDown(e: KeyboardEvent): void {
    if (!$confirmRequest) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelConfirm();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      resolveConfirm();
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

{#if $confirmRequest}
  {@const req = $confirmRequest}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scrim" transition:fade={{ duration: 120 }} onclick={cancelConfirm}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="modal"
      role="alertdialog"
      tabindex="-1"
      aria-label={req.title}
      transition:scale={{ duration: 150, start: 0.94 }}
      onclick={(e) => e.stopPropagation()}
    >
      <header class="head">
        <h3>{req.title}</h3>
        <button type="button" class="close" aria-label={t('confirm.close')} onclick={cancelConfirm}>
          ✕
        </button>
      </header>
      <p class="body">{req.body}</p>
      <div class="actions">
        <button type="button" class="btn cancel" onclick={cancelConfirm}>
          {t('confirm.cancel')}
        </button>
        <button
          type="button"
          class="btn confirm"
          class:danger={req.tone === 'danger'}
          onclick={resolveConfirm}
        >
          {req.confirmLabel}
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
  }
  .modal {
    width: min(420px, 100%);
    background: #121d20;
    border: 1px solid #28383d;
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
    border-bottom: 1px solid #18262a;
  }
  .head h3 {
    margin: 0;
    flex: 1;
    font-size: 1.05rem;
    font-weight: 600;
    color: #dde7e7;
  }
  .close {
    appearance: none;
    background: transparent;
    border: 1px solid #18262a;
    color: #c0cdcd;
    border-radius: 6px;
    width: 30px;
    height: 30px;
    cursor: pointer;
  }
  .close:hover {
    background: #18262a;
  }
  .body {
    margin: 0;
    padding: 16px;
    color: #bbc8c8;
    font-size: 0.92rem;
    line-height: 1.5;
  }
  .actions {
    display: flex;
    gap: 8px;
    padding: 12px 16px 16px;
    justify-content: flex-end;
  }
  .btn {
    appearance: none;
    border-radius: 8px;
    padding: 10px 18px;
    font-size: 0.92rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
  }
  .btn.cancel {
    background: #18262a;
    border: 1px solid #28383d;
    color: #c0cdcd;
  }
  .btn.cancel:hover {
    background: #28383d;
  }
  .btn.confirm {
    background: #28383d;
    border: 1px solid #374d52;
    color: #fff;
  }
  .btn.confirm:hover {
    background: #374d52;
    border-color: #3cc7b8;
  }
  .btn.confirm.danger {
    background: #5a2424;
    border-color: #8a3a3a;
    color: #ff9c9c;
  }
  .btn.confirm.danger:hover {
    background: #6e2a2a;
    border-color: #cc4444;
  }
</style>
