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
  // Active statuses (burn/bleed/poison/freeze/shock). Refresh-on-re-apply
  // single-instance model; statuses tick down per frame in
  // tickStatuses(). Empty/undefined = nothing afflicted.
  statuses?: Partial<Record<StatusType, StatusInstance>>;
}
