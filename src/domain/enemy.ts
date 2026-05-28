import type { DamageType, StatusType } from './enchant';

export type EnemyKind = 'common' | 'elite' | 'boss';
export type Locomotion = 'grounded' | 'flying';

export interface EnemyDef {
  id: string;
  nameKey: string;
  emoji: string;
  hp: number;
  damage: number;
  damageType: DamageType;
  interval: number; // seconds between attacks
  resist: number; // 0..1, flat damage reduction
  dodge: number; // 0..1
  loc: Locomotion;
  kind: EnemyKind;
  // Optional flavour: status the enemy applies on hit (Slime poisons, Lich
  // poisons, Pyroclasm-style enemies could burn, etc.).
  appliesStatus?: StatusType;
  // Taunt schedule: every intervalSec the enemy yanks the player's
  // target onto itself and locks it there for durationSec (click-
  // override suppressed during the lock). Minotaur's signature
  // mechanic per docs/enemies.md.
  taunt?: { intervalSec: number; durationSec: number };
}
