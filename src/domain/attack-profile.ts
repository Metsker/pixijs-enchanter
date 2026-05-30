import type { DamageType, EnchantEffect } from './enchant';

export interface AttackProfile {
  damage: number;
  type: DamageType;
  interval: number;
  critChance: number; // 0..1
  critMultiplier: number; // default 2.0
  lifesteal: number; // 0..1
}

export const UNARMED: AttackProfile = {
  damage: 50,
  type: 'physical',
  interval: 3.0,
  critChance: 0,
  critMultiplier: 2.0,
  lifesteal: 0,
};

const BASE_DAMAGE = 0;
const BASE_TYPE: DamageType = 'physical';
// Base seconds between the player's auto-attacks (lower = faster). Speed-add /
// interval-reduction effects shorten it further. Bumped down from 1.5 so the
// player swings noticeably faster out of the box.
const BASE_INTERVAL = 1.1;
const BASE_CRIT_MUL = 2.0;
const INTERVAL_FLOOR = 0.3;

// Stacking rule per CONTEXT.md: same-stat effects sum additively, then the
// resulting value is clamped to sane bounds. Different mechanisms (Swift's
// interval reduction vs Quickening's attack-speed bonus) combine
// multiplicatively because they're different stats.
//
// Effect kinds not yet wired into combat (statuses, splash, chain,
// multistrike, conditionals, auras, the entire defence side, economy,
// uniques) are catalogued so the Inspector can show them, but resolveProfile
// silently passes them through for now. They land in a later combat-depth
// step.
//
// Input is the flat list of gem-resolved stat effects (see
// player-profile.ts § playerEffects) - one level flatter than the old
// per-enchant shape.
export function resolveProfile(effects: EnchantEffect[]): AttackProfile {
  let damage = BASE_DAMAGE;
  let intervalReduction = 0;
  let speedAdd = 0;
  let critChance = 0;
  let critMulBonus = 0;
  let lifesteal = 0;

  for (const eff of effects) {
    switch (eff.kind) {
      case 'damage-add':
      case 'damage-split':
        damage += eff.amount;
        break;
      case 'interval-reduction':
        intervalReduction += eff.amount;
        break;
      case 'attack-speed-add':
        speedAdd += eff.amount;
        break;
      case 'crit-chance-add':
        critChance += eff.amount;
        break;
      case 'crit-mul-add':
        critMulBonus += eff.amount;
        break;
      case 'lifesteal-add':
        lifesteal += eff.fraction;
        break;
      // Everything else: not yet wired into combat. The Inspector still
      // shows the effect via its description text.
    }
  }

  if (damage <= 0) return UNARMED;

  const interval = Math.max(
    INTERVAL_FLOOR,
    (BASE_INTERVAL * (1 - intervalReduction)) / (1 + speedAdd),
  );

  return {
    damage,
    type: BASE_TYPE,
    interval,
    critChance: Math.max(0, Math.min(1, critChance)),
    critMultiplier: BASE_CRIT_MUL + critMulBonus,
    lifesteal: Math.max(0, lifesteal),
  };
}
