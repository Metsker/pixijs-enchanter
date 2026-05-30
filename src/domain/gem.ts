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

// What a proc delivers when it fires. Most procs deal damage, but a few in the
// catalogue heal, shield, self-buff or grant gold (see docs/gem-catalogue.md):
//
//   damage - deal `damage` of `damageType` to the proc's target(s).
//   heal   - restore `fraction` of the player's max HP.
//   shield - grant a shield worth `fraction` of the player's max HP.
//   buff   - self-buff: +`attackSpeedAdd` attack speed for `durationSec`.
//   gold   - on a kill, `chance` to drop bonus gold.
//
// Support knobs that only make sense for damage (count / crit / rider) are
// inert on the other kinds; `scale` multiplies the payload magnitude (damage,
// or heal / shield fraction) for every kind that carries one.
export type ProcPayload =
  | { kind: 'damage'; damage: number; damageType: DamageType }
  | { kind: 'heal'; fraction: number }
  | { kind: 'shield'; fraction: number }
  | { kind: 'buff'; attackSpeedAdd: number; durationSec: number }
  | { kind: 'gold'; chance: number };

// An active ability: a trigger, a cooldown and a battlefield visual. The
// payload (above) decides what firing actually does. Procs do not crit by
// default (canCrit false) - a crit support flips canCrit on; crit / count /
// rider only carry meaning for a damage payload.
export interface ProcDef {
  trigger: ProcTrigger;
  cooldownSec: number;
  payload: ProcPayload;
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
// Two flavours of rider: a `rider` lands a status on the proc's target
// (Igniting -> Burn, Chilling -> Freeze); a `repeat` makes the proc fire again
// after a short delay (Echo -> fires twice).
export type SupportMod =
  | { kind: 'scale'; factor: number }
  | { kind: 'count'; plus: number }
  | { kind: 'cooldown'; factor: number }
  | { kind: 'crit'; chanceAdd: number }
  | { kind: 'rider'; status: StatusType }
  | { kind: 'repeat'; times: number; delaySec: number };

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

// Discriminators for the backpack, which now holds both Items and loose Gems
// in one (Item | Gem | null)[] grid. An Item carries `itemType`/`sockets`; a
// Gem carries `defId` and never an `itemType`. We test on `defId` so the guard
// stays a pure shape check that doesn't need to import Item (keeping gem.ts a
// leaf module). The `unknown`-friendly signatures let callers narrow a raw
// `Item | Gem | null` slot in one step.
export function isGem(v: { defId?: unknown; itemType?: unknown } | null | undefined): v is Gem {
  return v != null && typeof v.defId === 'string' && v.itemType === undefined;
}
