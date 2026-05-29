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
// This is ADDITIVE: it does not touch the baked-enchant system. It only reads
// the gem model (gem.ts) and the gem catalogue (gem-catalogue.ts).
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
import type { Gem, ProcDef, SupportMod, GemDef } from './gem';
import { GEM_CATALOGUE } from './gem-catalogue';

// A proc after its bound supports are applied: the ProcDef fields plus where it
// came from (sourceDefId), the resolved crit chance (0 unless a crit support
// applied), and the riders accumulated from rider supports + the proc's own.
export interface ResolvedProc extends ProcDef {
  sourceDefId: string;
  critChance: number;
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

// Apply a support's knob to a proc-in-progress. A knob that does not apply to a
// proc is ignored for that part (none here - every knob applies to procs).
function applyKnobToProc(proc: ResolvedProc, mod: SupportMod): void {
  switch (mod.kind) {
    case 'scale':
      proc.damage *= mod.factor;
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

    if (def.role === 'support') {
      pendingSupports.push(def.mod);
      continue;
    }

    // An effect gem: every pending support binds to it, in socket order.
    if ('proc' in def) {
      const resolved: ResolvedProc = {
        ...def.proc,
        riders: [...def.proc.riders],
        sourceDefId: def.id,
        critChance: 0,
      };
      for (const mod of pendingSupports) applyKnobToProc(resolved, mod);
      procs.push(resolved);
    } else {
      let effects = def.stat.effects.map((e) => ({ ...e }));
      for (const mod of pendingSupports) effects = applyKnobToStats(effects, mod);
      stats.push(...effects);
    }

    // The run of supports has been consumed by this effect.
    pendingSupports = [];
  }

  return { stats, procs };
}
