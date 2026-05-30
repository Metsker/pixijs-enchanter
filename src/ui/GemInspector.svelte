<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { gemInspector, closeGemInspector } from '../state/gem-inspector';
  import { gemDisplay, gemDisplayForDef, SOCKET_COLOR_HEX } from '../domain/gem-display';
  import { GEM_CATALOGUE } from '../domain/gem-catalogue';
  import { gemColor } from '../domain/gem-fit';
  import { gemLevel, isGem, type Gem } from '../domain/gem';
  import { gemRefund, disenchantGemFromBackpack, disenchantRewardGem } from '../state/disenchant';
  import { socketGemIntoItem } from '../state/gem-move';
  import { buyGem, canBuyGem } from '../state/shop';
  import { topbar } from '../state/topbar';
  import { equipped } from '../state/inventory';
  import { backpack, addGemToBackpack } from '../state/backpack';
  import { pendingRewards, removeRewardGem } from '../state/rewards';
  import { shopStock } from '../state/shop';
  import { itemOffer } from '../state/item-offer';
  import { isItem, itemEmoji, tierOf, type Item } from '../domain/item';
  import { EQUIPMENT_SLOT_ORDER } from '../domain/equipment';
  import { t } from '../i18n';

  const TIER_COLORS: Record<number, string> = {
    1: '#9ca3af',
    2: '#22c55e',
    3: '#3b82f6',
    4: '#a855f7',
    5: '#f97316',
    6: '#ef4444',
    7: '#fbbf24',
  };

  // The inspected gem (a snapshot) + its catalogue def / colour / level.
  const subject = $derived($gemInspector);
  const gem = $derived(subject?.gem ?? null);
  // Shop preview mode: the gem isn't owned, so no Insert / Destroy - just Buy.
  const shop = $derived(subject?.shop ?? null);
  const def = $derived(gem ? GEM_CATALOGUE[gem.defId] ?? null : null);
  const disp = $derived(gem ? gemDisplay(gem) : null);
  const color = $derived(gem ? gemColor(gem) : null);
  const level = $derived(gem ? gemLevel(gem) : 1);
  const refund = $derived(gem ? gemRefund(gem) : 0);

  // What the gem reads as one level higher - the SAME generated summary combat
  // uses, so the level-up preview never drifts from the real numbers.
  const nextSummary = $derived(def ? gemDisplayForDef(def, level + 1).summary : '');
  const scalesOnLevel = $derived(disp !== null && nextSummary !== '' && disp.summary !== nextSummary);

  // Is this exact instance a loose backpack gem? Only then can we offer a
  // direct Destroy (socketed / shop / reward gems show the value for reference).
  const looseInBag = $derived(gem !== null && $backpack.some((s) => isGem(s) && s.id === gem.id));
  // A loose gem sitting in the victory chest - offer a Take (into the bag).
  const isRewardGem = $derived(gem !== null && !shop && $pendingRewards.gems.some((g) => g.id === gem.id));
  const bagFull = $derived(!$backpack.includes(null));

  // Readable label for an item: its armour sub-slot or its item type.
  function itemLabel(item: Item): string {
    if (item.itemType === 'armor' && item.armorSlot) return t(`inventory.slot.${item.armorSlot}`);
    return t(`item.type.${item.itemType}`);
  }

  type SourceKey = 'equipped' | 'bag' | 'chest' | 'shop' | 'offer';
  // Only OWNED items (editable + persistable by socketGemIntoItem) can take a
  // direct Insert. Shop / offer items are reference-only here.
  const OWNED: ReadonlySet<SourceKey> = new Set(['equipped', 'bag', 'chest']);
  const sourceLabel = (k: SourceKey): string => t(`gemInspector.source.${k}`);

  interface ItemRef {
    item: Item;
    key: SourceKey;
  }
  interface GemRef {
    gem: Gem;
    where: string;
  }

  // Every item across every source the player can reach (equipped, bag, victory
  // chest, shop, item offer), each tagged with where it lives.
  const allItems = $derived.by((): ItemRef[] => {
    const out: ItemRef[] = [];
    const eq = $equipped;
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      const it = eq[slot];
      if (it) out.push({ item: it, key: 'equipped' });
    }
    for (const s of $backpack) if (isItem(s)) out.push({ item: s, key: 'bag' });
    for (const it of $pendingRewards.items) out.push({ item: it, key: 'chest' });
    const shop = $shopStock;
    if (shop) for (const slot of shop.items) if (slot) out.push({ item: slot.item, key: 'shop' });
    const offer = $itemOffer;
    if (offer) for (const it of offer.items) if (it) out.push({ item: it, key: 'offer' });
    return out;
  });

  // Every gem everywhere - loose ones plus those socketed in any surveyed item.
  const allGems = $derived.by((): GemRef[] => {
    const out: GemRef[] = [];
    for (const s of $backpack) if (isGem(s)) out.push({ gem: s, where: sourceLabel('bag') });
    for (const g of $pendingRewards.gems) out.push({ gem: g, where: sourceLabel('chest') });
    const shop = $shopStock;
    if (shop) for (const slot of shop.gems) if (slot) out.push({ gem: slot.gem, where: sourceLabel('shop') });
    for (const { item, key } of allItems) {
      for (const sock of item.sockets) if (sock) out.push({ gem: sock, where: sourceLabel(key) });
    }
    return out;
  });

  // Items with an EMPTY socket of this gem's colour - i.e. somewhere it could go
  // right now. Each carries the open / total matching-socket counts, its source,
  // and whether it can take a direct Insert (owned + the gem is the player's).
  const compatibleItems = $derived.by(() => {
    if (!color) return [];
    return allItems
      .map(({ item, key }) => {
        const open = item.sockets.filter((s, i) => s === null && item.socketColors[i] === color).length;
        return {
          item,
          key,
          source: sourceLabel(key),
          total: item.socketColors.filter((c) => c === color).length,
          open,
          // A shop gem isn't owned, so it can only be previewed, never inserted.
          insertable: !shop && open > 0 && OWNED.has(key),
        };
      })
      // Only items that have room for it right now.
      .filter((c) => c.open > 0)
      .sort((a, b) => Number(b.insertable) - Number(a.insertable) || b.open - a.open);
  });

  // Other gems of the same defId (any source) - drop one onto this to level up.
  const combinableGems = $derived.by(() => {
    if (!gem) return [];
    return allGems.filter((r) => r.gem.defId === gem.defId && r.gem.id !== gem.id);
  });

  const LIST_CAP = 8;

  // A gem the player can scrap right now: a loose bag gem or a loose reward-chest
  // gem (both refund crystals). Socketed / shop gems show the value, not a button.
  const canDestroy = $derived(looseInBag || isRewardGem);
  function onDestroy(): void {
    if (!gem) return;
    const ok = isRewardGem ? disenchantRewardGem(gem.id) : disenchantGemFromBackpack(gem.id);
    if (ok) closeGemInspector();
  }

  // "Fits these items -> Insert": socket the gem straight into this item's first
  // open matching socket, then close (the gem now lives in the item).
  function onInsert(item: Item): void {
    if (!gem || shop) return;
    if (socketGemIntoItem(gem, item)) closeGemInspector();
  }

  // Shop preview -> Buy: purchase the gem into the bag (canBuyGem re-checks gold
  // + bag space), then close. Touching $topbar / $backpack keeps the button's
  // disabled state + reason live as gold is spent or the bag fills.
  const buy = $derived.by(() => {
    void $topbar;
    void $backpack;
    if (!shop) return { ok: false, reason: '' };
    const r = canBuyGem(shop.index);
    return { ok: r.ok, reason: !r.ok && r.reasonKey ? t(r.reasonKey) : '' };
  });
  function onBuy(): void {
    if (!shop) return;
    if (buyGem(shop.index)) closeGemInspector();
  }

  // Victory chest -> Take: pull the reward gem into the bag, then close.
  function onTake(): void {
    if (!gem || !isRewardGem || bagFull) return;
    removeRewardGem(gem.id);
    addGemToBackpack(gem);
    closeGemInspector();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') closeGemInspector();
  }
