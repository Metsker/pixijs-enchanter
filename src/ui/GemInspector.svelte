<script lang="ts">
  import { get } from 'svelte/store';
  import { paneEnter, paneLeave } from '../utils/paneTransition';
  import { revealInRail } from '../utils/revealInRail';
  import { gemInspector, closeGemInspector, type GemInspectSubject } from '../state/gem-inspector';
  import { gemDisplay, gemDisplayForDef, SOCKET_COLOR_HEX } from '../domain/gem-display';
  import { GEM_CATALOGUE } from '../domain/gem-catalogue';
  import { gemColor } from '../domain/gem-fit';
  import { gemLevel, isGem, type Gem } from '../domain/gem';
  import { gemRefund, disenchantGemFromBackpack } from '../state/disenchant';
  import { socketGemIntoItem, unsocketGemToBag, combineGems, findOwnedGemById } from '../state/gem-move';
  import { buyGem, canBuyGem, sellGemFromBackpack } from '../state/shop';
  import { gemSellValue } from '../domain/shop';
  import { topbar } from '../state/topbar';
  import { equipped } from '../state/inventory';
  import { backpack } from '../state/backpack';
  import { shopStock } from '../state/shop';
  import { isItem, itemEmoji, tierOf, type Item } from '../domain/item';
  import { EQUIPMENT_SLOT_ORDER } from '../domain/equipment';
  import { sfx } from '../audio/sfx';
  import { t } from '../i18n';

  const TIER_COLORS: Record<number, string> = {
    1: '#9ca3af',
    2: '#22c55e',
    3: '#3b82f6',
    4: '#a855f7',
    5: '#f97316',
    6: '#ef4444',
    7: '#33b6a6',
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
  // direct Destroy (socketed / shop gems show the value for reference).
  const looseInBag = $derived(gem !== null && $backpack.some((s) => isGem(s) && s.id === gem.id));

  // Readable label for an item: its armour sub-slot or its item type.
  function itemLabel(item: Item): string {
    if (item.itemType === 'armor' && item.armorSlot) return t(`inventory.slot.${item.armorSlot}`);
    return t(`item.type.${item.itemType}`);
  }

  // The combine / fits lists survey ONLY what the player owns - equipped gear
  // and the bag. The shop / armory stock is deliberately excluded (you can't
  // combine into or out of gear you don't own); when PREVIEWING a shop gem the
  // lists therefore read as "what buying this would let you do with YOUR gear".
  type SourceKey = 'equipped' | 'bag';
  const sourceLabel = (k: SourceKey): string => t(`gemInspector.source.${k}`);

  interface ItemRef {
    item: Item;
    key: SourceKey;
  }
  interface GemRef {
    gem: Gem;
    where: string;
    // An icon for the SOURCE: the host item's type emoji when the gem is
    // socketed (weapon / ring / ...), or the bag emoji for a loose gem.
    icon: string;
  }
  const BAG_ICON = '🎒';

  // Every item the player owns (equipped + bag), each tagged with where it lives.
  const allItems = $derived.by((): ItemRef[] => {
    const out: ItemRef[] = [];
    const eq = $equipped;
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      const it = eq[slot];
      if (it) out.push({ item: it, key: 'equipped' });
    }
    for (const s of $backpack) if (isItem(s)) out.push({ item: s, key: 'bag' });
    return out;
  });

  // Every gem the player owns - loose bag gems plus those socketed in owned gear.
  // Each carries an icon for its source: the bag, or the host item's type.
  const allGems = $derived.by((): GemRef[] => {
    const out: GemRef[] = [];
    for (const s of $backpack) if (isGem(s)) out.push({ gem: s, where: sourceLabel('bag'), icon: BAG_ICON });
    for (const { item, key } of allItems) {
      for (const sock of item.sockets) {
        if (sock) out.push({ gem: sock, where: sourceLabel(key), icon: itemEmoji(item) });
      }
    }
    return out;
  });

  // Owned items with an EMPTY socket of this gem's colour - somewhere it could
  // go right now. Each carries the open / total matching-socket counts and
  // whether it can take a direct Insert (only when the gem is the player's, not
  // a shop preview).
  const compatibleItems = $derived.by(() => {
    if (!color) return [];
    return allItems
      .map(({ item, key }) => {
        const open = item.sockets.filter((s, i) => s === null && item.socketColors[i] === color).length;
        return {
          item,
          key,
          source: sourceLabel(key),
          // Source-type icon (the item's own type: weapon / ring / ...), shown
          // alongside the where-it-lives label.
          icon: key === 'bag' ? BAG_ICON : itemEmoji(item),
          total: item.socketColors.filter((c) => c === color).length,
          open,
          // A shop gem isn't owned, so it can only be previewed, never inserted.
          insertable: !shop && open > 0,
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

  // A gem the player can scrap right now: a loose bag gem (refunds crystals).
  // Socketed / shop gems show the value for reference, not a button.
  const canDestroy = $derived(looseInBag);
  function onDestroy(): void {
    if (!gem) return;
    if (disenchantGemFromBackpack(gem.id)) closeGemInspector();
  }

  // === Combine (one-click level up) ================================
  // Merge a same-defId gem into the other so the result levels up. We PREFER to
  // keep the EQUIPPED gem as the survivor (level it in its socket) rather than
  // pull it out: if exactly one of the two gems is socketed in equipped gear,
  // that one is the target and the other is consumed. Otherwise the inspected
  // gem survives. Both must be owned (gated off in shop-preview mode). After the
  // merge we re-point the inspector at the survivor and pulse it for feedback.
  function isInEquipped(gemId: string): boolean {
    return Object.values($equipped).some((it) => it && it.sockets.some((s) => s?.id === gemId));
  }
  function onCombine(sourceId: string): void {
    if (!gem || shop) return;
    let targetId = gem.id;
    let srcId = sourceId;
    // Prefer the equipped gem as the survivor: if the OTHER gem is equipped and
    // this one isn't, swap roles so we don't empty the equipped socket.
    if (isInEquipped(sourceId) && !isInEquipped(gem.id)) {
      targetId = sourceId;
      srcId = gem.id;
    }
    if (!combineGems(targetId, srcId)) return;
    sfx.powerup();
    closeGemInspector();
  }

  // Sell a loose bag gem to the shop for gold (only while a shop is open).
  const canSell = $derived(looseInBag && $shopStock !== null);
  function onSell(): void {
    if (!gem || !canSell) return;
    sellGemFromBackpack(gem.id);
    closeGemInspector();
  }

  // The owned item this gem is socketed in (equipped / backpack), if any - so we
  // can pull it back out into the bag. allItems is already owned-only; a shop
  // preview gem isn't socketed in anything of the player's.
  const socketedIn = $derived.by((): { item: Item; index: number } | null => {
    if (!gem || shop) return null;
    const g = gem;
    for (const { item } of allItems) {
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
    // Keep the gem window open after buying (the slot sells, so Buy disables) -
    // the player keeps their place while shopping.
    buyGem(shop.index);
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
    <header class="gi-head" data-pane-header style="--gem-color: {color ? SOCKET_COLOR_HEX[color] : '#5c6a6a'}">
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

      <!-- Combine targets: same-defId owned gems. Each row is a one-click merge
           that levels up THIS gem (and consumes the listed one) - except in a
           shop preview, where you don't own the inspected gem yet. -->
      <section class="gi-sec">
        <div class="gi-sec-head">{t('gemInspector.combine')}</div>
        {#if combinableGems.length === 0}
          <p class="gi-none">{t('gemInspector.combineNone', { name: d?.name ?? gem.defId })}</p>
        {:else}
          <p class="gi-subhint">{shop ? t('gemInspector.combineHintShop') : t('gemInspector.combineActionHint')}</p>
          <ul class="gi-list">
            {#each combinableGems.slice(0, LIST_CAP) as cg (cg.gem.id)}
              {@const cd = gemDisplay(cg.gem)}
              <li class="gi-fit-li">
                <button
                  type="button"
                  class="gi-item gi-item-btn"
                  class:insertable={!shop}
                  disabled={shop !== null}
                  title={shop ? '' : t('gemInspector.combineDoHint')}
                  onclick={() => onCombine(cg.gem.id)}
                >
                  <span class="gi-item-emoji">{cd?.emoji ?? '💎'}</span>
                  <span class="gi-item-main">{cd?.name ?? cg.gem.defId}{#if (cd?.level ?? 1) > 1}<span class="gi-mini-lv"> Lv{cd?.level}</span>{/if}</span>
                  <span class="gi-item-src"><span class="gi-src-icon">{cg.icon}</span>{cg.where}</span>
                  {#if !shop}<span class="gi-insert combine">{t('gemInspector.combineDo')}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
          {#if combinableGems.length > LIST_CAP}
            <div class="gi-more">{t('gemInspector.more', { n: combinableGems.length - LIST_CAP })}</div>
          {/if}
        {/if}
      </section>

      <!-- Compatible owned gear: items with an open socket of this gem's colour. -->
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
                  <span class="gi-item-tier" style="--tier-color: {TIER_COLORS[tierOf(ci.item)] ?? '#5c6a6a'}">T{tierOf(ci.item)}</span>
                  <span class="gi-item-main">{itemLabel(ci.item)}</span>
                  <span class="gi-item-open">{t('gemInspector.open', { open: ci.open, total: ci.total })}</span>
                  <span class="gi-item-src"><span class="gi-src-icon">{ci.icon}</span>{ci.source}</span>
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
         inspector: Buy (shop) / Sell + Destroy (loose) / Unsocket (socketed in
         an owned item) / a value label (otherwise). -->
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
    background: var(--pane-glass);
    backdrop-filter: blur(12px) saturate(1.15);
    -webkit-backdrop-filter: blur(12px) saturate(1.15);
    border-left: 1px solid #28383d;    overflow: hidden;
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
    border-bottom: 1px solid #18262a;
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
    color: #c0cdcd;
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
    border: 1px solid var(--gem-color, #5c6a6a);
    color: var(--gem-color, #849393);
    background: rgba(0, 0, 0, 0.3);
  }
  .gi-close {
    appearance: none;
    background: transparent;
    border: 1px solid #28383d;
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
    background: #18262a;
  }
  .gi-close:focus-visible {
    outline: 2px solid #3cc7b8;
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
    color: #bac6c6;
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
    color: #768585;
  }
  .gi-value {
    font-variant-numeric: lining-nums tabular-nums;
    color: #bac6c6;
    font-weight: 600;
  }
  /* Action footer at the bottom of the panel (matches the item inspector). */
  .gi-foot {
    padding: 12px 14px;
    border-top: 1px solid #18262a;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* Footer action buttons - the exact same .cta family the item inspector uses,
     stacked full-width, so the two inspectors read identically. */
  .cta {
    width: 100%;
    appearance: none;
    background: #28383d;
    border: 1px solid #374d52;
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
    background: #121d20;
    color: #c0cdcd;
  }
  .cta.secondary:hover:not(:disabled) {
    background: #18262a;
    border-color: #3cc7b8;
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
    background: #374d52;
    border-color: #3cc7b8;
  }
  .cta:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .cta:focus-visible {
    outline: 2px solid #3cc7b8;
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
    color: #6f7d7d;
    border-top: 1px solid #18262a;
    padding-top: 12px;
  }
  .gi-none {
    margin: 0;
    color: #647171;
    font-size: 0.84rem;
    line-height: 1.4;
  }
  .gi-subhint {
    margin: 0;
    color: #768585;
    font-size: 0.78rem;
  }

  .lvl-compare {
    display: flex;
    flex-direction: column;
    gap: 3px;
    background: #0c1517;
    border: 1px solid #18262a;
    border-radius: 8px;
    padding: 10px 12px;
  }
  .lvl-now {
    color: #7f8e8e;
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
    border: 1px solid #18262a;
    border-radius: 6px;
    background: #0c1517;
    font-size: 0.85rem;
    color: #bac6c6;
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
    outline: 2px solid #3cc7b8;
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
  /* Combine action badge: purple to read as a level-up (matches the Lv badge),
     distinct from the green Insert. */
  .gi-insert.combine {
    color: #f0e0ff;
    background: #7c3ac8;
  }
  /* A combinable row hovers purple (not the green insert hover). */
  .gi-item-btn.insertable:has(.gi-insert.combine):hover {
    background: #1d1430;
    border-color: #c084fc;
  }
  .gi-item-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.2rem;
    line-height: 1;
  }
  .gi-item-tier {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--tier-color, #849393);
    border: 1px solid var(--tier-color, #5c6a6a);
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
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #647171;
    background: #152124;
    border-radius: 4px;
    padding: 2px 6px;
  }
  /* The source-type emoji (weapon / ring / bag) prefixing the where-it-lives
     label, so a glance reads what kind of gear the source is. */
  .gi-src-icon {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 0.85rem;
    line-height: 1;
  }
  .gi-more {
    color: #647171;
    font-size: 0.78rem;
    padding-left: 2px;
  }
</style>
