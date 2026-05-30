// Gem level scaling (see FEATURE 1: combine to level up). Centralised here so
// the resolution path (gem-resolution.ts, which feeds combat) and the display
// path (gem-display.ts) read the SAME numbers and can never drift.
//
// All constants below are PLACEHOLDERS - tune in one place.
//
//   mag(level)      magnitude multiplier for damage / heal / shield / stat
//                   amounts and for a scale support's bonus. Additive +50% per
//                   level: Lv1 = 1.0, Lv2 = 1.5, Lv3 = 2.0, ...
//   cooldownAt(cd)  a leveled cooldown: divided by (1 + 0.25*(level-1)) so a
//                   higher level fires faster, clamped to MIN_COOLDOWN_SEC.
//
// count / crit stay at base (level mainly bumps damage + shortens cooldown).

// Magnitude gain per level beyond the first (additive).
export const MAG_PER_LEVEL = 0.5;
// Cooldown speed-up per level beyond the first (additive divisor term).
export const COOLDOWN_SPEEDUP_PER_LEVEL = 0.25;
// A proc may never fire faster than this, however high its level.
export const MIN_COOLDOWN_SEC = 0.3;

// Magnitude multiplier for `level`. Lv1 -> 1; each level adds MAG_PER_LEVEL.
export function mag(level: number): number {
  return 1 + MAG_PER_LEVEL * (Math.max(1, level) - 1);
}

// Leveled cooldown for a base cooldown at `level`. Higher level = shorter
// cooldown, clamped to MIN_COOLDOWN_SEC so it never reaches zero.
export function cooldownAt(baseCooldownSec: number, level: number): number {
  const divisor = 1 + COOLDOWN_SPEEDUP_PER_LEVEL * (Math.max(1, level) - 1);
  return Math.max(MIN_COOLDOWN_SEC, baseCooldownSec / divisor);
}
