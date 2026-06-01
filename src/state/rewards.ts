import { get, writable } from 'svelte/store';
import type { Item } from '../domain/item';
import type { Gem } from '../domain/gem';
import { addItem, addGemToBackpack } from './backpack';
import { addGold } from './topbar';

// Loot accumulator that fills as enemies die. Unlike before, the chest is NOT a
// place the player picks loot OUT of: the moment a fight is won the whole haul
// is claimed (gold credited, items + gems dropped into the bag) and this
// accumulator is reset. The victory screen then shows `victoryHaul` - a
// read-only snapshot of what was just gained - as an INTERACTIVE summary (tap a
// card to inspect the now-owned item / gem), so there are no Take buttons.
export interface PendingRewards {
  gold: number;
  items: Item[];
  gems: Gem[];
}

export const pendingRewards = writable<PendingRewards>({ gold: 0, items: [], gems: [] });

export function resetPendingRewards(): void {
  pendingRewards.set({ gold: 0, items: [], gems: [] });
}

export function addRewardGold(amount: number): void {
  if (amount <= 0) return;
  pendingRewards.update((p) => ({ ...p, gold: p.gold + amount }));
}

export function addRewardItem(item: Item): void {
  pendingRewards.update((p) => ({ ...p, items: [...p.items, item] }));
}

export function addRewardGem(gem: Gem): void {
  pendingRewards.update((p) => ({ ...p, gems: [...p.gems, gem] }));
}

// === Victory haul (the claimed summary the victory screen shows) ===========
//
// A snapshot of the loot the player just earned, set when the fight is won and
// the rewards are auto-claimed into the bag. Cleared when the player leaves the
// victory screen (back to the map, or a new run). The items / gems here are the
// SAME instances that now live in the bag, so the summary cards resolve their
// live owner by id when tapped.
export const victoryHaul = writable<PendingRewards | null>(null);

// Auto-claim the accumulated rewards the instant a fight is won: credit the
// gold (this triggers the topbar tween), shovel every item + gem into the bag
// (unbounded, so nothing is lost), and snapshot the haul for the victory
// screen's interactive summary. The pending accumulator is then reset.
export function claimVictoryHaul(): void {
  const p = get(pendingRewards);
  addGold(p.gold);
  for (const item of p.items) addItem(item);
  for (const gem of p.gems) addGemToBackpack(gem);
  victoryHaul.set({ gold: p.gold, items: [...p.items], gems: [...p.gems] });
  resetPendingRewards();
}

// Drop the victory summary (the player has left the reward screen).
export function clearVictoryHaul(): void {
  victoryHaul.set(null);
}
