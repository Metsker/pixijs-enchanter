// Per-item gem resolution (see docs/gems.md § Resolution).
//
// Each item is a self-contained mini-wand. A support gem modifies only the
// effect gem(s) in its DIRECTLY ADJACENT sockets - the immediate left and right
// neighbours - so placement is a local puzzle: park a support between two
// effects to boost both. A support whose neighbours are both non-effects (or at
// the row's edge) is inert. Binding never crosses item boundaries. (Supersedes
// ADR 0006's nearest-effect-to-the-right rule and the brief all-effects rule.)
//
// The output is two parallel paths, exactly as in docs/gems.md:
//   - stats: EnchantEffect[]  -> the unchanged attack-profile / defence-profile
//   - procs: ResolvedProc[]   -> the new proc engine
//
// It only reads the gem model (gem.ts) and the gem catalogue
// (gem-catalogue.ts) - sockets are the single source of an item's effects.
//
// Worked example: [⚡ Chain Lightning] [Overload] [☄️ Meteor] [Forking]
//   Overload (x1.6 dmg) sits between the two procs, so it boosts BOTH.
//   Forking (+1 target) is only beside Meteor, so only Meteor forks.
//   A support flanked by empties / other supports is inert.

import type { EnchantEffect } from './enchant';
import type { Gem, ProcCondition, ProcDef, ProcPayload, SupportMod, GemDef } from './gem';
import { gemLevel } from './gem';
import { GEM_CATALOGUE } from './gem-catalogue';
import { mag, cooldownAt } from './gem-level';

// One conditional-scale a `condscale` support (Shatter / Overcharge) stamped on
// a proc: multiply the hit by `factor` when the target meets `condition`.
// Evaluated per target at fire.
export interface CondScale {
  condition: ProcCondition;
  factor: number;
}

// A proc after its bound supports are applied: the ProcDef fields plus where it
// came from (sourceDefId), the resolved crit chance (0 unless a crit support
// applied), the riders accumulated from rider supports + the proc's own, and
// any extra casts a `repeat` support (Echo) granted. The payload is carried
// through with its magnitude already scaled.
export interface ResolvedProc extends ProcDef {
  sourceDefId: string;
  critChance: number;
  // Extra fires beyond the first, each `repeatDelaySec` after the previous
  // (Echo: extraCasts 1). 0 means the proc fires once, as normal.
  extraCasts: number;
  repeatDelaySec: number;
  // Multipliers a `potency` support (Virulent) applies to the DoT of every
  // status this proc lands. {1, 1} means no boost.
  riderPotency: { dmgMul: number; durMul: number };
  // Conditional damage multipliers from `condscale` supports, all evaluated and
  // multiplied together per target when the proc fires.
  condScales: CondScale[];
  // Blood Pact: fraction of the player's CURRENT HP this proc costs each time it
  // fires (its damage is already scaled up by the support). undefined / 0 means
  // the proc is free, as normal. Paid in battlefield.ts after the proc lands.
  procCostHp?: number;
}

export interface ResolvedItemGems {
  stats: EnchantEffect[];
  procs: ResolvedProc[];
}

// Resolve a defId to its catalogue entry; unknown ids are skipped.
function lookup(defId: string): GemDef | undefined {
  return GEM_CATALOGUE[defId];
}

// Scale the numeric "amount" of a stat EnchantEffect by a factor. EnchantEffect
// is a discriminated union whose magnitude lives under different keys; we scale
// whichever numeric magnitude field a kind carries, leaving counts/thresholds
// alone where they are structural rather than a magnitude.
function scaleEffect(effect: EnchantEffect, factor: number): EnchantEffect {
  // Clone so we never mutate the catalogue's StatDef.
  const e = { ...effect } as Record<string, unknown> & EnchantEffect;
  const fields = ['amount', 'fraction', 'damage', 'bonusFraction', 'reductionFraction'] as const;
  for (const f of fields) {
    if (typeof e[f] === 'number') {
      (e as Record<string, number>)[f] = (e[f] as number) * factor;
    }
  }
  return e;
}

