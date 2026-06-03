// Per-fight damage attribution (docs/decisions-that-matter.md, Milestone A).
//
// The "grade" half of the loop: after a fight the player sees WHERE their
// damage came from and WHAT hurt them, so build decisions become legible. The
// dealt side splits into three build axes - auto-attack, procs/summons, and
// ailments - which is exactly what the threat lessons turn on (an ailment-immune
// Skeleton shows a near-zero Ailments bar; a physical-resistant Slime shows a
// weak Auto-attack bar).
//
// Accumulators are plain module state mutated on every hit (cheap); we only
// snapshot into a store at fight end, so per-frame store churn is avoided.

import { writable } from 'svelte/store';
import { t } from '../i18n';
import { ENEMY_CATALOGUE } from '../domain/enemy-catalogue';

export type DealtBucket = 'auto' | 'proc' | 'ailment';

let dealt = new Map<DealtBucket, number>();
// Keyed by enemy id (catalogue key) for hits, or the literal 'ailment' for
// DoT the player suffers (e.g. Slime / Lich poison).
let taken = new Map<string, number>();

export function resetFightStats(): void {
  dealt = new Map();
  taken = new Map();
}

export function recordDealt(bucket: DealtBucket, amount: number): void {
  if (amount > 0) dealt.set(bucket, (dealt.get(bucket) ?? 0) + amount);
}

export function recordTaken(key: string, amount: number): void {
  if (amount > 0) taken.set(key, (taken.get(key) ?? 0) + amount);
}

export interface BreakdownRow {
  emoji: string;
  label: string;
  amount: number;
}

export interface FightBreakdown {
  dealt: BreakdownRow[];
  taken: BreakdownRow[];
  totalDealt: number;
  totalTaken: number;
}

const DEALT_META: Record<DealtBucket, { emoji: string; key: string }> = {
  auto: { emoji: '🗡️', key: 'breakdown.auto' },
  proc: { emoji: '✨', key: 'breakdown.proc' },
  ailment: { emoji: '☠️', key: 'breakdown.ailment' },
};

function takenRow(key: string, amount: number): BreakdownRow {
  if (key === 'ailment') return { emoji: '☠️', label: t('breakdown.ailment'), amount };
  const def = ENEMY_CATALOGUE[key];
  return { emoji: def?.emoji ?? '❓', label: t(`enemy.${key}`), amount };
}

// The store the victory / defeat panels read. Null between fights.
export const fightBreakdown = writable<FightBreakdown | null>(null);

// Snapshot the accumulators into the store, sorted biggest-first. Called once on
// victory and once on defeat.
export function publishBreakdown(): void {
  const dealtRows = [...dealt.entries()]
    .map(([b, amount]) => ({ emoji: DEALT_META[b].emoji, label: t(DEALT_META[b].key), amount }))
    .sort((a, b) => b.amount - a.amount);
  const takenRows = [...taken.entries()]
    .map(([k, a]) => takenRow(k, a))
    .sort((a, b) => b.amount - a.amount);
  fightBreakdown.set({
    dealt: dealtRows,
    taken: takenRows,
    totalDealt: dealtRows.reduce((s, r) => s + r.amount, 0),
    totalTaken: takenRows.reduce((s, r) => s + r.amount, 0),
  });
}

export function clearBreakdown(): void {
  fightBreakdown.set(null);
}
