// The v1 gem pool (see docs/gem-catalogue.md). 26 gems: 13 procs, 4 stats, 9
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
  // Weapon gems (11) - offense
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
  // Effect (proc) - on-crit: echo your auto-attack for 50% extra. Damage is a
  // placeholder flat value; the design intent is a fraction of the auto-attack.
  'vault-strike': {
    id: 'vault-strike',
    emoji: '🌠',
    class: 'weapon',
    role: 'effect',
    proc: {
      trigger: 'on-crit',
      cooldownSec: 0,
      payload: { kind: 'damage', damage: 50, damageType: 'physical' },
      targeting: 'nearest',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'strike-line',
      emoji: '🌠',
    },
  },
  // Effect (stat) - +80 physical to your auto-attack.
  edge: {
    id: 'edge',
    emoji: '⚔️',
    class: 'weapon',
    role: 'effect',
    stat: {
      effects: [{ kind: 'damage-add', amount: 80, type: 'physical' }],
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
  // Armor gems (7) - defense
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
  // Effect (proc) - timer 8s: heal 15% max HP.
  sanctuary: {
    id: 'sanctuary',
    emoji: '✨',
    class: 'armor',
    role: 'effect',
    proc: {
      trigger: 'timer',
      cooldownSec: 8,
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
  // Effect (proc) - timer 12s: gain a shield = 20% max HP.
  bulwark: {
    id: 'bulwark',
    emoji: '🛡️',
    class: 'armor',
    role: 'effect',
    proc: {
      trigger: 'timer',
      cooldownSec: 12,
      payload: { kind: 'shield', fraction: 0.2 },
      targeting: 'nearest',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'glow',
      emoji: '🛡️',
    },
  },
  // Effect (stat) - +400 max HP.
  heart: {
    id: 'heart',
    emoji: '❤️',
    class: 'armor',
    role: 'effect',
    stat: {
      effects: [{ kind: 'hp-max-add', amount: 400 }],
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

  // ----------------------------------------------------------------------
  // Jewelry gems (8) - utility / meta
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
  // Effect (proc) - timer 10s: +50% attack speed for 3s (self-buff).
  'time-warp': {
    id: 'time-warp',
    emoji: '⏳',
    class: 'jewelry',
    role: 'effect',
    proc: {
      trigger: 'timer',
      cooldownSec: 10,
      payload: { kind: 'buff', attackSpeedAdd: 0.5, durationSec: 3 },
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
  // Effect (stat) - +12% attack speed.
  swiftness: {
    id: 'swiftness',
    emoji: '⏩',
    class: 'jewelry',
    role: 'effect',
    stat: {
      effects: [{ kind: 'attack-speed-add', amount: 0.12 }],
    },
  },
  // Effect (stat) - +10% crit chance (auto-attack).
  keen: {
    id: 'keen',
    emoji: '🔎',
    class: 'jewelry',
    role: 'effect',
    stat: {
      effects: [{ kind: 'crit-chance-add', amount: 0.1 }],
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
};