// Scale a payload's magnitude by a factor. `scale` (Overload / Amplify)
// multiplies the damage of a damage payload, or the heal / shield fraction of
// those payloads; buff and gold payloads carry no scalable magnitude here, so
// scale leaves them untouched (see docs/gems.md § Support knobs).
function scalePayload(payload: ProcPayload, factor: number): ProcPayload {
  switch (payload.kind) {
    case 'damage':
      return { ...payload, damage: payload.damage * factor };
    case 'summon':
      // Overload / Amplify strengthen each minion's bite (its other knobs -
      // interval / lifespan / count - are tuned, not scaled here).
      return { ...payload, damage: payload.damage * factor };
    case 'attack-echo':
    case 'heal':
    case 'shield':
      return { ...payload, fraction: payload.fraction * factor };
    // `scale` is the universal support: it also strengthens the self-buff
    // (more attack speed) and the gold roll (capped at certain), so Overload /
    // Amplify are never inert on a proc.
    case 'buff':
      return { ...payload, attackSpeedAdd: payload.attackSpeedAdd * factor };
    case 'gold':
      return { ...payload, chance: Math.min(1, payload.chance * factor) };
  }
}

// Scale a support's knob by the support gem's own level. Combining identical
// gems raises the level, and EVERY knob grows with it so a higher-level support
// is always stronger (a Lv2 Lethal really does add more crit, etc.):
//   - scale:    bonus (factor - 1) grows on the non-linear mag() curve
//   - count:    +targets grows linearly (N copies -> N x plus)
//   - crit:     +crit-chance grows linearly
//   - repeat:   +extra casts grows linearly
//   - cooldown: the multiplier compounds (N copies each multiply: 0.7 -> 0.49)
//   - rider:    a status carries no numeric magnitude, so level can't scale it
//               (Igniting / Chilling just (re)apply their status). This is the
//               one knob whose level-up is inert by design.
// Exported as the single source of truth so the display (gem-display.ts) shows
// exactly the leveled knob combat uses.
export function levelSupportMod(mod: SupportMod, level: number): SupportMod {
  if (level <= 1) return mod;
  switch (mod.kind) {
    case 'scale':
      return { kind: 'scale', factor: 1 + (mod.factor - 1) * mag(level) };
    case 'count':
      return { kind: 'count', plus: mod.plus * level };
    case 'crit':
      return { kind: 'crit', chanceAdd: mod.chanceAdd * level };
    case 'repeat':
      return { kind: 'repeat', times: mod.times * level, delaySec: mod.delaySec };
    case 'cooldown':
      return { kind: 'cooldown', factor: Math.pow(mod.factor, level) };
    case 'rider':
      return mod;
    case 'potency':
      // The DoT / duration bonuses grow on the mag() curve, like `scale`.
      return {
        kind: 'potency',
        dmgMul: 1 + (mod.dmgMul - 1) * mag(level),
        durMul: 1 + (mod.durMul - 1) * mag(level),
      };
    case 'condscale':
      // The conditional multiplier's bonus grows on the mag() curve.
      return {
        kind: 'condscale',
        condition: mod.condition,
        factor: 1 + (mod.factor - 1) * mag(level),
      };
    case 'proc-cost-hp':
      // Blood Pact: the damage bonus grows on the mag() curve like `scale`; the
      // HP cost stays flat (a higher level pays the SAME % of current HP but hits
      // harder, so leveling is a pure upside - in keeping with the other knobs).
      return {
        kind: 'proc-cost-hp',
        damageFactor: 1 + (mod.damageFactor - 1) * mag(level),
        hpFraction: mod.hpFraction,
      };
  }
}

// Apply a support's knob to a proc-in-progress. `scale` multiplies the payload
// magnitude; `count` / `crit` / `rider` only carry meaning for a damage
// payload but are harmless on the others (they tune fields the engine ignores
// for non-damage procs). `cooldown` applies to every proc.
function applyKnobToProc(proc: ResolvedProc, mod: SupportMod): void {
  switch (mod.kind) {
    case 'scale':
      proc.payload = scalePayload(proc.payload, mod.factor);
      break;
    case 'count':
      proc.count += mod.plus;
      break;
    case 'cooldown':
      proc.cooldownSec *= mod.factor;
      break;
    case 'crit':
      proc.canCrit = true;
      proc.critChance += mod.chanceAdd;
      break;
    case 'rider':
      proc.riders = [...proc.riders, mod.status];
      break;
    case 'repeat':
      proc.extraCasts += mod.times;
      proc.repeatDelaySec = mod.delaySec;
      break;
    case 'potency':
      proc.riderPotency = {
        dmgMul: proc.riderPotency.dmgMul * mod.dmgMul,
        durMul: proc.riderPotency.durMul * mod.durMul,
      };
      break;
    case 'condscale':
      proc.condScales = [
        ...proc.condScales,
        { condition: mod.condition, factor: mod.factor },
      ];
      break;
    case 'proc-cost-hp':
      // Blood Pact: scale the payload damage up and stamp the HP cost. Two Blood
      // Pacts on one proc compound the damage and stack the HP fraction.
      proc.payload = scalePayload(proc.payload, mod.damageFactor);
      proc.procCostHp = (proc.procCostHp ?? 0) + mod.hpFraction;
      break;
  }
}

