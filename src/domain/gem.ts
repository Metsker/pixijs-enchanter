// Gem + proc type model (see docs/gems.md, docs/gem-catalogue.md).
//
// Gems supersede the baked-enchant model: free-floating objects the player
// arranges in item sockets. A gem has a class (which socket it fits) and a
// role (what it does). Effect gems carry a payload - either an active proc or
// a passive stat; support gems modify the nearest effect gem to their right.
//
// This module is pure types + a discriminated union. It reuses DamageType,
// StatusType and EnchantEffect from enchant.ts rather than redefining them.

import type { DamageType, StatusType, EnchantEffect } from './enchant';

// A gem only fits a socket of its own class - this is "compatible items".
// Reused from the old enchant pools (weapons / armor / jewelry).
export type GemClass = 'weapon' | 'armor' | 'jewelry';

// Effect gems carry the payload; support gems modify the effect they bind to.
export type GemRole = 'effect' | 'support';

// When a proc fires (see docs/gems.md § Triggers).
export type ProcTrigger = 'timer' | 'continuous' | 'on-kill' | 'on-crit' | 'on-hit-taken';

// How a firing proc picks its target(s).
export type ProcTargeting = 'random' | 'all' | 'nearest';

// An active ability: a trigger, a cooldown and a battlefield visual. Procs do
// not crit by default (canCrit false) - a crit support flips canCrit on.
export interface ProcDef {
  trigger: ProcTrigger;
  cooldownSec: number;
  damage: number;
  damageType: DamageType;
  targeting: ProcTargeting;
  count: number;
  canCrit: boolean;
  riders: StatusType[];
  // Visual primitive id, e.g. "strike-line" (see docs/gems.md § Visual primitives).
  visual: string;
  emoji: string;
}

// A passive effect that feeds the player's attack / defence profile. Reuses
// the existing EnchantEffect union so it aggregates exactly as before.
export interface StatDef {
  effects: EnchantEffect[];
}

// What a support does when it binds to an effect. A kind that doesn't apply to
// the bound effect is simply ignored for that part (see docs/gems.md § knobs).
export type SupportMod =
  | { kind: 'scale'; factor: number }
  | { kind: 'count'; plus: number }
  | { kind: 'cooldown'; factor: number }
  | { kind: 'crit'; chanceAdd: number }
  | { kind: 'rider'; status: StatusType };

// A gem definition. Discriminated first on role, then (for effects) on whether
// it carries a proc or a stat.
interface GemBase {
  id: string;
  emoji: string;
  class: GemClass;
}

export type GemDef =
  | (GemBase & { role: 'effect'; proc: ProcDef })
  | (GemBase & { role: 'effect'; stat: StatDef })
  | (GemBase & { role: 'support'; mod: SupportMod });

// A placed gem instance - just a reference into the catalogue. The instance id
// is unique so the same defId can sit in two sockets at once.
export interface Gem {
  id: string;
  defId: string;
}
