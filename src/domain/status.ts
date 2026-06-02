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
  // dmgPerSec is the per-second rate. tickIntervalSec controls how
  // often it actually lands - so burn at 120 dps / 0.5s tick lands
  // 60 damage twice per second, while poison at 70 dps / 1.0s tick
  // lands 70 once per second. Average dps stays interpretable; per-
  // tick numbers feel impactful instead of dripping.
  dmgPerSec: number; // 0 = no DoT, tickIntervalSec is then ignored
  tickIntervalSec: number;
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
    tickIntervalSec: 0.5,
  },
  bleed: {
    emoji: '🩸',
    color: '#ff5252',
    damageType: 'physical',
    durationSec: 4,
    dmgPerSec: 90,
    tickIntervalSec: 1,
  },
  poison: {
    emoji: '☠️',
    color: '#7fe57f',
    damageType: 'chaos',
    durationSec: 5,
    dmgPerSec: 70,
    tickIntervalSec: 1,
  },
  freeze: {
    emoji: '❄️',
    color: '#88c8ff',
    damageType: 'cold',
    durationSec: 2,
    dmgPerSec: 0,
    tickIntervalSec: 0,
    attackIntervalMul: 1.6,
  },
  shock: {
    emoji: '⚡',
    color: '#ffd84a',
    damageType: 'lightning',
    durationSec: 3,
    dmgPerSec: 0,
    tickIntervalSec: 0,
    takeDamageMul: 1.3,
  },
};

// Per-fighter state of one active status. nextTickIn counts down
// to the next discrete DoT application; ignored for non-DoT statuses.
export interface StatusInstance {
  remainingSec: number;
  nextTickIn: number;
  // Potency multiplier on this instance's DoT, from a `potency` support
  // (Virulent). Absent means 1 (no boost). Duration potency is folded into
  // remainingSec at apply time, so only the damage multiplier persists here.
  dmgMul?: number;
}

// Returned by tickStatuses so the Battlefield can paint a coloured
// damage number on the right view.
export interface DoTEvent {
  targetId: string;
  status: StatusType;
  amount: number;
}
