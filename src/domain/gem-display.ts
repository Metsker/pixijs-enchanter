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

import type { DamageType, EnchantEffect } from './enchant';
import type {
  Gem,
  GemDef,
  ProcDef,
  ProcPayload,
  ProcTrigger,
  SocketColor,
  StatDef,
  SupportMod,
} from './gem';
import { colorForClass, gemLevel } from './gem';
import { GEM_CATALOGUE } from './gem-catalogue';
import { mag, cooldownAt } from './gem-level';
import { levelSupportMod } from './gem-resolution';

// The single source of truth for socket / gem colour hex, used by every UI
// surface that paints a socket ring or a gem tile (Inspector, Backpack). Tuned
// to read clearly on the dark theme.
export const SOCKET_COLOR_HEX: Record<SocketColor, string> = {
  red: '#e0524f',
  green: '#4fcf6f',
  blue: '#5aa0ff',
};

export interface GemDisplay {
  emoji: string;
  name: string;
  // One-line effect / role summary, e.g. "Every 3s: 200 lightning to a random
  // enemy" or "x1.6 to the bound effect". Reflects the gem's
  // level - the numbers here match what gem-resolution.ts feeds combat.
  summary: string;
  role: 'effect' | 'support';
  // The gem's socket colour (red / green / blue), derived from its class. Lets
  // a tile / socket paint the colour that decides what fits where.
  color: SocketColor;
  // The gem's combine level (1 for a base gem). The UI shows a "Lv{n}" badge
  // when this is above 1.
  level: number;
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
  // Spellblade + ailment + combo additions (docs/gem-catalogue.md).
  spellstrike: 'Spellstrike',
  bloodthirst: 'Bloodthirst',
  cull: 'Cull',
  gutting: 'Gutting',
  serrated: 'Serrated',
  conduction: 'Conduction',
  ruthless: 'Ruthless',
  overcharge: 'Overcharge',
  shatter: 'Shatter',
  berserker: 'Berserker',
  'giants-blood': "Giant's Blood",
  evasion: 'Evasion',
  regrowth: 'Regrowth',
  plating: 'Plating',
  galvanize: 'Galvanize',
  brutality: 'Brutality',
  hunter: 'Hunter',
  envenom: 'Envenom',
  virulent: 'Virulent',
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
    case 'on-hit':
      return 'On hit:';
    case 'on-hit-taken':
      return 'When hit:';
  }
}

function payloadPhrase(payload: ProcPayload, proc: ProcDef): string {
  switch (payload.kind) {
    case 'damage':
      return `${Math.round(payload.damage)} ${DAMAGE_LABELS[payload.damageType]} ${targetPhrase(proc)}`;
    case 'attack-echo':
      return `${pct(payload.fraction)} of your auto-attack ${targetPhrase(proc)}`;
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
    case 'crit-mul-add':
      return `+${effect.amount.toFixed(1)} crit multiplier`;
    case 'lifesteal-add':
      return `lifesteal ${pct(effect.fraction)} of damage dealt`;
    case 'status-on-hit':
      return `${pct(effect.chance)} on hit: ${STATUS_LABELS[effect.status] ?? effect.status}`;
    case 'damage-vs-low-hp':
      return `+${pct(effect.bonusFraction)} vs enemies below ${pct(effect.threshold)} HP`;
    case 'damage-vs-high-hp':
      return `+${pct(effect.bonusFraction)} vs enemies above ${pct(effect.threshold)} HP`;
    case 'damage-mul-low-hp':
      return `+${pct(effect.perPercentMissing)} damage per 10% HP missing (max +${pct(effect.cap)})`;
    case 'damage-from-max-hp':
      return `+${pct(effect.fractionOfMaxHp)} of max HP as damage`;
    case 'dodge-add':
      return `+${pct(effect.amount)} dodge`;
    case 'damage-reduction':
      return `+${pct(effect.amount)} damage reduction`;
    case 'regen':
      return `+${Math.round(effect.amount)} HP/s`;
    default:
      return effect.kind;
  }
}

function statSummary(stat: StatDef): string {
  return stat.effects.map(statEffectPhrase).join(', ');
}

