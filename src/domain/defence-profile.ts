import type { DamageType, Enchantment } from './enchant';

// The "you take damage" half of the player's stat block. Mirrors
// attack-profile.ts in shape so combat code can read both via the
// player-profile store. Effect kinds the resolver doesn't yet handle
// (conditional or reactive variants like damage-reduction-low-hp,
// counter-attack, on-dodge-damage-buff, status-immune, etc.) are
// catalogued so the Inspector shows them but pass through silently
// here - they'll land in a follow-up combat-depth step.
export interface DefenceProfile {
  maxHp: number;
  dodge: number; // 0..1
  hpRegenPerSec: number;
  damageReduction: number; // 0..1 flat pre-resist
  thornsFlat: number; // damage reflected per incoming hit
  resists: Partial<Record<DamageType, number>>; // 0..1 per type
}

// Player baseline before any equipped enchant kicks in. The 1000 HP /
// 0 dodge / 0 regen numbers match the prior hardcoded values in
// fight.ts so behavior is unchanged when the player has nothing
// equipped.
const BASE_MAX_HP = 1000;

export const BASE_DEFENCE: DefenceProfile = {
  maxHp: BASE_MAX_HP,
  dodge: 0,
  hpRegenPerSec: 0,
  damageReduction: 0,
  thornsFlat: 0,
  resists: {},
};

// Stacking: same-stat effects sum additively; hp-max-mul applies after
// the additive pass (one multiplier per Unique). Dodge / DR / resists
// are clamped to [0, 0.95] so even fully-stacked builds can't make
// the player unhittable.
const DODGE_CAP = 0.95;
const DR_CAP = 0.95;
const RESIST_CAP = 0.95;

export function resolveDefence(enchants: Enchantment[]): DefenceProfile {
  let maxHp = BASE_MAX_HP;
  let maxHpMul = 1;
  let dodge = 0;
  let regen = 0;
  let dr = 0;
  let thorns = 0;
  const resists: Partial<Record<DamageType, number>> = {};

  for (const enchant of enchants) {
    for (const eff of enchant.effects) {
      switch (eff.kind) {
        case 'hp-max-add':
          maxHp += eff.amount;
          break;
        case 'hp-max-mul':
          maxHpMul *= eff.factor;
          break;
        case 'dodge-add':
          dodge += eff.amount;
          break;
        case 'regen':
          regen += eff.amount;
          break;
        case 'damage-reduction':
          dr += eff.amount;
          break;
        case 'thorns-flat':
          thorns += eff.amount;
          break;
        case 'resist-add':
          // "rolled" type is decided at item-gen time (not yet wired);
          // treat unrolled as physical-only for now so the field at
          // least stacks somewhere visible.
          if (eff.type && eff.type !== 'rolled') {
            resists[eff.type] = (resists[eff.type] ?? 0) + eff.amount;
          }
          break;
        // Conditional / reactive / status / unique kinds: silently
        // pass through. The Inspector still surfaces them via the
        // description text.
      }
    }
  }

  for (const type of Object.keys(resists) as DamageType[]) {
    resists[type] = Math.min(RESIST_CAP, Math.max(0, resists[type] ?? 0));
  }

  return {
    maxHp: Math.max(1, Math.floor(maxHp * maxHpMul)),
    dodge: Math.min(DODGE_CAP, Math.max(0, dodge)),
    hpRegenPerSec: Math.max(0, regen),
    damageReduction: Math.min(DR_CAP, Math.max(0, dr)),
    thornsFlat: Math.max(0, thorns),
    resists,
  };
}