// Apply a support's knob to a list of stat effects. Only `scale` applies to a
// stat gem (it multiplies the numeric amounts); count / cooldown / crit / rider
// are inert on stats (see docs/gems.md § Support knobs).
function applyKnobToStats(effects: EnchantEffect[], mod: SupportMod): EnchantEffect[] {
  if (mod.kind === 'scale') {
    return effects.map((e) => scaleEffect(e, mod.factor));
  }
  if (mod.kind === 'potency') {
    // Virulent boosts the DoT a status-on-hit stat lands (Gutting / Galvanize),
    // mirroring how it boosts a proc's riders. Other stat kinds are untouched.
    return effects.map((e) =>
      e.kind === 'status-on-hit'
        ? { ...e, dmgMul: (e.dmgMul ?? 1) * mod.dmgMul, durMul: (e.durMul ?? 1) * mod.durMul }
        : e,
    );
  }
  return effects;
}

// The binding state for an item's sockets, for the UI to render (active vs
// dimmed supports). Mirrors the resolution rule: a support modifies the effect
// gem(s) in its DIRECTLY ADJACENT sockets (left and right neighbours), so it is
// ACTIVE when at least one neighbour is an effect gem, and INERT otherwise.
//
//   - boundSupports: support socket indices with an adjacent effect the support
//     actually modifies (it's boosting that neighbour).
//   - inertSupports: support socket indices whose neighbours are both
//     non-effects (empty / support / edge of the socket row).
//   - incompatibleSupports: support socket indices adjacent to an effect, but
//     whose knob does NOTHING to it (e.g. a crit / count / rider support next
//     to a heal / buff proc, or any non-scale support next to a stat gem).
//
// Both are keyed by SOCKET index (empties / unknown defIds are never keys), so
// the UI can map them straight onto its cells.
export interface SocketBindings {
  boundSupports: Set<number>;
  inertSupports: Set<number>;
  incompatibleSupports: Set<number>;
}

// Classify a socket by its catalogue role without resolving its payload. Out-of
// -bounds indices (undefined) and empty sockets / unknown defIds count as
// neither effect nor support.
function socketRole(slot: Gem | null | undefined): 'effect' | 'support' | null {
  if (!slot) return null;
  const def = lookup(slot.defId);
  if (!def) return null;
  return def.role;
}

// Does this support knob actually do anything to `effect`? Mirrors
// applyKnobToProc / applyKnobToStats: `scale` tweaks damage / heal / shield
// magnitudes (and stat amounts); `count` / `crit` / `rider` only bite on a
// damage proc; `cooldown` and `repeat` apply to any proc; nothing but `scale`
// touches a stat gem. Exported so the gem inspector can list every effect gem a
// support is compatible with (the binding rule, minus the placement).
export function supportAppliesToEffect(mod: SupportMod, effect: GemDef): boolean {
  if ('proc' in effect) {
    const kind = effect.proc.payload.kind;
    // attack-echo and summon both resolve to damage hits, so every damage-
    // oriented knob bites on them exactly as on a plain damage payload (a
    // summoned minion inherits its proc's crit / riders / condscale).
    const dealsDamage = kind === 'damage' || kind === 'attack-echo' || kind === 'summon';
    switch (mod.kind) {
      case 'cooldown':
      case 'repeat':
      case 'scale':
        // The three universal knobs: every proc has a cooldown, can be repeated,
        // and now carries a scalable magnitude (damage / heal / shield / buff /
        // gold). None are ever inert on a proc.
        return true;
      case 'count':
      case 'crit':
      case 'condscale':
        return dealsDamage;
      case 'rider':
      case 'potency':
        // rider lands a status on a damage hit; potency boosts those statuses.
        // (potency with no rider present is harmless but reads as "bound".)
        return dealsDamage;
      case 'proc-cost-hp':
        // Blood Pact binds to ANY damage-dealing proc (damage / attack-echo /
        // summon) - the widest possible reach, per the support-compatibility
        // rule. Inert on heal / shield / buff / gold procs (nothing to amplify).
        return dealsDamage;
    }
  }
  // Stat gem: `scale` changes any amount; `potency` also boosts a stat's
  // status-on-hit ailment (Virulent next to Gutting / Galvanize), so the
  // ailment build can pump auto-attack DoTs too.
  if (mod.kind === 'scale') return true;
  if (mod.kind === 'potency') {
    return 'stat' in effect && effect.stat.effects.some((e) => e.kind === 'status-on-hit');
  }
  return false;
}

