import { writable } from 'svelte/store';
import type { Fighter } from '../domain/fighter';
import type { EnemyDef } from '../domain/enemy';
import { LICH, SKELETON } from '../domain/enemy-catalogue';

// Lich phase-spawn config per docs/enemies.md: "Spawns 2 Skeleton adds when
// HP crosses 66% and 33% thresholds." Group cap: 1 Lich + up to 2 active
// Skeleton adds.
const LICH_PHASE_THRESHOLDS = [0.66, 0.33];
const SKELETON_ADD_CAP = 2;

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

function makeFighters(defs: EnemyDef[]): Fighter[] {
  return defs.map((e) => ({
    id: nextInstanceId(e.id),
    kind: 'enemy',
    name: e.id,
    emoji: e.emoji,
    hp: e.hp,
    maxHp: e.hp,
  }));
}

export function startFightWith(enemies: EnemyDef[]): void {
  const fighters = makeFighters(enemies);
  fight.update((state) => ({
    ...state,
    // Reset player HP at the start of every fight. The spec is "HP carries
    // between rooms, Rest heals" - that's intended for later when dodge /
    // resist / regen enchants actually work; for now, full HP per fight
    // keeps unbalanced encounters from immediately snowballing.
    player: { ...state.player, hp: state.player.maxHp },
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

export function applyDamageToPlayer(amount: number): void {
  fight.update((state) => ({
    ...state,
    player: { ...state.player, hp: Math.max(0, state.player.hp - amount) },
  }));
}

export function applyDamage(targetId: string, amount: number): void {
  let pendingAdds = 0;
  fight.update((state) => {
    const enemies = state.enemies.map((e) => {
      if (e.id !== targetId) return e;
      const newHp = Math.max(0, e.hp - amount);
      const next: Fighter = { ...e, hp: newHp };

      // Lich phase-spawn check: if this damage crossed an untriggered
      // threshold, mark the phase and queue Skeleton adds (respecting cap).
      if (e.name === LICH.id) {
        const triggered = new Set(e.triggeredPhases ?? []);
        const oldFrac = e.maxHp > 0 ? e.hp / e.maxHp : 0;
        const newFrac = e.maxHp > 0 ? newHp / e.maxHp : 0;
        for (let i = 0; i < LICH_PHASE_THRESHOLDS.length; i++) {
          if (triggered.has(i)) continue;
          const t = LICH_PHASE_THRESHOLDS[i];
          if (oldFrac > t && newFrac <= t) {
            triggered.add(i);
            const liveSkeletons = state.enemies.filter(
              (x) => x.name === SKELETON.id && x.hp > 0,
            ).length;
            const slots = Math.max(0, SKELETON_ADD_CAP - liveSkeletons);
            pendingAdds += Math.min(2, slots);
          }
        }
        if (triggered.size !== (e.triggeredPhases?.length ?? 0)) {
          next.triggeredPhases = Array.from(triggered).sort();
        }
      }

      return next;
    });
    return { ...state, enemies };
  });

  if (pendingAdds > 0) {
    const newSkeletons = makeFighters(Array.from({ length: pendingAdds }, () => SKELETON));
    fight.update((state) => ({
      ...state,
      enemies: [...state.enemies, ...newSkeletons],
    }));
  }
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
