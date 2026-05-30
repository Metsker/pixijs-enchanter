<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { get } from 'svelte/store';
  import { closeInspector, inspector } from '../state/inspector';
  import { completeRoom, run } from '../state/run';
  import { addSocketCost, addSocketToItem, canAddSocket } from '../state/rest';
  import { topbar } from '../state/topbar';
  import {
    canEquipDirect,
    equipFromBackpack,
    equipItemDirect,
    equipped,
    unequipToBackpack,
  } from '../state/inventory';
  import { addItem, backpack } from '../state/backpack';
  import { buyAndEquipItem, buyItem, canBuyAndEquipItem, canBuyItem } from '../state/shop';
  import { removeRewardItem, pendingRewards } from '../state/rewards';
  import { canPickItem, pickItem } from '../state/item-offer';
  import {
    isItem,
    itemEmoji,
    legalEquipmentSlots,
    tierOf,
    type Item,
  } from '../domain/item';
  import type { Gem, SocketColor } from '../domain/gem';
  import { seededSocketColorForType } from '../domain/random';
  import { gemDisplay, SOCKET_COLOR_HEX } from '../domain/gem-display';
  import { computeBindings } from '../domain/gem-resolution';
  import { gemFitsSocketAt } from '../domain/gem-fit';
  import { cancelHeld, heldGem } from '../state/gem-move';
  import { startGemDrag, gemDropZone, isGemDragActive } from '../state/gem-drag';
  import { inspectGem } from '../state/gem-inspector';
  import { gemStash } from '../state/gem-stash';
  import { disenchantRewardItem, destroyRewardItemKeepGems, itemRefund } from '../state/disenchant';
  import { requestDestroy } from '../state/destroy-prompt';
  import { t } from '../i18n';
  import { clickOutside } from '../utils/clickOutside';

  const TIER_COLORS: Record<number, string> = {
    1: '#9ca3af',
    2: '#22c55e',
    3: '#3b82f6',
    4: '#a855f7',
    5: '#f97316',
    6: '#ef4444',
    7: '#fbbf24',
  };

  // Display info (emoji + name + one-line summary + role) for a placed gem,
  // or null for an empty socket / unknown defId.
  function display(gem: Gem | null) {
    return gem ? gemDisplay(gem) : null;
  }

  // Comparison item: when inspecting a CANDIDATE item (shop / rewards / backpack
  // / item-offer - anything that isn't already equipped), the item currently
  // sitting in its slot. Shown read-only beneath the inspected item so the
  // player can compare the two loadouts before equipping. Every type maps to a
  // single slot now, so there's exactly one item to compare against.
  const comparison = $derived.by((): Item | null => {
    const s = $inspector;
    if (!s || s.source === 'inventory') return null;
    const [slotId] = legalEquipmentSlots(s.item);
    if (!slotId) return null;
    const eq = $equipped[slotId];
    return eq && eq.id !== s.item.id ? eq : null;
  });

  // === Interactive sockets + binding hints =========================
  // Socket editing is only meaningful when the player OWNS the item - i.e.
  // it is equipped or sits in the backpack. Shop / rewards / item-offer
  // items are previews; their sockets stay read-only.
  const socketsEditable = $derived(
    $inspector !== null &&
      ($inspector.source === 'inventory' ||
        $inspector.source === 'backpack' ||
        $inspector.source === 'rewards'),
  );

  // === Add socket (FEATURE 3) ======================================
  // Only at Rest, only for an OWNED item (equipped / backpack), only while it
  // is under the tier cap. The button's cost + affordability read the live
  // topbar so they re-derive as crystals change.
  const canShowAddSocket = $derived(
    $inspector !== null &&
      $run.screen === 'rest' &&
      socketsEditable &&
      canAddSocket($inspector.item),
  );
  const addSocketPrice = $derived(
    $inspector ? addSocketCost($inspector.item) : 0,
  );
  // Read $topbar.crystals directly so affordability re-derives on every spend.
  const addSocketAffordable = $derived(
    $inspector !== null && $topbar.crystals >= addSocketPrice,
  );

  // Colour of the NEXT socket the Add-socket button would add. Seeded by the
  // item id + the next socket index, so it is PREDEFINED (deterministic): the
  // same item always grows the same colour sequence, the previewed swatch never
  // flickers, and it exactly matches what onAddSocket commits.
  const pendingSocketColor = $derived.by((): SocketColor => {
    const s = $inspector;
    if (!s) return 'blue';
    return seededSocketColorForType(
      s.item.itemType,
      s.item.id,
      s.item.sockets.length,
      s.item.armorSlot,
    );
  });

  function onAddSocket(): void {
    const subj = $inspector;
    if (!subj) return;
    addSocketToItem(subj.item, pendingSocketColor);
  }

  // Whether the currently held gem fits a GIVEN socket of `colItem` (its colour
  // matches that socket's colour). Per-socket - a held gem can be a valid drop
  // target for some sockets of an item and not others. Takes the item so it
  // works for either column of the side-by-side compare.
  function heldFitsItemSocket(colItem: Item, index: number): boolean {
    const held = $heldGem;
    if (!held) return false;
    return gemFitsSocketAt(held.gem, colItem, index);
  }

  // Pointer-down on a FILLED socket starts a gem drag (drag it out to a stash /
  // another socket / an equipped item). Empty sockets and read-only previews
  // are inert. The gem-drag controller gates on a move threshold, so a tap that
  // doesn't move neither lifts the gem nor opens anything.
  function onSocketPointerDown(e: PointerEvent, item: Item, index: number): void {
    if (!socketsEditable) return;
    const gem = item.sockets[index];
    if (!gem) return; // empty socket: nothing to drag.
    // Drag to move the gem; a tap (no movement) opens the gem inspector.
    startGemDrag({ kind: 'socket', item, index }, e, () => inspectGem(gem));
  }

  // Pointer-down on a loose stash gem starts a drag (into a socket / equipped
  // item, or back into the backpack); a tap opens the gem inspector instead.
  function onStashPointerDown(e: PointerEvent, gem: Gem): void {
    startGemDrag({ kind: 'backpack', gemId: gem.id }, e, () => inspectGem(gem));
  }

  // True while a dragged gem is hovering THIS open item's socket whose drop
  // zone id matches, so the socket highlights as the live drop target.
  function isArmedSocket(itemId: string, index: number): boolean {
    return $gemDropZone === `socket:${itemId}:${index}`;
  }

  // Tooltip for a socket cell, reflecting what a drag would do right now.
  function socketTitle(
    d: ReturnType<typeof display>,
    holding: boolean,
    dropTarget: boolean,
    incompatible: boolean,
  ): string {
    // The name + summary are already shown in the cell; the tooltip needn't
  // repeat the name, so it carries just the effect summary.
  if (!socketsEditable) return d ? d.summary : t('inspector.socket.empty');
    if (holding) {
      if (incompatible) return t('inspector.socket.incompatible');
      if (dropTarget) return d ? t('inspector.socket.swapHere') : t('inspector.socket.placeHere');
    }
    return d ? t('inspector.socket.pickUp') : t('inspector.socket.empty');
  }

  // === Equip / Unequip CTA =========================================
  // A reward equip "swaps" when the item's legal slots are all occupied, so
  // equipping it must displace existing gear. Drives the Equip/Swap label.
  const rewardWouldSwap = $derived.by((): boolean => {
    const s = $inspector;
    if (!s || s.source !== 'rewards') return false;
    const legal = legalEquipmentSlots(s.item);
    return legal.length > 0 && legal.every((slot) => $equipped[slot] !== null);
  });

  const ctaLabel = $derived.by(() => {
    const s = $inspector;
    if (!s) return '';
    if (s.source === 'rewards') {
      return rewardWouldSwap ? t('inspector.swap') : t('inspector.equip');
    }
    if (s.source === 'backpack' || s.source === 'item-offer') {
      return t('inspector.equip');
    }
    if (s.source === 'inventory') return t('inspector.unequip');
    return t('inspector.buy', { price: s.price });
  });

  // Safety net for a gem held with NO active drag while the Inspector is
  // closed - return it to its origin so it can't be stranded. We must NOT fire
  // during a live drag: a pointer drag sets `heldGem` and is driven by the
  // gem-drag controller's document listeners (independent of the Inspector), so
  // its own pointerup/pointercancel will route the gem. Without the
  // isGemDragActive guard this effect cancelled EVERY Backpack gem drag started
  // while the Inspector was closed (the gem snapped straight back), which is
  // exactly the "drag breaks after acquiring a loose gem" bug.
  $effect(() => {
    if (!$inspector && $heldGem && !isGemDragActive()) cancelHeld();
  });

  const ctaDisabledReason = $derived.by((): string | null => {
    const s = $inspector;
    if (!s) return null;
    if (s.source === 'inventory') {
      if (!$backpack.includes(null)) return t('inspector.cta.backpackFull');
    }
    if (s.source === 'shop') {
      const r = canBuyItem(s.index);
      if (!r.ok && r.reasonKey) return t(r.reasonKey);
      if (!r.ok) return '';
    }
    if (s.source === 'rewards') {
      if (!canEquipDirect(s.item)) return t('inspector.cta.backpackFull');
    }
    if (s.source === 'item-offer') {
      if (!canPickItem(s.index)) return t('inspector.cta.backpackFull');
    }
    return null;
  });

  function handleCta(): void {
    const subject = $inspector;
    if (!subject) return;
    if (subject.source === 'backpack') {
      const landedSlot = equipFromBackpack(subject.index);
      if (landedSlot !== null) {
        const newItem = get(equipped)[landedSlot];
        if (newItem) {
          inspector.set({ source: 'inventory', slotId: landedSlot, item: newItem });
        }
        queueMicrotask(() => {
          document
            .querySelector<HTMLElement>(`.inventory [data-slot-id="${landedSlot}"]`)
            ?.focus();
        });
      }
    } else if (subject.source === 'inventory') {
      const landedIndex = unequipToBackpack(subject.slotId);
      if (landedIndex !== -1) {
        const newItem = get(backpack)[landedIndex];
        if (isItem(newItem)) {
          inspector.set({ source: 'backpack', index: landedIndex, item: newItem });
        }
        queueMicrotask(() => {
          document
            .querySelector<HTMLElement>(`.backpack [data-cell-index="${landedIndex}"]`)
            ?.focus();
        });
      }
    } else if (subject.source === 'rewards') {
      const landedSlot = equipItemDirect(subject.item);
      if (landedSlot !== null) {
        removeRewardItem(subject.item.id);
        // Keep working the chest: move to the next reward (or close if empty).
        inspectNextReward();
      }
    } else if (subject.source === 'item-offer') {
      const landed = pickItem(subject.index);
      if (landed !== null) completeRoom();
    } else {
      buyItem(subject.index);
    }
  }

  // After acting on a chest item (equip / take / destroy), keep working the
  // chest: jump the Inspector to the next reward, or close it if the chest is
  // now empty. The acted item must already be removed from pendingRewards.
  function inspectNextReward(): void {
    const items = get(pendingRewards).items;
    if (items.length > 0) inspector.set({ source: 'rewards', item: items[0] });
    else closeInspector();
  }

  // Rewards-only secondary CTA: "Take" the reward item straight into the
  // Backpack (instead of equipping it). Disabled when the bag is full.
  const takeDisabledReason = $derived.by((): string | null => {
    const s = $inspector;
    if (!s || s.source !== 'rewards') return null;
    if (!$backpack.includes(null)) return t('inspector.cta.backpackFull');
    return null;
  });

  function handleTake(): void {
    const subject = $inspector;
    if (!subject || subject.source !== 'rewards') return;
    const landed = addItem(subject.item);
    if (landed === -1) return; // bag full - leave it in the chest
    removeRewardItem(subject.item.id);
    inspectNextReward();
  }

  // Rewards-only: scrap the chest item for crystals instead of taking it.
  function handleDestroy(): void {
    const subject = $inspector;
    if (!subject || subject.source !== 'rewards') return;
    const item = subject.item;
    // If it still holds gems, ask whether to keep them (detach to the bag) or
    // scrap everything; otherwise destroy straight away.
    if (item.sockets.some((g) => g !== null)) {
      requestDestroy({
        item,
        onKeepGems: () => {
          if (destroyRewardItemKeepGems(item.id)) inspectNextReward();
        },
        onDestroyAll: () => {
          if (disenchantRewardItem(item.id)) inspectNextReward();
        },
      });
      return;
    }
    if (disenchantRewardItem(item.id)) inspectNextReward();
  }

  // Shop-only secondary CTA: take the item straight to the Inventory,
  // skipping the Backpack entirely.
  const buyAndEquipDisabledReason = $derived.by((): string | null => {
    const s = $inspector;
    if (!s || s.source !== 'shop') return null;
    const r = canBuyAndEquipItem(s.index);
    if (!r.ok && r.reasonKey) return t(r.reasonKey);
    if (!r.ok) return '';
    return null;
  });

  function handleBuyAndEquip(): void {
    const subject = $inspector;
    if (!subject || subject.source !== 'shop') return;
    const landed = buyAndEquipItem(subject.index);
    if (landed !== null) {
      const newItem = get(equipped)[landed];
      if (newItem) {
        inspector.set({ source: 'inventory', slotId: landed, item: newItem });
      }
      queueMicrotask(() => {
        document
          .querySelector<HTMLElement>(`.inventory [data-slot-id="${landed}"]`)
          ?.focus();
      });
    }
  }
