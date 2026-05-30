import type { ArmorSlot, Item, ItemType } from './item';
import type { Gem, SocketColor } from './gem';
import { colorForClass } from './gem';
import { GEM_CATALOGUE } from './gem-catalogue';

const ALL_ITEM_TYPES: ItemType[] = ['weapon', 'shield', 'armor', 'ring', 'belt', 'amulet'];
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
  belt: ['👝', '🎗️'],
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

// Every catalogue defId, for rolling a loose gem as loot (combat rewards) or
// shop stock. Uniform over the whole pool - effects and supports alike.
const ALL_GEM_IDS: string[] = Object.keys(GEM_CATALOGUE);

// Roll one random catalogue gem as a fresh level-1 instance. Used by combat
// loot and the shop to drop loose gems the player can socket or combine.
export function randomGem(): Gem {
  return { id: nextGemId(), defId: pick(ALL_GEM_IDS) };
}

// Per-item-type socket-colour pools. A colour ABSENT from a type's map can
// NEVER roll on that type (a hard exclusion, not a bias): weapons never get a
// green socket, shields / armor never get a red one. Within a type the weights
// are a primary "mainly" colour (~0.7) plus a secondary "sometimes" (~0.3);
// jewelry (ring / amulet) is flexible and admits all three. Weights are a
// deliberate knob - placeholders tuned here in one place. They need not sum to
// 1: rollSocketColorForType normalises by the per-type total.
const SOCKET_COLOR_WEIGHTS: Record<ItemType, Partial<Record<SocketColor, number>>> = {
  weapon: { red: 0.7, blue: 0.3 },
  shield: { green: 0.6, red: 0.4 },
  armor: { green: 0.7, blue: 0.3 },
  ring: { blue: 0.5, red: 0.5 },
  belt: { blue: 0.5, green: 0.5 },
  amulet: { blue: 0.5, red: 0.25, green: 0.25 },
};

// Per-ARMOR-SLOT overrides (armor is one ItemType but its sub-slots can differ).
// Gloves roll red as a secondary - the other offensive home gained back.
const ARMOR_SLOT_COLOR_WEIGHTS: Partial<
  Record<ArmorSlot, Partial<Record<SocketColor, number>>>
> = {
  gloves: { green: 0.5, red: 0.3, blue: 0.2 },
};

// The socket-colour weights for an item, honouring per-armor-slot overrides.
function weightsFor(
  itemType: ItemType,
  armorSlot?: ArmorSlot,
): Partial<Record<SocketColor, number>> {
  if (itemType === 'armor' && armorSlot && ARMOR_SLOT_COLOR_WEIGHTS[armorSlot]) {
    return ARMOR_SLOT_COLOR_WEIGHTS[armorSlot]!;
  }
  return SOCKET_COLOR_WEIGHTS[itemType];
}

// Weighted draw over an item's listed colours using a supplied 0..1 value, so
// an excluded colour can never appear. Shared by the random + seeded pickers.
function pickSocketColor(
  itemType: ItemType,
  r01: number,
  armorSlot?: ArmorSlot,
): SocketColor {
  const weights = weightsFor(itemType, armorSlot);
  const entries = Object.entries(weights) as [SocketColor, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = r01 * total;
  for (const [color, w] of entries) {
    if (r < w) return color;
    r -= w;
  }
  return entries[entries.length - 1][0]; // numeric safety net.
}

// Roll one RANDOM socket colour for an item (drops + save backfill).
export function rollSocketColorForType(itemType: ItemType, armorSlot?: ArmorSlot): SocketColor {
  return pickSocketColor(itemType, Math.random(), armorSlot);
}

// Deterministic socket colour for an item at a given (seed, index), so an item
// always grows the SAME colour sequence as sockets are added. The Add-socket
// preview reads this, so the previewed swatch is stable and exactly matches the
// colour the player will get. Drawn from the same weighted pool.
export function seededSocketColorForType(
  itemType: ItemType,
  seed: string,
  index: number,
  armorSlot?: ArmorSlot,
): SocketColor {
  return pickSocketColor(itemType, hash01(`${seed}#${index}`), armorSlot);
}

// Tiny deterministic string hash -> [0, 1). FNV-1a, dependency-free.
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1_000_000) / 1_000_000;
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
    rollSocketColorForType(itemType, armorSlot),
  );
  const sockets = rollSockets(socketColors);
  const icon = iconFor(itemType, armorSlot);
  return { id: nextItemId(idPrefix), itemType, armorSlot, sockets, socketColors, icon };
}
