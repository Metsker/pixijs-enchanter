// Shop stock generation per docs/shop.md. Numbers from the doc's placeholder
// pricing table; tier distribution biased by floor depth.

import type { Item } from './item';
import type { Gem } from './gem';
import { randomItem, randomGem } from './random';

export interface ShopItemSlot {
  item: Item;
  price: number;
}

export interface ShopGemSlot {
  gem: Gem;
  price: number;
}

export interface ShopStock {
  items: (ShopItemSlot | null)[];
  gems: (ShopGemSlot | null)[];
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

// Gems are build-defining and tier-less; price them in a flat band that
// drifts up with floor depth so late-shop gems cost more than early ones.
function rollGemPrice(floor: number): number {
  return Math.floor(rand(80, 160) + floor * 10);
}

export function generateShopStock(floor: number): ShopStock {
  const items: (ShopItemSlot | null)[] = Array.from({ length: 3 }, () => {
    const tier = rollTier(floor);
    return { item: randomItem(tier, 'shop'), price: rollPrice(tier) };
  });

  const gems: (ShopGemSlot | null)[] = Array.from({ length: 3 }, () => ({
    gem: randomGem(),
    price: rollGemPrice(floor),
  }));

  return {
    items,
    gems,
    crystals: {
      remaining: 50 + Math.floor(Math.random() * 51), // 50..100
      perPackSize: 10,
      pricePerCrystal: 3,
    },
  };
}
