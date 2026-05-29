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
  import { fight } from '../state/fight';
  import { run } from '../state/run';
  import { topbar } from '../state/topbar';
  import { buyAndEquipItem, buyItem, canBuyAndEquipItem, canBuyItem } from '../state/shop';
  import { removeRewardItem } from '../state/rewards';
  import { canPickItem, pickItem } from '../state/item-offer';
  import {
    ADD_ROLL_COST,
    canAddRoll,
    canApplyScroll,
    canDisenchantTop,
    canLockSelected,
    canRemoveSelected,
    canRerollAll,
    canRerollLayer,
    canTransfer,
    canTransferSlot,
    destroyRefund,
    disenchantTopRefund,
    doAddRoll,
    doApplyScroll,
    doDestroy,
    doDisenchantTop,
    doLockSelected,
    doRemoveSelected,
    doRerollAll,
    doRerollMains,
    doRerollUtilities,
    doTransfer,
    legalScrollsFor,
    LOCK_SELECTED_CRYSTAL_COST,
    LOCK_SELECTED_SEAL_COST,
    REMOVE_SELECTED_CRYSTAL_COST,
    REMOVE_SELECTED_SEAL_COST,
    REROLL_ALL_COST,
    REROLL_LAYER_CRYSTAL_COST,
    REROLL_LAYER_SEAL_COST,
  } from '../state/workbench';
  import { requestConfirm } from '../state/confirm';
  import type { CarriedScroll } from '../state/scrolls';
  import {
    isSealed,
    itemEmoji,
    legalEquipmentSlots,
    stackLayerAt,
    STACK_HEIGHT,
    tierOf,
    type Item,
    type StackLayer,
  } from '../domain/item';
  import { enchantDescription, enchantName } from '../domain/enchant-display';
  import { t } from '../i18n';
  import { clickOutside } from '../utils/clickOutside';

  // Selection is stored as primitives so mutations to the inspected item
  // (which change the object ref) don't cause an effect loop trying to
  // refresh `selected.item`. The hint and the action eligibility derive
  // their enchant from the live $inspector value.
  let selectedSlot = $state<number | null>(null);
  let selectedItemId = $state<string | null>(null);

  // Reset selection whenever the inspected item changes (different item picked
  // in the Inventory or Backpack). lastItemId is a plain let, not $state, so
  // the effect only re-runs on $inspector changes and the write below can't
  // form a reactive loop.
  let lastItemId: string | null = null;
  $effect(() => {
    const id = $inspector?.item.id ?? null;
    if (id !== lastItemId) {
      lastItemId = id;
      selectedSlot = null;
      selectedItemId = null;
    }
  });

  // Which action button is currently hovered, so we can preview the slot(s)
  // it will affect on the enchant stack (per docs/ux.md § Workbench:
  // "Hovering a button previews its target").
  type PreviewAction =
    | 'enchant'
    | 'disenchant'
    | 'rerollAll'
    | 'rerollMains'
    | 'rerollUtils'
    | 'destroy'
    | null;
  let hoveredAction = $state<PreviewAction>(null);

  function previewSlots(forItem: Item): number[] {
    if (hoveredAction === null) return [];
    if (hoveredAction === 'enchant') {
      if (forItem.enchants.length >= 6) return [];
      return [forItem.enchants.length + 1];
    }
    if (hoveredAction === 'disenchant') {
      for (let i = forItem.enchants.length; i >= 1; i--) {
        if (!isSealed(forItem, i)) return [i];
      }
      return [];
    }
    if (hoveredAction === 'destroy') {
      // Destroy removes everything, sealed or not.
      const slots: number[] = [];
      for (let s = 1; s <= forItem.enchants.length; s++) slots.push(s);
      return slots;
    }
    // rerollAll / rerollMains / rerollUtils: every filled, unsealed
    // slot whose layer matches the action's filter.
    const slots: number[] = [];
    for (let s = 1; s <= forItem.enchants.length; s++) {
      if (isSealed(forItem, s)) continue;
      const layer = stackLayerAt(s);
      if (hoveredAction === 'rerollMains' && layer !== 'main') continue;
      if (hoveredAction === 'rerollUtils' && layer !== 'utility') continue;
      slots.push(s);
    }
    return slots;
  }

  function isSelectedCell(stackItem: Item, slot: number): boolean {
    return selectedSlot === slot && selectedItemId === stackItem.id;
  }

  function selectedSlotOn(item: Item): number | null {
    return selectedItemId === item.id ? selectedSlot : null;
  }

  const TIER_COLORS: Record<number, string> = {
    1: '#9ca3af',
    2: '#22c55e',
    3: '#3b82f6',
    4: '#a855f7',
    5: '#f97316',
    6: '#ef4444',
    7: '#fbbf24',
  };

  const stackSlots = Array.from({ length: STACK_HEIGHT }, (_, i) => i + 1);

  const inRest = $derived($run.screen === 'rest');

  function enchantAt(item: Item, slot: number) {
    return item.enchants[slot - 1] ?? null;
  }

  function isFilled(item: Item, slot: number): boolean {
    return slot <= tierOf(item);
  }

  function comparisonItem(): Item | null {
    const subject = $inspector;
    if (!subject || subject.source === 'inventory' || inRest) return null;
    const legal = legalEquipmentSlots(subject.item);
    for (const slotId of legal) {
      const eq = $equipped[slotId];
      if (eq) return eq;
    }
    return null;
  }


  function onCellClick(slot: number, item: Item): void {
    if (selectedSlot === slot && selectedItemId === item.id) {
      selectedSlot = null;
      selectedItemId = null;
    } else {
      selectedSlot = slot;
      selectedItemId = item.id;
    }
  }

  function layerLabel(layer: StackLayer): string {
    if (layer === 'main') return t('inspector.layer.main');
    if (layer === 'utility') return t('inspector.layer.utility');
    return t('inspector.layer.unique');
  }

  // === Equip / Unequip CTA (non-Rest only) =========================
  const ctaLabel = $derived.by(() => {
    const s = $inspector;
    if (!s) return '';
    if (
      s.source === 'backpack' ||
      s.source === 'rewards' ||
      s.source === 'item-offer'
    ) {
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
  // clickOutside or the X. Without this the pulsing slots would
  // linger after the user has clearly moved on.
  $effect(() => {
    if (!$inspector && $displacementPick) cancelDisplacementPick();
  });

  const ctaDisabledReason = $derived.by((): string | null => {
    const s = $inspector;
    if (!s) return null;
    if (pickActive) return t('inspector.pickSlotHint');
    if (s.source === 'backpack') {
      // Equip-from-backpack always works via swap-in-place when no
      // empty legal slot is free.
    }
    if (s.source === 'inventory') {
      if (!$backpack.includes(null)) return t('inspector.cta.backpackFull');
    }
    if (s.source === 'shop') {
      const r = canBuyItem(s.index);
      if (!r.ok && r.reasonKey) return t(r.reasonKey);
      if (!r.ok) return '';
    }
    if (s.source === 'rewards') {
      // No legal slot AND backpack full -> nowhere for the
      // displaced item to land.
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
        // Follow the item to its new home: Inspector stays open, source
        // flips backpack -> inventory, CTA flips Equip -> Unequip. The
        // Backpack tile's inspecting border vanishes; the Inventory slot
        // lights up. Keyboard focus also moves to the slot for a11y.
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
      // Else null may mean displacement picker armed - the user
      // clicks an Inventory slot to resolve.
    } else if (subject.source === 'inventory') {
      const landedIndex = unequipToBackpack(subject.slotId);
      if (landedIndex !== -1) {
        // Symmetric: Inspector follows the item back into the Backpack.
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
      // pickItem equips + blanks the offer slot + closes the
      // Inspector. An item-select room is a "pick one and go"
      // decision, so on a successful equip we auto-complete the
      // room straight back to the map.
      const landed = pickItem(subject.index);
      if (landed !== null) completeRoom();
    } else {
      buyItem(subject.index);
    }
  }

  // Shop-only secondary CTA: take the item straight to the Inventory,
  // skipping the Backpack entirely. Disabled separately from the
  // primary Buy button so the player can still buy-to-backpack if no
  // legal slot is free.
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
      // Follow the item: re-open the Inspector on the freshly-equipped
      // slot so the user can immediately Unequip / inspect it.
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

  // === Rest action availability ====================================
  function ownsResources(crystals: number, seals: number): boolean {
    return $topbar.crystals >= crystals && $topbar.seals >= seals;
  }

  // Apply-scroll picker overlay. Open while the player chooses which held
  // scroll to engrave onto the inspected item's next slot. Closes on
  // resolve, click-away, or ESC.
  let scrollPickerOpen = $state(false);

  // Reset the picker whenever the inspected item changes - a stale picker
  // would otherwise target the wrong item after a subject switch.
  $effect(() => {
    void $inspector?.item.id;
    scrollPickerOpen = false;
  });

  function applyScrollPick(scroll: CarriedScroll): void {
    doApplyScroll(scroll.id);
    scrollPickerOpen = false;
  }

  // Confirm-routed irrecoverable actions (docs/ux.md § Confirm modals).
  function confirmDestroy(target: Item): void {
    requestConfirm({
      title: t('confirm.destroy.title'),
      body: t('confirm.destroy.body', {
        item: t(`item.type.${target.itemType}`),
        refund: destroyRefund(target),
      }),
      confirmLabel: t('confirm.destroy.confirm'),
      tone: 'danger',
      onConfirm: doDestroy,
    });
  }

  function confirmRemove(target: Item, slot: number): void {
    const enchant = target.enchants[slot - 1];
    if (!enchant) return;
    requestConfirm({
      title: t('confirm.remove.title'),
      body: t('confirm.remove.body', {
        enchant: enchantName(enchant),
        tier: tierOf(target) - 1,
      }),
      confirmLabel: t('confirm.remove.confirm'),
      tone: 'danger',
      onConfirm: () => doRemoveSelected(slot),
    });
  }

  function confirmTransfer(target: Item, slot: number): void {
    const enchant = target.enchants[slot - 1];
    if (!enchant) return;
    requestConfirm({
      title: t('confirm.transfer.title'),
      body: t('confirm.transfer.body', {
        enchant: enchantName(enchant),
        item: t(`item.type.${target.itemType}`),
      }),
      confirmLabel: t('confirm.transfer.confirm'),
      tone: 'danger',
      onConfirm: () => doTransfer(slot),
    });
  }

</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && scrollPickerOpen) {
      e.preventDefault();
      scrollPickerOpen = false;
    }
  }}
/>

{#if $inspector}
  {@const subject = $inspector}
  {@const compare = comparisonItem()}
  {@const item = subject.item}
  {@const selSlot = selectedSlotOn(item)}
  <aside
    class="inspector"
    class:wide={compare !== null || inRest}
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

    {#snippet stackColumn(stackItem: Item, label: string | null, clickable: boolean)}
      {@const preview = new Set(previewSlots(stackItem))}
      <div class="stack-col">
        {#if label}<div class="stack-label">{label}</div>{/if}
        <div class="stack">
          {#each stackSlots as slotIndex (slotIndex)}
            {@const layer = stackLayerAt(slotIndex)}
            {@const filled = isFilled(stackItem, slotIndex)}
            {@const enchant = enchantAt(stackItem, slotIndex)}
            {@const sealed = isSealed(stackItem, slotIndex)}
            {@const isSelected = isSelectedCell(stackItem, slotIndex)}
            {@const isPreview = preview.has(slotIndex) && stackItem === item}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="cell"
              class:filled
              class:sealed
              class:selected={isSelected}
              class:preview={isPreview}
              class:clickable
              onclick={() => clickable && onCellClick(slotIndex, stackItem)}
            >
              <span class="cell-emoji">{filled && enchant ? enchant.emoji : '·'}</span>
              <span class="cell-name">
                {#if filled && enchant}
                  {enchantName(enchant)}
                {:else}
                  {t('inspector.empty', { layer: layerLabel(layer) })}
                {/if}
              </span>
              <span
                class="cell-layer"
                class:main={layer === 'main'}
                class:utility={layer === 'utility'}
              >
                {layerLabel(layer)}
              </span>
              {#if sealed}
                <span class="seal-badge" aria-label="Sealed">⚜️</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/snippet}

    {#snippet costLine(crystals: number, seals: number, refund: number)}
      <span class="cost">
        {#if seals > 0}<span class="cost-pill">{seals} ⚜️</span>{/if}
        {#if crystals > 0}<span class="cost-pill">-{crystals} 💎</span>{/if}
        {#if refund > 0}<span class="cost-pill refund">+{refund} 💎</span>{/if}
      </span>
    {/snippet}

    {#snippet restActions()}
      {@const rollLegal = canAddRoll(item)}
      {@const applyLegal = canApplyScroll(item)}
      <div class="actions-col">
        <div class="actions-group-label">{t('workbench.group.enchant')}</div>

        <!-- Add collapse rule (docs/ux.md): 0 legal sub-actions -> hidden;
             1 -> the button is that sub-action directly; 2 -> two buttons. -->
        {#if rollLegal}
          <button
            type="button"
            class="action"
            disabled={!ownsResources(ADD_ROLL_COST, 0)}
            onclick={doAddRoll}
            onmouseenter={() => (hoveredAction = 'enchant')}
            onmouseleave={() => (hoveredAction = null)}
          >
            <span class="action-label"
              >{applyLegal ? t('workbench.action.addRoll') : t('workbench.action.add')}</span
            >
            {@render costLine(ADD_ROLL_COST, 0, 0)}
          </button>
        {/if}
        {#if applyLegal}
          <button
            type="button"
            class="action"
            onclick={() => (scrollPickerOpen = true)}
            onmouseenter={() => (hoveredAction = 'enchant')}
            onmouseleave={() => (hoveredAction = null)}
          >
            <span class="action-label">{t('workbench.action.applyScroll')}</span>
            <span class="cost">
              <span class="cost-pill scroll">{legalScrollsFor(item).length} 📜</span>
            </span>
          </button>
        {/if}

        <button
          type="button"
          class="action"
          disabled={!canRerollAll(item) || !ownsResources(REROLL_ALL_COST, 0)}
          onclick={doRerollAll}
          onmouseenter={() => (hoveredAction = 'rerollAll')}
          onmouseleave={() => (hoveredAction = null)}
        >
          <span class="action-label">{t('workbench.action.rerollAll')}</span>
          {@render costLine(REROLL_ALL_COST, 0, 0)}
        </button>

        <button
          type="button"
          class="action"
          disabled={!canRerollLayer(item, 'main') ||
            !ownsResources(REROLL_LAYER_CRYSTAL_COST, REROLL_LAYER_SEAL_COST)}
          onclick={doRerollMains}
          onmouseenter={() => (hoveredAction = 'rerollMains')}
          onmouseleave={() => (hoveredAction = null)}
        >
          <span class="action-label">{t('workbench.action.rerollMains')}</span>
          {@render costLine(REROLL_LAYER_CRYSTAL_COST, REROLL_LAYER_SEAL_COST, 0)}
        </button>
        <button
          type="button"
          class="action"
          disabled={!canRerollLayer(item, 'utility') ||
            !ownsResources(REROLL_LAYER_CRYSTAL_COST, REROLL_LAYER_SEAL_COST)}
          onclick={doRerollUtilities}
          onmouseenter={() => (hoveredAction = 'rerollUtils')}
          onmouseleave={() => (hoveredAction = null)}
        >
          <span class="action-label">{t('workbench.action.rerollUtilities')}</span>
          {@render costLine(REROLL_LAYER_CRYSTAL_COST, REROLL_LAYER_SEAL_COST, 0)}
        </button>

        <div class="actions-group-label">{t('workbench.group.disenchant')}</div>

        <button
          type="button"
          class="action"
          disabled={!canDisenchantTop(item)}
          onclick={doDisenchantTop}
          onmouseenter={() => (hoveredAction = 'disenchant')}
          onmouseleave={() => (hoveredAction = null)}
        >
          <span class="action-label">{t('workbench.action.disenchantTop')}</span>
          {@render costLine(0, 0, disenchantTopRefund(item))}
        </button>

        <button
          type="button"
          class="action"
          disabled={!canRemoveSelected(item, selSlot) ||
            !ownsResources(REMOVE_SELECTED_CRYSTAL_COST, REMOVE_SELECTED_SEAL_COST)}
          title={selSlot === null ? t('workbench.needSelection') : ''}
          onclick={() => selSlot !== null && confirmRemove(item, selSlot)}
        >
          <span class="action-label">{t('workbench.action.removeSelected')}</span>
          {@render costLine(REMOVE_SELECTED_CRYSTAL_COST, REMOVE_SELECTED_SEAL_COST, 0)}
        </button>

        <button
          type="button"
          class="action destroy"
          onclick={() => confirmDestroy(item)}
          onmouseenter={() => (hoveredAction = 'destroy')}
          onmouseleave={() => (hoveredAction = null)}
        >
          <span class="action-label">{t('workbench.action.destroy')}</span>
          {@render costLine(0, 0, destroyRefund(item))}
        </button>

        <div class="actions-group-label">{t('workbench.group.other')}</div>

        <button
          type="button"
          class="action"
          disabled={!canTransfer(item) || !canTransferSlot(item, selSlot)}
          title={!canTransfer(item)
            ? t('workbench.transfer.needScroll')
            : selSlot === null
              ? t('workbench.transfer.needSelection')
              : ''}
          onclick={() => selSlot !== null && confirmTransfer(item, selSlot)}
        >
          <span class="action-label">{t('workbench.action.transfer')}</span>
          <span class="cost"><span class="cost-pill">1 📜</span></span>
        </button>

        <button
          type="button"
          class="action"
          disabled={!canLockSelected(item, selSlot) ||
            !ownsResources(LOCK_SELECTED_CRYSTAL_COST, LOCK_SELECTED_SEAL_COST)}
          title={selSlot === null ? t('workbench.needSelection') : ''}
          onclick={() => selSlot !== null && doLockSelected(selSlot)}
        >
          <span class="action-label">{t('workbench.action.lockSelected')}</span>
          {@render costLine(LOCK_SELECTED_CRYSTAL_COST, LOCK_SELECTED_SEAL_COST, 0)}
        </button>
      </div>
    {/snippet}

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

    <div class="body">
      {@render stackColumn(item, inRest || compare ? t('inspector.stack.inspected') : null, true)}
      {#if inRest}
        {@render restActions()}
      {:else if compare}
        {@render stackColumn(compare, t('inspector.stack.equipped'), true)}
      {/if}
    </div>

    <div class="hint">
      {#if selectedSlot === null || selectedItemId === null}
        <div class="hint-prompt">{t('inspector.hint.clickPrompt')}</div>
      {:else}
        {@const hintItem =
          selectedItemId === item.id ? item : compare && selectedItemId === compare.id ? compare : null}
        {#if hintItem}
          {@const layer = stackLayerAt(selectedSlot)}
          {@const enchant = enchantAt(hintItem, selectedSlot)}
          {#if isFilled(hintItem, selectedSlot) && enchant}
            <div class="hint-header">
              <span class="emoji">{enchant.emoji}</span>
              <div>
                <div class="hint-name">{enchantName(enchant)}</div>
                <div class="hint-meta">
                  {layerLabel(layer)} · {enchant.pools.map((p) => t(`enchant.pool.${p}`)).join(' / ')}
                </div>
              </div>
            </div>
            <div class="hint-desc">{enchantDescription(enchant)}</div>
          {:else}
            <div class="hint-empty">
              {t('inspector.hint.emptyCell', { layer: layerLabel(layer) })}
            </div>
          {/if}
        {:else}
          <div class="hint-prompt">{t('inspector.hint.clickPrompt')}</div>
        {/if}
      {/if}
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

    {#if scrollPickerOpen && inRest}
      {@const legal = legalScrollsFor(item)}
      {@const nextSlot = item.enchants.length + 1}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="scroll-picker" onclick={() => (scrollPickerOpen = false)}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="picker-panel" onclick={(e) => e.stopPropagation()}>
          <header class="picker-head">
            <div>
              <div class="picker-title">{t('workbench.applyScroll.title')}</div>
              <div class="picker-sub">{t('workbench.applyScroll.subtitle', { slot: nextSlot })}</div>
            </div>
            <button
              type="button"
              class="close"
              aria-label={t('confirm.close')}
              onclick={() => (scrollPickerOpen = false)}
            >
              ✕
            </button>
          </header>
          {#if legal.length === 0}
            <div class="picker-empty">{t('workbench.applyScroll.empty')}</div>
          {:else}
            <div class="picker-list">
              {#each legal as scroll (scroll.id)}
                <button
                  type="button"
                  class="picker-tile"
                  class:unique={scroll.kind === 'unique'}
                  onclick={() => applyScrollPick(scroll)}
                >
                  <span class="picker-tile-emoji">{scroll.enchant.emoji}</span>
                  <span class="picker-tile-text">
                    <span class="picker-tile-name">{enchantName(scroll.enchant)}</span>
                    <span class="picker-tile-kind"
                      >{scroll.kind === 'unique'
                        ? t('workbench.applyScroll.unique')
                        : t('workbench.applyScroll.loaded')}</span
                    >
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
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
  .inspector.wide {
    width: 560px;
  }

  /* Landscape-mobile / narrow viewports: clamp Inspector width so the
     Battlefield isn't reduced to a sliver behind it. */
  @media (max-width: 900px) {
    .inspector {
      width: min(360px, 50vw);
    }
    .inspector.wide {
      width: min(560px, 70vw);
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
    gap: 12px;
    padding: 12px;
    overflow-y: auto;
    min-height: 0;
  }
  .stack-col,
  .actions-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .stack-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #788;
    padding: 0 2px;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .cell {
    position: relative;
    display: grid;
    grid-template-columns: 28px 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border: 1px solid #2a2a34;
    border-radius: 6px;
    background: #14141a;
    transition: background-color 80ms ease, border-color 80ms ease;
  }
  .cell:not(.filled) {
    opacity: 0.55;
  }
  .cell.sealed {
    border-style: dashed;
    border-color: #5a5a64;
  }
  .cell.clickable {
    cursor: pointer;
  }
  .cell.clickable:hover {
    border-color: #4a4a58;
    background: #1f1f28;
  }
  .cell.selected {
    border-color: #ffcc44;
    background: #2a2418;
    box-shadow: inset 0 0 0 1px #ffcc44;
  }
  .cell.preview {
    border-color: #88c8ff;
    background: #182028;
    box-shadow: inset 0 0 0 1px #88c8ff;
  }
  .cell-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.3rem;
    line-height: 1;
    justify-self: center;
  }
  .cell-name {
    font-size: 0.85rem;
    color: #ddd;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cell-layer {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 5px;
    border-radius: 4px;
    border: 1px solid #2a2a34;
  }
  .cell-layer.main {
    color: #ffd866;
    border-color: #5a4c1e;
  }
  .cell-layer.utility {
    color: #88c8ff;
    border-color: #2a4760;
  }
  .seal-badge {
    position: absolute;
    bottom: -4px;
    right: -4px;
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 0.95rem;
    background: #14141a;
    border-radius: 50%;
    padding: 0 2px;
    line-height: 1;
  }

  .actions-group-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6a7080;
    padding: 8px 2px 2px;
    border-top: 1px solid #2a2a34;
  }
  .actions-group-label:first-child {
    padding-top: 0;
    border-top: none;
  }

  .actions-col .action {
    appearance: none;
    background: #2a2a34;
    border: 1px solid #3a3a48;
    color: #ddd;
    border-radius: 6px;
    padding: 8px 10px;
    cursor: pointer;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .actions-col .action:hover:not(:disabled) {
    background: #3a3a48;
    border-color: #ffcc44;
  }
  .actions-col .action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .actions-col .action.destroy {
    background: #3a1a1a;
    border-color: #8a3a3a;
    color: #ff8888;
  }
  .actions-col .action.destroy:hover:not(:disabled) {
    background: #5a2424;
    border-color: #cc4444;
  }
  .action-label {
    font-size: 0.88rem;
    font-weight: 500;
  }
  .cost {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    font-size: 0.85rem;
    color: #aab;
    font-variant-numeric: lining-nums tabular-nums;
  }
  .cost-pill {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid #2a2a34;
    border-radius: 4px;
    padding: 1px 6px;
    font-weight: 600;
  }
  .cost-pill.refund {
    color: #88dd88;
    border-color: #2a4a2a;
  }
  .cost-pill.scroll {
    color: #c8b8ff;
    border-color: #423a5e;
  }

  .scroll-picker {
    position: absolute;
    inset: 0;
    z-index: 5;
    background: rgba(10, 10, 16, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .picker-panel {
    width: 100%;
    max-height: 100%;
    background: #1c1c24;
    border: 1px solid #3a3a48;
    border-radius: 10px;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .picker-head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid #2a2a34;
  }
  .picker-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: #eee;
  }
  .picker-sub {
    font-size: 0.78rem;
    color: #9aa;
    margin-top: 2px;
  }
  .picker-empty {
    padding: 16px 14px;
    color: #788;
    font-size: 0.85rem;
    font-style: italic;
  }
  .picker-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    overflow-y: auto;
  }
  .picker-tile {
    appearance: none;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    background: #14141a;
    border: 1px solid #423a5e;
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .picker-tile:hover {
    background: #1f1b2c;
    border-color: #8a7cff;
  }
  .picker-tile.unique {
    border-color: #6a5520;
  }
  .picker-tile.unique:hover {
    border-color: #ffcc44;
  }
  .picker-tile-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.4rem;
    line-height: 1;
  }
  .picker-tile-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .picker-tile-name {
    font-size: 0.88rem;
    color: #ddd;
    font-weight: 500;
  }
  .picker-tile-kind {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9a8fc8;
  }

  .hint {
    border-top: 1px solid #2a2a34;
    padding: 12px 14px;
    min-height: 100px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hint-prompt {
    color: #788;
    font-size: 0.85rem;
    font-style: italic;
  }
  .hint-header {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .hint-header .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.6rem;
  }
  .hint-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: #eee;
  }
  .hint-meta {
    font-size: 0.75rem;
    color: #9aa;
  }
  .hint-desc {
    font-size: 0.85rem;
    color: #ccc;
    line-height: 1.45;
  }
  .hint-empty {
    color: #788;
    font-size: 0.85rem;
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
