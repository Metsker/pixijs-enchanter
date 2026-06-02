// The Forge bench (internally still 'rest'): Craft a gem, Craft a tier-1 item,
// or Destroy a gem (ADR 0008). Craft spends crystals to roll a random gem into
// the stash or a random T1 item into the bag; Destroy deletes a stash gem for a
// partial crystal refund - the deliberate crystal scrap loop, the main faucet
// alongside the capped shop crystal pack (crystals are NOT dropped elsewhere,
// ADR 0003).

import { get } from 'svelte/store';
import { gemLevel } from '../domain/gem';
import type { Gem, GemDef } from '../domain/gem';
import type { Item } from '../domain/item';
import { GEM_CATALOGUE } from '../domain/gem-catalogue';
import { randomItem } from '../domain/random';
import { addGemToStash, removeGemFromStashById } from './gem-stash';
import { addItem } from './backpack';
import { refundCrystals, spendCrystals, topbar } from './topbar';

// Placeholder economy (tune in playtesting). Craft costs CRAFT_COST crystals;
// destroying / disenchanting a gem refunds DESTROY_REFUND per gem level. The
// refund staying below the craft cost keeps the scrap loop a deliberate choice
// rather than free deletion (ADR 0008).
export const CRAFT_COST = 30;
// Crafting a random tier-1 item costs more than a gem - it's a bigger get
// (sockets + pre-rolled gems), so it shouldn't out-pace gem crafting.
export const CRAFT_ITEM_COST = 50;
export const DESTROY_REFUND = 25;

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

// True if the player can currently afford to craft an item.
export function canCraftItem(): boolean {
  return get(topbar).crystals >= CRAFT_ITEM_COST;
}

// Craft an item: spend CRAFT_ITEM_COST crystals, roll a random tier-1 item
// (random type, one socket, pre-socketed like a drop) and drop it into the
// backpack. Returns the crafted Item, or null when the player cannot afford it
// (no crystals spent in that case).
export function craftItem(): Item | null {
  if (!spendCrystals(CRAFT_ITEM_COST)) return null;
  const item = randomItem(1, 'forge');
  addItem(item);
  return item;
}

// Crystals refunded for scrapping a stash gem: DESTROY_REFUND per combine level
// (a Lv2 gem refunds 2x, a Lv3 3x), so a leveled gem is worth more dead than a
// base one - matching disenchant.ts's gemRefund for loose / socketed gems.
export function gemDestroyRefund(gem: Gem): number {
  return DESTROY_REFUND * gemLevel(gem);
}

// Destroy a stash gem by instance id: remove it and refund its crystal value
// (DESTROY_REFUND scaled by level). The scrap loop. Returns true if a gem was
// removed (and refunded), false if no such gem was in the stash.
export function destroyGem(gemId: string): boolean {
  const removed = removeGemFromStashById(gemId);
  if (!removed) return false;
  refundCrystals(gemDestroyRefund(removed));
  return true;
}

// NB: adding sockets to gear used to live here, but it is no longer a Rest
// action - it is available wherever the player inspects their gear. See
// state/sockets.ts.
