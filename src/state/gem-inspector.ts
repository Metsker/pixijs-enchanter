import { get, writable } from 'svelte/store';
import type { Gem } from '../domain/gem';

// The gem-detail "window": one reusable read-out for a single gem (description,
// destroy value, the level-up delta, what it can combine with, and which gear it
// fits), opened from anywhere a gem is shown - the bag, the Inspector stash, a
// socket, the Rest stash, the victory chest, and the shop.
//
// The subject carries the gem plus a SOURCE that decides which actions the
// window offers, so the same component serves every surface:
//   - owned  (bag / stash / socket / rest / chest): Insert into fitting gear +
//             Destroy (loose gems). The gem is the player's to move.
//   - shop:   PREVIEW only - no insert/destroy - plus a Buy action. Lets the
//             player read exactly what a gem does before paying for it.
//
// The gem window sits ON TOP of the item Inspector (it's a modal) and leaves it
// open underneath, so the SELECTED item stays selected - closing the gem window
// reveals it again. The gem is snapshotted by value; the fit / combine lists
// re-derive live from the inventory stores.
export interface GemInspectSubject {
  gem: Gem;
  // Present only for shop stock: the slot to buy and its price. Its presence is
  // what flips the window into preview+buy (non-owned) mode.
  shop?: { index: number; price: number };
}

export const gemInspector = writable<GemInspectSubject | null>(null);

// True when the gem window is already showing this exact gem - a second click
// on the same entry should toggle it off.
function isShowing(gem: Gem): boolean {
  return get(gemInspector)?.gem.id === gem.id;
}

// Inspect a gem the player OWNS (bag / stash / socket / rest / victory chest):
// the window offers Insert + Destroy. Toggles off on a repeat click of the same gem.
export function inspectGem(gem: Gem): void {
  if (isShowing(gem)) {
    gemInspector.set(null);
    return;
  }
  gemInspector.set({ gem });
}

// Inspect a SHOP gem: preview only, with a Buy action. The player isn't holding
// it, so it can't be inserted or destroyed. Toggles off on a repeat click.
export function inspectShopGem(gem: Gem, index: number, price: number): void {
  if (isShowing(gem)) {
    gemInspector.set(null);
    return;
  }
  gemInspector.set({ gem, shop: { index, price } });
}

export function closeGemInspector(): void {
  gemInspector.set(null);
}
