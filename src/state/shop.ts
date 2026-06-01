import { get, writable } from 'svelte/store';
import type { ShopStock } from '../domain/shop';
import { generateShopStock, itemSellValue, gemSellValue } from '../domain/shop';
import { isItem } from '../domain/item';
import { backpack, addItem, addGemToBackpack, removeItem, removeBackpackGemById } from './backpack';
import { addGold, topbar } from './topbar';
import { closeInspector, inspector } from './inspector';
import { gemInspector } from './gem-inspector';
import { heldGem } from './gem-move';
import { sfx } from '../audio/sfx';

export const shopStock = writable<ShopStock | null>(null);

export function openShopForFloor(floor: number): void {
  shopStock.set(generateShopStock(floor));
}

export function closeShop(): void {
  shopStock.set(null);
}

function spendGold(amount: number): boolean {
  let ok = false;
  topbar.update((s) => {
    if (s.gold < amount) return s;
    ok = true;
    return { ...s, gold: s.gold - amount };
  });
  return ok;
}

// === Buy an item ====================================================
export function canBuyItem(shopIndex: number): { ok: boolean; reasonKey?: string } {
  const stock = get(shopStock);
  if (!stock) return { ok: false };
  const slot = stock.items[shopIndex];
  if (!slot) return { ok: false };
  if (get(topbar).gold < slot.price) return { ok: false, reasonKey: 'shop.cta.notEnoughGold' };
  if (!get(backpack).includes(null)) return { ok: false, reasonKey: 'shop.cta.backpackFull' };
  return { ok: true };
}

export function buyItem(shopIndex: number): boolean {
  const stock = get(shopStock);
  if (!stock) return false;
  const slot = stock.items[shopIndex];
  if (!slot) return false;
  if (!canBuyItem(shopIndex).ok) return false;

  if (!spendGold(slot.price)) return false;
  const landed = addItem(slot.item);
  sfx.buy();

  shopStock.update((s) => {
    if (!s) return s;
    const items = s.items.slice();
    items[shopIndex] = null;
    return { ...s, items };
  });

  // The item is now OWNED: if the Inspector was on this shop slot, re-point it
  // to the bag item so it shows the owned actions (equip / sell / disenchant)
  // instead of a (now-disabled) Buy. Otherwise the Inspector is left alone.
  const ins = get(inspector);
  if (ins?.source === 'shop' && ins.index === shopIndex) {
    const owned = get(backpack)[landed];
    if (isItem(owned)) inspector.set({ source: 'backpack', index: landed, item: owned });
  }
  return true;
}

// === Buy a gem ======================================================
// Gems go straight to the Backpack (they aren't equipped from the shop -
// the player sockets them later at Rest).
export function canBuyGem(shopIndex: number): { ok: boolean; reasonKey?: string } {
  const stock = get(shopStock);
  if (!stock) return { ok: false };
  const slot = stock.gems[shopIndex];
  if (!slot) return { ok: false };
  if (get(topbar).gold < slot.price) return { ok: false, reasonKey: 'shop.cta.notEnoughGold' };
  if (!get(backpack).includes(null)) return { ok: false, reasonKey: 'shop.cta.backpackFull' };
  return { ok: true };
}

export function buyGem(shopIndex: number): boolean {
  const stock = get(shopStock);
  if (!stock) return false;
  const slot = stock.gems[shopIndex];
  if (!slot) return false;
  if (!canBuyGem(shopIndex).ok) return false;

  if (!spendGold(slot.price)) return false;
  addGemToBackpack(slot.gem);
  sfx.buy();

  shopStock.update((s) => {
    if (!s) return s;
    const gems = s.gems.slice();
    gems[shopIndex] = null;
    return { ...s, gems };
  });

  // The gem is now OWNED: if its shop preview was open, drop the shop flag so
  // the gem window shows the owned actions (insert / combine / sell / destroy)
  // instead of Buy.
  const gi = get(gemInspector);
  if (gi?.shop?.index === shopIndex) gemInspector.set({ gem: slot.gem });
  return true;
}

// === Sell to the shop ===============================================
// Selling is only offered while a shop is open (the bag shows a Sell drop-zone).
// Gold flows back at SELL_FRACTION; the topbar's coin sfx fires off addGold.

// Sell the backpack item at `index` (and the value of any gems socketed in it).
// Closes the Inspector if it was pointed at this tile. Returns true if sold.
export function sellItemFromBackpack(index: number): boolean {
  const slot = get(backpack)[index];
  if (!isItem(slot)) return false;
  const value = itemSellValue(slot);
  removeItem(index);
  addGold(value);
  const ins = get(inspector);
  if (ins?.source === 'backpack' && ins.index === index) closeInspector();
  return true;
}

// Sell a loose backpack gem by instance id. Returns true if sold.
export function sellGemFromBackpack(gemId: string): boolean {
  const removed = removeBackpackGemById(gemId);
  if (!removed) return false;
  addGold(gemSellValue(removed));
  return true;
}

// Sell the gem currently HELD by a drag (already lifted out of its origin):
// credit gold and consume it. Returns true if a gem was held.
export function sellHeldGem(): boolean {
  const held = get(heldGem);
  if (!held) return false;
  addGold(gemSellValue(held.gem));
  heldGem.set(null);
  return true;
}

// === Buy a crystal pack =============================================
export function buyCrystalPack(): boolean {
  const stock = get(shopStock);
  if (!stock) return false;
  const packSize = Math.min(stock.crystals.perPackSize, stock.crystals.remaining);
  if (packSize <= 0) return false;
  const packPrice = packSize * stock.crystals.pricePerCrystal;
  if (!spendGold(packPrice)) return false;
  topbar.update((s) => ({ ...s, crystals: s.crystals + packSize }));
  shopStock.update((s) => {
    if (!s) return s;
    return {
      ...s,
      crystals: { ...s.crystals, remaining: s.crystals.remaining - packSize },
    };
  });
  return true;
}
