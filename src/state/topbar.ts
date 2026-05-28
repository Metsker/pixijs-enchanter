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