</script>

{#if $inspector}
  {@const subject = $inspector}
  {@const item = subject.item}
  <aside
    class="inspector"
    class:with-compare={comparison !== null}
    aria-label={t('inspector.title')}
    transition:fly={{ x: 580, duration: 220, easing: cubicOut, opacity: 1 }}
  >
    <header class="header">
      <span class="emoji">{itemEmoji(item)}</span>
      <div class="title">
        <div class="kind">{t(`item.type.${item.itemType}`)}</div>
        <div class="tier" style="--tier-color: {TIER_COLORS[tierOf(item)] ?? '#666'}">
          {t('inspector.tier', { tier: tierOf(item) })}
        </div>
        {#if socketsEditable}
          <!-- Disenchant hint: total crystals from trashing this item (the
               item frame plus every gem socketed in it). -->
          <div class="disenchant-hint" title={t('inspector.disenchant.title')}>
            🗑️ 💎 {itemRefund(item)}
          </div>
        {/if}
      </div>
      <button
        type="button"
        class="close"
        aria-label={t('inspector.close')}
        onclick={closeInspector}
      >
        ✕
      </button>
    </header>

    <!-- Interactive socket list. When the item is owned (equipped / backpack)
         each filled socket is DRAGGABLE - drag a gem out to the stash, to
         another socket, or onto an equipped item - and every socket is a DROP
         target while a gem is being dragged. Bound supports show a "binds to"
         connector to their effect; inert supports are dimmed. -->
    <!-- One interactive socket column for an item. Rendered once normally, or
         twice (inspected + equipped) side-by-side when comparing - and gems
         drag freely between the two columns via the shared by-id gem-move. -->
    {#snippet socketColumn(colItem: Item, colEditable: boolean, label: string)}
      {@const colBindings = computeBindings(colItem.sockets)}
      <div class="socket-col">
        <div class="sockets-label">{label}</div>
        <div class="sockets">
          {#each colItem.sockets as gem, i (i)}
            {@const d = display(gem)}
            {@const socketHex = SOCKET_COLOR_HEX[colItem.socketColors[i]] ?? '#666'}
            {@const isSupport = d?.role === 'support'}
            {@const isBound = isSupport ? colBindings.boundSupports.has(i) : false}
            {@const inert = isSupport ? colBindings.inertSupports.has(i) : false}
            {@const supportMismatch = isSupport ? colBindings.incompatibleSupports.has(i) : false}
            {@const isHeldOrigin =
              $heldGem !== null &&
              $heldGem.from.kind === 'socket' &&
              $heldGem.from.itemId === colItem.id &&
              $heldGem.from.index === i}
            {@const fitsThis = heldFitsItemSocket(colItem, i)}
            {@const dropTarget = colEditable && $heldGem !== null && fitsThis}
            {@const incompatible = colEditable && $heldGem !== null && !fitsThis}
            {@const armed = isArmedSocket(colItem.id, i)}
            <div class="socket-row">
              <button
                type="button"
                class="socket"
                class:filled={d !== null}
                class:support={isSupport}
                class:effect={d?.role === 'effect'}
                class:inert={inert || supportMismatch}
                class:bound={isBound}
                class:drop-target={dropTarget}
                class:armed
                class:incompatible
                class:held-origin={isHeldOrigin}
                class:interactive={colEditable}
                class:draggable={colEditable && d !== null}
                disabled={!colEditable}
                data-gem-socket
                data-item-id={colItem.id}
                data-socket-index={i}
                style="--socket-color: {socketHex}"
                title={socketTitle(d, !!$heldGem, dropTarget, incompatible)}
                onpointerdown={(e) => onSocketPointerDown(e, colItem, i)}
              >
                <span class="socket-emoji">{d ? d.emoji : '·'}</span>
                <span class="socket-info">
                  {#if d}
                    <span class="socket-name">
                      {d.name}
                      {#if d.level > 1}<span class="gem-level">Lv{d.level}</span>{/if}
                    </span>
                    <span class="socket-summary">{d.summary}</span>
                    {#if isSupport && isBound}
                      <span class="socket-bind">↳ {t('inspector.socket.bindsAll')}</span>
                    {:else if isSupport && supportMismatch}
                      <span class="socket-bind inert-note">{t('inspector.socket.mismatch')}</span>
                    {:else if inert}
                      <span class="socket-bind inert-note">{t('inspector.socket.inert')}</span>
                    {/if}
                  {:else}
                    <span class="socket-name empty">{t('inspector.socket.empty')}</span>
                  {/if}
                </span>
                <span
                  class="socket-role"
                  class:role-effect={d?.role === 'effect'}
                  class:role-support={isSupport}
                >
                  {#if d}{d.role === 'support' ? t('inspector.socket.support') : t('inspector.socket.effect')}{/if}
                </span>
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/snippet}

    <div class="body" data-gem-zone>
      <div class="columns" class:dual={comparison !== null}>
        {@render socketColumn(
          item,
          socketsEditable,
          comparison ? t('inspector.compare.selected') : t('inspector.sockets'),
        )}
        {#if comparison}
          {@render socketColumn(comparison, socketsEditable, t('inspector.compare.equipped'))}
        {/if}
      </div>

      <!-- Add socket (Rest only, owned item, under the tier cap). Improves the
           item's tier by one empty socket for crystals. -->
      {#if canShowAddSocket}
        <button
          type="button"
          class="add-socket"
          disabled={!addSocketAffordable}
          title={addSocketAffordable
            ? t('inspector.addSocket.hint')
            : t('rest.craft.notEnough')}
          onclick={onAddSocket}
        >
          <span
            class="socket-swatch"
            style="--swatch: {SOCKET_COLOR_HEX[pendingSocketColor]}"
            aria-hidden="true"
          ></span>
          {t('inspector.addSocket', { cost: addSocketPrice })}
        </button>
      {/if}

      <!-- Gem stash strip (the backpack's loose gems). Drag a gem out to a
           socket / equipped item, or drag a socketed gem in here to un-socket
           it. The whole strip is a drop zone (data-gem-stash). -->
      <div
        class="stash"
        class:drop-armed={$gemDropZone === 'stash'}
        data-gem-stash
      >
        <div class="sockets-label stash-label">{t('inspector.stash.title')}</div>
        {#if $gemStash.length === 0}
          <div class="stash-empty">{t('inspector.stash.empty')}</div>
        {:else}
          <div class="stash-grid">
            {#each $gemStash as g (g.id)}
              {@const sd = display(g)}
              <button
                type="button"
                class="stash-gem draggable"
                style="--socket-color: {sd ? SOCKET_COLOR_HEX[sd.color] : '#666'}"
                title={sd ? sd.summary : ''}
                onpointerdown={(e) => onStashPointerDown(e, g)}
              >
                <span class="socket-emoji">{sd?.emoji ?? '?'}</span>
                <span class="stash-gem-name">{sd?.name ?? ''}</span>
                {#if sd && sd.level > 1}<span class="gem-level">Lv{sd.level}</span>{/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if subject.source === 'backpack' || subject.source === 'inventory' || subject.source === 'shop' || subject.source === 'rewards' || subject.source === 'item-offer'}
      <footer class="footer">
        {#if subject.source === 'rewards'}
          <!-- Victory chest: "Destroy" (scrap for crystals) above "Take" (to
               the bag) above "Equip" / "Swap". -->
          <button
            type="button"
            class="cta danger"
            onclick={handleDestroy}
          >
            {t('inspector.destroy')} · 💎 {itemRefund(subject.item)}
          </button>
          <button
            type="button"
            class="cta"
            disabled={takeDisabledReason !== null}
            title={takeDisabledReason ?? ''}
            onclick={handleTake}
          >
            {t('inspector.take')}
          </button>
          <button
            type="button"
            class="cta secondary"
            disabled={ctaDisabledReason !== null}
            title={ctaDisabledReason ?? ''}
            onclick={handleCta}
          >
            {ctaLabel}
          </button>
        {:else}
          <button
            type="button"
            class="cta"
            disabled={ctaDisabledReason !== null}
            title={ctaDisabledReason ?? ''}
            onclick={handleCta}
          >
            {ctaLabel}
          </button>
          {#if subject.source === 'shop'}
            <button
              type="button"
              class="cta secondary"
              disabled={buyAndEquipDisabledReason !== null}
              title={buyAndEquipDisabledReason ?? ''}
              onclick={handleBuyAndEquip}
            >
              {t('inspector.buyAndEquip', { price: subject.price })}
            </button>
          {/if}
        {/if}
      </footer>
    {/if}
  </aside>
{/if}

<style>
  .inspector {
    position: fixed;
    top: 56px;
    right: 0;
    bottom: 0;
    width: 360px;
    max-width: calc(100vw - 16px);
    background: #1c1c24;
    border-left: 1px solid #2a2a34;
    box-shadow: -18px 0 40px rgba(0, 0, 0, 0.45);
    z-index: 110;
    display: flex;
    flex-direction: column;
    user-select: none;
    transition: width 180ms ease;
  }
  /* Widen to fit two socket columns side-by-side when comparing. */
  .inspector.with-compare {
    width: min(660px, calc(100vw - 16px));
  }

  @media (max-width: 900px) {
    .inspector {
      width: min(360px, 50vw);
    }
    .inspector.with-compare {
      width: calc(100vw - 16px);
    }
  }

  /* Socket area: one column normally, two side-by-side when comparing. */
  .columns {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .columns.dual {
    flex-direction: row;
    gap: 10px;
    align-items: flex-start;
  }
  .columns.dual .socket-col {
    flex: 1 1 0;
    min-width: 0;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 12px 14px;
    border-bottom: 1px solid #2a2a34;
  }
  .header .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 2rem;
    line-height: 1;
  }
  .title {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kind {
    font-size: 1.1rem;
    font-weight: 600;
    color: #ddd;
  }
  .tier {
    align-self: flex-start;
    font-size: 0.95rem;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid var(--tier-color, #666);
    color: var(--tier-color, #999);
    background: rgba(0, 0, 0, 0.3);
    font-variant-numeric: lining-nums;
  }
  /* Disenchant-refund hints (crystals returned by trashing). */
  .disenchant-hint {
    align-self: flex-start;
    margin-top: 3px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #d8b34a;
    font-variant-numeric: lining-nums;
  }
  .close {
    appearance: none;
    background: transparent;
    border: 1px solid #2a2a34;
    color: #ddd;
    border-radius: 6px;
    width: 32px;
    height: 32px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .close:hover {
    background: #2a2a34;
  }

  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    overflow-y: auto;
    min-height: 0;
  }
  .sockets-label {
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #788;
    padding: 0 2px;
  }
  .sockets {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  /* Row wrapper around a single socket button. */
  .socket-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .socket {
    width: 100%;
    text-align: left;
    appearance: none;
    display: grid;
    grid-template-columns: 28px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid #2a2a34;
    border-radius: 6px;
    background: #14141a;
    color: inherit;
    min-height: 44px;
    transition: border-color 100ms ease, background-color 100ms ease,
      box-shadow 100ms ease, opacity 100ms ease;
  }
  .socket:not(.filled) .socket-name.empty {
    color: #667;
  }
  .socket:not(.filled):not(.drop-target) {
    opacity: 0.6;
  }
  .socket.interactive:not(:disabled) {
    cursor: pointer;
  }
  /* Draggable gem socket: suppress browser touch gestures so a touch drag
     isn't stolen by scroll / pan. */
  .socket.draggable {
    touch-action: none;
  }
  /* Live drop target under a dragged gem (matched via gemDropZone). */
  .socket.armed {
    border-color: #ffcc44;
    box-shadow: inset 0 0 0 2px #ffcc44;
    opacity: 1;
  }
  .socket.interactive:not(:disabled):hover {
    border-color: #4a4a58;
    background: #181820;
  }
  /* Socket COLOUR: the left edge reads as the socket's colour (what fits
     here), on every socket - empty or filled. The role (effect / support) is
     carried separately by the .socket-role text badge on the right. */
  .socket {
    border-left: 4px solid var(--socket-color, #666);
  }
  /* A bound support and the connector below it share the support accent. */
  .socket.inert {
    opacity: 0.5;
  }
  /* Held origin: the socket the held gem was lifted from sits empty + outlined. */
  .socket.held-origin {
    border-style: dashed;
    border-color: #6ad;
  }
  /* Valid drop targets glow while a compatible gem is held. */
  .socket.drop-target {
    border-color: #ffcc44;
    box-shadow: inset 0 0 0 1px rgba(255, 204, 68, 0.5);
    opacity: 1;
  }
  .socket.drop-target:hover {
    background: #2a2410;
  }
  /* Incompatible item while holding: every socket reads as a dead end. */
  .socket.incompatible {
    opacity: 0.4;
  }
  .socket:disabled {
    cursor: not-allowed;
  }
  .socket:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }
  .socket-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.5rem;
    line-height: 1;
    justify-self: center;
  }
  .socket-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .socket-name {
    font-size: 1.05rem;
    font-weight: 600;
    color: #e6e6ee;
  }
  /* Combine level badge (shown only when level > 1). Inline next to the gem
     name in a socket; absolutely positioned on a compact stash tile. */
  .gem-level {
    display: inline-block;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    color: #f0e0ff;
    background: rgba(124, 58, 200, 0.85);
    border: 1px solid #c084fc;
    vertical-align: middle;
    font-variant-numeric: lining-nums;
  }
  .stash-gem .gem-level {
    position: absolute;
    top: 3px;
    right: 3px;
    font-size: 0.62rem;
    padding: 1px 3px;
  }
  .socket-summary {
    font-size: 0.88rem;
    color: #9aa;
    line-height: 1.25;
  }
  /* Binding hint: "↳ bound effect name" under a support, or the inert note. */
  .socket-bind {
    font-size: 0.85rem;
    color: #6ad;
    font-weight: 600;
    margin-top: 1px;
  }
  .socket-bind.inert-note {
    color: #c77;
    font-weight: 500;
  }
  /* Role badge: a small pill so effect vs support still reads now that the
     socket's left edge carries colour instead of role. */
  .socket-role {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #788;
    align-self: start;
  }
  .socket-role.role-effect,
  .socket-role.role-support {
    padding: 1px 6px;
    border-radius: 999px;
    font-weight: 700;
  }
  .socket-role.role-effect {
    color: #ffd0e6;
    background: rgba(255, 102, 170, 0.18);
    border: 1px solid #f6a;
  }
  .socket-role.role-support {
    color: #cfe6ff;
    background: rgba(102, 170, 221, 0.18);
    border: 1px solid #6ad;
  }

  /* Add-socket action (Rest only). Crystal-tinted to read as a tier upgrade,
     distinct from the gold socket highlights and the grey CTA. */

  .add-socket {
    width: 100%;
    appearance: none;
    margin-top: 6px;
    background: #221a2e;
    border: 1px solid #5a4a80;
    color: #d8c8ff;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  /* Preview dot of the colour the next socket will be. */
  .socket-swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--swatch, #666);
    border: 1px solid rgba(255, 255, 255, 0.35);
    box-shadow: 0 0 6px var(--swatch, #666);
    flex: none;
  }
  .add-socket:hover:not(:disabled) {
    background: #2c2240;
    border-color: #a070ff;
  }
  .add-socket:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .add-socket:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }

  /* === Gem stash ================================================ */
  .stash {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed #2a2a34;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .stash.drop-armed {
    border-top-color: #ffcc44;
    background: #2a2410;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgba(255, 204, 68, 0.4);
  }
  .stash-label {
    margin-bottom: 0;
  }
  .stash-empty {
    font-size: 0.9rem;
    color: #667;
    line-height: 1.3;
    padding: 2px;
  }
  .stash-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .stash-gem {
    position: relative;
    appearance: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 62px;
    padding: 7px 4px;
    border: 1px solid #2a2a34;
    /* Socket colour reads as the left edge, like the sockets (no colour ring). */
    border-left: 3px solid var(--socket-color, #666);
    border-radius: 6px;
    background: #14141a;
    color: #ccd;
    cursor: pointer;
    min-height: 56px;
    transition: border-color 100ms ease, background-color 100ms ease;
  }
  .stash-gem.draggable {
    touch-action: none;
  }
  .stash-gem:hover {
    border-color: #4a4a58;
    background: #181820;
  }
  .stash-gem:focus-visible {
    outline: 2px solid #ffcc44;
    outline-offset: 2px;
  }
  .stash-gem-name {
    font-size: 0.74rem;
    text-align: center;
    line-height: 1.1;
    color: #9aa;
  }
  .footer {
    padding: 12px 14px;
    border-top: 1px solid #2a2a34;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
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
  /* Destructive action (scrap a reward for crystals): red outline. */
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
</style>
