import type { ArmorSlot, Item, ItemType } from './item';
import type { Gem, SocketColor } from './gem';
import { colorForClass } from './gem';
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

// Catalogue defIds grouped by COLOUR (a gem's colour = colorForClass of its
// class), computed once. Used to pre-socket a freshly-dropped item with a
// couple of colour-matched gems.
const GEM_IDS_BY_COLOR: Record<SocketColor, string[]> = (() => {
  const acc: Record<SocketColor, string[]> = { red: [], green: [], blue: [] };
  for (const def of Object.values(GEM_CATALOGUE)) {
    acc[colorForClass(def.class)].push(def.id);
  }
  return acc;
})();

// Effect-only defIds grouped by colour. A pre-socketed item must include at
// least one EFFECT gem (a support with no effect to bind to is inert), so an
// item never drops "support only" / doing nothing. Every colour has effect
// gems, so there is always a valid pick.
const EFFECT_GEM_IDS_BY_COLOR: Record<SocketColor, string[]> = (() => {
  const acc: Record<SocketColor, string[]> = { red: [], green: [], blue: [] };
  for (const def of Object.values(GEM_CATALOGUE)) {
    if (def.role === 'effect') acc[colorForClass(def.class)].push(def.id);
  }
  return acc;
})();

const ALL_COLORS: SocketColor[] = ['red', 'green', 'blue'];

// Type-biased colour roll: any colour can appear on any item, but the item's
// THEME colour is favoured. Placeholder weights - theme 0.6, each other 0.2.
const THEME_COLOR_WEIGHT = 0.6;
const OFF_COLOR_WEIGHT = 0.2;

// Roll one socket colour, biased toward `theme`. Exported so add-socket
// (rest.ts) rolls a new socket's colour with the exact same bias.
export function rollSocketColor(theme: SocketColor): SocketColor {
  let r = Math.random();
  for (const color of ALL_COLORS) {
    const w = color === theme ? THEME_COLOR_WEIGHT : OFF_COLOR_WEIGHT;
    if (r < w) return color;
    r -= w;
  }
  return theme; // numeric safety net (weights sum to 1.0).
}

// Roll the item's per-socket colours: a capacity-length list, each colour
// type-biased toward the item's theme.
function rollSocketColors(capacity: number, theme: SocketColor): SocketColor[] {
  return Array.from({ length: capacity }, () => rollSocketColor(theme));
}

// Pre-socket the item: drop 1-2 colour-matched gems into sockets whose colour
// they fit, leaving the rest empty. Each gem goes into the first still-empty
// socket of a colour that has a gem pool, so a placed gem always fits its
// socket. Gives a freshly-dropped item something to do in combat until the
// player rearranges it at Rest.
function rollSockets(socketColors: SocketColor[]): (Gem | null)[] {
  const sockets: (Gem | null)[] = socketColors.map(() => null);
  const capacity = socketColors.length;
  const count = Math.min(capacity, 1 + Math.floor(Math.random() * 2)); // 1 or 2
  let placed = 0;
  for (let i = 0; i < capacity && placed < count; i++) {
    const color = socketColors[i];
    const pool = GEM_IDS_BY_COLOR[color];
    if (pool.length === 0) continue;
    // The LAST (rightmost) pre-socketed gem is forced to be an effect: that
    // guarantees the item is never support-only (inert), and any support
    // placed to its left binds to it (nearest effect to the right).
    const isLast = placed === count - 1;
    const effectPool = EFFECT_GEM_IDS_BY_COLOR[color];
    const fromPool = isLast && effectPool.length > 0 ? effectPool : pool;
    sockets[i] = { id: nextGemId(), defId: pick(fromPool) };
    placed += 1;
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

// Tier is the socket capacity (clamped to at least 1 so every item has
// room for a gem).
function buildItem(itemType: ItemType, tier: number, idPrefix: string): Item {
  const armorSlot = itemType === 'armor' ? pick(ALL_ARMOR_SLOTS) : undefined;
  const capacity = Math.max(1, tier);
  const theme = colorForClass(gemClassForItemType(itemType));
  const socketColors = rollSocketColors(capacity, theme);
  const sockets = rollSockets(socketColors);
  const icon = iconFor(itemType, armorSlot);
  return { id: nextItemId(idPrefix), itemType, armorSlot, sockets, socketColors, icon };
}
