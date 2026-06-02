// Add-socket: append an empty socket to an OWNED item, raising its tier. This is
// the item-improvement lever, available ANYWHERE the player can inspect their
// gear - it is deliberately decoupled from the Rest bench (which now only crafts
// / destroys gems, see rest.ts). Costs crystals scaling with the item's current
// tier - placeholders, tuned here in one place.

import { get } from 'svelte/store';
import { tierOf, type Item } from '../domain/item';
import type { SocketColor } from '../domain/gem';
import { rollSocketColorForType } from '../domain/random';
import { writeItem } from './gem-move';
import { spendCrystals, topbar } from './topbar';

// An item can never exceed this many sockets.
export const MAX_SOCKET_TIER = 6;

// Crystal cost to add a socket to an item at its current tier (placeholder).
export function addSocketCost(item: Item): number {
  return 40 + 25 * tierOf(item);
}

// True if `item` can still take another socket (under the tier cap).
export function canAddSocket(item: Item): boolean {
  return tierOf(item) < MAX_SOCKET_TIER;
}

// True if the player can currently afford to add a socket to `item`.
export function canAffordAddSocket(item: Item): boolean {
  return get(topbar).crystals >= addSocketCost(item);
}

// Add one empty socket to `item`: spend the tier-scaled crystal cost and
// persist through the shared item write-back (so it lands on the equipped /
// backpack store and the open Inspector re-derives). The new socket's colour
// is `color` when given (the UI pre-rolls it so the Add-socket button can
// preview the exact colour the player will get), else rolled here from the
// item type's pool. No-op (returns false) if the item is at the tier cap or
// the player can't afford it - no crystals are spent in either case.
export function addSocketToItem(
  item: Item,
  color: SocketColor = rollSocketColorForType(item.itemType),
): boolean {
  if (!canAddSocket(item)) return false;
  if (!spendCrystals(addSocketCost(item))) return false;
  writeItem({
    ...item,
    sockets: [...item.sockets, null],
    socketColors: [...item.socketColors, color],
  });
  return true;
}
