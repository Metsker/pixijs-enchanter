// The v1 gem pool (see docs/gem-catalogue.md). Numbers are placeholders per
// the catalogue's own note - the BEHAVIOURS are locked, values tune in
// playtesting. This starter slice carries Chain Lightning end-to-end plus the
// three weapon supports that bind to it.

import type { GemDef } from './gem';

export const GEM_CATALOGUE: Record<string, GemDef> = {
  // Effect - weapon proc. Every 3s, bolt a random enemy for 200 lightning.
  'chain-lightning': {
    id: 'chain-lightning',
    emoji: '⚡',
    class: 'weapon',
    role: 'effect',
    proc: {
      trigger: 'timer',
      cooldownSec: 3,
      damage: 200,
      damageType: 'lightning',
      targeting: 'random',
      count: 1,
      canCrit: false,
      riders: [],
      visual: 'strike-line',
      emoji: '⚡',
    },
  },
  // Support - +1 target on the bound proc.
  forking: {
    id: 'forking',
    emoji: '🔱',
    class: 'weapon',
    role: 'support',
    mod: { kind: 'count', plus: 1 },
  },
  // Support - x1.6 damage on the bound effect.
  overload: {
    id: 'overload',
    emoji: '💥',
    class: 'weapon',
    role: 'support',
    mod: { kind: 'scale', factor: 1.6 },
  },
  // Support - -30% cooldown on the bound proc.
  rapid: {
    id: 'rapid',
    emoji: '⏱️',
    class: 'weapon',
    role: 'support',
    mod: { kind: 'cooldown', factor: 0.7 },
  },
};
