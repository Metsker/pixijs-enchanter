import { get, writable } from 'svelte/store';
import type { Fighter } from '../domain/fighter';
import type { EnemyDef } from '../domain/enemy';
import { ENEMY_CATALOGUE, LICH, SKELETON } from '../domain/enemy-catalogue';
import { randomItem } from '../domain/random';
import { addRewardGold, addRewardItem, resetPendingRewards } from './rewards';
import { playerProfile } from './player-profile';
import type { StatusType } from '../domain/enchant';
import { STATUS_DEFS, type DoTEvent } from '../domain/status';

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
  // Loot from a previous fight that the player never claimed is gone -
  // a fresh fight always starts with an empty chest.
  resetPendingRewards();
  // Snapshot the player's defence profile from currently-equipped
  // enchants and rebuild player maxHp / hp from it. Equip changes are
  // blocked during combat, so this snapshot is stable for the fight.
  const def = get(playerProfile).defence;
  fight.update((state) => ({
    ...state,
    player: { ...state.player, maxHp: def.maxHp, hp: def.maxHp },
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

// Heal the player by `amount`, clamped to current maxHp. Used for both
// continuous Regeneration and on-hit Vampiric / Lifedrain effects.
export function healPlayer(amount: number): void {
  if (amount <= 0) return;
  fight.update((state) => ({
    ...state,
    player: {
      ...state.player,
      hp: Math.min(state.player.maxHp, state.player.hp + amount),
    },
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

// === Statuses ========================================================
// Re-applying the same status refreshes its duration but preserves
// the dripping DoT accumulator. One instance per status per fighter
// (no stacks); shock/freeze are non-DoT, just enable their multiplier
// while the timer runs.
function withStatus(f: Fighter, status: StatusType): Fighter {
  const def = STATUS_DEFS[status];
  const existing = f.statuses?.[status];
  return {
    ...f,
    statuses: {
      ...f.statuses,
      [status]: {
        remainingSec: def.durationSec,
        // Preserve the existing countdown on a refresh so re-stacking
        // doesn't reset the next tick out by a full interval.
        nextTickIn: existing?.nextTickIn ?? def.tickIntervalSec,
      },
    },
  };
}

export function applyStatusToEnemy(id: string, status: StatusType): void {
  fight.update((state) => ({
    ...state,
    enemies: state.enemies.map((e) => (e.id === id ? withStatus(e, status) : e)),
  }));
}

export function applyStatusToPlayer(status: StatusType): void {
  fight.update((state) => ({ ...state, player: withStatus(state.player, status) }));
}

// One pass per Battlefield tick: ages every active status, drips
// DoT damage into a per-status accumulator, and applies whole
// hp-ticks (floors the accumulator). Returns a list of DoT events
// so the view layer can paint coloured damage numbers - we don't
// want the fight store to know about Pixi.
export function tickStatuses(dt: number): DoTEvent[] {
  const events: DoTEvent[] = [];
  fight.update((state) => ({
    ...state,
    player: tickFighterStatuses(state.player, dt, events),
    enemies: state.enemies.map((e) => tickFighterStatuses(e, dt, events)),
  }));
  return events;
}

function tickFighterStatuses(f: Fighter, dt: number, events: DoTEvent[]): Fighter {
  if (!f.statuses) return f;
  if (f.hp <= 0) {
    // Dead fighters drop their statuses so corpses don't keep
    // ticking and the next-fight reset starts clean.
    return f.statuses ? { ...f, statuses: undefined } : f;
  }

  let hp = f.hp;
  const next: Partial<Record<StatusType, typeof f.statuses[StatusType]>> = {};
  let mutated = false;
  for (const [key, inst] of Object.entries(f.statuses) as [
    StatusType,
    NonNullable<typeof f.statuses[StatusType]>,
  ][]) {
    const def = STATUS_DEFS[key];
    if (!def || !inst) continue;
    const remainingSec = inst.remainingSec - dt;
    if (remainingSec <= 0) {
      mutated = true;
      continue;
    }
    let nextTickIn = inst.nextTickIn - dt;
    // DoTs fire one discrete chunk every tickIntervalSec rather than
    // dripping per frame - poison hits for 70 once per second, burn
    // for 60 every 0.5s, etc. Catch up if dt overshot (unlikely at
    // 60fps but cheap to handle).
    if (def.dmgPerSec > 0 && def.tickIntervalSec > 0) {
      while (nextTickIn <= 0 && hp > 0) {
        const damage = Math.min(hp, Math.round(def.dmgPerSec * def.tickIntervalSec));
        hp -= damage;
        events.push({ targetId: f.id, status: key, amount: damage });
        nextTickIn += def.tickIntervalSec;
      }
    }
    next[key] = { remainingSec, nextTickIn };
    mutated = true;
  }
  if (!mutated && hp === f.hp) return f;
  return { ...f, hp, statuses: next };
}

// === Loot ============================================================
// Drops are tuned to the enemy's catalogue kind. Numbers are placeholders
// until economy work lands; tier rolls deliberately stay low so the
// player can stack but not snowball.
interface DropTable {
  goldMin: number;
  goldMax: number;
  itemChance: number;
  tierMin: number;
  tierMax: number;
}

const DROP_TABLES: Record<'common' | 'elite' | 'boss', DropTable> = {
  common: { goldMin: 20, goldMax: 40, itemChance: 0.5, tierMin: 1, tierMax: 2 },
  elite: { goldMin: 80, goldMax: 150, itemChance: 1.0, tierMin: 2, tierMax: 3 },
  boss: { goldMin: 300, goldMax: 500, itemChance: 1.0, tierMin: 4, tierMax: 5 },
};

function rollInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// Kill an enemy: roll loot into the pending-rewards chest (the player
// claims it from the victory overlay), then remove the enemy from the
// fight. Skeleton adds spawned by the Lich count as commons.
export function killEnemy(id: string): void {
  const enemy = get(fight).enemies.find((e) => e.id === id);
  if (enemy) {
    const def = ENEMY_CATALOGUE[enemy.name];
    const kind = (def?.kind ?? 'common') as 'common' | 'elite' | 'boss';
    const table = DROP_TABLES[kind];
    addRewardGold(rollInt(table.goldMin, table.goldMax));
    if (Math.random() < table.itemChance) {
      const tier = rollInt(table.tierMin, table.tierMax);
      addRewardItem(randomItem(tier, 'loot'));
    }
  }
  removeEnemy(id);
}
