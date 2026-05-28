// Shop stock generation per docs/shop.md. Numbers from the doc's placeholder
// pricing table; tier distribution biased by floor depth.

import type { Item } from './item';
import { randomItem } from './random';

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
  1: [40, 80],
  2: [100, 180],
  3: [240, 400],
  4: [600, 900],
  5: [1200, 1700],
  6: [2400, 3400],
};

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
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

export function generateShopStock(floor: number): ShopStock {
  const items: (ShopItemSlot | null)[] = Array.from({ length: 6 }, () => {
    const tier = rollTier(floor);
    return { item: randomItem(tier, 'shop'), price: rollPrice(tier) };
  });

  return {
    items,
    emptyScrolls: { remaining: 3, unitPrice: 75 },
    seals: { remaining: 3 + (Math.random() < 0.5 ? 0 : 1), unitPrice: 125 },
    crystals: {
      remaining: 50 + Math.floor(Math.random() * 51), // 50..100
      perPackSize: 10,
      pricePerCrystal: 3,
    },
  };
}
