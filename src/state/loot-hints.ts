import { derived } from 'svelte/store';
import { equipped, type EquippedItems } from './inventory';
import { backpack } from './backpack';
import { isItem, legalEquipmentSlots, tierOf, type Item } from '../domain/item';
import { isGem, type Gem, type SocketColor } from '../domain/gem';
import { gemColor } from '../domain/gem-fit';

// Loot hints (see the loot-UX pass): a glance-readable signal on every loot
// card / bag tile telling the player whether a found item / gem is USEFUL to
// them right now. The three signals the design asks for:
//   - item "new"     : fills an equipment slot the player has nothing in yet.
//   - item "upgrade" : beats (more sockets than) what's equipped in its slot.
//   - gem  combine   : there's another gem of the same kind the player owns,
//                      so the two could be merged to level up.
//   - gem  socket    : the player owns gear with an OPEN socket of this gem's
//                      colour, so it could be slotted in right now.
//
// All four read only the player's OWNED state (equipped + backpack), never the
// shop / armory stock, so a hint always means "good for YOU".

export type ItemHint = 'new' | 'upgrade' | null;
export interface GemHint {
  combine: boolean;
  socket: boolean;
}

// A reactive snapshot of everything the hint predicates need, recomputed
// whenever the equipped gear or the bag changes. Cards subscribe to this once
// and call itemHint / gemHint per card against it.
export interface OwnedContext {
  equipped: EquippedItems;
  // Every gem the player owns: loose in the bag plus those socketed in any
  // owned item. Combine hints scan this (excluding the gem itself by id).
  ownedGems: Gem[];
  // Socket colours that have at least one EMPTY socket across owned gear, so a
  // socket hint is an O(1) set lookup.
  openColors: Set<SocketColor>;
}

export const ownedContext = derived([equipped, backpack], ([$equipped, $backpack]): OwnedContext => {
  const ownedItems: Item[] = [];
  for (const it of Object.values($equipped)) if (it) ownedItems.push(it);
  for (const slot of $backpack) if (isItem(slot)) ownedItems.push(slot);

  const ownedGems: Gem[] = [];
  for (const slot of $backpack) if (isGem(slot)) ownedGems.push(slot);

  const openColors = new Set<SocketColor>();
  for (const item of ownedItems) {
    for (let i = 0; i < item.sockets.length; i++) {
      const socketed = item.sockets[i];
      if (socketed) ownedGems.push(socketed);
      else openColors.add(item.socketColors[i]);
    }
  }
  return { equipped: $equipped, ownedGems, openColors };
});

// What signal (if any) a candidate item should flag. Empty slot wins over an
// upgrade (an empty slot is the strongest "you want this"). For a generic armor
// piece with several legal slots, the weakest occupant decides the upgrade.
export function itemHint(item: Item, ctx: OwnedContext): ItemHint {
  const slots = legalEquipmentSlots(item);
  for (const slot of slots) {
    if (ctx.equipped[slot] === null) return 'new';
  }
  let weakest = Infinity;
  for (const slot of slots) {
    const eq = ctx.equipped[slot];
    if (eq) weakest = Math.min(weakest, tierOf(eq));
  }
  if (weakest !== Infinity && tierOf(item) > weakest) return 'upgrade';
  return null;
}

// Combine + socket signals for a candidate gem. `combine` excludes the gem
// itself by id, so a loose bag gem only flags when a SECOND matching gem exists.
export function gemHint(gem: Gem, ctx: OwnedContext): GemHint {
  const color = gemColor(gem);
  const combine = ctx.ownedGems.some((g) => g.defId === gem.defId && g.id !== gem.id);
  const socket = color !== null && ctx.openColors.has(color);
  return { combine, socket };
}