// The gem's role ("Support") is already labelled by the UI next to its name, so
// the summary just states the modifier and never repeats the word "Support".
function supportSummary(mod: SupportMod): string {
  switch (mod.kind) {
    case 'scale':
      return `x${mod.factor} to the bound effect`;
    case 'count':
      return `+${mod.plus} target on the bound proc`;
    case 'cooldown':
      return `x${mod.factor} cooldown on the bound proc`;
    case 'crit':
      return `the bound proc may crit (+${pct(mod.chanceAdd)})`;
    case 'rider':
      return `the bound proc also applies ${STATUS_LABELS[mod.status] ?? mod.status}`;
    case 'repeat':
      return `the bound proc fires ${mod.times + 1}x`;
    case 'potency':
      return `the bound proc's ailments deal x${mod.dmgMul} damage and last ${Math.round((mod.durMul - 1) * 100)}% longer`;
    case 'condscale':
      return `the bound proc deals x${+mod.factor.toFixed(2)} vs ${conditionPhrase(mod.condition, mod.threshold)}`;
  }
}

// "frozen targets" / "Shocked targets" / "targets below 30% HP".
function conditionPhrase(condition: string, threshold?: number): string {
  switch (condition) {
    case 'frozen':
      return 'Frozen targets';
    case 'shocked':
      return 'Shocked targets';
    case 'low-hp':
      return `targets below ${pct(threshold ?? 0)} HP`;
    default:
      return condition;
  }
}

// --- level scaling (shared math with gem-resolution.ts via gem-level.ts) ---
// The display must show the SAME leveled numbers combat uses, so we apply mag /
// cooldownAt here exactly as gem-resolution does, then summarise the result.

function scalePayloadMag(payload: ProcPayload, factor: number): ProcPayload {
  switch (payload.kind) {
    case 'damage':
      return { ...payload, damage: payload.damage * factor };
    case 'attack-echo':
    case 'heal':
    case 'shield':
      return { ...payload, fraction: payload.fraction * factor };
    // Mirror gem-resolution.scalePayload so a leveled buff / gold proc shows the
    // same numbers combat uses.
    case 'buff':
      return { ...payload, attackSpeedAdd: payload.attackSpeedAdd * factor };
    case 'gold':
      return { ...payload, chance: Math.min(1, payload.chance * factor) };
  }
}

function scaleEffectMag(effect: EnchantEffect, factor: number): EnchantEffect {
  const e = { ...effect } as Record<string, unknown> & EnchantEffect;
  const fields = ['amount', 'fraction', 'damage', 'bonusFraction', 'reductionFraction'] as const;
  for (const f of fields) {
    if (typeof e[f] === 'number') {
      (e as Record<string, number>)[f] = (e[f] as number) * factor;
    }
  }
  return e;
}

function leveledProc(proc: ProcDef, level: number): ProcDef {
  if (level <= 1) return proc;
  return {
    ...proc,
    payload: scalePayloadMag(proc.payload, mag(level)),
    cooldownSec: cooldownAt(proc.cooldownSec, level),
  };
}

function leveledStat(stat: StatDef, level: number): StatDef {
  if (level <= 1) return stat;
  return { effects: stat.effects.map((e) => scaleEffectMag(e, mag(level))) };
}

function defSummary(def: GemDef, level: number): string {
  // Use the same support-leveling math combat uses, so the displayed knob
  // (e.g. a Lv2 Lethal's crit chance) matches what the proc engine applies.
  if (def.role === 'support') return supportSummary(levelSupportMod(def.mod, level));
  if ('proc' in def) return procSummary(leveledProc(def.proc, level));
  return statSummary(leveledStat(def.stat, level));
}

// Display info for a catalogue gem def at a given level (default 1). Falls back
// to the raw id for a name if the def somehow lacks a table entry (shouldn't
// happen for catalogue gems).
export function gemDisplayForDef(def: GemDef, level = 1): GemDisplay {
  return {
    emoji: def.emoji,
    name: GEM_NAMES[def.id] ?? def.id,
    summary: defSummary(def, level),
    role: def.role,
    color: colorForClass(def.class),
    level,
  };
}

// Display info for a placed gem instance, or null for an unknown defId.
export function gemDisplay(gem: Gem): GemDisplay | null {
  const def = GEM_CATALOGUE[gem.defId];
  return def ? gemDisplayForDef(def, gemLevel(gem)) : null;
}
