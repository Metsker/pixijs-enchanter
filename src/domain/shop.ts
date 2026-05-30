// Shop stock generation per docs/shop.md. Numbers from the doc's placeholder
// pricing table; tier distribution biased by floor depth.

import { tierOf, type Item } from './item';
import { gemLevel, type Gem } from './gem';
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

// === Selling back to the shop =======================================
// The shop buys gear / gems back for SELL_FRACTION of their market value (gold,
// not crystals - that's disenchanting). An item is worth its tier value plus the
// value of every gem still socketed in it, so selling socketed gear isn't a trap.
export const SELL_FRACTION = 0.5;
// Flat market value for a tier-less gem (≈ the midpoint of rollGemPrice's band),
// scaled by combine level.
const GEM_MARKET_VALUE = 120;

export function gemSellValue(gem: Gem): number {
  return Math.floor(GEM_MARKET_VALUE * gemLevel(gem) * SELL_FRACTION);
}

export function itemSellValue(item: Item): number {
  const [lo, hi] = TIER_PRICE_RANGE[tierOf(item)] ?? [100, 200];
  const frame = Math.floor(((lo + hi) / 2) * SELL_FRACTION);
  const gems = item.sockets.reduce((sum, g) => sum + (g ? gemSellValue(g) : 0), 0);
  return frame + gems;
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
