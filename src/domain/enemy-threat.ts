// Enemy threat system (docs/decisions-that-matter.md, Milestone A).
//
// Turns the seven enemies from HP/damage sponges into differentiated threats
// that demand a build answer, and exposes that answer BEFORE the fight via
// threatTags (rendered on the map). Free respec is the engine: the player
// reads the threat ahead, then reconfigures owned gems to counter it.

import type { DamageType, StatusType } from './enchant';
import type { EnemyDef } from './enemy';

// Type-matchup multipliers on direct damage whose DamageType is known: the
// player's auto-attack + DoT ticks, plus every effect-proc and minion bite
// (each proc / summon payload now carries a damageType, so elemental procs
// answer resistant enemies). Tuned gentle for the prototype - easy to dial.
export const RESIST_TYPE_MUL = 0.5;
export const WEAK_TYPE_MUL = 1.5;

// Auto-attack melee whiff chance vs a flying enemy. Procs / chain / splash
// bypass this (they don't route through the basic swing), so flyers reward a
// proc / projectile build. Stacks on top of the enemy's own dodge.
export const MELEE_VS_FLYING_MISS = 0.6;

// Multiplier on a typed hit against `def`. weakType wins over resistType if an
// enemy somehow has both (it won't in the catalogue).
export function typeDamageMul(def: EnemyDef | undefined, type: DamageType): number {
  if (!def) return 1;
  if (def.weakType === type) return WEAK_TYPE_MUL;
  if (def.resistType === type) return RESIST_TYPE_MUL;
  return 1;
}

export function isAilmentImmune(def: EnemyDef | undefined, status: StatusType): boolean {
  return !!def?.ailmentImmune?.includes(status);
}

// Small glyph per damage type, reused by the inspector / tag tooltips.
export const DAMAGE_TYPE_EMOJI: Record<DamageType, string> = {
  physical: '🗡️',
  fire: '🔥',
  cold: '❄️',
  lightning: '⚡',
  chaos: '☠️',
};

// One telegraphed threat. `emoji` shows on the map node; `labelKey` (+ optional
// `param`) resolves to the tooltip via the i18n t() in the component, so this
// domain module stays free of the i18n layer.
export interface ThreatTag {
  emoji: string;
  labelKey: string;
  param?: string;
}

// Derive an enemy's threat tags, ordered most-build-relevant first. The map
// shows the union across a node's roster (deduped, capped); a single-enemy
// preview can show them all.
export function threatTags(def: EnemyDef): ThreatTag[] {
  const tags: ThreatTag[] = [];

  if (def.ailmentImmune && def.ailmentImmune.length > 0) {
    tags.push({ emoji: '🦴', labelKey: 'threat.ailmentImmune' });
  }
  if (def.resistType) {
    tags.push({ emoji: '🛡️', labelKey: 'threat.resist', param: def.resistType });
  }
  if (def.weakType) {
    tags.push({ emoji: '🎯', labelKey: 'threat.weak', param: def.weakType });
  }
  if (def.loc === 'flying') {
    tags.push({ emoji: '🕊️', labelKey: 'threat.flying' });
  }
  if (def.appliesStatus) {
    tags.push({ emoji: '☠️', labelKey: 'threat.applies', param: def.appliesStatus });
  }
  if (def.taunt) {
    tags.push({ emoji: '🌀', labelKey: 'threat.taunt' });
  }
  // Lich's signature: spawns Skeleton adds at HP thresholds (see fight.ts).
  if (def.id === 'lich') {
    tags.push({ emoji: '💀', labelKey: 'threat.summons' });
  }
  // Heavy, slow hitters: one big swing rather than a stream of chip. (Plain
  // dodge % and flat resist % are shown as numeric stats in the dossier, so they
  // are not duplicated as tags here.)
  if (def.damage >= 300 && def.interval >= 4.0) {
    tags.push({ emoji: '💥', labelKey: 'threat.burst' });
  }

  return tags;
}
