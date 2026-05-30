// The Rest bench: Craft and Destroy gems (ADR 0008). Rest now has exactly two
// actions - spend crystals to roll a random gem into the stash (Craft), or
// delete a stash gem for a partial crystal refund (Destroy). Destroying gems
// is the deliberate crystal scrap loop, the main faucet alongside the capped
// shop crystal pack; crystals are NOT dropped anywhere else (ADR 0003).

import { get } from 'svelte/store';
import type { Gem, GemDef, SocketColor } from '../domain/gem';
import { GEM_CATALOGUE } from '../domain/gem-catalogue';
import { tierOf, type Item } from '../domain/item';
import { gemColor, themeColorForItem } from '../domain/gem-fit';
import { rollSocketColor } from '../domain/random';
import { addGemToBackpack, backpack } from './backpack';
import { addGemToStash, removeGemFromStashById } from './gem-stash';
import { writeItem } from './gem-move';
import { refundCrystals, spendCrystals, topbar } from './topbar';

// Placeholder economy (tune in playtesting). Craft costs CRAFT_COST crystals;
// destroying a gem refunds DESTROY_REFUND (~50% of the craft cost). The refund
// being a fraction of the cost is what makes destroying a deliberate scrap
// loop rather than free deletion (ADR 0008).
export const CRAFT_COST = 30;
export const DESTROY_REFUND = 15;

// --- Craft weighting -----------------------------------------------------
//
// Crafting rolls from GEM_CATALOGUE weighted by the balance-notes intent
// (docs/gem-catalogue.md § Balance notes): supports are rarer than effects,
// and among effects procs are rarer than stats. Weights are a deliberate knob,
// centralised here as placeholders so they are tuned in one place.
//
// Each gem's weight is a per-category base. Class is balanced implicitly: the
// catalogue already carries roughly the same spread of roles per class, so a
// flat per-category weight keeps every class reachable while honouring the
// stat > proc > support rarity ordering. (A future per-class multiplier would
// slot in here as another factor.)
const CATEGORY_WEIGHTS = {
  stat: 5, // passive backbone - the most common roll
  proc: 3, // active abilities - rarer than stats
  support: 1, // modifiers - the rarest roll
} as const;

// Map a catalogue def to its rarity category.
function categoryOf(def: GemDef): keyof typeof CATEGORY_WEIGHTS {
  if (def.role === 'support') return 'support';
  return 'proc' in def ? 'proc' : 'stat';
}

function weightOf(def: GemDef): number {
  return CATEGORY_WEIGHTS[categoryOf(def)];
}

// Pre-compute the weighted draw table once: a flat list of catalogue defs with
// the running total weight, so a single rng draw selects one in O(n).
const WEIGHTED_DEFS: { def: GemDef; weight: number }[] = Object.values(
  GEM_CATALOGUE,
).map((def) => ({ def, weight: weightOf(def) }));
const TOTAL_WEIGHT = WEIGHTED_DEFS.reduce((sum, e) => sum + e.weight, 0);

// Roll a single catalogue defId from the weighted pool.
function rollDefId(rng: () => number): string {
  let r = rng() * TOTAL_WEIGHT;
  for (const entry of WEIGHTED_DEFS) {
    if (r < entry.weight) return entry.def.id;
    r -= entry.weight;
  }
  return WEIGHTED_DEFS[WEIGHTED_DEFS.length - 1].def.id;
}

let craftCounter = 0;
function nextCraftedGemId(): string {
  craftCounter += 1;
  return `gem-craft-${Date.now()}-${craftCounter}`;
}

// True if the player can currently afford to craft a gem. Peeks the crystal
// balance rather than probing spendCrystals, which would mutate state.
export function canCraftGem(): boolean {
  return get(topbar).crystals >= CRAFT_COST;
}

// Craft a gem: spend CRAFT_COST crystals, roll a weighted-random catalogue gem
// and add the new instance to the stash. Returns the crafted Gem, or null when
// the player cannot afford it (no crystals spent in that case).
export function craftGem(rng: () => number = Math.random): Gem | null {
  if (!spendCrystals(CRAFT_COST)) return null;
  const gem: Gem = { id: nextCraftedGemId(), defId: rollDefId(rng) };
  addGemToStash(gem);
  return gem;
}

