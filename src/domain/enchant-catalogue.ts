// All 54 enchants per docs/enchant-catalogue.md, plus the 7 Unique-pool
// enchants. Numbers are placeholders per the catalogue's own note - the
// EFFECTS are locked, the values tune during playtesting.
//
// nameKey + descriptionKey route every user-visible string through the i18n
// catalogue (see src/i18n/en.ts).

import type { Enchantment, EnchantLayer, EnchantPool, EnchantEffect } from './enchant';

function mk(
  id: string,
  emoji: string,
  pools: EnchantPool[],
  layer: EnchantLayer,
  effects: EnchantEffect[],
): Enchantment {
  return {
    id,
    nameKey: `enchant.${id}.name`,
    descriptionKey: `enchant.${id}.desc`,
    emoji,
    pools,
    layer,
    effects,
  };
}

// === Weapons - Main (8) ===
export const SHARPNESS = mk('sharpness', '⚔️', ['weapons'], 'main', [
  { kind: 'damage-add', amount: 300, type: 'physical' },
]);
export const PYROCLASM = mk('pyroclasm', '🔥', ['weapons'], 'main', [
  { kind: 'damage-add', amount: 200, type: 'fire' },
  { kind: 'status-on-hit', status: 'burn', chance: 0.25 },
]);
export const FROSTBITE = mk('frostbite', '❄️', ['weapons'], 'main', [
  { kind: 'damage-add', amount: 200, type: 'cold' },
  { kind: 'status-on-hit', status: 'freeze', chance: 0.25 },
]);
export const VOLTAIC = mk('voltaic', '⚡', ['weapons'], 'main', [
  { kind: 'damage-add', amount: 200, type: 'lightning' },
  { kind: 'status-on-hit', status: 'shock', chance: 0.25 },
]);
export const ENVENOM = mk('envenom', '☠️', ['weapons'], 'main', [
  { kind: 'damage-add', amount: 180, type: 'chaos' },
  { kind: 'status-on-hit', status: 'poison', chance: 0.5 },
]);
export const SMITE = mk('smite', '💥', ['weapons'], 'main', [
  { kind: 'damage-add', amount: 250, type: 'physical' },
  { kind: 'damage-vs-high-hp', bonusFraction: 0.5, threshold: 0.8 },
]);
export const BANE = mk('bane', '🦴', ['weapons'], 'main', [
  { kind: 'damage-add', amount: 250, type: 'chaos' },
  { kind: 'damage-vs-low-hp', bonusFraction: 0.75, threshold: 0.3 },
]);
export const RESONANCE = mk('resonance', '🌈', ['weapons'], 'main', [
  { kind: 'damage-split', amount: 500 },
]);

// === Weapons - Utility (10) ===
export const SWIFT = mk('swift', '💨', ['weapons'], 'utility', [
  { kind: 'interval-reduction', amount: 0.2 },
]);
export const PRECISION = mk('precision', '🎯', ['weapons', 'jewelry'], 'utility', [
  { kind: 'crit-chance-add', amount: 0.15 },
]);
export const BRUTALITY = mk('brutality', '💢', ['weapons', 'jewelry'], 'utility', [
  { kind: 'crit-mul-add', amount: 0.5 },
]);
export const VAMPIRIC = mk('vampiric', '🩸', ['weapons', 'jewelry'], 'utility', [
  { kind: 'lifesteal-add', fraction: 0.05 },
]);
export const KNOCKBACK = mk('knockback', '👊', ['weapons'], 'utility', [
  { kind: 'knockback-on-hit', chance: 0.25, durationSec: 1.0 },
]);
export const SWEEPING_EDGE = mk('sweeping-edge', '🌪️', ['weapons'], 'utility', [
  { kind: 'splash-add', fraction: 0.4, flag: 'grounded-only' },
]);
export const CONDUCTION = mk('conduction', '🔗', ['weapons'], 'utility', [
  { kind: 'chain-add', targets: 2, damage: 500 },
]);
export const MULTISTRIKE = mk('multistrike', '✌️', ['weapons'], 'utility', [
  { kind: 'multistrike-chance', chance: 0.25 },
]);
export const BERSERKER = mk('berserker', '😡', ['weapons', 'jewelry'], 'utility', [
  { kind: 'damage-mul-low-hp', perPercentMissing: 0.05, cap: 0.5 },
]);
export const ADRENALINE = mk('adrenaline', '💪', ['weapons', 'jewelry'], 'utility', [
  { kind: 'speed-burst-on-kill', bonusFraction: 0.3, durationSec: 3 },
]);

