<script lang="ts">
  import { randomWeapon } from '../domain/random';
  import { itemEmoji, type Item } from '../domain/item';
  import { equipItemDirect } from '../state/inventory';
  import { leaveWeaponSelect } from '../state/run';
  import { t } from '../i18n';

  // Roll three T1 weapons on mount. The list lives in $state so the
  // user sees the same offers as long as this component is alive; a
  // new run unmounts WeaponSelect (screen flips to 'map'), so the
  // next run re-rolls.
  const choices = $state<Item[]>([
    randomWeapon(1, 'starter'),
    randomWeapon(1, 'starter'),
    randomWeapon(1, 'starter'),
  ]);

  function pick(item: Item): void {
    equipItemDirect(item);
    leaveWeaponSelect();
  }
</script>

<section class="screen" aria-label={t('weaponSelect.title')}>
  <h2>{t('weaponSelect.title')}</h2>
  <p class="subtitle">{t('weaponSelect.subtitle')}</p>

  <div class="grid" role="list">
    {#each choices as item (item.id)}
      {@const enchant = item.enchants[0]}
      <button type="button" class="card" onclick={() => pick(item)}>
        <span class="icon">{itemEmoji(item)}</span>
        <div class="meta">
          <div class="enchant-row">
            <span class="enchant-emoji">{enchant.emoji}</span>
            <span class="enchant-name">{t(enchant.nameKey)}</span>
          </div>
          <div class="enchant-desc">{t(enchant.descriptionKey)}</div>
        </div>
      </button>
    {/each}
  </div>
</section>

<style>
  .screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 24px;
    background:
      radial-gradient(ellipse at center, rgba(255, 204, 68, 0.05), transparent 60%),
      linear-gradient(180deg, #14141a 0%, #1c1c24 100%);
    overflow-y: auto;
  }
  h2 {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 600;
    color: #ffcc44;
  }
  .subtitle {
    margin: 0 0 8px;
    color: #9aa;
    font-size: 0.95rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(180px, 220px));
    gap: 16px;
    max-width: 720px;
    width: 100%;
  }
  @media (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
      max-width: 320px;
    }
  }

  .card {
    appearance: none;
    background: #1c1c24;
    border: 1px solid #3a3a48;
    color: inherit;
    border-radius: 12px;
    padding: 18px 14px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    transition: background-color 120ms ease, border-color 120ms ease,
      transform 120ms ease;
  }
  .card:hover {
    background: #232330;
    border-color: #ffcc44;
    transform: translateY(-2px);
  }
  .card:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 3px;
  }
  .icon {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 3rem;
    line-height: 1;
  }
  .meta {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
  }
  .enchant-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .enchant-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.1rem;
  }
  .enchant-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: #eee;
  }
  .enchant-desc {
    font-size: 0.82rem;
    color: #ccc;
    line-height: 1.4;
  }
</style>
