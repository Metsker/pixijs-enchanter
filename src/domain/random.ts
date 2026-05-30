import type { ArmorSlot, Item, ItemType } from './item';
import type { Gem, SocketColor } from './gem';
import { colorForClass } from './gem';
import { GEM_CATALOGUE } from './gem-catalogue';

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

// Per-item-type socket-colour pools. A colour ABSENT from a type's map can
// NEVER roll on that type (a hard exclusion, not a bias): weapons never get a
// green socket, shields / armor never get a red one. Within a type the weights
// are a primary "mainly" colour (~0.7) plus a secondary "sometimes" (~0.3);
// jewelry (ring / amulet) is flexible and admits all three. Weights are a
// deliberate knob - placeholders tuned here in one place. They need not sum to
// 1: rollSocketColorForType normalises by the per-type total.
const SOCKET_COLOR_WEIGHTS: Record<ItemType, Partial<Record<SocketColor, number>>> = {
  weapon: { red: 0.7, blue: 0.3 },
  shield: { green: 0.7, blue: 0.3 },
  armor: { green: 0.7, blue: 0.3 },
  ring: { blue: 0.5, red: 0.25, green: 0.25 },
  amulet: { blue: 0.5, red: 0.25, green: 0.25 },
};

// Roll one socket colour for `itemType` from its weighted pool. A weighted draw
// over only that type's listed entries, so an excluded colour can never appear.
// Exported so add-socket (rest.ts) and the save backfill roll a new / missing
// socket's colour from the exact same pool as drops.
export function rollSocketColorForType(itemType: ItemType): SocketColor {
  const weights = SOCKET_COLOR_WEIGHTS[itemType];
  const entries = Object.entries(weights) as [SocketColor, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [color, w] of entries) {
    if (r < w) return color;
    r -= w;
  }
  return entries[entries.length - 1][0]; // numeric safety net.
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
  const socketColors = Array.from({ length: capacity }, () =>
    rollSocketColorForType(itemType),
  );
  const sockets = rollSockets(socketColors);
  const icon = iconFor(itemType, armorSlot);
  return { id: nextItemId(idPrefix), itemType, armorSlot, sockets, socketColors, icon };
}
