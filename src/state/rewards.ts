import { get, writable } from 'svelte/store';
import type { Item } from '../domain/item';
import type { Gem } from '../domain/gem';
import { addItem, addGemToBackpack } from './backpack';
import { addGold } from './topbar';

// Loot accumulator that fills as enemies die and is presented to the
// player on the victory overlay as a chest. Items can be equipped
// directly from the chest via the Inspector; gems and whatever isn't
// equipped go to the Backpack when the player presses Continue.
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

export function removeRewardItem(itemId: string): void {
  pendingRewards.update((p) => ({
    ...p,
    items: p.items.filter((it) => it.id !== itemId),
  }));
}

// Find a chest item by instance id (peek, no removal). Lets the gem move / drag
// layer treat a reward item as an editable item-by-id, like equipped / backpack.
export function findRewardItemById(itemId: string): Item | null {
  return get(pendingRewards).items.find((it) => it.id === itemId) ?? null;
}

// Apply a mutator to the chest item with the given id (e.g. a socket edit from
// a gem drag). Returns true if a reward item with that id was found + rewritten.
export function updateRewardItemById(itemId: string, mutate: (item: Item) => Item): boolean {
  let found = false;
  pendingRewards.update((p) => {
    const idx = p.items.findIndex((it) => it.id === itemId);
    if (idx === -1) return p;
    found = true;
    const items = p.items.slice();
    items[idx] = mutate(items[idx]);
    return { ...p, items };
  });
  return found;
}

export function addRewardGem(gem: Gem): void {
  pendingRewards.update((p) => ({ ...p, gems: [...p.gems, gem] }));
}

export function removeRewardGem(gemId: string): void {
  pendingRewards.update((p) => ({
    ...p,
    gems: p.gems.filter((g) => g.id !== gemId),
  }));
}

// Apply the accumulated rewards: credit gold (this triggers the topbar
// tween) and shovel any unclaimed items + gems into the Backpack. Anything
// that doesn't fit is silently dropped per spec.
export function claimPendingRewards(): void {
  const p = get(pendingRewards);
  addGold(p.gold);
  for (const item of p.items) addItem(item);
  for (const gem of p.gems) addGemToBackpack(gem);
  resetPendingRewards();
}
