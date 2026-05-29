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
  import type { Gem, GemDef } from '../domain/gem';
  import { GEM_CATALOGUE } from '../domain/gem-catalogue';
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

  // Look up a placed gem's catalogue definition (emoji + role), or null
  // for an empty socket / unknown defId.
  function gemDef(gem: Gem | null): GemDef | null {
    if (!gem) return null;
    return GEM_CATALOGUE[gem.defId] ?? null;
  }

  function roleLabel(def: GemDef): string {
    return def.role === 'support' ? t('inspector.socket.support') : t('inspector.socket.effect');
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

    <!-- Read-only socket list (full interactive socket UI lands in a
         later phase). Each socket shows its gem emoji + role, or an
         empty-dot for an open socket. -->
    <div class="body">
      <div class="sockets-label">{t('inspector.sockets')}</div>
      <div class="sockets">
        {#each item.sockets as gem, i (i)}
          {@const def = gemDef(gem)}
          <div class="socket" class:filled={def !== null}>
            <span class="socket-emoji">{def ? def.emoji : '·'}</span>
            <span class="socket-role">{def ? roleLabel(def) : t('inspector.socket.empty')}</span>
          </div>
        {/each}
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
    display: grid;
    grid-template-columns: 28px 1fr;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border: 1px solid #2a2a34;
    border-radius: 6px;
    background: #14141a;
  }
  .socket:not(.filled) {
    opacity: 0.55;
  }
  .socket-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.3rem;
    line-height: 1;
    justify-self: center;
  }
  .socket-role {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
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
