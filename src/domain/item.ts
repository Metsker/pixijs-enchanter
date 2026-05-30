import type { Gem, SocketColor } from './gem';
import { EQUIPMENT_SLOTS, type EquipmentSlotId } from './equipment';

// Discriminate an Item from a loose Gem in a shared backpack slot. An Item is
// the one carrying `itemType`; a Gem never does (it has `defId`). Counterpart
// to isGem in gem.ts; kept here because it references the Item shape.
export function isItem(v: Item | Gem | null | undefined): v is Item {
  return v != null && (v as Item).itemType !== undefined;
}

export type ItemType = 'weapon' | 'shield' | 'armor' | 'ring' | 'belt' | 'amulet';

// Armor items are further specialised to one of the four armor slots.
// Non-armor items have armorSlot = undefined.
export type ArmorSlot = 'helm' | 'chest' | 'gloves' | 'boots';

export interface Item {
  id: string;
  itemType: ItemType;
  armorSlot?: ArmorSlot;
  // An ordered list of sockets (see docs/gems.md § Sockets). The length is
  // the item's capacity, replacing the old "tier = enchant count" idea. Each
  // socket holds a Gem instance whose colour matches socketColors[i], or is
  // empty (null). Order is player-controlled and drives the per-item gem
  // resolution.
  sockets: (Gem | null)[];
  // The colour of each socket, parallel to `sockets` (index i is the colour of
  // socket i, so socketColors.length === sockets.length). A gem fits socket i
  // iff gemColor(gem) === socketColors[i] (see gem-fit.ts). Kept as a parallel
  // array - NOT folded into the socket objects - so the resolution / move /
  // display code that reads sockets[i] as a gem stays untouched.
  socketColors: SocketColor[];
  // Per-item visual variant override (e.g. weapons roll a random sword /
  // axe / spear / bow icon at generation time). Purely cosmetic - all
  // weapons share the same combat math regardless of icon. When unset,
  // itemEmoji falls back to the slot's default emoji.
  icon?: string;
}

// Tier is now the socket capacity (how many gems the item can hold).
export function tierOf(item: Item): number {
  return item.sockets.length;
}

// Compact "filled/total" socket occupancy for item tiles (FEATURE 4): total is
// the tier (socket capacity), filled is the count of non-empty sockets. Shown
// in place of the bare "T{tier}" badge so a tile reads how full it is.
export function socketSummary(item: Item): { filled: number; total: number } {
  const total = item.sockets.length;
  const filled = item.sockets.reduce((n, s) => (s ? n + 1 : n), 0);
  return { filled, total };
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
      return EQUIPMENT_SLOTS.ring.emoji;
    case 'belt':
      return EQUIPMENT_SLOTS.belt.emoji;
    case 'amulet':
      return EQUIPMENT_SLOTS.amulet.emoji;
  }
}

// Which equipment slot can this item be equipped into? Every type maps to
// exactly ONE slot now (no doubled ring / weapon-offhand), so equipping is
// always a clean 1:1 swap and there's no slot-select step. Weapons -> weapon,
// shields -> the shield-only offhand, rings -> ring, belts -> belt, armor to
// its sub-slot, amulets -> amulet.
export function legalEquipmentSlots(item: Item): EquipmentSlotId[] {
  switch (item.itemType) {
    case 'weapon':
      return ['weapon'];
    case 'shield':
      return ['offhand'];
    case 'armor':
      return item.armorSlot ? [item.armorSlot] : ['helm', 'chest', 'gloves', 'boots'];
    case 'ring':
      return ['ring'];
    case 'belt':
      return ['belt'];
    case 'amulet':
      return ['amulet'];
  }
}
