import { writable } from 'svelte/store';
import type { Fighter } from '../domain/fighter';
import type { EnemyDef } from '../domain/enemy';

export interface FightState {
  player: Fighter;
  enemies: Fighter[];
  targetId: string | null;
  // True while the Battlefield is actively running combat (i.e. the player
  // is inside a fight room). Map / Shop / Rest screens leave it false.
  inFight: boolean;
}

const initialPlayer: Fighter = {
  id: 'player',
  kind: 'player',
  name: 'Player',
  emoji: '\u{1F9DD}',
  hp: 1000,
  maxHp: 1000,
};

const initial: FightState = {
  player: initialPlayer,
  enemies: [],
  targetId: null,
  inFight: false,
};

export const fight = writable<FightState>(initial);

let enemyCounter = 0;
function nextInstanceId(prefix: string): string {
  enemyCounter += 1;
  return `${prefix}#${enemyCounter}`;
}

export function startFightWith(enemies: EnemyDef[]): void {
  const fighters: Fighter[] = enemies.map((e) => ({
    id: nextInstanceId(e.id),
    kind: 'enemy',
    name: e.id,
    emoji: e.emoji,
    hp: e.hp,
    maxHp: e.hp,
  }));
  fight.update((state) => ({
    ...state,
    enemies: fighters,
    targetId: fighters[0]?.id ?? null,
    inFight: true,
  }));
}

export function endFight(): void {
  fight.update((state) => ({
    ...state,
    enemies: [],
    targetId: null,
    inFight: false,
  }));
}

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
