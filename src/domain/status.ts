import type { DamageType, StatusType } from './enchant';

// Status archetypes. DoTs (burn/bleed/poison) tick dmgPerSec for
// durationSec. Freeze multiplies the afflicted fighter's attack
// interval. Shock multiplies the damage they take from every source.
// Apply rules sum chance per source; refresh-duration on re-apply
// (one instance per status per fighter, no stacks for now).
export interface StatusDef {
  emoji: string;
  color: string; // hex CSS color for DoT damage numbers + status icons
  damageType: DamageType;
  durationSec: number;
  dmgPerSec: number; // 0 = no DoT
  attackIntervalMul?: number; // freeze: e.g. 1.5x slower swings
  takeDamageMul?: number; // shock: e.g. 1.25x more damage taken
}

export const STATUS_DEFS: Record<StatusType, StatusDef> = {
  burn: {
    emoji: '🔥',
    color: '#ff8a3c',
    damageType: 'fire',
    durationSec: 3,
    dmgPerSec: 120,
  },
  bleed: {
    emoji: '🩸',
    color: '#ff5252',
    damageType: 'physical',
    durationSec: 4,
    dmgPerSec: 90,
  },
  poison: {
    emoji: '☠️',
    color: '#7fe57f',
    damageType: 'chaos',
    durationSec: 5,
    dmgPerSec: 70,
  },
  freeze: {
    emoji: '❄️',
    color: '#88c8ff',
    damageType: 'cold',
    durationSec: 2,
    dmgPerSec: 0,
    attackIntervalMul: 1.6,
  },
  shock: {
    emoji: '⚡',
    color: '#ffd84a',
    damageType: 'lightning',
    durationSec: 3,
    dmgPerSec: 0,
    takeDamageMul: 1.3,
  },
};

// Per-fighter state of one active status. accumulatedDmg lets us
// drip sub-1-hp DoT damage at 60fps without losing precision.
export interface StatusInstance {
  remainingSec: number;
  accumulatedDmg: number;
}

// Returned by tickStatuses so the Battlefield can paint a coloured
// damage number on the right view.
export interface DoTEvent {
  targetId: string;
  status: StatusType;
  amount: number;
}