// === Armor - Main (4) ===
export const VITALITY = mk('vitality', '❤️', ['armor'], 'main', [
  { kind: 'hp-max-add', amount: 500 },
]);
export const WARDING = mk('warding', '🛡️', ['armor', 'jewelry'], 'main', [
  { kind: 'resist-add', amount: 0.3, type: 'rolled' },
]);
export const FORTITUDE = mk('fortitude', '🪨', ['armor'], 'main', [
  { kind: 'damage-reduction', amount: 0.15 },
]);
export const DODGE = mk('dodge', '🌀', ['armor'], 'main', [
  { kind: 'dodge-add', amount: 0.2 },
]);

// === Armor - Utility (11) ===
export const THORNS = mk('thorns', '🌹', ['armor'], 'utility', [
  { kind: 'thorns-flat', amount: 250 },
]);
export const REACTIVE_CURSE = mk('reactive-curse', '🪄', ['armor'], 'utility', [
  { kind: 'reactive-status', chance: 0.25 },
]);
export const COUNTER_ATTACK = mk('counter-attack', '🔁', ['armor'], 'utility', [
  { kind: 'counter-attack', fraction: 0.25 },
]);
export const RESILIENT = mk('resilient', '🧱', ['armor'], 'utility', [
  { kind: 'big-hit-reduction', threshold: 500, reductionFraction: 0.5 },
]);
export const DEFIANCE = mk('defiance', '🦁', ['armor'], 'utility', [
  { kind: 'damage-reduction-low-hp', amount: 0.5, threshold: 0.25 },
]);
export const FROST_AURA = mk('frost-aura', '❄️', ['armor'], 'utility', [
  { kind: 'aura-on-hit', status: 'freeze', chance: 0.15 },
]);
export const BURN_AURA = mk('burn-aura', '🔥', ['armor'], 'utility', [
  { kind: 'aura-on-hit', status: 'burn', chance: 0.15 },
]);
export const SHOCK_AURA = mk('shock-aura', '⚡', ['armor'], 'utility', [
  { kind: 'aura-on-hit', status: 'shock', chance: 0.15 },
]);
export const POISON_CLOUD = mk('poison-cloud', '☁️', ['armor'], 'utility', [
  { kind: 'aura-on-hit', status: 'poison', chance: 0.15 },
]);
export const BLEED_AURA = mk('bleed-aura', '🩸', ['armor'], 'utility', [
  { kind: 'aura-on-hit', status: 'bleed', chance: 0.15 },
]);
export const STOIC = mk('stoic', '🧘', ['armor'], 'utility', [
  { kind: 'stoic', fraction: 0.25, durationSec: 3 },
]);

// === Jewelry - Main (6) ===
export const REGENERATION = mk('regeneration', '✨', ['jewelry'], 'main', [
  { kind: 'regen', amount: 50 },
]);
export const LIFEDRAIN = mk('lifedrain', '🧛', ['jewelry'], 'main', [
  { kind: 'lifesteal-add', fraction: 0.05 },
]);
export const TREASURE_HUNTER = mk('treasure-hunter', '💰', ['jewelry'], 'main', [
  { kind: 'gold-find', goldFraction: 0.25, itemDropFraction: 0.25 },
]);
export const CRYSTAL_AFFINITY = mk('crystal-affinity', '💎', ['jewelry'], 'main', [
  { kind: 'crystal-affinity', fraction: 0.5 },
]);
export const AVATAR_OF_ELEMENT = mk('avatar-of-element', '🌟', ['jewelry'], 'main', [
  { kind: 'convert-physical-rolled', toType: 'fire', fraction: 0.5 },
]);
export const PRISM = mk('prism', '🌈', ['jewelry'], 'main', [
  { kind: 'convert-physical-random', fraction: 0.5 },
]);

