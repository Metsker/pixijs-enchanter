<script lang="ts">
  import { get } from 'svelte/store';
  import { paneEnter, paneLeave } from '../utils/paneTransition';
  import { revealInRail } from '../utils/revealInRail';
  import { gemInspector, closeGemInspector, type GemInspectSubject } from '../state/gem-inspector';
  import { gemDisplay, gemDisplayForDef, SOCKET_COLOR_HEX } from '../domain/gem-display';
  import { GEM_CATALOGUE } from '../domain/gem-catalogue';
  import { gemColor } from '../domain/gem-fit';
  import { gemLevel, isGem, type Gem } from '../domain/gem';
  import { gemRefund, disenchantGemFromBackpack, disenchantRewardGem } from '../state/disenchant';
  import { socketGemIntoItem, unsocketGemToBag } from '../state/gem-move';
  import { buyGem, canBuyGem, sellGemFromBackpack } from '../state/shop';
  import { gemSellValue } from '../domain/shop';
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
  // App's rail {#each} owns this pane's mount/unmount; the store clears a frame
  // before that, so cache the last subject and render from it through the leave -
  // otherwise the pane blanks the instant the store clears and the out transition
  // is cut (the content collapses mid-fade). Mirrors Inspector.svelte.
  let lastSubject = $state<GemInspectSubject | null>(get(gemInspector));
  $effect(() => {
    const s = $gemInspector;
    if (s) lastSubject = s;
  });
  const subject = $derived($gemInspector ?? lastSubject);
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

  // Sell a loose bag gem to the shop for gold (only while a shop is open).
  const canSell = $derived(looseInBag && $shopStock !== null);
  function onSell(): void {
    if (!gem || !canSell) return;
    sellGemFromBackpack(gem.id);
    closeGemInspector();
  }

  // The owned item this gem is socketed in (equipped / backpack / reward chest),
  // if any - so we can pull it back out into the bag. Shop / offer previews
  // aren't editable, so they don't count.
  const socketedIn = $derived.by((): { item: Item; index: number } | null => {
    if (!gem || shop) return null;
    const g = gem;
    for (const { item, key } of allItems) {
      if (!OWNED.has(key)) continue;
      const index = item.sockets.findIndex((s) => s?.id === g.id);
      if (index >= 0) return { item, index };
    }
    return null;
  });
  const canUnsocket = $derived(socketedIn !== null);
  function onUnsocket(): void {
    const target = socketedIn;
    if (!target) return;
    if (unsocketGemToBag(target.item, target.index)) closeGemInspector();
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
  <div
    class="gi"
    role="dialog"
    aria-label={d?.name ?? gem.defId}
    use:revealInRail
    in:paneEnter|global
    out:paneLeave|global
  >
    <header class="gi-head" data-pane-header style="--gem-color: {color ? SOCKET_COLOR_HEX[color] : '#666'}">
      <span class="gi-emoji">{d?.emoji ?? '💎'}</span>
      <div class="gi-title">
        <div class="gi-name">
          {d?.name ?? gem.defId}
          {#if level > 1}<span class="gi-level">Lv{level}</span>{/if}
        </div>
        <div class="gi-role">
          {d?.role === 'support' ? t('gemInspector.role.support') : t('gemInspector.role.effect')}
        </div>
      </div>
      <button type="button" class="gi-close" aria-label={t('gemInspector.close')} onclick={closeGemInspector}>✕</button>
    </header>

    <div class="gi-body">
      <!-- Description: the gem's current effect, generated from its def + level. -->
      <p class="gi-desc">{d?.summary ?? ''}</p>

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

    <!-- Actions live in a footer at the bottom of the panel, matching the item
         inspector: Buy (shop) / Take + Sell + Destroy (loose / reward) /
         Unsocket (socketed in an owned item) / a value label (otherwise). -->
    <footer class="gi-foot">
      {#if shop}
        <button
          type="button"
          class="cta"
          disabled={!buy.ok}
          title={buy.reason}
          onclick={onBuy}
        >
          {t('inspector.buy', { price: shop.price })}
        </button>
      {:else if canDestroy}
        {#if isRewardGem}
          <button
            type="button"
            class="cta"
            disabled={bagFull}
            title={bagFull ? t('inspector.cta.backpackFull') : ''}
            onclick={onTake}
          >
            {t('inspector.take')}
          </button>
        {/if}
        {#if canSell}
          <button type="button" class="cta secondary" onclick={onSell}>
            {t('gemInspector.sell', { price: gemSellValue(gem) })}
          </button>
        {/if}
        <button type="button" class="cta danger" onclick={onDestroy}>
          {t('gemInspector.destroy', { refund })}
        </button>
      {:else if canUnsocket}
        <!-- Socketed in an owned item: pull it back out into the bag. -->
        <button type="button" class="cta" onclick={onUnsocket}>
          {t('gemInspector.unsocket')}
        </button>
      {:else}
        <div class="gi-row destroy-row">
          <span class="gi-label">{t('gemInspector.destroyValue')}</span>
          <span class="gi-value">💎 {refund}</span>
        </div>
      {/if}
    </footer>
  </div>
{/if}

<style>
  /* In-rail gem panel: a fixed-width flex column stretched to the rail's full
     height, snapping as the player scrolls/swipes. (Was a centered modal.) */
  .gi {
    flex: 0 0 auto;
    align-self: stretch;
    /* Every split is exactly a quarter of the screen: four tile to fill it, a
       fifth scrolls off (reached via the rail arrows). The floor keeps it usable
       where a quarter would be too narrow. */
    width: 25%;
    min-width: min(300px, 100%);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #1c1c24;
    border-left: 1px solid #3a3a48;    overflow: hidden;
  }

  /* Header mirrors the item inspector: emoji + name + a colour-coded badge
     (the gem's socket colour, the way the item shows its tier) + close. */
  .gi-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    height: 76px;
    box-sizing: border-box;
    padding: 0 14px;
    border-bottom: 1px solid #2a2a34;
  }
  .gi-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 2rem;
    line-height: 1;
  }
  .gi-title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .gi-name {
    font-size: 1.1rem;
    font-weight: 600;
    color: #ddd;
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
  /* Role badge - styled like the item inspector's tier badge, tinted by the
     gem's socket colour (red / green / blue) so it reads role + colour at once. */
  .gi-role {
    align-self: flex-start;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid var(--gem-color, #666);
    color: var(--gem-color, #999);
    background: rgba(0, 0, 0, 0.3);
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
    flex: 1;
    min-height: 0;
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
  /* Action footer at the bottom of the panel (matches the item inspector). */
  .gi-foot {
    padding: 12px 14px;
    border-top: 1px solid #2a2a34;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* Footer action buttons - the exact same .cta family the item inspector uses,
     stacked full-width, so the two inspectors read identically. */
  .cta {
    width: 100%;
    appearance: none;
    background: #3a3a48;
    border: 1px solid #4a4a58;
    color: #fff;
    border-radius: 8px;
    padding: 12px;
    font-size: 1.05rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
    font-variant-numeric: lining-nums tabular-nums;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .cta.secondary {
    background: #1c1c24;
    color: #ddd;
  }
  .cta.secondary:hover:not(:disabled) {
    background: #2a2a34;
    border-color: #ffcc44;
  }
  .cta.danger {
    background: transparent;
    border-color: #5a2a2a;
    color: #e88;
  }
  .cta.danger:hover:not(:disabled) {
    background: #2a1414;
    border-color: #c44;
  }
  .cta:hover:not(:disabled) {
    background: #4a4a58;
    border-color: #ffcc44;
  }
  .cta:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .cta:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }

  .gi-sec {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .gi-sec-head {
    font-size: 0.82rem;
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
