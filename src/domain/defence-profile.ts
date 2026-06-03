import type { EnchantEffect } from './enchant';

// The "you take damage" half of the player's stat block. Mirrors
// attack-profile.ts in shape so combat code can read both via the
// player-profile store. Effect kinds the resolver doesn't yet handle
// (conditional or reactive variants like damage-reduction-low-hp,
// counter-attack, on-dodge-damage-buff, status-immune, etc.) are
// catalogued so the Inspector shows them but pass through silently
// here - they'll land in a follow-up combat-depth step.
//
// Mitigation is deliberately simple: a flat dodge chance (full miss) plus a
// flat damage reduction. There is no per-element resist - "armor" is just the
// damageReduction number.
export interface DefenceProfile {
  maxHp: number;
  dodge: number; // 0..1
  hpRegenPerSec: number;
  damageReduction: number; // 0..1 flat
  thornsFlat: number; // damage reflected per incoming hit
  // Covenant trade-off: when true, the player can no longer heal AT ALL
  // (lifesteal, the Sanctuary heal proc, and regen are all gated on this).
  // Honoured everywhere the player would GAIN HP. (Shields and Blood Pact's
  // HP cost are unaffected - neither is healing.)
  noHeal: boolean;
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
  noHeal: false,
};

// Stacking: same-stat effects sum additively; hp-max-mul applies after
// the additive pass (one multiplier per Unique). Dodge / DR are clamped
// to [0, 0.95] so even fully-stacked builds can't make the player
// unhittable.
const DODGE_CAP = 0.95;
const DR_CAP = 0.95;

// Input is the flat list of gem-resolved stat effects (see
// player-profile.ts § playerEffects) - one level flatter than the old
// per-enchant shape.
export function resolveDefence(effects: EnchantEffect[]): DefenceProfile {
  let maxHp = BASE_MAX_HP;
  let maxHpMul = 1;
  let dodge = 0;
  let regen = 0;
  let dr = 0;
  let thorns = 0;
  // Covenant: any no-heal effect flips this on for the whole build.
  let noHeal = false;

  for (const eff of effects) {
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
      case 'no-heal':
        // Covenant: suppress all player healing (gated in battlefield.ts).
        noHeal = true;
        break;
      // Conditional / reactive / status / unique kinds: silently
      // pass through. The Inspector still surfaces them via the
      // description text.
    }
  }

  return {
    maxHp: Math.max(1, Math.floor(maxHp * maxHpMul)),
    dodge: Math.min(DODGE_CAP, Math.max(0, dodge)),
    hpRegenPerSec: Math.max(0, regen),
    damageReduction: Math.min(DR_CAP, Math.max(0, dr)),
    thornsFlat: Math.max(0, thorns),
    noHeal,
  };
}
