import type { Gem } from './gem';
import { EQUIPMENT_SLOTS, type EquipmentSlotId } from './equipment';

// Discriminate an Item from a loose Gem in a shared backpack slot. An Item is
// the one carrying `itemType`; a Gem never does (it has `defId`). Counterpart
// to isGem in gem.ts; kept here because it references the Item shape.
export function isItem(v: Item | Gem | null | undefined): v is Item {
  return v != null && (v as Item).itemType !== undefined;
}

export type ItemType = 'weapon' | 'shield' | 'armor' | 'ring' | 'amulet';

// Armor items are further specialised to one of the four armor slots.
// Non-armor items have armorSlot = undefined.
export type ArmorSlot = 'helm' | 'chest' | 'gloves' | 'boots';

export interface Item {
  id: string;
  itemType: ItemType;
  armorSlot?: ArmorSlot;
  // An ordered list of sockets (see docs/gems.md § Sockets). The length is
  // the item's capacity, replacing the old "tier = enchant count" idea. Each
  // socket holds a Gem instance of the item's class or is empty (null). Order
  // is player-controlled and drives the per-item gem resolution.
  sockets: (Gem | null)[];
  // Per-item visual variant override (e.g. weapons roll a random sword /
  // axe / spear / bow icon at generation time). Purely cosmetic - all
  // weapons share the same combat math regardless of icon. When unset,
  // itemEmoji falls back to the slot's default emoji.
  icon?: string;
}

// Tier is the displayed power level; each tier grants TWO sockets
// (T1 = 2 sockets, T2 = 4, ...). tierOf maps a socket capacity back to its
// tier. ceil keeps any legacy odd-capacity item readable.
export function tierOf(item: Item): number {
  return Math.ceil(item.sockets.length / 2);
}

export function itemEmoji(item: Item): string {
  if (item.icon) return item.icon;
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

// Which equipment slots can this item be equipped into?
// Weapons go to weapon or offhand; shields only to offhand; rings to either
// ring slot; armor to its specific sub-slot; amulets to amulet.
export function legalEquipmentSlots(item: Item): EquipmentSlotId[] {
  switch (item.itemType) {
    case 'weapon':
      return ['weapon', 'offhand'];
    case 'shield':
      return ['offhand'];
    case 'armor':
      return item.armorSlot ? [item.armorSlot] : ['helm', 'chest', 'gloves', 'boots'];
    case 'ring':
      return ['ring1', 'ring2'];
    case 'amulet':
      return ['amulet'];
  }
}