// Destroy a stash gem by instance id: remove it and refund DESTROY_REFUND
// crystals. The scrap loop. Returns true if a gem was removed (and refunded),
// false if no such gem was in the stash (no crystals granted).
export function destroyGem(gemId: string): boolean {
  const removed = removeGemFromStashById(gemId);
  if (!removed) return false;
  refundCrystals(DESTROY_REFUND);
  return true;
}

// --- Add socket (FEATURE 3: improve tier at Rest) -----------------------
//
// Appends one empty socket to an item (raising its tier by 1), capped at tier
// MAX_SOCKET_TIER. Costs crystals scaling with the CURRENT tier - placeholders,
// tuned here in one place.

// An item can never exceed this many sockets.
export const MAX_SOCKET_TIER = 6;

// Crystal cost to add a socket to an item at its current tier (placeholder).
export function addSocketCost(item: Item): number {
  return 40 + 25 * tierOf(item);
}

// True if `item` can still take another socket (under the tier cap).
export function canAddSocket(item: Item): boolean {
  return tierOf(item) < MAX_SOCKET_TIER;
}

// True if the player can currently afford to add a socket to `item`.
export function canAffordAddSocket(item: Item): boolean {
  return get(topbar).crystals >= addSocketCost(item);
}

// Add one empty socket to `item`: spend the tier-scaled crystal cost and
// persist through the shared item write-back (so it lands on the equipped /
// backpack store and the open Inspector re-derives). The new socket's colour
// is rolled type-biased toward the item's theme (same roll as drops). No-op
// (returns false) if the item is at the tier cap or the player can't afford it
// - no crystals are spent in either case.
export function addSocketToItem(item: Item): boolean {
  if (!canAddSocket(item)) return false;
  if (!spendCrystals(addSocketCost(item))) return false;
  const color = rollSocketColor(themeColorForItem(item));
  writeItem({
    ...item,
    sockets: [...item.sockets, null],
    socketColors: [...item.socketColors, color],
  });
  return true;
}

// --- Re-colour a socket (targeted craft at Rest) -----------------------
//
// Set ONE socket's colour to a chosen colour for crystals (placeholder cost
// RECOLOR_COST). If the socket holds a gem whose colour no longer matches the
// new colour, the gem is EJECTED to the backpack; if the backpack is full the
// re-colour is BLOCKED (returns false, no crystals spent) so the gem can never
// be lost. A no-op re-colour (same colour) is rejected. Only meaningful for an
// OWNED item (equipped / backpack) - the UI gates that.

// Crystal cost to re-colour a single socket (placeholder, tuned in playtesting).
export const RECOLOR_COST = 20;

// True if the player can currently afford a single socket re-colour.
export function canAffordRecolor(): boolean {
  return get(topbar).crystals >= RECOLOR_COST;
}

// Re-colour `item`'s socket `index` to `color`. Spends RECOLOR_COST, sets
// socketColors[index] = color, and persists via the shared item write-back. A
// gem in that socket whose colour no longer fits is ejected to the backpack;
// if the backpack is full the re-colour is blocked (false, no spend). Returns
// true on success. No-op (false, no spend) when the colour is unchanged, the
// index is out of range, or the item can't be afforded.
export function recolorSocket(item: Item, index: number, color: SocketColor): boolean {
  if (index < 0 || index >= item.socketColors.length) return false;
  if (item.socketColors[index] === color) return false; // no-op re-colour.

  // If a gem sits here and would no longer fit, it must move to the backpack.
  // Check capacity BEFORE spending so a full backpack blocks cleanly.
  const occupant = item.sockets[index];
  const ejects = occupant !== null && gemColor(occupant) !== color;
  if (ejects && !get(backpack).includes(null)) return false; // no room: block.

  if (!spendCrystals(RECOLOR_COST)) return false;

  const socketColors = item.socketColors.slice();
  socketColors[index] = color;
  const sockets = item.sockets.slice();
  if (ejects && occupant) {
    sockets[index] = null;
    addGemToBackpack(occupant);
  }
  writeItem({ ...item, sockets, socketColors });
  return true;
}
