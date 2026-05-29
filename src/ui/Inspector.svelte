<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { get } from 'svelte/store';
  import { closeInspector, inspector } from '../state/inspector';
  import { completeRoom } from '../state/run';
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
    itemEmoji,
    legalEquipmentSlots,
    tierOf,
    type Item,
  } from '../domain/item';
  import type { Gem } from '../domain/gem';
  import { gemDisplay } from '../domain/gem-display';
  import { computeBindings } from '../domain/gem-resolution';
  import { gemFitsSocketOf } from '../domain/gem-fit';
  import {
    cancelHeld,
    heldGem,
    pickUpFromSocket,
    pickUpFromStash,
    placeIntoSocket,
    placeIntoStash,
  } from '../state/gem-move';
  import { gemStash } from '../state/gem-stash';
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

  // The support -> effect binding map for the open item's sockets, recomputed
  // whenever the sockets change. Drives the connector hints and inert dimming.
  const bindings = $derived(
    $inspector ? computeBindings($inspector.item.sockets) : null,
  );

  // True if the currently held gem may be dropped into the open item (class
  // fits). Used to highlight valid drop targets; a class mismatch makes every
  // socket of this item an invalid target.
  const heldFitsItem = $derived.by(() => {
    const held = $heldGem;
    const subj = $inspector;
    if (!held || !subj) return false;
    return gemFitsSocketOf(held.gem, subj.item);
  });

  // Tap handler for a socket cell. With nothing held: pick up the gem (no-op
  // on an empty socket). With a gem held: place it here if it fits (an
  // occupied socket swaps); a class mismatch is a no-op.
  function onSocketTap(item: Item, index: number): void {
    if (!socketsEditable) return;
    const held = $heldGem;
    if (!held) {
      pickUpFromSocket(item, index);
      return;
    }
    placeIntoSocket(item, index);
  }

  function onStashTap(gemId: string): void {
    if ($heldGem) {
      placeIntoStash();
      return;
    }
    pickUpFromStash(gemId);
  }

  // Tooltip for a socket cell, reflecting what a tap would do right now.
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
        if (newItem) {
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

    {#if $heldGem}
      {@const held = display($heldGem.gem)}
      <div class="held-banner">
        <span class="held-emoji">{held?.emoji ?? '?'}</span>
        <span class="held-text">
          <span class="held-label">{t('inspector.held.label')}</span>
          <span class="held-name">{held?.name ?? ''}</span>
        </span>
        <button
          type="button"
          class="held-cancel"
          onclick={cancelHeld}
        >
          {t('inspector.held.cancel')}
        </button>
      </div>
    {/if}

    <!-- Interactive socket list. Each socket is a tap target when the item is
         owned (equipped / backpack): tap a gem to pick it up, tap a socket to
         place / swap the held gem. Bound supports show a "binds to" connector
         to their effect; inert supports are dimmed. -->
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
          {@const dropTarget = socketsEditable && $heldGem !== null && heldFitsItem}
          {@const incompatible =
            socketsEditable && $heldGem !== null && !heldFitsItem}
          <button
            type="button"
            class="socket"
            class:filled={d !== null}
            class:support={isSupport}
            class:effect={d?.role === 'effect'}
            class:inert
            class:bound={boundEffect !== null}
            class:drop-target={dropTarget}
            class:incompatible
            class:held-origin={isHeldOrigin}
            class:interactive={socketsEditable}
            disabled={!socketsEditable || (incompatible && d === null)}
            title={socketTitle(d, !!$heldGem, dropTarget, incompatible)}
            onclick={() => onSocketTap(item, i)}
          >
            <span class="socket-emoji">{d ? d.emoji : '·'}</span>
            <span class="socket-info">
              {#if d}
                <span class="socket-name">{d.name}</span>
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

      <!-- Gem stash strip: pick a loose gem up, or drop the held gem here. -->
      <div class="stash" class:drop-armed={$heldGem !== null}>
        <div class="sockets-label stash-label">{t('inspector.stash.title')}</div>
        {#if $gemStash.length === 0}
          {#if $heldGem}
            <button type="button" class="stash-drop" onclick={() => onStashTap('')}>
              {t('inspector.stash.drop')}
            </button>
          {:else}
            <div class="stash-empty">{t('inspector.stash.empty')}</div>
          {/if}
        {:else}
          <div class="stash-grid">
            {#each $gemStash as g (g.id)}
              {@const sd = display(g)}
              <button
                type="button"
                class="stash-gem"
                class:support={sd?.role === 'support'}
                class:effect={sd?.role === 'effect'}
                title={sd ? `${sd.name} - ${sd.summary}` : ''}
                onclick={() => onStashTap(g.id)}
              >
                <span class="socket-emoji">{sd?.emoji ?? '?'}</span>
                <span class="stash-gem-name">{sd?.name ?? ''}</span>
              </button>
            {/each}
            {#if $heldGem}
              <button type="button" class="stash-gem stash-drop-tile" onclick={() => onStashTap('')}>
                <span class="socket-emoji">⬇️</span>
                <span class="stash-gem-name">{t('inspector.stash.drop')}</span>
              </button>
            {/if}
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
    font-size: 1.8rem;
    line-height: 1;
  }
  .title {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kind {
    font-size: 0.95rem;
    font-weight: 600;
    color: #ddd;
  }
  .tier {
    align-self: flex-start;
    font-size: 0.85rem;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid var(--tier-color, #666);
    color: var(--tier-color, #999);
    background: rgba(0, 0, 0, 0.3);
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
    font-size: 0.85rem;
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
    font-size: 0.7rem;
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
    font-size: 1.3rem;
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
    font-size: 0.9rem;
    font-weight: 600;
    color: #e6e6ee;
  }
  .socket-summary {
    font-size: 0.74rem;
    color: #9aa;
    line-height: 1.25;
  }
  /* Binding hint: "↳ bound effect name" under a support, or the inert note. */
  .socket-bind {
    font-size: 0.72rem;
    color: #6ad;
    font-weight: 600;
    margin-top: 1px;
  }
  .socket-bind.inert-note {
    color: #c77;
    font-weight: 500;
  }
  .socket-role {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #788;
    align-self: start;
  }

  /* === Held banner ============================================== */
  .held-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    background: #2a2410;
    border-bottom: 1px solid #5a4a18;
    color: #ffd866;
  }
  .held-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.5rem;
    line-height: 1;
  }
  .held-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .held-label {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #c8a84a;
  }
  .held-name {
    font-size: 0.95rem;
    font-weight: 600;
  }
  .held-cancel {
    appearance: none;
    background: transparent;
    border: 1px solid #5a4a18;
    color: #ffd866;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 36px;
    white-space: nowrap;
  }
  .held-cancel:hover {
    background: #3a3214;
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
  }
  .stash-label {
    margin-bottom: 0;
  }
  .stash-empty {
    font-size: 0.78rem;
    color: #667;
    line-height: 1.3;
    padding: 2px;
  }
  .stash-drop {
    appearance: none;
    background: #2a2410;
    border: 1px dashed #ffcc44;
    color: #ffd866;
    border-radius: 6px;
    padding: 10px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
  }
  .stash-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .stash-gem {
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
    font-size: 0.62rem;
    text-align: center;
    line-height: 1.1;
    color: #9aa;
  }
  .stash-drop-tile {
    border-style: dashed;
    border-color: #ffcc44;
    background: #2a2410;
    color: #ffd866;
  }
  .stash-drop-tile .stash-gem-name {
    color: #ffd866;
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
    font-size: 0.95rem;
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
