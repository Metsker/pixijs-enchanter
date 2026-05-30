import type { ArmorSlot, Item, ItemType } from './item';
import type { Gem, GemClass } from './gem';
import { GEM_CATALOGUE } from './gem-catalogue';
import { gemClassForItemType } from './gem-fit';

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

let gemCounter = 0;
function nextGemId(): string {
  gemCounter += 1;
  return `gem-${Date.now()}-${gemCounter}`;
}

// Catalogue defIds grouped by class, computed once. Used to pre-socket
// freshly-dropped items with a couple of class-matched gems.
const GEM_IDS_BY_CLASS: Record<GemClass, string[]> = (() => {
  const acc: Record<GemClass, string[]> = { weapon: [], armor: [], jewelry: [] };
  for (const def of Object.values(GEM_CATALOGUE)) {
    acc[def.class].push(def.id);
  }
  return acc;
})();

// Build the item's socket list: a capacity-length (Gem | null)[] where
// 1-2 leading sockets carry random class-matched gem instances and the
// rest are empty. Pre-socketing gives a freshly-dropped item something
// to do in combat until the player rearranges it at Rest (a later phase).
function rollSockets(capacity: number, gemClass: GemClass): (Gem | null)[] {
  const sockets: (Gem | null)[] = Array.from({ length: capacity }, () => null);
  const pool = GEM_IDS_BY_CLASS[gemClass];
  if (pool.length === 0) return sockets;
  const count = Math.min(capacity, 1 + Math.floor(Math.random() * 2)); // 1 or 2
  for (let i = 0; i < count; i++) {
    sockets[i] = { id: nextGemId(), defId: pick(pool) };
  }
  return sockets;
}

export function randomItem(tier: number, idPrefix = 'item'): Item {
  const itemType = pick(ALL_ITEM_TYPES);
  return buildItem(itemType, tier, idPrefix);
}

export function randomWeapon(tier: number, idPrefix = 'weapon'): Item {
  return buildItem('weapon', tier, idPrefix);
}

// Each tier grants TWO sockets (T1 = 2, T2 = 4, ...). Tier is clamped to at
// least 1 so every item has room for a couple of gems.
function buildItem(itemType: ItemType, tier: number, idPrefix: string): Item {
  const armorSlot = itemType === 'armor' ? pick(ALL_ARMOR_SLOTS) : undefined;
  const capacity = Math.max(1, tier) * 2;
  const sockets = rollSockets(capacity, gemClassForItemType(itemType));
  const icon = iconFor(itemType, armorSlot);
  return { id: nextItemId(idPrefix), itemType, armorSlot, sockets, icon };
}
