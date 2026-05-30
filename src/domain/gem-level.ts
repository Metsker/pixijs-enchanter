// Gem level scaling (FEATURE 1: combine to level up). Centralised here so the
// resolution path (gem-resolution.ts, which feeds combat) and the display path
// (gem-display.ts) read the SAME numbers and can never drift.
//
// Growth is NON-LINEAR and UNCAPPED: each level multiplies the previous one
// (geometric), so deep combining pays off increasingly rather than at a flat
// rate. All constants are PLACEHOLDERS - tune in one place.
//
//   mag(level)      magnitude multiplier for damage / heal / shield / stat
//                   amounts and for a scale support's bonus. Compounds by
//                   MAG_GROWTH per level:
//                     Lv1 1.00, Lv2 1.35, Lv3 1.82, Lv4 2.46, Lv5 3.32,
//                     Lv6 4.48, Lv10 ~15.9 ...
//   cooldownAt(cd)  leveled cooldown: shrinks geometrically (× CD_FACTOR per
//                   level) so a higher level fires faster, clamped to
//                   MIN_COOLDOWN_SEC.
//
// count / crit stay at base (level mainly bumps damage + shortens cooldown).

// Magnitude grows geometrically: each level beyond the first multiplies by this.
export const MAG_GROWTH = 1.35;
// Cooldown shrinks geometrically: each level beyond the first multiplies by this
// (< 1 = faster).
export const CD_FACTOR = 0.85;
// A proc may never fire faster than this, however high its level.
export const MIN_COOLDOWN_SEC = 0.3;

// Magnitude multiplier for `level`. Lv1 -> 1; compounds by MAG_GROWTH per level.
export function mag(level: number): number {
  return MAG_GROWTH ** (Math.max(1, level) - 1);
}

// Leveled cooldown for a base cooldown at `level`. Shrinks geometrically with
// level (higher = faster), clamped to MIN_COOLDOWN_SEC so it never hits zero.
export function cooldownAt(baseCooldownSec: number, level: number): number {
  return Math.max(MIN_COOLDOWN_SEC, baseCooldownSec * CD_FACTOR ** (Math.max(1, level) - 1));
}
