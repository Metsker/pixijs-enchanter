import type { Enchantment } from './enchant';

export type ItemType = 'weapon' | 'shield' | 'armor' | 'ring' | 'amulet';

export interface Item {
  id: string;
  itemType: ItemType;
  // Length is the item's Tier per ADR-0002 ("tier equals current enchant count").
  // Slot 1 sits at the base; later slots alternate main / utility.
  // Tier 7 adds a Unique-slot enchant - separate from this list; modelled later.
  enchants: Enchantment[];
}