</script>

<svelte:window onkeydown={onKeyDown} />

{#if gem}
  {@const d = disp}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="gi-scrim" transition:fade={{ duration: 120 }} onclick={closeGemInspector}></div>
  <div
    class="gi"
    role="dialog"
    aria-modal="true"
    aria-label={d?.name ?? gem.defId}
    transition:fly={{ y: 16, duration: 180, easing: cubicOut, opacity: 0 }}
  >
    <header class="gi-head" style="--gem-color: {color ? SOCKET_COLOR_HEX[color] : '#666'}">
      <span class="gi-emoji">{d?.emoji ?? '💎'}</span>
      <div class="gi-title">
        <div class="gi-name">
          {d?.name ?? gem.defId}
          {#if level > 1}<span class="gi-level">Lv{level}</span>{/if}
        </div>
        <div class="gi-role" class:support={d?.role === 'support'}>
          {d?.role === 'support' ? t('gemInspector.role.support') : t('gemInspector.role.effect')}
        </div>
      </div>
      <button type="button" class="gi-close" aria-label={t('gemInspector.close')} onclick={closeGemInspector}>✕</button>
    </header>

    <div class="gi-body">
      <!-- Description: the gem's current effect, generated from its def + level. -->
      <p class="gi-desc">{d?.summary ?? ''}</p>

      {#if shop}
        <!-- Shop preview: a Buy action; the gem isn't owned, so no insert/destroy. -->
        <div class="gi-row">
          <span class="gi-label">{t('gemInspector.destroyValue')}</span>
          <span class="gi-value">💎 {refund}</span>
        </div>
        <button
          type="button"
          class="gi-buy"
          disabled={!buy.ok}
          title={buy.reason}
          onclick={onBuy}
        >
          {t('inspector.buy', { price: shop.price })}
        </button>
      {:else}
        {#if canDestroy}
          <!-- A loose gem (bag or chest): a real Destroy button carrying the
               crystal value. -->
          <div class="gi-actions">
            {#if isRewardGem}
              <!-- Victory chest: Take the gem straight into the bag. -->
              <button
                type="button"
                class="gi-act take"
                disabled={bagFull}
                title={bagFull ? t('inspector.cta.backpackFull') : ''}
                onclick={onTake}
              >
                {t('inspector.take')}
              </button>
            {/if}
            <button type="button" class="gi-act destroy" onclick={onDestroy}>
              {t('gemInspector.destroy', { refund })}
            </button>
          </div>
        {:else}
          <!-- Socketed gem: not directly destroyable here, just show its value. -->
          <div class="gi-row destroy-row">
            <span class="gi-label">{t('gemInspector.destroyValue')}</span>
            <span class="gi-value">💎 {refund}</span>
          </div>
        {/if}
      {/if}

      <!-- Level-up preview: current effect -> next level, so the change is read
           straight off the numbers combat will use. -->
      <section class="gi-sec">
        <div class="gi-sec-head">{t('gemInspector.levelUp', { from: level, to: level + 1 })}</div>
        {#if scalesOnLevel}
          <div class="lvl-compare">
            <span class="lvl-now">{d?.summary}</span>
            <span class="lvl-arrow">↓</span>
            <span class="lvl-next">{nextSummary}</span>
          </div>
        {:else}
          <p class="gi-none">{t('gemInspector.noLevelChange')}</p>
        {/if}
      </section>

      <!-- Combine targets: same-defId gems anywhere that can merge to level up. -->
      <section class="gi-sec">
        <div class="gi-sec-head">{t('gemInspector.combine')}</div>
        {#if combinableGems.length === 0}
          <p class="gi-none">{t('gemInspector.combineNone', { name: d?.name ?? gem.defId })}</p>
        {:else}
          <p class="gi-subhint">{t('gemInspector.combineHint')}</p>
          <ul class="gi-list">
            {#each combinableGems.slice(0, LIST_CAP) as cg (cg.gem.id)}
              {@const cd = gemDisplay(cg.gem)}
              <li class="gi-item">
                <span class="gi-item-emoji">{cd?.emoji ?? '💎'}</span>
                <span class="gi-item-main">{cd?.name ?? cg.gem.defId}{#if (cd?.level ?? 1) > 1}<span class="gi-mini-lv"> Lv{cd?.level}</span>{/if}</span>
                <span class="gi-item-src">{cg.where}</span>
              </li>
            {/each}
          </ul>
          {#if combinableGems.length > LIST_CAP}
            <div class="gi-more">{t('gemInspector.more', { n: combinableGems.length - LIST_CAP })}</div>
          {/if}
        {/if}
      </section>

      <!-- Compatible items (any source): gear with a socket of this gem's colour. -->
      <section class="gi-sec">
        <div class="gi-sec-head">{t('gemInspector.fits')}</div>
        {#if compatibleItems.length === 0}
          <p class="gi-none">{t('gemInspector.fitsNone')}</p>
        {:else}
          <ul class="gi-list">
            {#each compatibleItems.slice(0, LIST_CAP) as ci (ci.item.id)}
              <li class="gi-fit-li">
                <button
                  type="button"
                  class="gi-item gi-item-btn"
                  class:insertable={ci.insertable}
                  disabled={!ci.insertable}
                  title={ci.insertable ? t('gemInspector.insertHint') : ''}
                  onclick={() => onInsert(ci.item)}
                >
                  <span class="gi-item-emoji">{itemEmoji(ci.item)}</span>
                  <span class="gi-item-tier" style="--tier-color: {TIER_COLORS[tierOf(ci.item)] ?? '#666'}">T{tierOf(ci.item)}</span>
                  <span class="gi-item-main">{itemLabel(ci.item)}</span>
                  <span class="gi-item-open">{t('gemInspector.open', { open: ci.open, total: ci.total })}</span>
                  <span class="gi-item-src">{ci.source}</span>
                  {#if ci.insertable}<span class="gi-insert">{t('gemInspector.insert')}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
          {#if compatibleItems.length > LIST_CAP}
            <div class="gi-more">{t('gemInspector.more', { n: compatibleItems.length - LIST_CAP })}</div>
          {/if}
        {/if}
      </section>
    </div>
  </div>
{/if}

<style>
  .gi-scrim {
    position: fixed;
    inset: 0;
    background: rgba(8, 8, 12, 0.55);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    z-index: 130;
  }
  .gi {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(420px, 92vw);
    max-height: calc(100dvh - 80px);
    display: flex;
    flex-direction: column;
    background: #1c1c24;
    border: 1px solid #3a3a48;
    border-radius: 12px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.6);
    z-index: 131;
    overflow: hidden;
  }

  .gi-head {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 14px 14px 12px;
    border-bottom: 1px solid #2a2a34;
    border-left: 4px solid var(--gem-color, #666);
  }
  .gi-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 2rem;
    line-height: 1;
  }
  .gi-title {
    min-width: 0;
  }
  .gi-name {
    font-size: 1.1rem;
    font-weight: 600;
    color: #eee;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .gi-level {
    font-size: 0.72rem;
    font-weight: 700;
    color: #f0e0ff;
    background: rgba(124, 58, 200, 0.85);
    border: 1px solid #c084fc;
    border-radius: 4px;
    padding: 1px 5px;
    font-variant-numeric: lining-nums;
  }
  .gi-role {
    margin-top: 2px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #f6a;
  }
  .gi-role.support {
    color: #6ad;
  }
  .gi-close {
    appearance: none;
    background: transparent;
    border: 1px solid #3a3a48;
    color: #ccc;
    border-radius: 6px;
    width: 32px;
    height: 32px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .gi-close:hover {
    background: #2a2a34;
  }
  .gi-close:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }

  .gi-body {
    padding: 12px 14px 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .gi-desc {
    margin: 0;
    color: #cdd;
    font-size: 0.92rem;
    line-height: 1.4;
  }

  .gi-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .gi-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #889;
  }
  .gi-value {
    font-variant-numeric: lining-nums tabular-nums;
    color: #cdd;
    font-weight: 600;
  }
  /* Loose-gem action row: Take (chest only) + Destroy, side by side. */
  .gi-actions {
    display: flex;
    gap: 8px;
  }
  .gi-act {
    flex: 1;
    appearance: none;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .gi-act.take {
    background: #2a2418;
    border: 1px solid #5a4a30;
    color: #ffd28a;
  }
  .gi-act.take:hover:not(:disabled) {
    background: #3a2c1c;
    border-color: #ffcc44;
  }
  .gi-act.take:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .gi-act.destroy {
    background: transparent;
    border: 1px solid #5a2a2a;
    color: #e88;
  }
  .gi-act.destroy:hover {
    background: #2a1414;
    border-color: #c44;
  }
  .gi-act:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }

  .gi-buy {
    appearance: none;
    width: 100%;
    background: #2a2418;
    border: 1px solid #5a4a30;
    color: #ffd28a;
    border-radius: 8px;
    padding: 12px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
    font-variant-numeric: lining-nums tabular-nums;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .gi-buy:hover:not(:disabled) {
    background: #3a2c1c;
    border-color: #ffcc44;
  }
  .gi-buy:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .gi-buy:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }

  .gi-sec {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .gi-sec-head {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #788;
    border-top: 1px solid #2a2a34;
    padding-top: 12px;
  }
  .gi-none {
    margin: 0;
    color: #778;
    font-size: 0.84rem;
    line-height: 1.4;
  }
  .gi-subhint {
    margin: 0;
    color: #889;
    font-size: 0.78rem;
  }

  .lvl-compare {
    display: flex;
    flex-direction: column;
    gap: 3px;
    background: #14141a;
    border: 1px solid #2a2a34;
    border-radius: 8px;
    padding: 10px 12px;
  }
  .lvl-now {
    color: #99a;
    font-size: 0.86rem;
    line-height: 1.35;
  }
  .lvl-arrow {
    color: #c084fc;
    font-weight: 700;
    line-height: 1;
  }
  .lvl-next {
    color: #e6d4ff;
    font-size: 0.92rem;
    font-weight: 600;
    line-height: 1.35;
  }

  .gi-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .gi-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: 1px solid #2a2a34;
    border-radius: 6px;
    background: #14141a;
    font-size: 0.85rem;
    color: #cdd;
  }
  .gi-fit-li {
    list-style: none;
  }
  /* The fits row is a full-width button (it inherits the .gi-item row visual). */
  .gi-item-btn {
    width: 100%;
    appearance: none;
    font: inherit;
    cursor: default;
  }
  .gi-item-btn:disabled {
    opacity: 1; /* reference-only rows still read at full strength */
  }
  .gi-item-btn.insertable {
    cursor: pointer;
    border-color: #3a4a3a;
  }
  .gi-item-btn.insertable:hover {
    background: #19231b;
    border-color: #4caf6a;
  }
  .gi-item-btn.insertable:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }
  .gi-insert {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #0c140c;
    background: #4caf6a;
    border-radius: 4px;
    padding: 2px 8px;
  }
  .gi-item-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.2rem;
    line-height: 1;
  }
  .gi-item-tier {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--tier-color, #999);
    border: 1px solid var(--tier-color, #666);
    border-radius: 4px;
    padding: 0 4px;
    font-variant-numeric: lining-nums;
  }
  .gi-item-main {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gi-mini-lv {
    color: #c084fc;
    font-weight: 700;
  }
  .gi-item-open {
    font-size: 0.74rem;
    color: #8a9;
    font-variant-numeric: lining-nums;
  }
  .gi-item-src {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #778;
    background: #20202a;
    border-radius: 4px;
    padding: 2px 6px;
  }
  .gi-more {
    color: #778;
    font-size: 0.78rem;
    padding-left: 2px;
  }
</style>
