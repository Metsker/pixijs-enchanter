import { get, writable } from 'svelte/store';
import type { Item } from '../domain/item';
import { addItem } from './backpack';
import { addGold } from './topbar';

// Loot accumulator that fills as enemies die and is presented to the
// player on the victory overlay as a chest. Items can be equipped
// directly from the chest via the Inspector; whatever isn't equipped
// goes to the Backpack when the player presses Continue.
export interface PendingRewards {
  gold: number;
  items: Item[];
}

export const pendingRewards = writable<PendingRewards>({ gold: 0, items: [] });

export function resetPendingRewards(): void {
  pendingRewards.set({ gold: 0, items: [] });
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

// Apply the accumulated rewards: credit gold (this triggers the topbar
// tween) and shovel any uncllaimed items into the Backpack. Items that
// don't fit are silently dropped per spec.
export function claimPendingRewards(): void {
  const p = get(pendingRewards);
  addGold(p.gold);
  for (const item of p.items) addItem(item);
  resetPendingRewards();
}
