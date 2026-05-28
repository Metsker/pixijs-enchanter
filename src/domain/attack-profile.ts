import type { DamageType, Enchantment } from './enchant';

export interface AttackProfile {
  damage: number;
  type: DamageType;
  interval: number;
}

export const UNARMED: AttackProfile = {
  damage: 50,
  type: 'physical',
  interval: 3.0,
};

const BASE_DAMAGE = 0;
const BASE_TYPE: DamageType = 'physical';
const BASE_INTERVAL = 1.5;
const INTERVAL_FLOOR = 0.3;

export function resolveProfile(enchants: Enchantment[]): AttackProfile {
  let damage = BASE_DAMAGE;

  for (const e of enchants) {
    if (e.effect.kind === 'damage-add') {
      damage += e.effect.amount;
    }
  }

  if (damage <= 0) return UNARMED;

  return {
    damage,
    type: BASE_TYPE,
    interval: Math.max(INTERVAL_FLOOR, BASE_INTERVAL),
  };
}
