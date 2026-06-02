// The gem pool (see docs/gem-catalogue.md). 44 gems: 16 procs, 13 stats, 15
// supports. Numbers are placeholders per the catalogue's own note - the
// BEHAVIOURS are locked here, values tune in playtesting.
//
// Visual primitive ids (docs/gems.md § Visual primitives):
//   strike-line · expanding-ring · falling-body · drifting-orb ·
//   orbiting-sprite · glow
//
// Stat gems wire into the existing EnchantEffect union so they aggregate into
// the single player profile exactly as before:
//   Edge      -> damage-add (physical)   Heart     -> hp-max-add
//   Swiftness -> attack-speed-add         Keen      -> crit-chance-add
// attack-speed-add / crit-chance-add amounts are fractions (0.12 = +12%).

import type { GemDef } from './gem';

export const GEM_CATALOGUE: Record<string, GemDef> = {
  // ----------------------------------------------------------------------
  // Weapon gems (18) - offense
  // ----------------------------------------------------------------------

  // Effect (proc) - timer 3s: bolt a random enemy for 200 lightning.
  'chain-lightning': {
    id: 'chain-lightning',
    emoji: '⚡',
    class: 'weapon',
    role: 'effect',
    proc: {
      trigger: 'timer',
      cooldownSec: 3,
      payload: { kind: 'damage', damage: 200, damageType: 'lightning' },
      targeting: 'random',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'strike-line',
      emoji: '⚡',
    },
  },
  // Effect (proc) - timer 6s: random enemy takes 350 fire (+ small splash, tbd).
  meteor: {
    id: 'meteor',
    emoji: '☄️',
    class: 'weapon',
    role: 'effect',
    proc: {
      trigger: 'timer',
      cooldownSec: 6,
      payload: { kind: 'damage', damage: 350, damageType: 'fire' },
      targeting: 'random',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'falling-body',
      emoji: '☄️',
    },
  },
  // Effect (proc) - timer 5s: ring from you, 150 cold to all + Freeze chance.
  'frost-nova': {
    id: 'frost-nova',
    emoji: '❄️',
    class: 'weapon',
    role: 'effect',
    proc: {
      trigger: 'timer',
      cooldownSec: 5,
      payload: { kind: 'damage', damage: 150, damageType: 'cold' },
      targeting: 'all',
      count: 1,
      canCrit: false,
      riders: ['freeze'],
      visual: 'expanding-ring',
      emoji: '❄️',
    },
  },
  // Effect (proc) - continuous: orbiting blade, 120 physical on contact.
  whirlblade: {
    id: 'whirlblade',
    emoji: '🗡️',
    class: 'weapon',
    role: 'effect',
    proc: {
      trigger: 'continuous',
      cooldownSec: 1,
      payload: { kind: 'damage', damage: 120, damageType: 'physical' },
      targeting: 'nearest',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'orbiting-sprite',
      emoji: '🗡️',
    },
  },
  // Effect (proc) - timer 6s: summon a wolf that lopes to the nearest enemy and
  // bites for 90 physical every 1s, fading after 6s. The summoner backbone -
  // every weapon support stacks on it (Forking +1 wolf, Overload bigger bites,
  // Igniting / Serrated a burning / bleeding wolf).
  'spirit-wolf': {
    id: 'spirit-wolf',
    emoji: '🐺',
    class: 'weapon',
    role: 'effect',
    proc: {
      trigger: 'timer',
      cooldownSec: 6,
      payload: {
        kind: 'summon',
        emoji: '🐺',
        damage: 90,
        damageType: 'physical',
        intervalSec: 1,
        lifespanSec: 6,
        orbit: false,
      },
      targeting: 'nearest',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'glow',
      emoji: '🐺',
    },
  },
  // Effect (proc) - on-kill: burst at the corpse, 250 to nearby enemies.
  'soul-reap': {
    id: 'soul-reap',
    emoji: '💀',
    class: 'weapon',
    role: 'effect',
    proc: {
      trigger: 'on-kill',
      cooldownSec: 0,
      payload: { kind: 'damage', damage: 250, damageType: 'physical' },
      targeting: 'all',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'expanding-ring',
      emoji: '💀',
    },
  },
  // Effect (proc) - on-crit: echo your auto-attack for 60% of its damage. Uses
  // the attack-echo payload so it scales with your real attack profile (Edge /
  // Brutality / etc.) instead of a flat placeholder.
  'vault-strike': {
    id: 'vault-strike',
    emoji: '🌠',
    class: 'weapon',
    role: 'effect',
    proc: {
      trigger: 'on-crit',
      cooldownSec: 0,
      payload: { kind: 'attack-echo', fraction: 0.6, damageType: 'physical' },
      targeting: 'nearest',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'strike-line',
      emoji: '🌠',
    },
  },
  // Effect (proc) - on-hit: each auto-attack that lands bolts the struck enemy
  // for 45 lightning. The spellblade bridge - attack speed (Swiftness) scales
  // how often it fires, and weapon supports (Overload / Igniting / Forking)
  // stack on it like any other proc.
  spellstrike: {
    id: 'spellstrike',
    emoji: '🌩️',
    class: 'weapon',
    role: 'effect',
    proc: {
      trigger: 'on-hit',
      cooldownSec: 0,
      payload: { kind: 'damage', damage: 45, damageType: 'lightning' },
      targeting: 'nearest',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'strike-line',
      emoji: '🌩️',
    },
  },
  // Effect (stat) - lifesteal: heal 8% of auto-attack damage dealt. Sustain for
  // an attack build (the offense answer to Sanctuary).
  bloodthirst: {
    id: 'bloodthirst',
    emoji: '🧛',
    class: 'weapon',
    role: 'effect',
    stat: {
      effects: [{ kind: 'lifesteal-add', fraction: 0.08 }],
    },
  },
  // Effect (stat) - status-on-hit: 30% of auto-attacks also cause Bleed. The
  // melee entry to an ailment build (weapon / physical themed).
  gutting: {
    id: 'gutting',
    emoji: '🩸',
    class: 'weapon',
    role: 'effect',
    stat: {
      effects: [{ kind: 'status-on-hit', status: 'bleed', chance: 0.3 }],
    },
  },
  // Support - rider: bound damage proc also applies Bleed.
  serrated: {
    id: 'serrated',
    emoji: '🪒',
    class: 'weapon',
    role: 'support',
    mod: { kind: 'rider', status: 'bleed' },
  },
  // Support - rider: bound damage proc also applies Shock (x1.3 damage taken).
  // The only way to reach Shock - a force multiplier for the whole build.
  conduction: {
    id: 'conduction',
    emoji: '🔌',
    class: 'weapon',
    role: 'support',
    mod: { kind: 'rider', status: 'shock' },
  },
  // Support - condscale: bound proc deals x2 to Shocked targets. Closes the
  // loop with Conduction / Galvanize (apply Shock, then cash it in).
  overcharge: {
    id: 'overcharge',
    emoji: '⚙️',
    class: 'weapon',
    role: 'support',
    mod: { kind: 'condscale', condition: 'shocked', factor: 2 },
  },
  // Effect (stat) - +150 physical to your auto-attack.
  edge: {
    id: 'edge',
    emoji: '⚔️',
    class: 'weapon',
    role: 'effect',
    stat: {
      effects: [{ kind: 'damage-add', amount: 150, type: 'physical' }],
    },
  },
  // Support - count: +1 target on the bound proc.
  forking: {
    id: 'forking',
    emoji: '🔱',
    class: 'weapon',
    role: 'support',
    mod: { kind: 'count', plus: 1 },
  },
  // Support - damage: x1.6 to the bound effect.
  overload: {
    id: 'overload',
    emoji: '💥',
    class: 'weapon',
    role: 'support',
    mod: { kind: 'scale', factor: 1.6 },
  },
  // Support - cooldown: -30% cooldown on the bound proc.
  rapid: {
    id: 'rapid',
    emoji: '⏱️',
    class: 'weapon',
    role: 'support',
    mod: { kind: 'cooldown', factor: 0.7 },
  },
  // Support - rider: bound damage proc also applies Burn (35%).
  igniting: {
    id: 'igniting',
    emoji: '🔥',
    class: 'weapon',
    role: 'support',
    mod: { kind: 'rider', status: 'burn' },
  },

  // ----------------------------------------------------------------------
  // Armor gems (13) - defense
  // ----------------------------------------------------------------------

  // Effect (proc) - on-hit-taken: blast the attacker for 200.
  retaliate: {
    id: 'retaliate',
    emoji: '🌵',
    class: 'armor',
    role: 'effect',
    proc: {
      trigger: 'on-hit-taken',
      cooldownSec: 0,
      payload: { kind: 'damage', damage: 200, damageType: 'physical' },
      targeting: 'nearest',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'expanding-ring',
      emoji: '🌵',
    },
  },
  // Effect (proc) - timer 6s: heal 15% max HP.
  sanctuary: {
    id: 'sanctuary',
    emoji: '✨',
    class: 'armor',
    role: 'effect',
    proc: {
      trigger: 'timer',
      cooldownSec: 6,
      payload: { kind: 'heal', fraction: 0.15 },
      targeting: 'nearest',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'glow',
      emoji: '✨',
    },
  },
  // Effect (proc) - continuous: nearby enemies take 60 fire/s.
  'searing-aura': {
    id: 'searing-aura',
    emoji: '🔥',
    class: 'armor',
    role: 'effect',
    proc: {
      trigger: 'continuous',
      cooldownSec: 1,
      payload: { kind: 'damage', damage: 60, damageType: 'fire' },
      targeting: 'all',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'expanding-ring',
      emoji: '🔥',
    },
  },
  // Effect (proc) - timer 6s: gain a shield = 20% max HP. (Cooldowns are
  // capped at 6s across the catalogue - see docs note; longer timers were
  // buffed down to 6.)
  bulwark: {
    id: 'bulwark',
    emoji: '🛡️',
    class: 'armor',
    role: 'effect',
    proc: {
      trigger: 'timer',
      cooldownSec: 6,
      payload: { kind: 'shield', fraction: 0.2 },
      targeting: 'nearest',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'glow',
      emoji: '🛡️',
    },
  },
  // Effect (stat) - +700 max HP.
  heart: {
    id: 'heart',
    emoji: '❤️',
    class: 'armor',
    role: 'effect',
    stat: {
      effects: [{ kind: 'hp-max-add', amount: 700 }],
    },
  },
  // Support - cooldown: -30% cooldown / +duration on shields & auras.
  lasting: {
    id: 'lasting',
    emoji: '⏳',
    class: 'armor',
    role: 'support',
    mod: { kind: 'cooldown', factor: 0.7 },
  },
  // Support - rider: bound damage proc also applies Freeze (25%).
  chilling: {
    id: 'chilling',
    emoji: '🧊',
    class: 'armor',
    role: 'support',
    mod: { kind: 'rider', status: 'freeze' },
  },
  // Support - condscale: bound proc deals x2.5 to Frozen targets. The shatter
  // combo - pair on a green item beside Frost Nova / a Chilling proc.
  shatter: {
    id: 'shatter',
    emoji: '💠',
    class: 'armor',
    role: 'support',
    mod: { kind: 'condscale', condition: 'frozen', factor: 2.5 },
  },
  // Effect (stat) - Berserker: +8% auto-attack damage per 10% max HP missing,
  // capped at +80%. Rewards (and pairs with) a low-HP / glass build.
  berserker: {
    id: 'berserker',
    emoji: '😤',
    class: 'armor',
    role: 'effect',
    stat: {
      effects: [{ kind: 'damage-mul-low-hp', perPercentMissing: 0.08, cap: 0.8 }],
    },
  },
  // Effect (stat) - your auto-attack gains +3% of your max HP as damage. Links
  // the defence backbone (Heart) into offense - a tank that hits hard.
  'giants-blood': {
    id: 'giants-blood',
    emoji: '🗿',
    class: 'armor',
    role: 'effect',
    stat: {
      effects: [{ kind: 'damage-from-max-hp', fractionOfMaxHp: 0.03 }],
    },
  },
  // Effect (stat) - +12% dodge: a flat chance to avoid an incoming hit.
  evasion: {
    id: 'evasion',
    emoji: '💨',
    class: 'armor',
    role: 'effect',
    stat: {
      effects: [{ kind: 'dodge-add', amount: 0.12 }],
    },
  },
  // Effect (stat) - regenerate 30 HP/s while below max. Passive sustain that
  // stacks with Sanctuary / Bloodthirst.
  regrowth: {
    id: 'regrowth',
    emoji: '🌿',
    class: 'armor',
    role: 'effect',
    stat: {
      effects: [{ kind: 'regen', amount: 30 }],
    },
  },
  // Effect (stat) - +10% flat damage reduction: every incoming hit is softened.
  // This is "armor" - the only damage-mitigation stat now that per-element
  // resist is gone.
  plating: {
    id: 'plating',
    emoji: '🧱',
    class: 'armor',
    role: 'effect',
    stat: {
      effects: [{ kind: 'damage-reduction', amount: 0.1 }],
    },
  },

  // ----------------------------------------------------------------------
  // Jewelry gems (13) - utility / meta
  // ----------------------------------------------------------------------

  // Effect (proc) - timer 4s: homing orb to nearest enemy, 180 chaos.
  'spirit-bolt': {
    id: 'spirit-bolt',
    emoji: '👻',
    class: 'jewelry',
    role: 'effect',
    proc: {
      trigger: 'timer',
      cooldownSec: 4,
      payload: { kind: 'damage', damage: 180, damageType: 'chaos' },
      targeting: 'nearest',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'drifting-orb',
      emoji: '👻',
    },
  },
  // Effect (proc) - timer 5s: +50% attack speed for 2.5s (self-buff). Buffed
  // cooldown (10 -> 5).
  'time-warp': {
    id: 'time-warp',
    emoji: '⏳',
    class: 'jewelry',
    role: 'effect',
    proc: {
      trigger: 'timer',
      cooldownSec: 5,
      payload: { kind: 'buff', attackSpeedAdd: 0.5, durationSec: 2.5 },
      targeting: 'nearest',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'glow',
      emoji: '⏳',
    },
  },
  // Effect (proc) - on-kill: 30% chance for bonus gold.
  'midas-burst': {
    id: 'midas-burst',
    emoji: '💰',
    class: 'jewelry',
    role: 'effect',
    proc: {
      trigger: 'on-kill',
      cooldownSec: 0,
      payload: { kind: 'gold', chance: 0.3 },
      targeting: 'nearest',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'glow',
      emoji: '💰',
    },
  },
  // Effect (proc) - timer 6s: summon 3 bees that orbit you and sting the
  // nearest enemy for 35 chaos every 0.8s, fading after 6s. The count-scaling
  // familiar - Forking adds bees, Echo re-summons a second swarm, Envenom makes
  // them poisonous, Amplify makes each sting bite harder.
  swarm: {
    id: 'swarm',
    emoji: '🐝',
    class: 'jewelry',
    role: 'effect',
    proc: {
      trigger: 'timer',
      cooldownSec: 6,
      payload: {
        kind: 'summon',
        emoji: '🐝',
        damage: 35,
        damageType: 'chaos',
        intervalSec: 0.8,
        lifespanSec: 6,
        orbit: true,
      },
      targeting: 'nearest',
      count: 3,
      canCrit: false,
      riders: [],
      visual: 'glow',
      emoji: '🐝',
    },
  },
  // Effect (stat) - +20% attack speed.
  swiftness: {
    id: 'swiftness',
    emoji: '⏩',
    class: 'jewelry',
    role: 'effect',
    stat: {
      effects: [{ kind: 'attack-speed-add', amount: 0.2 }],
    },
  },
  // Effect (stat) - +18% crit chance (auto-attack).
  keen: {
    id: 'keen',
    emoji: '🔎',
    class: 'jewelry',
    role: 'effect',
    stat: {
      effects: [{ kind: 'crit-chance-add', amount: 0.18 }],
    },
  },
  // Support - crit: the bound proc can crit (+25% crit chance on it).
  lethal: {
    id: 'lethal',
    emoji: '🎯',
    class: 'jewelry',
    role: 'support',
    mod: { kind: 'crit', chanceAdd: 0.25 },
  },
  // Support - rider: the bound proc fires twice (one extra cast, 0.3s later).
  echo: {
    id: 'echo',
    emoji: '🔁',
    class: 'jewelry',
    role: 'support',
    mod: { kind: 'repeat', times: 1, delaySec: 0.3 },
  },
  // Support - damage: x1.5 to the bound effect (proc damage or stat value).
  amplify: {
    id: 'amplify',
    emoji: '🔮',
    class: 'jewelry',
    role: 'support',
    mod: { kind: 'scale', factor: 1.5 },
  },
  // Effect (stat) - status-on-hit: 25% of auto-attacks also Shock the target,
  // making it take +30% damage from every source. A whole-build multiplier on
  // your jewelry.
  galvanize: {
    id: 'galvanize',
    emoji: '🔋',
    class: 'jewelry',
    role: 'effect',
    stat: {
      effects: [{ kind: 'status-on-hit', status: 'shock', chance: 0.25 }],
    },
  },
  // Effect (stat) - +0.5 crit multiplier (crits hit for x2.5 instead of x2).
  // The missing crit-build payoff - pairs with Keen / Lethal.
  brutality: {
    id: 'brutality',
    emoji: '💪',
    class: 'jewelry',
    role: 'effect',
    stat: {
      effects: [{ kind: 'crit-mul-add', amount: 0.5 }],
    },
  },
  // Support - rider: bound damage proc also applies Poison (chaos DoT).
  envenom: {
    id: 'envenom',
    emoji: '🧪',
    class: 'jewelry',
    role: 'support',
    mod: { kind: 'rider', status: 'poison' },
  },
  // Support - potency: the riders the bound proc applies hit for x2 DoT and
  // last +50% longer. The ailment-build payoff - inert unless the proc carries
  // a status (its own, or one from an adjacent rider support).
  virulent: {
    id: 'virulent',
    emoji: '🧫',
    class: 'jewelry',
    role: 'support',
    mod: { kind: 'potency', dmgMul: 2, durMul: 1.5 },
  },
};
