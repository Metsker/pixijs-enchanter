import { get, writable } from 'svelte/store';
import type { ShopStock } from '../domain/shop';
import { generateShopStock } from '../domain/shop';
import { backpack, addItem, addGemToBackpack } from './backpack';
import { addGold, topbar } from './topbar';
import { closeInspector, inspector } from './inspector';
import { canEquipDirect, equipItemDirect } from './inventory';
import type { EquipmentSlotId } from '../domain/equipment';
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
  addItem(slot.item);
  sfx.buy();

  shopStock.update((s) => {
    if (!s) return s;
    const items = s.items.slice();
    items[shopIndex] = null;
    return { ...s, items };
  });

  // Close the Inspector if it was pointed at this shop slot.
  const ins = get(inspector);
  if (ins?.source === 'shop' && ins.index === shopIndex) closeInspector();
  return true;
}

// === Buy and Equip in one action ====================================
// Bypasses the Backpack entirely; goes from shop slot straight to the
// first empty legal Inventory slot. Doesn't require Backpack space,
// but does require an empty legal Inventory slot.
export function canBuyAndEquipItem(shopIndex: number): { ok: boolean; reasonKey?: string } {
  const stock = get(shopStock);
  if (!stock) return { ok: false };
  const slot = stock.items[shopIndex];
  if (!slot) return { ok: false };
  if (get(topbar).gold < slot.price) return { ok: false, reasonKey: 'shop.cta.notEnoughGold' };
  if (!canEquipDirect(slot.item)) return { ok: false, reasonKey: 'shop.cta.backpackFull' };
  return { ok: true };
}

export function buyAndEquipItem(shopIndex: number): EquipmentSlotId | null {
  const stock = get(shopStock);
  if (!stock) return null;
  const slot = stock.items[shopIndex];
  if (!slot) return null;
  if (!canBuyAndEquipItem(shopIndex).ok) return null;

  const item = slot.item;
  const clearShopSlot = (): void => {
    shopStock.update((s) => {
      if (!s) return s;
      const items = s.items.slice();
      items[shopIndex] = null;
      return { ...s, items };
    });
  };
  const closeIfInspectingThis = (): void => {
    const ins = get(inspector);
    if (ins?.source === 'shop' && ins.index === shopIndex) closeInspector();
  };

  // Single legal slot per type now, so equipItemDirect always resolves (empty
  // slot, or swap with the displaced item going to the bag) - no slot-select.
  if (!spendGold(slot.price)) return null;
  const landed = equipItemDirect(item);
  if (landed === null) {
    // Safety refund if equip fell through after our pre-check
    // somehow (shouldn't happen).
    addGold(slot.price);
    return null;
  }
  sfx.buy();
  clearShopSlot();
  closeIfInspectingThis();
  return landed;
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
