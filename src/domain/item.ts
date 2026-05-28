import type { Enchantment, EnchantLayer } from './enchant';
import { EQUIPMENT_SLOTS, type EquipmentSlotId } from './equipment';

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
  // 1-indexed slot positions that have been Lock-selected. Sealed slots are
  // protected from Reroll All / Reroll Mains / Reroll Utilities / Disenchant
  // top / Remove selected. Only Destroy pops a sealed slot.
  sealedSlots?: number[];
  // Per-item visual variant override (e.g. weapons roll a random sword /
  // axe / spear / bow icon at generation time). Purely cosmetic - all
  // weapons share the same combat math regardless of icon. When unset,
  // itemEmoji falls back to the slot's default emoji.
  icon?: string;
}

export function isSealed(item: Item, slotIndex1Based: number): boolean {
  return item.sealedSlots?.includes(slotIndex1Based) ?? false;
}

// Enchant-stack alternation per CONTEXT.md § Enchant stack:
// slot 1 = main, 2 = utility, 3 = main, ..., 6 = utility, 7 = unique (tier 7).
export type StackLayer = EnchantLayer | 'unique';
export const STACK_HEIGHT = 6;
export function stackLayerAt(slotIndex1Based: number): StackLayer {
  if (slotIndex1Based === 7) return 'unique';
  return slotIndex1Based % 2 === 1 ? 'main' : 'utility';
}

export function tierOf(item: Item): number {
  return item.enchants.length;
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
