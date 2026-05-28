import { ENCHANT_CATALOGUE } from './enchant-catalogue';
import type { Enchantment, EnchantLayer, EnchantPool } from './enchant';
import type { ArmorSlot, Item, ItemType } from './item';
import { stackLayerAt } from './item';

// Item-pool mapping per CONTEXT.md § Equipment slot table:
// weapon -> Weapons, shield/armor -> Armor, ring/amulet -> Jewelry.
export function itemPoolFor(itemType: string): EnchantPool {
  if (itemType === 'weapon') return 'weapons';
  if (itemType === 'shield' || itemType === 'armor') return 'armor';
  return 'jewelry';
}

// Eligible catalogue entries for a roll: must include the item's pool, match
// the required layer, and NOT be unique (unique enchants only come from
// boss-dropped Unique scrolls).
export function eligibleEnchants(pool: EnchantPool, layer: EnchantLayer): Enchantment[] {
  return Object.values(ENCHANT_CATALOGUE).filter(
    (e) => e.pools.includes(pool) && e.layer === layer && !e.pools.includes('unique'),
  );
}

export function pickRandomEnchant(pool: EnchantPool, layer: EnchantLayer): Enchantment {
  const choices = eligibleEnchants(pool, layer);
  return choices[Math.floor(Math.random() * choices.length)];
}

const ALL_ITEM_TYPES: ItemType[] = ['weapon', 'shield', 'armor', 'ring', 'amulet'];
const ALL_ARMOR_SLOTS: ArmorSlot[] = ['helm', 'chest', 'gloves', 'boots'];

// Cosmetic-only icon pools, keyed by itemType (or armorSlot for armor
// since helm/chest/gloves/boots each get their own pool). Every item
// rolls one icon at generation time. Strictly visual - all items of
// the same type share the same combat math regardless of icon. Add
// new icons by appending to the relevant pool.
const ICON_POOLS: Record<string, string[]> = {
  weapon: ['⚔️', '🗡️', '🪓', '🔱', '🔨', '🏹'],
  shield: ['🛡️'],
  helm: ['🪖', '👑', '🎩', '🎓'],
  chest: ['🦺', '👕', '🧥', '👘'],
  gloves: ['🧤', '🥊'],
  boots: ['🥾', '👞', '👟', '🥿', '👢'],
  ring: ['💍'],
  amulet: ['📿', '🧿', '🔮'],
};

function iconFor(itemType: ItemType, armorSlot?: ArmorSlot): string | undefined {
  const key = itemType === 'armor' && armorSlot ? armorSlot : itemType;
  const pool = ICON_POOLS[key];
  return pool && pool.length > 0 ? pick(pool) : undefined;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

let itemCounter = 0;
function nextItemId(prefix: string): string {
  itemCounter += 1;
  return `${prefix}-${Date.now()}-${itemCounter}`;
}

export function randomItem(tier: number, idPrefix = 'item'): Item {
  const itemType = pick(ALL_ITEM_TYPES);
  return buildItem(itemType, tier, idPrefix);
}

export function randomWeapon(tier: number, idPrefix = 'weapon'): Item {
  return buildItem('weapon', tier, idPrefix);
}

function buildItem(itemType: ItemType, tier: number, idPrefix: string): Item {
  const armorSlot = itemType === 'armor' ? pick(ALL_ARMOR_SLOTS) : undefined;
  const pool = itemPoolFor(itemType);
  const enchants = Array.from({ length: tier }, (_, i) => {
    const layer = stackLayerAt(i + 1) as EnchantLayer;
    return pickRandomEnchant(pool, layer);
  });
  const icon = iconFor(itemType, armorSlot);
  return { id: nextItemId(idPrefix), itemType, armorSlot, enchants, icon };
}
