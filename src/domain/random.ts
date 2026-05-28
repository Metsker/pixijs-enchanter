import { ENCHANT_CATALOGUE } from './enchant-catalogue';
import type { Enchantment, EnchantLayer, EnchantPool } from './enchant';

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
