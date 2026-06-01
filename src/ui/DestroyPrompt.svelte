<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { destroyPrompt, closeDestroyPrompt } from '../state/destroy-prompt';
  import { inspectGem } from '../state/gem-inspector';
  import { gemDisplay, SOCKET_COLOR_HEX } from '../domain/gem-display';
  import { itemEmoji, tierOf } from '../domain/item';
  import type { Gem } from '../domain/gem';
  import { t } from '../i18n';

  const req = $derived($destroyPrompt);
  const gems = $derived(req ? req.item.sockets.filter((g): g is Gem => !!g) : []);

  function keep(): void {
    const r = $destroyPrompt;
    closeDestroyPrompt();
    r?.onKeepGems();
  }
  function destroyAll(): void {
    const r = $destroyPrompt;
    closeDestroyPrompt();
    r?.onDestroyAll();
  }
  function onKeyDown(e: KeyboardEvent): void {
    if ($destroyPrompt && e.key === 'Escape') {
      e.preventDefault();
      closeDestroyPrompt();
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

{#if req}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scrim" transition:fade={{ duration: 120 }} onclick={closeDestroyPrompt}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="modal"
      role="alertdialog"
      tabindex="-1"
      aria-label={t('destroy.title')}
      transition:scale={{ duration: 150, start: 0.94 }}
      onclick={(e) => e.stopPropagation()}
    >
      <header class="head">
        <span class="item-emoji">{itemEmoji(req.item)}</span>
        <div class="title">
          <h3>{t('destroy.title')}</h3>
          <span class="sub">{t(`item.type.${req.item.itemType}`)} · T{tierOf(req.item)}</span>
        </div>
        <button type="button" class="close" aria-label={t('confirm.close')} onclick={closeDestroyPrompt}>✕</button>
      </header>

      <p class="body">{t('destroy.body', { n: gems.length })}</p>

      <div class="gems-label">{t('destroy.gemsLabel')}</div>
      <ul class="gems">
        {#each gems as gem (gem.id)}
          {@const gd = gemDisplay(gem)}
          <li>
            <button
              type="button"
              class="gem"
              style="--gem-color: {gd ? SOCKET_COLOR_HEX[gd.color] : '#5c6a6a'}"
              title={t('destroy.preview')}
              onclick={() => inspectGem(gem)}
            >
              <span class="gem-emoji">{gd?.emoji ?? '💠'}</span>
              <span class="gem-name">
                {gd?.name ?? gem.defId}{#if (gd?.level ?? 1) > 1}<span class="gem-lv"> Lv{gd?.level}</span>{/if}
              </span>
              <span class="gem-summary">{gd?.summary ?? ''}</span>
            </button>
          </li>
        {/each}
      </ul>

      <div class="actions">
        <button type="button" class="btn cancel" onclick={closeDestroyPrompt}>{t('confirm.cancel')}</button>
        <button type="button" class="btn keep" onclick={keep}>{t('destroy.keepGems')}</button>
        <button type="button" class="btn danger" onclick={destroyAll}>{t('destroy.destroyAll')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 120; /* above the item inspector (110) + backpack (100), below the gem inspector (130) */
    background: rgba(6, 6, 10, 0.62);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    backdrop-filter: blur(2px);
  }
  .modal {
    width: min(440px, 100%);
    max-height: calc(100dvh - 80px);
    background: #121d20;
    border: 1px solid #28383d;
    border-radius: 12px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
    user-select: none;
    overflow: hidden;
  }
  .head {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid #18262a;
  }
  .item-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.8rem;
    line-height: 1;
  }
  .title {
    min-width: 0;
  }
  .title h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: #dde7e7;
  }
  .sub {
    font-size: 0.78rem;
    color: #7f8e8e;
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
    padding: 14px 16px 8px;
    color: #bbc8c8;
    font-size: 0.92rem;
    line-height: 1.5;
  }
  .gems-label {
    padding: 0 16px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6f7d7d;
  }
  .gems {
    list-style: none;
    margin: 6px 0 0;
    padding: 0 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
  }
  .gem {
    width: 100%;
    appearance: none;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-areas: 'emoji name' 'emoji summary';
    column-gap: 10px;
    align-items: center;
    text-align: left;
    background: #0c1517;
    border: 1px solid #18262a;
    border-left: 3px solid var(--gem-color, #5c6a6a);
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
    color: #c0cdcd;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .gem:hover {
    background: #142023;
    border-color: #374d52;
  }
  .gem:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }
  .gem-emoji {
    grid-area: emoji;
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.5rem;
    line-height: 1;
  }
  .gem-name {
    grid-area: name;
    font-weight: 600;
    color: #dde7e7;
  }
  .gem-lv {
    color: #c084fc;
    font-weight: 700;
  }
  .gem-summary {
    grid-area: summary;
    font-size: 0.78rem;
    color: #91a1a1;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 14px 16px 16px;
    justify-content: flex-end;
  }
  .btn {
    appearance: none;
    border-radius: 8px;
    padding: 10px 16px;
    font-size: 0.9rem;
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
  .btn.keep {
    background: #18261b;
    border: 1px solid #3a5a3a;
    color: #b6f0c2;
  }
  .btn.keep:hover {
    background: #1f3324;
    border-color: #4caf6a;
  }
  .btn.danger {
    background: #5a2424;
    border: 1px solid #8a3a3a;
    color: #ff9c9c;
  }
  .btn.danger:hover {
    background: #6e2a2a;
    border-color: #cc4444;
  }
  .btn:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }
</style>
