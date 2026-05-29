import { writable } from 'svelte/store';
import type { Enchantment } from '../domain/enchant';

// A carried scroll holds exactly one named enchant the player has banked
// for later (per ADR-0004). Two states reach the Top bar:
//   - 'loaded': salvaged from an item via Transfer. Carries a Weapons /
//     Armor / Jewelry pool enchant of a known layer (main / utility).
//   - 'unique': originates from a boss drop or Shop purchase. Carries a
//     Unique-pool enchant; only fits a tier-7 Item's Unique slot.
// Empty scrolls are NOT modelled here - they're a bare count in the Top
// bar (`topbar.emptyScrolls`) because they carry no payload.
export interface CarriedScroll {
  id: string;
  kind: 'loaded' | 'unique';
  enchant: Enchantment;
}

export const scrolls = writable<CarriedScroll[]>([]);

let scrollCounter = 0;
function nextScrollId(): string {
  scrollCounter += 1;
  return `scroll-${Date.now()}-${scrollCounter}`;
}

export function addScroll(kind: CarriedScroll['kind'], enchant: Enchantment): CarriedScroll {
  const scroll: CarriedScroll = { id: nextScrollId(), kind, enchant };
  scrolls.update((list) => [...list, scroll]);
  return scroll;
}

export function removeScroll(id: string): void {
  scrolls.update((list) => list.filter((s) => s.id !== id));
}

export function resetScrolls(): void {
  scrolls.set([]);
}