// === Jewelry - Utility (8) ===
export const QUICKENING = mk('quickening', '⏩', ['weapons', 'jewelry'], 'utility', [
  { kind: 'attack-speed-add', amount: 0.1 },
]);
export const FOCUS = mk('focus', '🔍', ['weapons', 'jewelry'], 'utility', [
  { kind: 'crit-chance-add', amount: 0.05 },
]);
export const HEX_WARD = mk('hex-ward', '🪬', ['armor', 'jewelry'], 'utility', [
  { kind: 'status-resist-chance', chance: 0.1 },
]);
export const RESONANT_HUM = mk('resonant-hum', '🎵', ['jewelry'], 'utility', [
  { kind: 'damage-from-max-hp', fractionOfMaxHp: 0.1 },
]);
export const VITAL_SPRING = mk('vital-spring', '💚', ['armor', 'jewelry'], 'utility', [
  { kind: 'hp-max-add', amount: 200 },
]);
export const REFLEXES = mk('reflexes', '👁️', ['armor', 'jewelry'], 'utility', [
  { kind: 'dodge-add', amount: 0.05 },
]);
export const RAZOR_WIT = mk('razor-wit', '🗡️', ['jewelry'], 'utility', [
  { kind: 'on-dodge-damage-buff', bonusFraction: 0.2, durationSec: 2 },
]);
export const LAST_STAND = mk('last-stand', '🏁', ['jewelry'], 'utility', [
  { kind: 'damage-reduction-low-hp', amount: 0.3, threshold: 0.25 },
]);

// === Unique (7) ===
export const LICHCROWN = mk('lichcrown', '👑', ['unique'], 'main', [
  { kind: 'on-kill-aura', durationSec: 30 },
]);
export const PHOENIX_FORM = mk('phoenix-form', '🐦', ['unique'], 'main', [
  { kind: 'revive-on-death', hpFraction: 0.5, once: true },
]);
export const GLASS_CANNON = mk('glass-cannon', '💥', ['unique'], 'main', [
  { kind: 'damage-mul-low-hp', perPercentMissing: 0, cap: 0.75 },
  { kind: 'hp-max-mul', factor: 0.5 },
]);
export const ETERNAL_VIGIL = mk('eternal-vigil', '🕊️', ['unique'], 'main', [
  { kind: 'status-immune' },
]);
export const VORPAL_EDGE = mk('vorpal-edge', '🗡️', ['unique'], 'main', [
  { kind: 'all-crit-replace-mul', replacedMul: 1.5 },
]);
export const DORYANIS_HEART = mk('doryanis-heart', '💗', ['unique'], 'main', [
  { kind: 'damage-per-max-hp', perHundred: 0.01 },
]);
export const MIRROR_IMAGE = mk('mirror-image', '👥', ['unique'], 'main', [
  { kind: 'mirror-charge', intervalSec: 8, maxCharges: 1 },
]);

export const ENCHANT_CATALOGUE: Record<string, Enchantment> = Object.fromEntries(
  [
    SHARPNESS, PYROCLASM, FROSTBITE, VOLTAIC, ENVENOM, SMITE, BANE, RESONANCE,
    SWIFT, PRECISION, BRUTALITY, VAMPIRIC, KNOCKBACK, SWEEPING_EDGE, CONDUCTION,
    MULTISTRIKE, BERSERKER, ADRENALINE,
    VITALITY, WARDING, FORTITUDE, DODGE,
    THORNS, REACTIVE_CURSE, COUNTER_ATTACK, RESILIENT, DEFIANCE,
    FROST_AURA, BURN_AURA, SHOCK_AURA, POISON_CLOUD, BLEED_AURA, STOIC,
    REGENERATION, LIFEDRAIN, TREASURE_HUNTER, CRYSTAL_AFFINITY,
    AVATAR_OF_ELEMENT, PRISM,
    QUICKENING, FOCUS, HEX_WARD, RESONANT_HUM, VITAL_SPRING, REFLEXES,
    RAZOR_WIT, LAST_STAND,
    LICHCROWN, PHOENIX_FORM, GLASS_CANNON, ETERNAL_VIGIL, VORPAL_EDGE,
    DORYANIS_HEART, MIRROR_IMAGE,
  ].map((e) => [e.id, e]),
);