// The effect-gem defs in the two sockets directly beside `i`.
function adjacentEffectDefs(sockets: Array<Gem | null>, i: number): GemDef[] {
  const out: GemDef[] = [];
  for (const n of [i - 1, i + 1]) {
    const nb = sockets[n];
    if (!nb) continue;
    const def = lookup(nb.defId);
    if (def && def.role === 'effect') out.push(def);
  }
  return out;
}

// Compute the support binding state for an item's sockets: bound (boosts an
// adjacent effect), inert (no adjacent effect), or incompatible (adjacent to an
// effect its knob can't touch).
export function computeBindings(sockets: Array<Gem | null>): SocketBindings {
  const boundSupports = new Set<number>();
  const inertSupports = new Set<number>();
  const incompatibleSupports = new Set<number>();

  for (let i = 0; i < sockets.length; i++) {
    const slot = sockets[i];
    const def = slot ? lookup(slot.defId) : undefined;
    if (!def || def.role !== 'support') continue;
    const neighbours = adjacentEffectDefs(sockets, i);
    if (neighbours.length === 0) {
      inertSupports.add(i);
    } else if (neighbours.some((n) => supportAppliesToEffect(def.mod, n))) {
      boundSupports.add(i);
    } else {
      incompatibleSupports.add(i);
    }
  }

  return { boundSupports, inertSupports, incompatibleSupports };
}

// The levelled support knobs adjacent to socket `i` (its immediate left + right
// neighbours), in left-then-right order. Empty / non-support neighbours and the
// edges of the socket row contribute nothing.
function adjacentSupports(sockets: Array<Gem | null>, i: number): SupportMod[] {
  const mods: SupportMod[] = [];
  for (const n of [i - 1, i + 1]) {
    const nb = sockets[n];
    if (!nb) continue;
    const def = lookup(nb.defId);
    if (def && def.role === 'support') mods.push(levelSupportMod(def.mod, gemLevel(nb)));
  }
  return mods;
}

// Resolve one item's sockets into stats + procs. A support modifies only the
// effect gems DIRECTLY BESIDE it, so each effect is boosted by the supports in
// its two adjacent sockets (left + right).
export function resolveItemGems(sockets: Array<Gem | null>): ResolvedItemGems {
  const stats: EnchantEffect[] = [];
  const procs: ResolvedProc[] = [];

  for (let i = 0; i < sockets.length; i++) {
    const slot = sockets[i];
    if (!slot) continue;
    const def = lookup(slot.defId);
    if (!def || def.role !== 'effect') continue;

    const level = gemLevel(slot);
    const supports = adjacentSupports(sockets, i);

    if ('proc' in def) {
      const resolved: ResolvedProc = {
        ...def.proc,
        // Clone the payload so scale knobs never mutate the catalogue entry,
        // and bake the gem's level into the magnitude up front.
        payload: scalePayload({ ...def.proc.payload }, mag(level)),
        cooldownSec: cooldownAt(def.proc.cooldownSec, level),
        riders: [...def.proc.riders],
        sourceDefId: def.id,
        critChance: 0,
        extraCasts: 0,
        repeatDelaySec: 0,
        riderPotency: { dmgMul: 1, durMul: 1 },
        condScales: [],
      };
      for (const mod of supports) applyKnobToProc(resolved, mod);
      procs.push(resolved);
    } else {
      let effects = def.stat.effects.map((e) => scaleEffect({ ...e }, mag(level)));
      for (const mod of supports) effects = applyKnobToStats(effects, mod);
      stats.push(...effects);
    }
  }

  return { stats, procs };
}
