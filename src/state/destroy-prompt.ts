import { writable } from 'svelte/store';
import type { Item } from '../domain/item';

// Prompt shown when the player destroys an item that still holds gems: it lists
// the socketed gems (each openable in the gem inspector) and offers to either
// KEEP the gems (detach them to the bag, scrap only the frame) or destroy
// EVERYTHING. The caller supplies the two commit callbacks since the destroy
// path differs by source (backpack vs victory chest); this store stays a thin
// carrier so it doesn't need to know where the item lives.
export interface DestroyPromptRequest {
  item: Item;
  // Destroy the item but detach + keep its gems in the bag.
  onKeepGems: () => void;
  // Destroy the item AND its gems (scrap it all).
  onDestroyAll: () => void;
}

export const destroyPrompt = writable<DestroyPromptRequest | null>(null);

export function requestDestroy(req: DestroyPromptRequest): void {
  destroyPrompt.set(req);
}

export function closeDestroyPrompt(): void {
  destroyPrompt.set(null);
}
