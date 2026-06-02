<script lang="ts">
  import { paneEnter, paneLeave } from '../utils/paneTransition';
  import { get } from 'svelte/store';
  import { closeInspector, inspector, type InspectorSubject } from '../state/inspector';
  import { completeRoom, run } from '../state/run';
  import { addSocketCost, addSocketToItem, canAddSocket } from '../state/rest';
  import { topbar } from '../state/topbar';
  import {
    equipFromBackpack,
    equipped,
    unequipToBackpack,
  } from '../state/inventory';
  import { backpack } from '../state/backpack';
  import {
    buyItem,
    canBuyItem,
    sellItemFromBackpack,
    shopStock,
  } from '../state/shop';
  import { itemSellValue } from '../domain/shop';
  import { canPickItem, pickItem } from '../state/item-offer';
  import {
    itemEmoji,
    legalEquipmentSlots,
    tierOf,
    type Item,
  } from '../domain/item';
  import { isGem, type Gem, type SocketColor } from '../domain/gem';
  import { seededSocketColorForType } from '../domain/random';
  import { gemDisplay, SOCKET_COLOR_HEX } from '../domain/gem-display';
  import { computeBindings } from '../domain/gem-resolution';
  import { gemFitsSocketAt, gemColor } from '../domain/gem-fit';
  import { cancelHeld, heldGem, socketBagGemIntoSocket, unsocketGemToBag } from '../state/gem-move';
  import { clickOutside } from '../utils/clickOutside';
  import { startGemDrag, gemDropZone, isGemDragActive } from '../state/gem-drag';
  import { inspectGem, gemInspector } from '../state/gem-inspector';
  import {
    disenchantItemFromBackpack,
    destroyBackpackItemKeepGems,
    disenchantEquipped,
    itemRefund,
  } from '../state/disenchant';
  import { requestDestroy } from '../state/destroy-prompt';
  import { flashEquipSlot } from '../state/equip-feedback';
  import { sfx } from '../audio/sfx';
  import { t } from '../i18n';
  import { revealInRail } from '../utils/revealInRail';

  const TIER_COLORS: Record<number, string> = {
    1: '#9ca3af',
    2: '#22c55e',
    3: '#3b82f6',
    4: '#a855f7',
    5: '#f97316',
    6: '#ef4444',
    7: '#33b6a6',
  };

  // Display info (emoji + name + one-line summary + role) for a placed gem,
  // or null for an empty socket / unknown defId.
  function display(gem: Gem | null) {
    return gem ? gemDisplay(gem) : null;
  }

  // The pane is mounted / unmounted by App's rail {#each} (keyed on panelOrder).
  // closeInspector() clears the store a frame before that unmount lands, so if
  // the view read $inspector directly it would blank out (content collapsing,
  // transition cut) the instant the store cleared. Instead we cache the last
  // non-null subject and render from `subject` throughout: the pane keeps its
  // full content as it fades + scales out, and the leave animation plays in full.
  let lastSubject = $state<InspectorSubject | null>(get(inspector));
  $effect(() => {
    const s = $inspector;
    if (s) lastSubject = s;
  });
  const subject = $derived($inspector ?? lastSubject);

  // Comparison item: when inspecting a CANDIDATE item (shop / rewards / backpack
  // / item-offer - anything that isn't already equipped), the item currently
  // sitting in its slot. Shown read-only beneath the inspected item so the
  // player can compare the two loadouts before equipping. Every type maps to a
  // single slot now, so there's exactly one item to compare against.
  const comparison = $derived.by((): Item | null => {
    const s = subject;
    if (!s || s.source === 'inventory') return null;
    const [slotId] = legalEquipmentSlots(s.item);
    if (!slotId) return null;
    const eq = $equipped[slotId];
    return eq && eq.id !== s.item.id ? eq : null;
  });

  // === Interactive sockets + binding hints =========================
  // Socket editing is only meaningful when the player OWNS the item - i.e.
  // it is equipped or sits in the backpack. Shop / item-offer items are
  // previews; their sockets stay read-only.
  const socketsEditable = $derived(
    subject !== null &&
      (subject.source === 'inventory' || subject.source === 'backpack'),
  );

  // === Empty-socket gem picker =====================================
  // Tapping an EMPTY socket of an owned item opens an inline dropdown of every
  // loose bag gem whose colour fits that socket; picking one sockets it there.
  // `socketMenu` identifies the open socket BY ITEM + index, so the picker works
  // for either item in the compare view (the candidate or the equipped one).
  let socketMenu = $state<{ item: Item; index: number } | null>(null);
  function closeSocketMenu(): void {
    socketMenu = null;
  }
  function isPickerOpen(it: Item, index: number): boolean {
    return socketMenu !== null && socketMenu.item.id === it.id && socketMenu.index === index;
  }
  function toggleSocketMenu(it: Item, index: number): void {
    socketMenu = isPickerOpen(it, index) ? null : { item: it, index };
  }
  // Loose bag gems that fit a socket of the given colour, in bag order.
  function pickerGems(color: SocketColor): Gem[] {
    return $backpack.filter((s): s is Gem => isGem(s) && gemColor(s) === color);
  }
  function onPickGem(picked: Gem, it: Item, index: number): void {
    // "Change": if the socket is occupied, free it first (its gem returns to the
    // bag), then drop the picked gem into the now-empty socket.
    if (it.sockets[index]) unsocketGemToBag(it, index);
    if (socketBagGemIntoSocket(picked, it, index)) closeSocketMenu();
  }
  // The per-socket "change" (⇄): open the same bag-gem picker on a FILLED
  // socket to swap its gem for another. Toggles like tapping an empty socket.
  function onChangeSocket(it: Item, index: number): void {
    toggleSocketMenu(it, index);
  }
  // Inline unsocket (the per-socket ↥): pull the gem out of socket `index` of
  // the inspected item straight into the bag. The item re-derives in place.
  function onUnsocketAt(colItem: Item, index: number): void {
    unsocketGemToBag(colItem, index);
  }
  // Close the picker whenever the inspected item changes (switching subjects).
  let lastPickerItemId: string | null = null;
  $effect(() => {
    const id = subject?.item.id ?? null;
    if (id !== lastPickerItemId) {
      lastPickerItemId = id;
      socketMenu = null;
    }
  });

  // === Add socket (FEATURE 3) ======================================
  // Only at Rest, only for an OWNED item (equipped / backpack), only while it
  // is under the tier cap. The button's cost + affordability read the live
  // topbar so they re-derive as crystals change.
  const canShowAddSocket = $derived(
    subject !== null &&
      $run.screen === 'rest' &&
      socketsEditable &&
      canAddSocket(subject.item),
  );
  const addSocketPrice = $derived(
    subject ? addSocketCost(subject.item) : 0,
  );
  // Read $topbar.crystals directly so affordability re-derives on every spend.
  const addSocketAffordable = $derived(
    subject !== null && $topbar.crystals >= addSocketPrice,
  );

  // Colour of the NEXT socket the Add-socket button would add. Seeded by the
  // item id + the next socket index, so it is PREDEFINED (deterministic): the
  // same item always grows the same colour sequence, the previewed swatch never
  // flickers, and it exactly matches what onAddSocket commits.
  const pendingSocketColor = $derived.by((): SocketColor => {
    const s = subject;
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

  // Pointer-down on a FILLED socket. On an OWNED item it starts a gem drag (drag
  // it out to another socket / an equipped item) and a tap (no movement) opens
  // the gem inspector. On a READ-ONLY preview (shop / item-offer / the compare
  // column) you can't move gems, but a tap still inspects the socketed gem.
  // Empty sockets are always inert.
  function onSocketPointerDown(e: PointerEvent, item: Item, index: number): void {
    const gem = item.sockets[index];
    if (!gem) {
      // Empty socket on an OWNED item: toggle the gem picker for THAT item (so
      // the compare view can fill either column). Read-only previews stay inert.
      if (socketsEditable) toggleSocketMenu(item, index);
      return;
    }
    if (!socketsEditable) {
      inspectGem(gem);
      return;
    }
    socketMenu = null; // starting a drag closes any open picker
    startGemDrag({ kind: 'socket', item, index }, e, () => inspectGem(gem));
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
  // Equipping an item whose (single) legal slot is already occupied displaces
  // the occupant, so the action reads as "Swap" rather than "Equip".
  function wouldSwap(it: Item): boolean {
    const slots = legalEquipmentSlots(it);
    return slots.length > 0 && slots.every((slot) => $equipped[slot] !== null);
  }
  const ctaLabel = $derived.by(() => {
    const s = subject;
    if (!s) return '';
    if (s.source === 'backpack') {
      return wouldSwap(s.item) ? t('inspector.swap') : t('inspector.equip');
    }
    if (s.source === 'item-offer') {
      return wouldSwap(s.item) ? t('inspector.swap') : t('inspector.equip');
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
    const s = subject;
    if (!s) return null;
    if (s.source === 'inventory') {
      if (!$backpack.includes(null)) return t('inspector.cta.backpackFull');
    }
    if (s.source === 'shop') {
      const r = canBuyItem(s.index);
      if (!r.ok && r.reasonKey) return t(r.reasonKey);
      if (!r.ok) return '';
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
      // Equip from the bag, then close - the player is done with this item once
      // it's on (re-open it from the equipment slot to keep tinkering).
      const swap = wouldSwap(subject.item);
      const landed = equipFromBackpack(subject.index);
      if (landed !== null) {
        if (swap) sfx.swapItem();
        else sfx.equip();
        flashEquipSlot(landed);
        closeInspector();
      }
    } else if (subject.source === 'inventory') {
      // Unequip to the bag, then close.
      if (unequipToBackpack(subject.slotId) !== -1) closeInspector();
    } else if (subject.source === 'item-offer') {
      const landed = pickItem(subject.index);
      if (landed !== null) completeRoom();
    } else {
      buyItem(subject.index);
    }
  }


  // Disenchant / Sell are now per-item buttons on owned items (equipped /
  // backpack), replacing the bag's old trash + sell drop-zones.
  const owned = $derived(
    subject?.source === 'inventory' || subject?.source === 'backpack',
  );

  // Disenchant the inspected owned item for crystals. A backpack item that still
  // holds gems prompts to keep them (detach to the bag) or scrap everything,
  // mirroring the old trash-drop; an equipped item scraps outright.
  function handleDisenchant(): void {
    const s = $inspector;
    if (!s) return;
    if (s.source === 'backpack') {
      if (s.item.sockets.some((g) => g !== null)) {
        requestDestroy({
          item: s.item,
          onKeepGems: () => {
            destroyBackpackItemKeepGems(s.index);
            closeInspector();
          },
          onDestroyAll: () => {
            disenchantItemFromBackpack(s.index);
            closeInspector();
          },
        });
        return;
      }
      if (disenchantItemFromBackpack(s.index)) closeInspector();
    } else if (s.source === 'inventory') {
      if (disenchantEquipped(s.slotId)) closeInspector();
    }
  }

  // Sell the inspected backpack item to the shop for gold (only while a shop is
  // open). Equipped items aren't sellable directly - unequip first.
  function handleSell(): void {
    const s = $inspector;
    if (!s || s.source !== 'backpack') return;
    sellItemFromBackpack(s.index);
    closeInspector();
  }
</script>

{#if subject}
  {@const item = subject.item}
  <aside
    class="inspector"
    aria-label={t('inspector.title')}
    use:revealInRail
    in:paneEnter|global
    out:paneLeave|global
  >
    <header class="header" data-pane-header>
      <span class="emoji">{itemEmoji(item)}</span>
      <div class="title">
        <div class="kind">{t(`item.type.${item.itemType}`)}</div>
        <div class="badges">
          <div class="tier" style="--tier-color: {TIER_COLORS[tierOf(item)] ?? '#5c6a6a'}">
            {t('inspector.tier', { tier: tierOf(item) })}
          </div>
          {#if subject.source === 'inventory'}
            <span class="state-badge equipped">{t('inspector.equipped')}</span>
          {/if}
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

    <!-- Interactive socket list. When the item is owned (equipped / backpack)
         each filled socket is DRAGGABLE - drag a gem out to the stash, to
         another socket, or onto an equipped item - and every socket is a DROP
         target while a gem is being dragged. Bound supports show a "binds to"
         connector to their effect; inert supports are dimmed. -->
    <!-- One interactive socket - the building block for both the normal list and
         the compare view. Gems drag freely between the inspected + equipped
         item's sockets via the shared by-id gem-move. -->
    {#snippet socketCell(
      colItem: Item,
      colEditable: boolean,
      colBindings: ReturnType<typeof computeBindings>,
      i: number,
    )}
      {@const gem = colItem.sockets[i]}
      {@const d = display(gem)}
      {@const socketHex = SOCKET_COLOR_HEX[colItem.socketColors[i]] ?? '#5c6a6a'}
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
      {@const isSelected = gem !== null && $gemInspector?.gem.id === gem.id}
      {@const addHint =
        gem === null &&
        colEditable &&
        !isPickerOpen(colItem, i) &&
        pickerGems(colItem.socketColors[i]).length > 0}
      {@const canSwap = colEditable && gem !== null && pickerGems(colItem.socketColors[i]).length > 0}
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
        class:selected={isSelected}
        class:add-hint={addHint}
        class:has-actions={colEditable && gem !== null}
        class:has-actions-wide={canSwap}
        class:incompatible
        class:held-origin={isHeldOrigin}
        class:interactive={colEditable || d !== null}
        class:draggable={colEditable && d !== null}
        disabled={!colEditable && d === null}
        data-gem-socket
        data-item-id={colItem.id}
        data-socket-index={i}
        style="--socket-color: {socketHex}"
        title={addHint ? t('inspector.socket.addAvailable') : socketTitle(d, !!$heldGem, dropTarget, incompatible)}
        onpointerdown={(e) => onSocketPointerDown(e, colItem, i)}
      >
        <span class="socket-emoji">{d ? d.emoji : addHint ? '+' : '·'}</span>
        <span class="socket-info">
          {#if d}
            <span class="socket-name">
              <span class="socket-name-text">{d.name}</span>
              {#if d.level > 1}<span class="gem-level">Lv{d.level}</span>{/if}
              <!-- Role tag inline next to the name (matches the bag list). -->
              <span class="socket-role" class:role-effect={d.role === 'effect'} class:role-support={isSupport}>
                {d.role === 'support' ? t('inspector.socket.support') : t('inspector.socket.effect')}
              </span>
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
            <!-- An add-hint empty socket keeps the "Empty socket" label; the "+"
                 emoji + highlighted border are the only cue that a gem fits. -->
            <span class="socket-name empty">{t('inspector.socket.empty')}</span>
          {/if}
        </span>
      </button>
    {/snippet}

    <!-- Actions OVERLAID on the top-right of a FILLED socket of an owned item:
         "change" (⇄, opens the bag-gem picker to swap the gem) and "unsocket"
         (↥, pulls the gem back into the bag). Overlaid (not beside) so the same
         markup works in the wide single view AND the narrow compare chips. The
         socket reserves matching right padding (.has-actions) so content never
         slides under them. -->
    {#snippet socketActions(colItem: Item, index: number)}
      <div class="socket-overlay">
        <!-- "Change" only appears when there's actually a bag gem to swap in. -->
        {#if pickerGems(colItem.socketColors[index]).length > 0}
          <button
            type="button"
            class="ov-act change"
            data-socket-change
            aria-label={t('inspector.changeGem')}
            title={t('inspector.changeGem')}
            onclick={() => onChangeSocket(colItem, index)}
          >⇄</button>
        {/if}
        <button
          type="button"
          class="ov-act remove"
          aria-label={t('inspector.unsocket')}
          title={t('inspector.unsocket')}
          onclick={() => onUnsocketAt(colItem, index)}
        >↥</button>
      </div>
    {/snippet}

    <!-- Gem picker: opened by tapping an EMPTY socket of an owned item. Lists
         every loose bag gem whose colour fits that socket; picking one sockets
         it there. Closes on pick / outside click / re-tapping the socket. -->
    {#snippet socketPicker(colItem: Item, index: number)}
      {@const color = colItem.socketColors[index]}
      {@const gems = pickerGems(color)}
      <div
        class="socket-picker"
        style="--socket-color: {SOCKET_COLOR_HEX[color] ?? '#5c6a6a'}"
        use:clickOutside={{
          onOutside: closeSocketMenu,
          ignoreSelectors: ['[data-gem-socket]', '[data-socket-change]'],
        }}
      >
        {#if gems.length === 0}
          <div class="picker-empty">{t('inspector.socketPicker.empty')}</div>
        {:else}
          <div class="picker-head">
            {colItem.sockets[index]
              ? t('inspector.socketPicker.swap')
              : t('inspector.socketPicker.title')}
          </div>
          {#each gems as g (g.id)}
            {@const gd = display(g)}
            <button type="button" class="picker-gem" onclick={() => onPickGem(g, colItem, index)}>
              <span class="picker-emoji">{gd?.emoji ?? '💎'}</span>
              <span class="picker-info">
                <span class="picker-name">
                  {gd?.name ?? g.defId}
                  {#if (gd?.level ?? 1) > 1}<span class="gem-level">Lv{gd?.level}</span>{/if}
                </span>
                <span class="picker-summary">{gd?.summary ?? ''}</span>
              </span>
            </button>
          {/each}
        {/if}
      </div>
    {/snippet}

    <!-- Normal: a single labelled column of the item's sockets. -->
    {#snippet socketColumn(colItem: Item, colEditable: boolean, label: string)}
      {@const colBindings = computeBindings(colItem.sockets)}
      <div class="socket-col">
        <div class="sockets-label">{label}</div>
        <div class="sockets">
          {#each colItem.sockets as _gem, i (i)}
            <div class="socket-row">
              <div class="socket-line">
                {@render socketCell(colItem, colEditable, colBindings, i)}
                {#if colEditable && colItem.id === item.id && colItem.sockets[i]}
                  {@render socketActions(colItem, i)}
                {/if}
              </div>
              {#if colEditable && colItem.id === item.id && isPickerOpen(colItem, i)}
                {@render socketPicker(colItem, i)}
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/snippet}

    <!-- Compact socket cell for the side-by-side compare: a colour-coded chip
         with the gem emoji + name (truncated) + level. Tap a filled cell to open
         its detail in the gem window; tap an empty (editable) cell to pick a gem;
         drag works as everywhere. No inline name/summary/buttons, so two columns
         fit the narrow pane without crowding. -->
    {#snippet compactSocket(colItem: Item, colEditable: boolean, colBindings: ReturnType<typeof computeBindings>, i: number)}
      {@const g = colItem.sockets[i]}
      {@const cd = display(g)}
      {@const hex = SOCKET_COLOR_HEX[colItem.socketColors[i]] ?? '#5c6a6a'}
      {@const isSupport = cd?.role === 'support'}
      {@const inert = isSupport && (colBindings.inertSupports.has(i) || colBindings.incompatibleSupports.has(i))}
      {@const isSel = g !== null && $gemInspector?.gem.id === g.id}
      {@const armed = isArmedSocket(colItem.id, i)}
      {@const addHint = g === null && colEditable && !isPickerOpen(colItem, i) && pickerGems(colItem.socketColors[i]).length > 0}
      {@const canSwap = colEditable && g !== null && pickerGems(colItem.socketColors[i]).length > 0}
      <button
        type="button"
        class="csocket"
        class:filled={g !== null}
        class:inert
        class:selected={isSel}
        class:armed
        class:add-hint={addHint}
        class:has-actions={colEditable && g !== null}
        class:has-actions-wide={canSwap}
        class:interactive={colEditable || g !== null}
        class:draggable={colEditable && g !== null}
        disabled={!colEditable && g === null}
        data-gem-socket
        data-item-id={colItem.id}
        data-socket-index={i}
        style="--socket-color: {hex}"
        title={cd
          ? `${cd.name}${cd.level > 1 ? ` Lv${cd.level}` : ''} - ${cd.summary}`
          : addHint
            ? t('inspector.socket.addAvailable')
            : t('inspector.socket.empty')}
        onpointerdown={(e) => onSocketPointerDown(e, colItem, i)}
      >
        <span class="cs-emoji">{cd ? cd.emoji : addHint ? '+' : '·'}</span>
        <span class="cs-name" class:empty={!cd}>{cd ? cd.name : t('inspector.socket.empty')}</span>
        {#if cd && cd.level > 1}<span class="cs-lv">Lv{cd.level}</span>{/if}
      </button>
    {/snippet}

    <!-- Compare: two compact columns (candidate vs equipped) side by side. Both
         are interactive (the equipped one is owned too), so you can compare AND
         tweak / fill either, then Swap. The gem picker drops below the columns. -->
    {#snippet compareColumns(equipped: Item)}
      {@const selBindings = computeBindings(item.sockets)}
      {@const eqBindings = computeBindings(equipped.sockets)}
      <div class="compare">
        <div class="compare-col">
          <div class="cmp-head">
            <span class="cmp-tag selected">{t('inspector.compare.selected')}</span>
            <span class="cmp-tier" style="--tier-color: {TIER_COLORS[tierOf(item)] ?? '#5c6a6a'}">T{tierOf(item)}</span>
          </div>
          <div class="csockets">
            {#each item.sockets as _g, i (i)}
              <div class="csocket-wrap">
                {@render compactSocket(item, socketsEditable, selBindings, i)}
                {#if socketsEditable && item.sockets[i]}
                  {@render socketActions(item, i)}
                {/if}
              </div>
            {/each}
          </div>
        </div>
        <div class="compare-col equipped">
          <div class="cmp-head">
            <span class="cmp-tag">{t('inspector.compare.equipped')}</span>
            <span class="cmp-tier" style="--tier-color: {TIER_COLORS[tierOf(equipped)] ?? '#5c6a6a'}">T{tierOf(equipped)}</span>
          </div>
          <div class="csockets">
            {#each equipped.sockets as _g, i (i)}
              <div class="csocket-wrap">
                {@render compactSocket(equipped, socketsEditable, eqBindings, i)}
                {#if socketsEditable && equipped.sockets[i]}
                  {@render socketActions(equipped, i)}
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>
      {#if socketMenu}
        {@render socketPicker(socketMenu.item, socketMenu.index)}
      {/if}
    {/snippet}

    <div class="body" data-gem-zone>
      {#if comparison}
        {@render compareColumns(comparison)}
      {:else}
        {@render socketColumn(item, socketsEditable, t('inspector.sockets'))}
      {/if}

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

    </div>

    {#if subject.source === 'backpack' || subject.source === 'inventory' || subject.source === 'shop' || subject.source === 'item-offer'}
      <footer class="footer">
          {#if owned}
            <!-- Per-item Disenchant / Sell (replacing the bag's old drop-zones).
                 Sell only while a shop is open, and only for backpack items
                 (unequip first to sell equipped gear). These sit ABOVE the
                 primary CTA so the Equip / Swap / Unequip action stays anchored
                 at the very bottom (thumb-reach on mobile). -->
            {#if subject.source === 'backpack' && $shopStock}
              <button type="button" class="cta secondary" onclick={handleSell}>
                {t('inspector.sell', { price: itemSellValue(item) })}
              </button>
            {/if}
            <button type="button" class="cta danger" onclick={handleDisenchant}>
              {t('inspector.disenchant', { refund: itemRefund(item) })}
            </button>
          {/if}
          <button
            type="button"
            class="cta"
            disabled={ctaDisabledReason !== null}
            title={ctaDisabledReason ?? ''}
            onclick={handleCta}
          >
            {ctaLabel}
          </button>
      </footer>
    {/if}
  </aside>
{/if}

<style>
  /* In-rail detail panel: a fixed-width flex column that stretches to the rail's
     full height and snaps as the player scrolls/swipes. (Was a fixed right-edge
     side panel.) */
  .inspector {
    flex: 0 0 auto;
    align-self: stretch;
    /* Every split is exactly a quarter of the screen: four tile to fill it, a
       fifth scrolls off (reached via the rail arrows), and opening one never
       resizes the others. A lone split shows the room beside it. The floor keeps
       it usable where a quarter would be too narrow. */
    width: 25%;
    min-width: min(300px, 100%);
    background: var(--pane-glass);
    backdrop-filter: blur(12px) saturate(1.15);
    -webkit-backdrop-filter: blur(12px) saturate(1.15);
    border-left: 1px solid #18262a;
    display: flex;
    flex-direction: column;
    min-height: 0;    user-select: none;
  }
  /* Compare view: two compact columns side by side (candidate | equipped), so
     both stay readable in the narrow pane without the old stacked-pairs crowding.
     Each socket is a colour-coded chip (emoji + truncated name + level); tapping
     opens its detail / picker. */
  .compare {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .compare-col {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  /* The equipped column reads a touch dimmer than the candidate. */
  .compare-col.equipped {
    opacity: 0.78;
  }
  .cmp-head {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }
  .cmp-tag {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6f7d7d;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The candidate's tag carries the teal accent so the live/editable column reads
     as the focus. */
  .cmp-tag.selected {
    color: #3cc7b8;
  }
  .cmp-tier {
    flex: none;
    font-size: 0.66rem;
    font-weight: 600;
    line-height: 1;
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid var(--tier-color, #5c6a6a);
    color: var(--tier-color, #849393);
    background: rgba(0, 0, 0, 0.3);
    font-variant-numeric: lining-nums;
  }
  .csockets {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  /* Sized to match a bag list row (same height / padding / emoji + name sizes)
     so the compare chips feel substantial rather than cramped. */
  .csocket {
    width: 100%;
    text-align: left;
    appearance: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    min-height: 52px;
    border: 1px solid #18262a;
    border-left: 4px solid var(--socket-color, #5c6a6a);
    border-radius: 8px;
    background: #0c1517;
    color: inherit;
    transition: border-color 100ms ease, background-color 100ms ease, box-shadow 100ms ease,
      opacity 100ms ease;
  }
  .csocket.interactive:not(:disabled) {
    cursor: pointer;
  }
  .csocket.draggable {
    touch-action: none;
  }
  .csocket:not(.filled):not(.add-hint) {
    opacity: 0.5;
  }
  .csocket.inert {
    opacity: 0.5;
  }
  .csocket.interactive:not(:disabled):hover {
    border-top-color: #374d52;
    border-right-color: #374d52;
    border-bottom-color: #374d52;
    background: #0f181b;
  }
  .csocket.selected,
  .csocket.armed {
    box-shadow: inset 0 0 0 2px #3cc7b8;
    opacity: 1;
  }
  .csocket.add-hint {
    opacity: 1;
    border-top-color: #2f6f69;
    border-right-color: #2f6f69;
    border-bottom-color: #2f6f69;
    animation: socket-add-pulse 1.8s ease-in-out infinite;
  }
  .csocket:disabled {
    cursor: not-allowed;
  }
  .csocket:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }
  .cs-emoji {
    flex: none;
    min-width: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.55rem;
    line-height: 1;
  }
  .csocket.add-hint .cs-emoji {
    color: #3cc7b8;
    font-weight: 700;
  }
  .cs-name {
    flex: 1;
    min-width: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #dde7e7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cs-name.empty {
    font-weight: 500;
    color: #667;
  }
  .cs-lv {
    flex: none;
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    color: #f0e0ff;
    background: rgba(124, 58, 200, 0.85);
    border: 1px solid #c084fc;
    font-variant-numeric: lining-nums;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    height: 76px;
    box-sizing: border-box;
    padding: 0 14px;
    border-bottom: 1px solid #18262a;
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
    color: #c0cdcd;
  }
  /* Tier badge + optional "Equipped" state badge sit on one row under the kind. */
  .badges {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .tier {
    font-size: 0.95rem;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid var(--tier-color, #5c6a6a);
    color: var(--tier-color, #849393);
    background: rgba(0, 0, 0, 0.3);
    font-variant-numeric: lining-nums;
  }
  /* "Equipped" status badge: teal, so a glance reads the item is currently worn
     (vs sitting in the bag / shop). */
  .state-badge.equipped {
    font-size: 0.78rem;
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
  .close {
    appearance: none;
    background: transparent;
    border: 1px solid #18262a;
    color: #c0cdcd;
    border-radius: 6px;
    width: 32px;
    height: 32px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .close:hover {
    background: #18262a;
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
    color: #6f7d7d;
    padding: 0 2px;
  }
  .sockets {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  /* Row wrapper around a single socket button (+ its inline unsocket ✕ and the
     gem picker that drops below it). */
  .socket-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  /* Relative anchor for the overlaid socket actions; the picker (a sibling
     below) spans the full width. */
  .socket-line,
  .csocket-wrap {
    position: relative;
  }
  /* Press feedback: dip the WHOLE socket row (the socket button + its overlaid
     ⇄ / ↥ actions) as ONE unit, so the action buttons move WITH the socket
     rather than staying put while only the socket scales. The socket button's
     own press scale is then suppressed so the two don't compound (one 0.96, not
     0.96²). Pressing an overlay button itself still dips just that button (its
     own :active), since the socket isn't active then. */
  .socket-line:has(.socket:active:not(:disabled)),
  .csocket-wrap:has(.csocket:active:not(:disabled)) {
    transform: scale(0.96);
  }
  .socket-line .socket:active:not(:disabled),
  .csocket-wrap .csocket:active:not(:disabled) {
    transform: none;
  }
  /* Socket actions OVERLAID on the top-right of a filled socket: "change" (⇄)
     + "unsocket" (↥), small icon buttons with a backdrop so they read over the
     socket. Sits above the cell (the cell reserves right padding via
     .has-actions so its content never slides under them). */
  /* A horizontal row on the right edge, VERTICALLY CENTRED so it sits the same
     way the bag list's row actions do (coherent look between bag + inspector).
     The ✕ stays anchored at the edge; ⇄ appears to its left when a swap exists. */
  .socket-overlay {
    position: absolute;
    top: 50%;
    right: 5px;
    transform: translateY(-50%);
    display: flex;
    flex-direction: row;
    gap: 3px;
    z-index: 2;
  }
  .ov-act {
    width: 22px;
    height: 22px;
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #28383d;
    border-radius: 5px;
    background: rgba(8, 14, 16, 0.92);
    color: #9fb0b0;
    font-size: 0.85rem;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
    transition: background-color 100ms ease, border-color 100ms ease, color 100ms ease;
  }
  .ov-act.change:hover {
    background: #102a28;
    border-color: #3cc7b8;
    color: #8fe6dc;
  }
  /* Unsocket (↥) just MOVES the gem back to the bag - it is not a destroy, so it
     stays neutral/blue rather than the red the bag's disenchant + destroy use
     (those share the ✕ glyph; the ↥ eject-arrow - a thin monochrome glyph like
     the ⇄ change icon, NOT a colour emoji - keeps this distinct + consistent). */
  .ov-act.remove {
    border-color: #28383d;
    color: #9fb0b0;
  }
  .ov-act.remove:hover {
    background: #11202a;
    border-color: #6aa9d8;
    color: #bfe0f5;
  }
  .ov-act:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }
  /* Reserve room on the right for the overlay actions so content never slides
     under them: one button (✕), or two (✕ + ⇄) when a swap is possible. */
  .socket.has-actions,
  .csocket.has-actions {
    padding-right: 34px;
  }
  .socket.has-actions-wide,
  .csocket.has-actions-wide {
    padding-right: 60px;
  }
  .socket {
    width: 100%;
    text-align: left;
    appearance: none;
    display: grid;
    grid-template-columns: 28px 1fr;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid #18262a;
    border-radius: 6px;
    background: #0c1517;
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
    border-color: #3cc7b8;
    box-shadow: inset 0 0 0 2px #3cc7b8;
    opacity: 1;
  }
  /* Gem currently open in the gem inspector. An inset ring, so the gem's colour
     left-border stays visible (no border-color override). */
  .socket.selected {
    box-shadow: inset 0 0 0 2px #3cc7b8;
    opacity: 1;
  }
  /* Empty socket with a fitting bag gem available: a teal pulse + "+" so it's
     obvious you can add one here (tap opens the picker). Recolours only the
     top/right/bottom edges, leaving the socket-colour left edge intact. */
  .socket.add-hint {
    opacity: 1;
    border-top-color: #2f6f69;
    border-right-color: #2f6f69;
    border-bottom-color: #2f6f69;
    animation: socket-add-pulse 1.8s ease-in-out infinite;
  }
  .socket.add-hint .socket-emoji {
    color: #3cc7b8;
    font-weight: 700;
  }
  @keyframes socket-add-pulse {
    0%,
    100% {
      box-shadow: inset 0 0 0 1px rgba(60, 199, 184, 0.3);
    }
    50% {
      box-shadow: inset 0 0 0 1px rgba(60, 199, 184, 0.75), 0 0 8px -2px rgba(60, 199, 184, 0.55);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .socket.add-hint {
      animation: none;
    }
  }
  /* Hover recolours only the top/right/bottom edges so the gem's colour
     left-border is never hidden. */
  .socket.interactive:not(:disabled):hover {
    border-top-color: #374d52;
    border-right-color: #374d52;
    border-bottom-color: #374d52;
    background: #0f181b;
  }
  /* Socket COLOUR: the left edge reads as the socket's colour (what fits
     here), on every socket - empty or filled. The role (effect / support) is
     carried separately by the .socket-role text badge on the right. */
  .socket {
    border-left: 4px solid var(--socket-color, #5c6a6a);
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
    border-color: #3cc7b8;
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
    outline: 2px solid #3cc7b8;
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
  /* Name line: gem name + level + role tag laid out inline (like the bag rows). */
  .socket-name {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 1.05rem;
    font-weight: 600;
    color: #dde7e7;
  }
  .socket-name-text {
    min-width: 0;
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
  .socket-summary {
    font-size: 0.88rem;
    color: #91a1a1;
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
  /* Role tag: a small pill inline beside the name (effect / support). */
  .socket-role {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6f7d7d;
    white-space: nowrap;
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

  /* Empty-socket gem picker: an inline dropdown under the tapped socket listing
     the loose bag gems that fit it. In-flow (not absolute) so it never clips
     against the scrolling body; the socket-colour accent ties it to its socket. */
  .socket-picker {
    margin: 2px 0 2px 8px;
    border: 1px solid #28383d;
    border-left: 3px solid var(--socket-color, #5c6a6a);
    border-radius: 8px;
    background: #0a1214;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .picker-head {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6f7d7d;
    padding: 2px 4px;
  }
  .picker-empty {
    font-size: 0.82rem;
    color: #647171;
    padding: 6px 4px;
    line-height: 1.35;
  }
  .picker-gem {
    width: 100%;
    text-align: left;
    appearance: none;
    display: grid;
    grid-template-columns: 24px 1fr;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: 1px solid #18262a;
    border-radius: 6px;
    background: #0c1517;
    color: inherit;
    cursor: pointer;
    min-height: 40px;
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .picker-gem:hover {
    background: #122019;
    border-color: #4caf6a;
  }
  .picker-gem:focus-visible {
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }
  .picker-emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 1.3rem;
    line-height: 1;
    justify-self: center;
  }
  .picker-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .picker-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: #dde7e7;
  }
  .picker-summary {
    font-size: 0.8rem;
    color: #91a1a1;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
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
    background: var(--swatch, #5c6a6a);
    border: 1px solid rgba(255, 255, 255, 0.35);
    box-shadow: 0 0 6px var(--swatch, #5c6a6a);
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
    outline: 2px solid #3cc7b8;
    outline-offset: 2px;
  }

  .footer {
    padding: 12px 14px;
    border-top: 1px solid #18262a;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
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
</style>
