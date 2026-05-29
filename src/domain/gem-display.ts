// Human-readable gem identity for the socket UI (see docs/gems.md § Worked
// examples - arranging gems is only meaningful if the player can read what each
// one does). Derives an emoji + short name + one-line effect/role summary from
// a gem's catalogue definition. The project is EN-only, so the strings live
// here inline rather than in i18n keys.
//
// Names are a fixed table keyed by defId (the catalogue's own gem names from
// docs/gem-catalogue.md). Summaries are GENERATED from the structured def so
// they can never drift from the numbers in gem-catalogue.ts: a proc summary
// reads its trigger + payload, a stat summary reads its EnchantEffect, a
// support summary reads its knob.

import type { DamageType } from './enchant';
import type {
  Gem,
  GemDef,
  ProcDef,
  ProcPayload,
  ProcTrigger,
  StatDef,
  SupportMod,
} from './gem';
import { GEM_CATALOGUE } from './gem-catalogue';

export interface GemDisplay {
  emoji: string;
  name: string;
  // One-line effect / role summary, e.g. "Every 3s: 200 lightning to a random
  // enemy" or "Support: x1.6 damage to the bound effect".
  summary: string;
  role: 'effect' | 'support';
}

// Catalogue gem names (docs/gem-catalogue.md). Keyed by defId.
const GEM_NAMES: Record<string, string> = {
  'chain-lightning': 'Chain Lightning',
  meteor: 'Meteor',
  'frost-nova': 'Frost Nova',
  whirlblade: 'Whirlblade',
  'soul-reap': 'Soul Reap',
  'vault-strike': 'Vault Strike',
  edge: 'Edge',
  forking: 'Forking',
  overload: 'Overload',
  rapid: 'Rapid',
  igniting: 'Igniting',
  retaliate: 'Retaliate',
  sanctuary: 'Sanctuary',
  'searing-aura': 'Searing Aura',
  bulwark: 'Bulwark',
  heart: 'Heart',
  lasting: 'Lasting',
  chilling: 'Chilling',
  'spirit-bolt': 'Spirit Bolt',
  'time-warp': 'Time Warp',
  'midas-burst': 'Midas Burst',
  swiftness: 'Swiftness',
  keen: 'Keen',
  lethal: 'Lethal',
  echo: 'Echo',
  amplify: 'Amplify',
};

const DAMAGE_LABELS: Record<DamageType, string> = {
  physical: 'physical',
  fire: 'fire',
  cold: 'cold',
  lightning: 'lightning',
  chaos: 'chaos',
};

const STATUS_LABELS: Record<string, string> = {
  burn: 'Burn',
  freeze: 'Freeze',
  shock: 'Shock',
  poison: 'Poison',
  bleed: 'Bleed',
};

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

// "to a random enemy" / "to all enemies" / "to the nearest enemy".
function targetPhrase(proc: ProcDef): string {
  const each = proc.count > 1 ? `${proc.count} ` : '';
  switch (proc.targeting) {
    case 'random':
      return `to ${each || 'a '}random ${proc.count > 1 ? 'enemies' : 'enemy'}`;
    case 'all':
      return 'to all enemies';
    case 'nearest':
      return `to ${each || 'the '}nearest ${proc.count > 1 ? 'enemies' : 'enemy'}`;
  }
}

// The lead-in for a proc's trigger, e.g. "Every 3s:", "On kill:".
function triggerPhrase(trigger: ProcTrigger, cooldownSec: number): string {
  switch (trigger) {
    case 'timer':
      return `Every ${cooldownSec}s:`;
    case 'continuous':
      return 'Continuous:';
    case 'on-kill':
      return 'On kill:';
    case 'on-crit':
      return 'On crit:';
    case 'on-hit-taken':
      return 'When hit:';
  }
}

function payloadPhrase(payload: ProcPayload, proc: ProcDef): string {
  switch (payload.kind) {
    case 'damage':
      return `${Math.round(payload.damage)} ${DAMAGE_LABELS[payload.damageType]} ${targetPhrase(proc)}`;
    case 'heal':
      return `heal ${pct(payload.fraction)} max HP`;
    case 'shield':
      return `shield ${pct(payload.fraction)} max HP`;
    case 'buff':
      return `+${pct(payload.attackSpeedAdd)} attack speed for ${payload.durationSec}s`;
    case 'gold':
      return `${pct(payload.chance)} chance for bonus gold`;
  }
}

function procSummary(proc: ProcDef): string {
  const head = triggerPhrase(proc.trigger, proc.cooldownSec);
  const body = payloadPhrase(proc.payload, proc);
  const riders =
    proc.riders.length > 0
      ? ` + ${proc.riders.map((r) => STATUS_LABELS[r] ?? r).join(', ')}`
      : '';
  return `${head} ${body}${riders}`;
}

// A stat gem may carry several EnchantEffects; we summarise each. Only the
// kinds the v1 stat gems actually use are spelled out; anything else falls
// back to its kind label so the summary never throws.
function statEffectPhrase(effect: StatDef['effects'][number]): string {
  switch (effect.kind) {
    case 'damage-add':
      return `+${Math.round(effect.amount)} ${DAMAGE_LABELS[effect.type]} per hit`;
    case 'hp-max-add':
      return `+${Math.round(effect.amount)} max HP`;
    case 'attack-speed-add':
      return `+${pct(effect.amount)} attack speed`;
    case 'crit-chance-add':
      return `+${pct(effect.amount)} crit chance`;
    default:
      return effect.kind;
  }
}

function statSummary(stat: StatDef): string {
  return stat.effects.map(statEffectPhrase).join(', ');
}

function supportSummary(mod: SupportMod): string {
  switch (mod.kind) {
    case 'scale':
      return `Support: x${mod.factor} to the bound effect`;
    case 'count':
      return `Support: +${mod.plus} target on the bound proc`;
    case 'cooldown':
      return `Support: x${mod.factor} cooldown on the bound proc`;
    case 'crit':
      return `Support: the bound proc may crit (+${pct(mod.chanceAdd)})`;
    case 'rider':
      return `Support: the bound proc also applies ${STATUS_LABELS[mod.status] ?? mod.status}`;
    case 'repeat':
      return `Support: the bound proc fires ${mod.times + 1}x`;
  }
}

function defSummary(def: GemDef): string {
  if (def.role === 'support') return supportSummary(def.mod);
  if ('proc' in def) return procSummary(def.proc);
  return statSummary(def.stat);
}

// Display info for a catalogue gem def. Falls back to the raw id for a name if
// the def somehow lacks a table entry (shouldn't happen for catalogue gems).
export function gemDisplayForDef(def: GemDef): GemDisplay {
  return {
    emoji: def.emoji,
    name: GEM_NAMES[def.id] ?? def.id,
    summary: defSummary(def),
    role: def.role,
  };
}

// Display info for a placed gem instance, or null for an unknown defId.
export function gemDisplay(gem: Gem): GemDisplay | null {
  const def = GEM_CATALOGUE[gem.defId];
  return def ? gemDisplayForDef(def) : null;
}
