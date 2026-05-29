<script lang="ts">
  import { completeRoom } from '../state/run';
  import { gemStash } from '../state/gem-stash';
  import { canCraftGem, craftGem, destroyGem, CRAFT_COST, DESTROY_REFUND } from '../state/rest';
  import { gemDisplay } from '../domain/gem-display';
  import { t } from '../i18n';

  import { topbar } from '../state/topbar';

  // The Craft button's enabled state tracks the live crystal balance: this
  // derived re-runs whenever the topbar store ticks. canCraftGem() peeks the
  // same balance and guards onCraft defensively (the button is already
  // disabled when unaffordable).
  const affordable = $derived($topbar.crystals >= CRAFT_COST);

  function onCraft(): void {
    if (!canCraftGem()) return;
    craftGem();
  }

  function onDestroy(gemId: string): void {
    destroyGem(gemId);
  }
</script>

<section class="rest">
  <header class="scene">
    <div class="emoji">🔥</div>
    <h2>{t('rest.title')}</h2>
    <p>{t('rest.tagline')}</p>
  </header>

  <div class="bench">
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

    <div class="stash">
      <div class="stash-label">{t('rest.stash.title')}</div>
      {#if $gemStash.length === 0}
        <div class="stash-empty">{t('rest.stash.empty')}</div>
      {:else}
        <ul class="stash-list">
          {#each $gemStash as g (g.id)}
            {@const d = gemDisplay(g)}
            <li
              class="gem"
              class:effect={d?.role === 'effect'}
              class:support={d?.role === 'support'}
            >
              <span class="gem-emoji">{d?.emoji ?? '?'}</span>
              <span class="gem-text">
                <span class="gem-name">{d?.name ?? g.defId}</span>
                <span class="gem-summary">{d?.summary ?? ''}</span>
              </span>
              <button
                type="button"
                class="destroy"
                title={t('rest.destroy.title', { name: d?.name ?? g.defId, refund: DESTROY_REFUND })}
                onclick={() => onDestroy(g.id)}
              >
                {t('rest.destroy')} · 💎 {DESTROY_REFUND}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <button type="button" class="leave" onclick={completeRoom}>{t('room.leave')}</button>
</section>

<style>
  .rest {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    background: radial-gradient(ellipse at center, #1c1410 0%, #0a0a0e 70%);
    padding: 24px 16px;
    overflow-y: auto;
    min-height: 0;
  }
  .scene {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 4rem;
    line-height: 1;
    filter: drop-shadow(0 0 24px rgba(255, 120, 60, 0.6));
  }
  h2 {
    margin: 0;
    font-weight: 600;
  }
  .scene p {
    margin: 0;
    color: #aab;
    max-width: 38ch;
  }

  .bench {
    width: 100%;
    max-width: 460px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
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
    border-color: #ffcc44;
  }
  .craft:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .craft:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }
  .craft-hint {
    margin: 0;
    font-size: 0.78rem;
    color: #889;
    text-align: center;
  }

  .stash {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 6px;
  }
  .stash-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #788;
    padding: 0 2px;
  }
  .stash-empty {
    font-size: 0.82rem;
    color: #667;
    line-height: 1.4;
    padding: 8px 2px;
  }
  .stash-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .gem {
    display: grid;
    grid-template-columns: 32px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid #2a2a34;
    border-radius: 6px;
    background: #14141a;
  }
  .gem.effect {
    border-left: 3px solid #f6a;
  }
  .gem.support {
    border-left: 3px solid #6ad;
  }
  .gem-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.4rem;
    line-height: 1;
    justify-self: center;
  }
  .gem-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .gem-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: #e6e6ee;
  }
  .gem-summary {
    font-size: 0.74rem;
    color: #9aa;
    line-height: 1.25;
  }
  .destroy {
    appearance: none;
    background: transparent;
    border: 1px solid #5a2a2a;
    color: #e88;
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 40px;
    white-space: nowrap;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .destroy:hover {
    background: #2a1414;
    border-color: #c44;
  }
  .destroy:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }

  .leave {
    appearance: none;
    background: #3a3a48;
    border: 1px solid #4a4a58;
    color: #fff;
    border-radius: 8px;
    padding: 12px 24px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
    margin-top: auto;
  }
  .leave:hover {
    background: #4a4a58;
    border-color: #ffcc44;
  }
  .leave:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }
</style>
