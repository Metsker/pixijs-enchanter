<script lang="ts">
  import { get } from 'svelte/store';
  import { paneEnter, paneLeave } from '../utils/paneTransition';
  import { revealInRail } from '../utils/revealInRail';
  import { gemInspector, closeGemInspector, inspectGem, type GemInspectSubject } from '../state/gem-inspector';
  import { inspectItem } from '../state/inspector';
  import { gemDisplay, gemDisplayForDef, SOCKET_COLOR_HEX } from '../domain/gem-display';
  import { GEM_CATALOGUE } from '../domain/gem-catalogue';
  import { supportAppliesToEffect } from '../domain/gem-resolution';
  import { gemColor } from '../domain/gem-fit';
  import { gemLevel, isGem, type Gem } from '../domain/gem';
  import { gemRefund, disenchantGemFromBackpack, disenchantSocketedGem } from '../state/disenchant';
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
    // An icon for the SOURCE: a single unified glyph per place it can live (the
    // bag, or worn). Deliberately NOT the host item's own emoji - that doubled
    // the row's leading icon under the "Equipped" label.
    icon: string;
  }
  const BAG_ICON = '🎒';
  // One unified icon for anything the player has EQUIPPED, so the source badge
  // never echoes a row's own item / slot emoji.
  const EQUIPPED_ICON = '🧍';

  // Every item the player owns (equipped + bag), each tagged with where it lives.
  // Deduped by id (equipped wins): an item is owned in exactly one place, so a
  // repeated id is spurious - listing it once keeps the keyed lists below from
  // colliding and shows each piece of gear a single time.
  const allItems = $derived.by((): ItemRef[] => {
    const out: ItemRef[] = [];
    const seen = new Set<string>();
    const eq = $equipped;
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      const it = eq[slot];
      if (it && !seen.has(it.id)) {
        seen.add(it.id);
        out.push({ item: it, key: 'equipped' });
      }
    }
    for (const s of $backpack) {
      if (isItem(s) && !seen.has(s.id)) {
        seen.add(s.id);
        out.push({ item: s, key: 'bag' });
      }
    }
    return out;
  });

  // Every gem the player owns - loose bag gems plus those socketed in owned gear.
  // Each carries an icon for its source: the bag, or the host item's type.
  const allGems = $derived.by((): GemRef[] => {
    const out: GemRef[] = [];
    for (const s of $backpack) if (isGem(s)) out.push({ gem: s, where: sourceLabel('bag'), icon: BAG_ICON });
    for (const { item, key } of allItems) {
      for (const sock of item.sockets) {
        if (sock) out.push({ gem: sock, where: sourceLabel(key), icon: key === 'bag' ? BAG_ICON : EQUIPPED_ICON });
      }
    }
    return out;
  });

  // Owned items whose socket COLOURS include this gem's colour - everywhere it
  // could go. Items with an open matching socket come first (insertable); items
  // that match but are FULL (no empty space) trail last as dimmed, inert
  // reference rows. Each carries the open / total matching-socket counts.
  const compatibleItems = $derived.by(() => {
    if (!color || !gem) return [];
    const gemId = gem.id;
    return allItems
      // Skip the item this gem already sits in - it's not somewhere it could go.
      .filter(({ item }) => !item.sockets.some((s) => s?.id === gemId))
      .map(({ item, key }) => {
        const open = item.sockets.filter((s, i) => s === null && item.socketColors[i] === color).length;
        return {
          item,
          key,
          source: sourceLabel(key),
          // One unified source icon (bag / worn) - never the item's own emoji,
          // which the row already shows.
          icon: key === 'bag' ? BAG_ICON : EQUIPPED_ICON,
          total: item.socketColors.filter((c) => c === color).length,
          open,
          // Matches the gem's colour but every such socket is occupied: shown
          // last + dimmed for reference, never actionable.
          full: open === 0,
          // A shop gem isn't owned, so it can only be previewed, never inserted.
          insertable: !shop && open > 0,
        };
      })
      // Any item with a socket of this colour at all (open OR full).
      .filter((c) => c.total > 0)
      // Items with room first (insertable, then by open count); full ones last.
      .sort(
        (a, b) =>
          Number(b.open > 0) - Number(a.open > 0) ||
          Number(b.insertable) - Number(a.insertable) ||
          b.open - a.open,
      );
  });

  // Other gems of the same defId (any source) - drop one onto this to level up.
  const combinableGems = $derived.by(() => {
    if (!gem) return [];
    return allGems.filter((r) => r.gem.defId === gem.defId && r.gem.id !== gem.id);
  });

  // Effect gems this support is compatible with: every effect gem the player
  // owns - loose in the bag or socketed in their gear - whose def this support's
  // knob actually touches. Mirrors the adjacency binding's supportAppliesToEffect
  // MINUS the placement, so it answers "what is this support good for?" across
  // the whole collection - the player can then hunt a listed gem down to pair it
  // with. Empty for an effect gem (its pairings read the other way, via Combine /
  // Compatible gear), so the section below only renders for a support.
  const compatibleGems = $derived.by((): GemRef[] => {
    if (!def || def.role !== 'support') return [];
    const mod = def.mod;
    return allGems.filter((r) => {
      const ed = GEM_CATALOGUE[r.gem.defId];
      return ed !== undefined && ed.role === 'effect' && supportAppliesToEffect(mod, ed);
    });
  });

  const LIST_CAP = 8;

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
  // can pull it back out into the bag, badge the header as "Socketed", and link
  // to the host in its own section. allItems is already owned-only; a shop
  // preview gem isn't socketed in anything of the player's. Carries `key` (where
  // the host lives) so the host link can open the right item-inspector subject.
  const socketedIn = $derived.by((): { item: Item; index: number; key: SourceKey } | null => {
    if (!gem || shop) return null;
    const g = gem;
    for (const { item, key } of allItems) {
      const index = item.sockets.findIndex((s) => s?.id === g.id);
      if (index >= 0) return { item, index, key };
    }
    return null;
  });
  const canUnsocket = $derived(socketedIn !== null);
  function onUnsocket(): void {
    const target = socketedIn;
    if (!target) return;
    if (unsocketGemToBag(target.item, target.index)) closeGemInspector();
  }

  // A gem the player can scrap for crystals: any gem they OWN - loose in the bag
  // OR socketed in their gear - so the footer always offers Disenchant, the same
  // way the item inspector always offers it for owned gear. (A shop preview / not-
  // yet-owned gem can't be scrapped; it shows its value for reference instead.)
  const canDisenchant = $derived(looseInBag || socketedIn !== null);
  function onDisenchant(): void {
    if (!gem) return;
    // A socketed gem is scrapped straight out of its socket; a loose one out of
    // the bag. Either way the gem is destroyed (not returned to the bag).
    const ok = socketedIn
      ? disenchantSocketedGem(socketedIn.item, socketedIn.index)
      : disenchantGemFromBackpack(gem.id);
    if (ok) closeGemInspector();
  }

  // "Compatible -> Insert": socket the gem straight into this item's first open
  // matching socket, then close (the gem now lives in the item).
  function onInsert(item: Item): void {
    if (!gem || shop) return;
    if (socketGemIntoItem(gem, item)) closeGemInspector();
  }

  // Row click in the Compatible list: open the ITEM inspector for that piece of
  // gear (the Insert button is what sockets - the row is just navigation). Build
  // the right subject from where the item lives so the item inspector's actions
  // (equip / unequip / disenchant) stay correct.
  function openItemInspector(item: Item, key: SourceKey): void {
    if (key === 'equipped') {
      const eq = $equipped;
      const slotId = EQUIPMENT_SLOT_ORDER.find((s) => eq[s]?.id === item.id);
      if (slotId) inspectItem({ source: 'inventory', slotId, item });
    } else {
      const index = $backpack.findIndex((s) => isItem(s) && s.id === item.id);
      if (index >= 0) inspectItem({ source: 'backpack', index, item });
    }
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
        <div class="gi-sub">
          <span class="gi-role">
            {d?.role === 'support' ? t('gemInspector.role.support') : t('gemInspector.role.effect')}
          </span>
          {#if socketedIn}
            <span class="gi-state socketed">{t('gemInspector.socketed')}</span>
          {/if}
        </div>
      </div>
      <button type="button" class="gi-close" aria-label={t('gemInspector.close')} onclick={closeGemInspector}>✕</button>
    </header>

    <div class="gi-body">
      <!-- Description: the gem's current effect, generated from its def + level. -->
      <p class="gi-desc">{d?.summary ?? ''}</p>

      <!-- Socketed in: the owned item this gem currently sits in, as a row that
           opens that item's inspector. Shown only when the gem is socketed -
           loose bag gems and shop previews aren't in anything. -->
      {#if socketedIn}
        {@const host = socketedIn}
        <section class="gi-sec">
          <div class="gi-sec-head">{t('gemInspector.socketedIn')}</div>
          <ul class="gi-list">
            <li class="gi-fit-li">
              <button
                type="button"
                class="gi-item gi-item-btn"
                title={t('gemInspector.viewItem')}
                onclick={() => openItemInspector(host.item, host.key)}
              >
                <span class="gi-item-emoji">{itemEmoji(host.item)}</span>
                <span class="gi-item-tier" style="--tier-color: {TIER_COLORS[tierOf(host.item)] ?? '#5c6a6a'}">T{tierOf(host.item)}</span>
                <span class="gi-item-main">{itemLabel(host.item)}</span>
                <span class="gi-item-src"><span class="gi-src-icon">{host.key === 'bag' ? BAG_ICON : EQUIPPED_ICON}</span>{sourceLabel(host.key)}</span>
              </button>
            </li>
          </ul>
        </section>
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

      <!-- Combine targets: same-defId owned gems. Tapping a ROW opens that gem's
           own inspector; the Combine button is the only thing that merges it in
           (levelling up THIS gem and consuming the listed one) - hidden in a shop
           preview, where you don't own the inspected gem yet. -->
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
                  title={t('gemInspector.viewGem')}
                  onclick={() => inspectGem(cg.gem)}
                >
                  <span class="gi-item-emoji">{cd?.emoji ?? '💎'}</span>
                  <span class="gi-item-main">{cd?.name ?? cg.gem.defId}{#if (cd?.level ?? 1) > 1}<span class="gi-mini-lv"> Lv{cd?.level}</span>{/if}</span>
                  <span class="gi-item-src"><span class="gi-src-icon">{cg.icon}</span>{cg.where}</span>
                </button>
                {#if !shop}
                  <button
                    type="button"
                    class="gi-act-btn combine"
                    title={t('gemInspector.combineDoHint')}
                    onclick={() => onCombine(cg.gem.id)}
                  >
                    {t('gemInspector.combineDo')}
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
          {#if combinableGems.length > LIST_CAP}
            <div class="gi-more">{t('gemInspector.more', { n: combinableGems.length - LIST_CAP })}</div>
          {/if}
        {/if}
      </section>

      <!-- Compatible owned gear: items whose socket colours include this gem's.
           Tapping a ROW opens that item's inspector; the Insert button is the
           only thing that sockets the gem (shown only when the item has room).
           Full items trail last, dimmed - still openable, just not insertable. -->
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
                  class:no-room={ci.full}
                  title={t('gemInspector.viewItem')}
                  onclick={() => openItemInspector(ci.item, ci.key)}
                >
                  <span class="gi-item-emoji">{itemEmoji(ci.item)}</span>
                  <span class="gi-item-tier" style="--tier-color: {TIER_COLORS[tierOf(ci.item)] ?? '#5c6a6a'}">T{tierOf(ci.item)}</span>
                  <span class="gi-item-main">{itemLabel(ci.item)}</span>
                  {#if ci.full}
                    <span class="gi-item-open full">{t('gemInspector.full')}</span>
                  {:else}
                    <span class="gi-item-open">{t('gemInspector.open', { open: ci.open, total: ci.total })}</span>
                  {/if}
                  <span class="gi-item-src"><span class="gi-src-icon">{ci.icon}</span>{ci.source}</span>
                </button>
                {#if ci.insertable}
                  <button
                    type="button"
                    class="gi-act-btn insert"
                    title={t('gemInspector.insertHint')}
                    onclick={() => onInsert(ci.item)}
                  >
                    {t('gemInspector.insert')}
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
          {#if compatibleItems.length > LIST_CAP}
            <div class="gi-more">{t('gemInspector.more', { n: compatibleItems.length - LIST_CAP })}</div>
          {/if}
        {/if}
      </section>

      <!-- Compatible gems (support only): every owned effect gem - loose in the
           bag or socketed in gear - this support's knob actually modifies. Sits
           under Compatible gear. Tapping a ROW opens that gem's own inspector
           (navigation only, no action), so the player can jump straight to a gem
           worth pairing this support with. -->
      {#if def?.role === 'support'}
        <section class="gi-sec">
          <div class="gi-sec-head">{t('gemInspector.pairs')}</div>
          {#if compatibleGems.length === 0}
            <p class="gi-none">{t('gemInspector.pairsNone')}</p>
          {:else}
            <p class="gi-subhint">{t('gemInspector.pairsHint')}</p>
            <ul class="gi-list">
              {#each compatibleGems.slice(0, LIST_CAP) as cg (cg.gem.id)}
                {@const cd = gemDisplay(cg.gem)}
                <li class="gi-fit-li">
                  <button
                    type="button"
                    class="gi-item gi-item-btn"
                    title={t('gemInspector.viewGem')}
                    onclick={() => inspectGem(cg.gem)}
                  >
                    <span class="gi-item-emoji">{cd?.emoji ?? '💎'}</span>
                    <span class="gi-item-main">{cd?.name ?? cg.gem.defId}{#if (cd?.level ?? 1) > 1}<span class="gi-mini-lv"> Lv{cd?.level}</span>{/if}</span>
                    <span class="gi-item-src"><span class="gi-src-icon">{cg.icon}</span>{cg.where}</span>
                  </button>
                </li>
              {/each}
            </ul>
            {#if compatibleGems.length > LIST_CAP}
              <div class="gi-more">{t('gemInspector.more', { n: compatibleGems.length - LIST_CAP })}</div>
            {/if}
          {/if}
        </section>
      {/if}
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
      {:else if canDisenchant}
        <!-- Owned gem (loose OR socketed): always offer Disenchant, the same way
             the item inspector always offers it for owned gear. Sell sits above
             it (loose + shop only); Unsocket - the positive "move to bag" action
             for a socketed gem - is pinned at the very bottom, mirroring the item
             inspector's Equip / Unequip CTA. -->
        {#if canSell}
          <button type="button" class="cta secondary" onclick={onSell}>
            {t('gemInspector.sell', { price: gemSellValue(gem) })}
          </button>
        {/if}
        <button type="button" class="cta danger" onclick={onDisenchant}>
          {t('gemInspector.disenchant', { refund })}
        </button>
        {#if canUnsocket}
          <button type="button" class="cta" onclick={onUnsocket}>
            {t('gemInspector.unsocket')}
          </button>
        {/if}
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
    border-left: 1px solid #28383d;
    overflow: hidden;
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
  /* Header sub-row: the role badge + an optional "Socketed" state badge. */
  .gi-sub {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  /* Role badge - styled like the item inspector's tier badge, tinted by the
     gem's socket colour (red / green / blue) so it reads role + colour at once. */
  .gi-role {
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
  /* "Socketed" status badge: neutral teal, distinct from the colour-tinted role
     pill - it states the gem is currently in a piece of gear. */
  .gi-state.socketed {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 7px;
    border-radius: 4px;
    line-height: 1;
    color: #8fe6dc;
    border: 1px solid #2f6f69;
    background: rgba(60, 199, 184, 0.12);
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
  /* A row = the openable button + (optionally) its action button, side by side
     and equal height. */
  .gi-fit-li {
    list-style: none;
    display: flex;
    gap: 5px;
    align-items: stretch;
  }
  /* Each row button OPENS the item/gem inspector (navigation only). The actual
     Insert / Combine is the separate .gi-act-btn beside it, so a row tap never
     performs the action by accident. */
  .gi-item-btn {
    flex: 1;
    min-width: 0;
    appearance: none;
    font: inherit;
    cursor: pointer;
    transition: background-color 100ms ease, border-color 100ms ease, opacity 100ms ease;
  }
  .gi-item-btn:hover {
    background: #0f181b;
    border-color: #374d52;
  }
  .gi-item-btn:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }
  /* Full matching gear (no empty space for this gem): dimmed, trailing the items
     that DO have room. Still openable (it lifts a touch on hover) - it just has
     no Insert button. */
  .gi-item-btn.no-room {
    opacity: 0.45;
  }
  .gi-item-btn.no-room:hover {
    opacity: 0.7;
  }

  /* The row's action button - the ONLY control that performs Insert / Combine.
     Stretches to the row height (the li is align-items:stretch). Insert is
     green; Combine is purple (matching the Lv badge / level-up read). */
  .gi-act-btn {
    flex: none;
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    font: inherit;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 12px;
    border-radius: 6px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .gi-act-btn.insert {
    color: #0c140c;
    background: #4caf6a;
    border-color: #3a8f54;
  }
  .gi-act-btn.insert:hover {
    background: #5cc77b;
  }
  .gi-act-btn.combine {
    color: #f0e0ff;
    background: #7c3ac8;
    border-color: #6a2fb0;
  }
  .gi-act-btn.combine:hover {
    background: #8f4ad8;
  }
  .gi-act-btn:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
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
  /* "Full" marker on a no-room row: a muted warm tag, no numerals. */
  .gi-item-open.full {
    color: #b08a8a;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 700;
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
