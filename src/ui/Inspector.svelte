<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { get } from 'svelte/store';
  import { closeInspector, inspector } from '../state/inspector';
  import { completeRoom, run } from '../state/run';
  import {
    addSocketCost,
    addSocketToItem,
    canAddSocket,
  } from '../state/rest';
  import { topbar } from '../state/topbar';
  import {
    canEquipDirect,
    cancelDisplacementPick,
    displacementPick,
    equipFromBackpack,
    equipItemDirect,
    equipped,
    unequipToBackpack,
  } from '../state/inventory';
  import { backpack } from '../state/backpack';
  import { buyAndEquipItem, buyItem, canBuyAndEquipItem, canBuyItem } from '../state/shop';
  import { removeRewardItem } from '../state/rewards';
  import { canPickItem, pickItem } from '../state/item-offer';
  import {
    isItem,
    itemEmoji,
    legalEquipmentSlots,
    tierOf,
    type Item,
  } from '../domain/item';
  import type { Gem } from '../domain/gem';
  import { gemDisplay } from '../domain/gem-display';
  import { computeBindings } from '../domain/gem-resolution';
  import { gemFitsSocketAt } from '../domain/gem-fit';
  import { cancelHeld, heldGem } from '../state/gem-move';
  import { startGemDrag, gemDropZone } from '../state/gem-drag';
  import { gemStash } from '../state/gem-stash';
  import { gemRefund, itemRefund } from '../state/disenchant';
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

  // === Interactive sockets + binding hints =========================
  // Socket editing is only meaningful when the player OWNS the item - i.e.
  // it is equipped or sits in the backpack. Shop / rewards / item-offer
  // items are previews; their sockets stay read-only.
  const socketsEditable = $derived(
    $inspector !== null &&
      ($inspector.source === 'inventory' || $inspector.source === 'backpack'),
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

  function onAddSocket(): void {
    const subj = $inspector;
    if (!subj) return;
    addSocketToItem(subj.item);
  }

  // The support -> effect binding map for the open item's sockets, recomputed
  // whenever the sockets change. Drives the connector hints and inert dimming.
  const bindings = $derived(
    $inspector ? computeBindings($inspector.item.sockets) : null,
  );

  // Whether the currently held gem fits a GIVEN socket of the open item (its
  // colour matches that socket's colour). Per-socket now - a held gem can be a
  // valid drop target for some sockets of an item and not others.
  function heldFitsSocket(index: number): boolean {
    const held = $heldGem;
    const subj = $inspector;
    if (!held || !subj) return false;
    return gemFitsSocketAt(held.gem, subj.item, index);
  }

  // Pointer-down on a FILLED socket starts a gem drag (drag it out to a stash /
  // another socket / an equipped item). Empty sockets and read-only previews
  // are inert. The gem-drag controller gates on a move threshold, so a tap that
  // doesn't move neither lifts the gem nor opens anything.
  function onSocketPointerDown(e: PointerEvent, item: Item, index: number): void {
    if (!socketsEditable) return;
    if (!item.sockets[index]) return; // empty socket: nothing to drag.
    startGemDrag({ kind: 'socket', item, index }, e);
  }

  // Pointer-down on a loose stash gem starts a drag (into a socket / equipped
  // item, or back into the backpack).
  function onStashPointerDown(e: PointerEvent, gemId: string): void {
    startGemDrag({ kind: 'backpack', gemId }, e);
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
    if (!socketsEditable) return d ? `${d.name} - ${d.summary}` : t('inspector.socket.empty');
    if (holding) {
      if (incompatible) return t('inspector.socket.incompatible');
      if (dropTarget) return d ? t('inspector.socket.swapHere') : t('inspector.socket.placeHere');
    }
    return d ? t('inspector.socket.pickUp') : t('inspector.socket.empty');
  }

  // === Equip / Unequip CTA =========================================
  const ctaLabel = $derived.by(() => {
    const s = $inspector;
    if (!s) return '';
    if (s.source === 'backpack' || s.source === 'rewards' || s.source === 'item-offer') {
      return t('inspector.equip');
    }
    if (s.source === 'inventory') return t('inspector.unequip');
    return t('inspector.buy', { price: s.price });
  });

  // While a displacement pick is open for this item, the CTA is
  // disabled - the player resolves the equip by clicking an
  // Inventory slot (or hitting the banner's cancel).
  const pickActive = $derived(
    $inspector !== null &&
      $displacementPick !== null &&
      $displacementPick.item.id === $inspector.item.id,
  );

  // Cancel a pending picker when the user closes the Inspector via
  // clickOutside or the X.
  $effect(() => {
    if (!$inspector && $displacementPick) cancelDisplacementPick();
  });

  // A held gem has been lifted out of its socket; if the Inspector closes
  // while one is held, return it to its origin so it can never be stranded.
  $effect(() => {
    if (!$inspector && $heldGem) cancelHeld();
  });

  const ctaDisabledReason = $derived.by((): string | null => {
    const s = $inspector;
    if (!s) return null;
    if (pickActive) return t('inspector.pickSlotHint');
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
        const newItem = get(equipped)[landedSlot];
        if (newItem) {
          inspector.set({ source: 'inventory', slotId: landedSlot, item: newItem });
        }
      }
    } else if (subject.source === 'item-offer') {
      const landed = pickItem(subject.index);
      if (landed !== null) completeRoom();
    } else {
      buyItem(subject.index);
    }
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
    aria-label={t('inspector.title')}
    transition:fly={{ x: 580, duration: 220, easing: cubicOut, opacity: 1 }}
    use:clickOutside={{
      onOutside: closeInspector,
      ignoreSelectors: ['[data-inspector-source]', '.backpack-toggle', '.backpack', '.backpack-scrim', '.item-room', '.scrim'],
    }}
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

    {#if pickActive}
      <div class="pick-banner">
        <span class="pick-banner-text">{t('inspector.pickSlot')}</span>
        <button
          type="button"
          class="pick-banner-cancel"
          aria-label={t('inspector.cancelPick')}
          onclick={cancelDisplacementPick}
        >
          ✕
        </button>
      </div>
    {/if}

    <!-- Interactive socket list. When the item is owned (equipped / backpack)
         each filled socket is DRAGGABLE - drag a gem out to the stash, to
         another socket, or onto an equipped item - and every socket is a DROP
         target while a gem is being dragged. Bound supports show a "binds to"
         connector to their effect; inert supports are dimmed. -->
    <div class="body" data-gem-zone>
      <div class="sockets-label">{t('inspector.sockets')}</div>
      <div class="sockets">
        {#each item.sockets as gem, i (i)}
          {@const d = display(gem)}
          {@const isSupport = d?.role === 'support'}
          {@const boundEffect =
            isSupport && bindings ? bindings.supportToEffect.get(i) ?? null : null}
          {@const inert = isSupport && bindings ? bindings.inertSupports.has(i) : false}
          {@const boundName =
            boundEffect !== null ? display(item.sockets[boundEffect])?.name ?? '' : ''}
          {@const isHeldOrigin =
            $heldGem !== null &&
            $heldGem.from.kind === 'socket' &&
            $heldGem.from.itemId === item.id &&
            $heldGem.from.index === i}
          {@const fitsThis = heldFitsSocket(i)}
          {@const dropTarget = socketsEditable && $heldGem !== null && fitsThis}
          {@const incompatible =
            socketsEditable && $heldGem !== null && !fitsThis}
          {@const armed = isArmedSocket(item.id, i)}
          <button
            type="button"
            class="socket"
            class:filled={d !== null}
            class:support={isSupport}
            class:effect={d?.role === 'effect'}
            class:inert
            class:bound={boundEffect !== null}
            class:drop-target={dropTarget}
            class:armed
            class:incompatible
            class:held-origin={isHeldOrigin}
            class:interactive={socketsEditable}
            class:draggable={socketsEditable && d !== null}
            disabled={!socketsEditable}
            data-gem-socket
            data-item-id={item.id}
            data-socket-index={i}
            title={socketTitle(d, !!$heldGem, dropTarget, incompatible)}
            onpointerdown={(e) => onSocketPointerDown(e, item, i)}
          >
            <span class="socket-emoji">{d ? d.emoji : '·'}</span>
            <span class="socket-info">
              {#if d}
                <span class="socket-name">
                  {d.name}
                  {#if d.level > 1}<span class="gem-level">Lv{d.level}</span>{/if}
                </span>
                <span class="socket-summary">{d.summary}</span>
                {#if isSupport && boundEffect !== null}
                  <span class="socket-bind">↳ {boundName}</span>
                {:else if inert}
                  <span class="socket-bind inert-note">{t('inspector.socket.inert')}</span>
                {/if}
              {:else}
                <span class="socket-name empty">{t('inspector.socket.empty')}</span>
              {/if}
            </span>
            <span class="socket-role">
              {#if d}{d.role === 'support' ? t('inspector.socket.support') : t('inspector.socket.effect')}{/if}
            </span>
          </button>
        {/each}
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
                class:support={sd?.role === 'support'}
                class:effect={sd?.role === 'effect'}
                title={sd ? `${sd.name} - ${sd.summary}` : ''}
                onpointerdown={(e) => onStashPointerDown(e, g.id)}
              >
                <span class="socket-emoji">{sd?.emoji ?? '?'}</span>
                <span class="stash-gem-name">{sd?.name ?? ''}</span>
                {#if sd && sd.level > 1}<span class="gem-level">Lv{sd.level}</span>{/if}
                <span class="gem-refund" title={t('inspector.disenchant.title')}>🗑️ {gemRefund(g)}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if subject.source === 'backpack' || subject.source === 'inventory' || subject.source === 'shop' || subject.source === 'rewards' || subject.source === 'item-offer'}
      <footer class="footer">
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
  }

  @media (max-width: 900px) {
    .inspector {
      width: min(360px, 50vw);
    }
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
  .gem-refund {
    margin-top: 1px;
    font-size: 0.66rem;
    color: #b9912a;
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

  .pick-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: #182536;
    border-bottom: 1px solid #2a3a50;
    color: #88c8ff;
    font-size: 0.95rem;
    font-weight: 500;
  }
  .pick-banner-text {
    flex: 1;
  }
  .pick-banner-cancel {
    appearance: none;
    background: transparent;
    border: 1px solid #2a3a50;
    color: #88c8ff;
    border-radius: 4px;
    width: 24px;
    height: 24px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .pick-banner-cancel:hover {
    background: #2a3a50;
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
  /* Role accents: a left edge so effect vs support reads at a glance. */
  .socket.effect.filled {
    border-left: 3px solid #f6a;
  }
  .socket.support.filled {
    border-left: 3px solid #6ad;
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
    font-size: 1.55rem;
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
  .socket-role {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #788;
    align-self: start;
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
    transition: background-color 100ms ease, border-color 100ms ease;
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
    width: 64px;
    padding: 7px 4px;
    border: 1px solid #2a2a34;
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
  .stash-gem.effect {
    border-bottom: 2px solid #f6a;
  }
  .stash-gem.support {
    border-bottom: 2px solid #6ad;
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
