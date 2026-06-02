export type DamageType = 'physical' | 'fire' | 'cold' | 'lightning' | 'chaos';
export type StatusType = 'bleed' | 'burn' | 'freeze' | 'shock' | 'poison';

// The full effect union. resolveProfile in attack-profile.ts handles the
// attack-side simple kinds (damage-add, damage-split, interval-reduction,
// attack-speed-add, crit-chance-add, crit-mul-add, lifesteal-add). The
// defence-side and conditional / reactive / on-kill kinds are catalogued so
// they show up in the Inspector but don't yet drive combat math - they'll
// be wired in a later combat-depth step.
export type EnchantEffect =
  // Attack-side, immediately resolved
  | { kind: 'damage-add'; amount: number; type: DamageType }
  | { kind: 'damage-split'; amount: number }
  | { kind: 'interval-reduction'; amount: number }
  | { kind: 'attack-speed-add'; amount: number }
  | { kind: 'crit-chance-add'; amount: number }
  | { kind: 'crit-mul-add'; amount: number }
  | { kind: 'lifesteal-add'; fraction: number }
  // Attack-side. status-on-hit is wired in landDamage; dmgMul / durMul are an
  // optional ailment potency a bound Virulent support stamps on (default 1).
  | { kind: 'status-on-hit'; status: StatusType; chance: number; dmgMul?: number; durMul?: number }
  | { kind: 'splash-add'; fraction: number; flag?: 'grounded-only' }
  | { kind: 'chain-add'; targets: number; damage: number }
  | { kind: 'multistrike-chance'; chance: number }
  | { kind: 'knockback-on-hit'; chance: number; durationSec: number }
  | { kind: 'damage-mul-low-hp'; perPercentMissing: number; cap: number }
  | { kind: 'speed-burst-on-kill'; bonusFraction: number; durationSec: number }
  | { kind: 'damage-from-max-hp'; fractionOfMaxHp: number }
  | { kind: 'damage-per-max-hp'; perHundred: number }
  // Defence-side, not yet wired into combat
  | { kind: 'hp-max-add'; amount: number }
  | { kind: 'hp-max-mul'; factor: number }
  | { kind: 'dodge-add'; amount: number }
  | { kind: 'damage-reduction'; amount: number }
  | { kind: 'damage-reduction-low-hp'; amount: number; threshold: number }
  | { kind: 'big-hit-reduction'; threshold: number; reductionFraction: number }
  | { kind: 'stoic'; fraction: number; durationSec: number }
  | { kind: 'thorns-flat'; amount: number }
  | { kind: 'reactive-status'; chance: number }
  | { kind: 'counter-attack'; fraction: number }
  | { kind: 'on-dodge-damage-buff'; bonusFraction: number; durationSec: number }
  | { kind: 'regen'; amount: number }
  | { kind: 'aura-on-hit'; status: StatusType; chance: number }
  | { kind: 'status-resist-chance'; chance: number }
  | { kind: 'status-immune' }
  // Economy
  | { kind: 'gold-find'; goldFraction: number; itemDropFraction: number }
  | { kind: 'crystal-affinity'; fraction: number }
  // Unique-only specials
  | { kind: 'on-kill-aura'; durationSec: number }
  | { kind: 'revive-on-death'; hpFraction: number; once: true }
  | { kind: 'all-crit-replace-mul'; replacedMul: number }
  | { kind: 'mirror-charge'; intervalSec: number; maxCharges: number };
