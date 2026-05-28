import { writable } from 'svelte/store';

export interface TopbarState {
  gold: number;
  crystals: number;
  emptyScrolls: number;
  seals: number;
  act: number;
  floor: number;
}

const initial: TopbarState = {
  gold: 250,
  crystals: 30,
  emptyScrolls: 2,
  seals: 1,
  act: 1,
  floor: 1,
};

export const topbar = writable<TopbarState>(initial);

export function spendCrystals(amount: number): boolean {
  let ok = false;
  topbar.update((s) => {
    if (s.crystals < amount) return s;
    ok = true;
    return { ...s, crystals: s.crystals - amount };
  });
  return ok;
}

export function refundCrystals(amount: number): void {
  topbar.update((s) => ({ ...s, crystals: s.crystals + amount }));
}

export function addGold(amount: number): void {
  if (amount <= 0) return;
  topbar.update((s) => ({ ...s, gold: s.gold + amount }));
}

export function spendSeals(amount: number): boolean {
  let ok = false;
  topbar.update((s) => {
    if (s.seals < amount) return s;
    ok = true;
    return { ...s, seals: s.seals - amount };
  });
  return ok;
}
