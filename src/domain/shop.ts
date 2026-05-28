// Shop stock generation per docs/shop.md. Numbers from the doc's placeholder
// pricing table; tier distribution biased by floor depth.

import type { ArmorSlot, Item, ItemType } from './item';
import type { EnchantLayer } from './enchant';
import { itemPoolFor, pickRandomEnchant } from './random';
import { stackLayerAt } from './item';

export interface ShopItemSlot {
  item: Item;
  price: number;
}

export interface ShopStock {
  items: (ShopItemSlot | null)[];
  emptyScrolls: { remaining: number; unitPrice: number };
  seals: { remaining: number; unitPrice: number };
  crystals: { remaining: number; perPackSize: number; pricePerCrystal: number };
}

const TIER_PRICE_RANGE: Record<number, [number, number]> = {
  1: [80, 150],
  2: [200, 350],
  3: [500, 800],
  4: [1200, 1800],
  5: [2500, 3500],
  6: [5000, 7000],
};

const ALL_ITEM_TYPES: ItemType[] = ['weapon', 'shield', 'armor', 'ring', 'amulet'];
const ALL_ARMOR_SLOTS: ArmorSlot[] = ['helm', 'chest', 'gloves', 'boots'];

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rollTier(floor: number): number {
  if (floor <= 3) return Math.random() < 0.8 ? 1 : 2;
  if (floor <= 6) {
    const r = Math.random();
    if (r < 0.5) return 2;
    if (r < 0.85) return 3;
    return 4;
  }
  const r = Math.random();
  if (r < 0.4) return 3;
  if (r < 0.75) return 4;
  if (r < 0.95) return 5;
  return 6;
}

function rollPrice(tier: number): number {
  const range = TIER_PRICE_RANGE[tier] ?? [100, 200];
  return Math.floor(rand(range[0], range[1]));
}

let shopItemCounter = 0;
function nextShopItemId(): string {
  shopItemCounter += 1;
  return `shop-${Date.now()}-${shopItemCounter}`;
}

function randomItem(tier: number): Item {
  const itemType = pick(ALL_ITEM_TYPES);
  const armorSlot = itemType === 'armor' ? pick(ALL_ARMOR_SLOTS) : undefined;
  const pool = itemPoolFor(itemType);
  const enchants = Array.from({ length: tier }, (_, i) => {
    const layer = stackLayerAt(i + 1) as EnchantLayer;
    return pickRandomEnchant(pool, layer);
  });
  return { id: nextShopItemId(), itemType, armorSlot, enchants };
}

export function generateShopStock(floor: number): ShopStock {
  const items: (ShopItemSlot | null)[] = Array.from({ length: 6 }, () => {
    const tier = rollTier(floor);
    return { item: randomItem(tier), price: rollPrice(tier) };
  });

  return {
    items,
    emptyScrolls: { remaining: 3, unitPrice: 150 },
    seals: { remaining: 3 + (Math.random() < 0.5 ? 0 : 1), unitPrice: 250 },
    crystals: {
      remaining: 50 + Math.floor(Math.random() * 51), // 50..100
      perPackSize: 10,
      pricePerCrystal: 5,
    },
  };
}
