import type { DamageType, EnchantEffect } from './enchant';

export interface AttackProfile {
  damage: number;
  type: DamageType;
  interval: number;
  critChance: number; // 0..1
  critMultiplier: number; // default 2.0
  lifesteal: number; // 0..1
  // Global outgoing-damage multiplier (Shaped Glass x2). Applied on TOP of all
  // other damage math to every source the player deals (auto-attack, procs,
  // minion bites, DoT). 1 = no change.
  allDamageMul: number;
}

// Fallback swing for a build with NO flat damage at all. With a non-zero
// BASE_DAMAGE the player always has an innate attack, so this is effectively
// unreachable now - kept (and matched to the base) so the resolver's
// damage<=0 guard can never produce the old feeble 50/3.0s swing.
export const UNARMED: AttackProfile = {
  damage: 130,
  type: 'physical',
  interval: 1.0,
  critChance: 0,
  critMultiplier: 2.0,
  lifesteal: 0,
  allDamageMul: 1,
};

// The player's INNATE auto-attack, before any gem. Non-zero so the bare swing
// is a real weapon (early common rooms are clearable with no gems) and gems
// stack ADD-on damage rather than being the sole source of it. Tuned so a
// fresh run beats single early commons sweaty-but-safe (see the balance sim);
// flat damage gems (Edge +150, Covenant +300) roughly 2-3x it.
const BASE_DAMAGE = 130;
const BASE_TYPE: DamageType = 'physical';
// Base seconds between the player's auto-attacks (lower = faster). Speed-add /
// interval-reduction effects shorten it further. 1.0s reads as a steady,
// responsive swing the build accelerates from.
const BASE_INTERVAL = 1.0;
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
  // Global outgoing-damage multiplier: every all-damage-mul effect compounds
  // (one per Shaped Glass). Defaults to 1 so an empty build is unchanged.
  let allDamageMul = 1;
  // Damage contributed per type, so the auto-attack takes on the type the
  // build leans into. This is what lets enemy resistType / weakType bite -
  // slot enough fire and your swing reads as fire (docs/decisions-that-matter).
  const byType: Partial<Record<DamageType, number>> = {};

  for (const eff of effects) {
    switch (eff.kind) {
      case 'damage-add':
        damage += eff.amount;
        byType[eff.type] = (byType[eff.type] ?? 0) + eff.amount;
        break;
      case 'damage-split':
        // Untyped flat add: counts toward damage but doesn't sway the type.
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
      case 'all-damage-mul':
        // Shaped Glass: global outgoing-damage multiplier, compounds across
        // copies. Applied by combat (battlefield.ts) to every damage source.
        allDamageMul *= eff.factor;
        break;
      // Everything else: not yet wired into combat. The Inspector still
      // shows the effect via its description text.
    }
  }

  // Safety floor: BASE_DAMAGE is non-zero so this never fires in practice, but
  // if a future negative modifier ever zeroed the swing, fall back to the
  // unarmed profile while still honouring a global damage multiplier.
  if (damage <= 0) return { ...UNARMED, allDamageMul };

  const interval = Math.max(
    INTERVAL_FLOOR,
    (BASE_INTERVAL * (1 - intervalReduction)) / (1 + speedAdd),
  );

  // Dominant type: the element the build pours the most flat damage into.
  // Ties and an all-untyped build fall back to physical.
  let type: DamageType = BASE_TYPE;
  let best = 0;
  for (const [t, amt] of Object.entries(byType) as [DamageType, number][]) {
    if (amt > best) {
      best = amt;
      type = t;
    }
  }

  return {
    damage,
    type,
    interval,
    critChance: Math.max(0, Math.min(1, critChance)),
    critMultiplier: BASE_CRIT_MUL + critMulBonus,
    lifesteal: Math.max(0, lifesteal),
    allDamageMul: Math.max(0, allDamageMul),
  };
}
