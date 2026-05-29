// Gem <-> socket class compatibility (see docs/gems.md § Gems, ADR 0005).
//
// A gem only fits a socket of its own class. The item-class mapping
// (weapon / shield -> weapon-class; armor -> armor-class; ring / amulet ->
// jewelry-class) is the single source of truth here, reused by item drop
// generation (random.ts § rollSockets) and by the held-gem move logic
// (state/gem-move.ts) so the two can never disagree.

import type { Gem, GemClass, GemDef } from './gem';
import { GEM_CATALOGUE } from './gem-catalogue';
import type { Item, ItemType } from './item';

// The raw item-type -> gem-class mapping. weapon / shield share the weapon
// pool; ring / amulet share the jewelry pool; armor stands alone.
export function gemClassForItemType(itemType: ItemType): GemClass {
  if (itemType === 'weapon' || itemType === 'shield') return 'weapon';
  if (itemType === 'armor') return 'armor';
  return 'jewelry';
}

// Which gem class an item's sockets accept.
export function gemClassForItem(item: Item): GemClass {
  return gemClassForItemType(item.itemType);
}

// The catalogue definition a placed gem instance refers to (undefined for an
// unknown defId, which should not happen for catalogue-sourced gems).
function defOf(gem: Gem): GemDef | undefined {
  return GEM_CATALOGUE[gem.defId];
}

// True when `gem` may be placed into a socket of `item` - i.e. their classes
// match. An unknown defId never fits (defensive; keeps a corrupt save from
// slotting a phantom gem).
export function gemFitsSocketOf(gem: Gem, item: Item): boolean {
  const def = defOf(gem);
  if (!def) return false;
  return def.class === gemClassForItem(item);
}
