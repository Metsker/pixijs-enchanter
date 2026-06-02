// A small symmetric random spread applied to every final damage number - player
// hits, enemy hits, procs, reflects, and DoT ticks - so combat reads livelier
// instead of repeating the exact same figure. The roll is centred on 1.0 (mean
// unchanged), so it's pure visual variety and does NOT shift balance, and it is
// deliberately not surfaced in gem / stat descriptions, which keep showing the
// base (pre-spread) values.
//
// Callers pass the post-multiplier damage; the result is rounded and floored to
// 1 so a landed hit never shows 0. A non-positive input is returned untouched
// (an absorbed / zero hit stays zero).
export const DAMAGE_VARIANCE = 0.1; // +/- 10%

export function jitterDamage(amount: number): number {
  if (amount <= 0) return amount;
  const factor = 1 + (Math.random() * 2 - 1) * DAMAGE_VARIANCE;
  return Math.max(1, Math.round(amount * factor));
}
