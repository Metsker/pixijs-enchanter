import { writable } from 'svelte/store';
import type { Fighter } from '../domain/fighter';

export interface FightState {
  player: Fighter;
  enemies: Fighter[];
  targetId: string | null;
}

const initial: FightState = {
  player: {
    id: 'player',
    kind: 'player',
    name: 'Player',
    emoji: '\u{1F9DD}',
    hp: 1000,
    maxHp: 1000,
  },
  enemies: [
    { id: 'skeleton-1', kind: 'enemy', name: 'Skeleton', emoji: '\u{1F480}', hp: 800, maxHp: 800 },
    { id: 'goblin-1', kind: 'enemy', name: 'Goblin', emoji: '\u{1F479}', hp: 400, maxHp: 400 },
    { id: 'slime-1', kind: 'enemy', name: 'Slime', emoji: '\u{1F7E2}', hp: 1200, maxHp: 1200 },
  ],
  targetId: 'skeleton-1',
};

export const fight = writable<FightState>(initial);

export function setTarget(id: string): void {
  fight.update((state) => {
    if (!state.enemies.some((e) => e.id === id)) return state;
    return { ...state, targetId: id };
  });
}
