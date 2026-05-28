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

export function applyDamage(targetId: string, amount: number): void {
  fight.update((state) => ({
    ...state,
    enemies: state.enemies.map((e) =>
      e.id === targetId ? { ...e, hp: Math.max(0, e.hp - amount) } : e,
    ),
  }));
}

export function removeEnemy(id: string): void {
  fight.update((state) => {
    const enemies = state.enemies.filter((e) => e.id !== id);
    let targetId = state.targetId;
    if (targetId === id) {
      targetId =
        enemies.length > 0 ? enemies[Math.floor(Math.random() * enemies.length)].id : null;
    }
    return { ...state, enemies, targetId };
  });
}
