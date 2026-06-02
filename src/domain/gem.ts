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

// A gem's class drives its colour (see SocketColor below). Reused from the old
// enchant pools (weapons / armor / jewelry).
export type GemClass = 'weapon' | 'armor' | 'jewelry';

// PoE-style socket colours. A gem no longer fits "its item's class"; instead
// every socket carries a colour and a gem fits a socket iff their colours
// match. The three colours map one-to-one onto the gem classes:
//   weapon  -> red      armor -> green      jewelry -> blue
export type SocketColor = 'red' | 'green' | 'blue';

// The colour for a gem class (single source of truth for the class<->colour
// map, reused by gemColor, drop generation and the item's theme colour).
export function colorForClass(gemClass: GemClass): SocketColor {
  switch (gemClass) {
    case 'weapon':
      return 'red';
    case 'armor':
      return 'green';
    case 'jewelry':
      return 'blue';
  }
}

// Effect gems carry the payload; support gems modify the effect they bind to.
export type GemRole = 'effect' | 'support';

// When a proc fires (see docs/gems.md § Triggers). `on-hit` fires once per
// auto-attack that lands - the spellblade bridge, so attack speed scales the
// proc's frequency (it ignores its own cooldown, like the other reactive kinds).
export type ProcTrigger =
  | 'timer'
  | 'continuous'
  | 'on-kill'
  | 'on-crit'
  | 'on-hit'
  | 'on-hit-taken';

// A run-time condition a conditional-scale support (see SupportMod) tests
// against each target the bound proc hits:
//   frozen  - target currently has the Freeze status
//   shocked - target currently has the Shock status
export type ProcCondition = 'frozen' | 'shocked';

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
//   attack-echo - deal `fraction` of the player's CURRENT auto-attack damage
//                 (so it scales with your attack build, not a flat number).
//                 Used by Vault Strike's on-crit echo.
//   summon - spawn proc.count autonomous minions that follow / orbit the player
//            and bite the nearest enemy for `damage` every `intervalSec`,
//            fading after `lifespanSec` (0 = whole fight). `orbit` circles the
//            player (Swarm bees) vs roaming to enemies (Spirit Wolf). A summoned
//            minion inherits its proc's crit / riders / condscale, so the damage
//            supports below apply to it like any other damage proc.
//
// Support knobs that only make sense for damage (count / crit / rider) also
// apply to attack-echo and summon (both resolve to damage hits); `scale`
// multiplies the payload magnitude (damage / fraction) for every kind that
// carries one.
export type ProcPayload =
  | { kind: 'damage'; damage: number; damageType: DamageType }
  | { kind: 'attack-echo'; fraction: number; damageType: DamageType }
  | { kind: 'heal'; fraction: number }
  | { kind: 'shield'; fraction: number }
  | { kind: 'buff'; attackSpeedAdd: number; durationSec: number }
  | { kind: 'gold'; chance: number }
  | {
      kind: 'summon';
      emoji: string;
      damage: number;
      damageType: DamageType;
      intervalSec: number;
      lifespanSec: number;
      orbit: boolean;
    };

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
//
// `potency` scales the DoT of the riders the bound proc applies (Virulent makes
// a proc's Burn / Poison / Bleed hit harder and last longer); it is inert on a
// proc with no riders. `condscale` multiplies the proc's damage against targets
// that meet a condition at fire time (Shatter x2.5 vs frozen, Overcharge x2 vs
// shocked) - the combo payoff knobs.
export type SupportMod =
  | { kind: 'scale'; factor: number }
  | { kind: 'count'; plus: number }
  | { kind: 'cooldown'; factor: number }
  | { kind: 'crit'; chanceAdd: number }
  | { kind: 'rider'; status: StatusType }
  | { kind: 'repeat'; times: number; delaySec: number }
  | { kind: 'potency'; dmgMul: number; durMul: number }
  | { kind: 'condscale'; condition: ProcCondition; factor: number };

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
// is unique so the same defId can sit in two sockets at once. `level` is the
// combine level (two identical gems merge additively, see state/gem-move.ts);
// absent means level 1, so old saves round-trip cleanly. Read it via gemLevel.
export interface Gem {
  id: string;
  defId: string;
  level?: number;
}

// A gem's effective level. Absent / non-positive defaults to 1, so a gem that
// predates the level field (or a corrupt save) is treated as a base gem.
export function gemLevel(gem: Gem): number {
  return gem.level && gem.level > 0 ? gem.level : 1;
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
