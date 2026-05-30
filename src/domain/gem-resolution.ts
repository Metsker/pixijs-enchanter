// Per-item gem resolution (see docs/gems.md § Resolution,
// docs/adr/0006-support-binds-to-nearest-effect-right.md).
//
// Each item is a self-contained mini-wand. We scan its sockets left to right;
// each support binds to the nearest EFFECT gem to its right (skipping over any
// intervening supports). A run of supports left of an effect therefore all bind
// to that one effect, applied in socket order. A support with no effect to its
// right is inert. Binding never crosses item boundaries - this module resolves
// a single item's sockets.
//
// The output is two parallel paths, exactly as in docs/gems.md:
//   - stats: EnchantEffect[]  -> the unchanged attack-profile / defence-profile
//   - procs: ResolvedProc[]   -> the new proc engine
//
// It only reads the gem model (gem.ts) and the gem catalogue
// (gem-catalogue.ts) - sockets are the single source of an item's effects.
//
// Worked example (from docs/gems.md § Worked examples, build a lightning storm):
//   [Forking] [Overload] [Rapid] [⚡ Chain Lightning]
//   All three supports bind to Chain Lightning and apply in socket order:
//     count    1 -> 2        (Forking: +1 target)
//     damage   200 -> 320    (Overload: x1.6)
//     cooldown 3s -> 2.1s    (Rapid: x0.7)
//   Add a 5th socket [Igniting] and the bolts also Burn (rider appended).
//   The wasted-support puzzle: [⚡ Chain Lightning] [Overload] leaves Overload
//   with no effect to its right, so it is inert.

import type { EnchantEffect } from './enchant';
import type { Gem, ProcDef, ProcPayload, SupportMod, GemDef } from './gem';
import { gemLevel } from './gem';
import { GEM_CATALOGUE } from './gem-catalogue';
import { mag, cooldownAt } from './gem-level';

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
    case 'heal':
    case 'shield':
      return { ...payload, fraction: payload.fraction * factor };
    case 'buff':
    case 'gold':
      return payload;
  }
}

// Level a support's knob by the support gem's own level. A `scale` support's
// bonus (factor - 1) is multiplied by mag(level), so a Lv2 x1.6 scale becomes
// x1.9 (0.6 -> 0.9). count / cooldown / crit / rider / repeat keep their base
// strength - level mainly bumps damage + cooldown, and a "rider" / "count"
// knob has no magnitude to scale (see FEATURE 1).
function levelSupportMod(mod: SupportMod, level: number): SupportMod {
  if (level <= 1) return mod;
  if (mod.kind === 'scale') {
    return { kind: 'scale', factor: 1 + (mod.factor - 1) * mag(level) };
  }
  return mod;
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
  }
}

// Apply a support's knob to a list of stat effects. Only `scale` applies to a
// stat gem (it multiplies the numeric amounts); count / cooldown / crit / rider
// are inert on stats (see docs/gems.md § Support knobs).
function applyKnobToStats(effects: EnchantEffect[], mod: SupportMod): EnchantEffect[] {
  if (mod.kind === 'scale') {
    return effects.map((e) => scaleEffect(e, mod.factor));
  }
  return effects;
}

// The binding map for an item's sockets, for the UI to render (connectors /
// dimming). Mirrors the resolution rule exactly: a support binds to the
// nearest EFFECT gem to its right, skipping intervening supports; a support
// with no effect to its right is inert.
//
//   - supportToEffect: support socket index -> the effect socket index it
//     binds to. A support index present here is bound; absent means inert.
//   - inertSupports: the support socket indices that found no effect (a Set
//     for cheap membership tests in the render loop).
//
// Both are keyed by SOCKET index (including empties / unknown defIds, which
// are simply never keys), so the UI can map them straight onto its cells.
export interface SocketBindings {
  supportToEffect: Map<number, number>;
  inertSupports: Set<number>;
}

// Classify a socket by its catalogue role without resolving its payload.
// Empty sockets and unknown defIds count as neither effect nor support.
function socketRole(slot: Gem | null): 'effect' | 'support' | null {
  if (!slot) return null;
  const def = lookup(slot.defId);
  if (!def) return null;
  return def.role;
}

// Compute the support -> effect binding map for an item's sockets. We scan
// right to left: each effect becomes the "nearest effect to the right" for
// every support we encounter until the next effect. Supports seen before any
// effect (i.e. with no effect further right) stay inert.
export function computeBindings(sockets: Array<Gem | null>): SocketBindings {
  const supportToEffect = new Map<number, number>();
  const inertSupports = new Set<number>();

  let nearestEffectRight = -1;
  for (let i = sockets.length - 1; i >= 0; i--) {
    const role = socketRole(sockets[i]);
    if (role === 'effect') {
      nearestEffectRight = i;
    } else if (role === 'support') {
      if (nearestEffectRight === -1) inertSupports.add(i);
      else supportToEffect.set(i, nearestEffectRight);
    }
  }

  return { supportToEffect, inertSupports };
}

// Resolve one item's sockets into stats + procs.
export function resolveItemGems(sockets: Array<Gem | null>): ResolvedItemGems {
  const stats: EnchantEffect[] = [];
  const procs: ResolvedProc[] = [];

  // Pending supports waiting for the next effect to their right. We accumulate
  // them in socket order; when we hit an effect they all bind to it (left to
  // right). Leftover supports at the end never found an effect and are inert.
  let pendingSupports: SupportMod[] = [];

  for (const slot of sockets) {
    if (!slot) continue;
    const def = lookup(slot.defId);
    if (!def) continue;

    const level = gemLevel(slot);

    if (def.role === 'support') {
      // The support's knob strength scales with its own level.
      pendingSupports.push(levelSupportMod(def.mod, level));
      continue;
    }

    // An effect gem: scale its payload + cooldown (proc) or stat amounts by its
    // own level FIRST, then bind every pending support to it in socket order.
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
      };
      for (const mod of pendingSupports) applyKnobToProc(resolved, mod);
      procs.push(resolved);
    } else {
      let effects = def.stat.effects.map((e) => scaleEffect({ ...e }, mag(level)));
      for (const mod of pendingSupports) effects = applyKnobToStats(effects, mod);
      stats.push(...effects);
    }

    // The run of supports has been consumed by this effect.
    pendingSupports = [];
  }

  return { stats, procs };
}
