import type { StatusType } from './enchant';
import type { StatusInstance } from './status';

export type FighterKind = 'player' | 'enemy';

export interface Fighter {
  id: string;
  kind: FighterKind;
  name: string;
  emoji: string;
  hp: number;
  maxHp: number;
  // 1-indexed phase indices that have already triggered (boss phase spawns).
  triggeredPhases?: number[];
  // Difficulty-scaled combat stats baked at creation (makeFighters). When
  // present, the battlefield reads these instead of the raw ENEMY_CATALOGUE
  // values so a run's locked difficulty stays applied even after reload.
  // Enemies only; the player never carries them.
  damage?: number;
  interval?: number; // seconds between attacks
  resist?: number; // 0..cap, flat damage reduction
  // Active statuses (burn/bleed/poison/freeze/shock). Refresh-on-re-apply
  // single-instance model; statuses tick down per frame in
  // tickStatuses(). Empty/undefined = nothing afflicted.
  statuses?: Partial<Record<StatusType, StatusInstance>>;
}
