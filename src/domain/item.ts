import type { Enchantment } from './enchant';
import { EQUIPMENT_SLOTS } from './equipment';

export type ItemType = 'weapon' | 'shield' | 'armor' | 'ring' | 'amulet';

// Armor items are further specialised to one of the four armor slots.
// Non-armor items have armorSlot = undefined.
export type ArmorSlot = 'helm' | 'chest' | 'gloves' | 'boots';

export interface Item {
  id: string;
  itemType: ItemType;
  armorSlot?: ArmorSlot;
  // Length is the item's Tier per ADR-0002 ("tier equals current enchant count").
  // Slot 1 sits at the base; later slots alternate main / utility.
  // Tier 7 adds a Unique-slot enchant - separate from this list; modelled later.
  enchants: Enchantment[];
}

export function tierOf(item: Item): number {
  return item.enchants.length;
}

export function itemEmoji(item: Item): string {
  switch (item.itemType) {
    case 'weapon':
      return EQUIPMENT_SLOTS.weapon.emoji;
    case 'shield':
      return EQUIPMENT_SLOTS.offhand.emoji;
    case 'armor':
      return item.armorSlot ? EQUIPMENT_SLOTS[item.armorSlot].emoji : '🛡️';
    case 'ring':
      return EQUIPMENT_SLOTS.ring1.emoji;
    case 'amulet':
      return EQUIPMENT_SLOTS.amulet.emoji;
  }
}
