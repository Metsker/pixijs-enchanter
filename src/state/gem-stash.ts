import { derived } from 'svelte/store';
import type { Gem } from '../domain/gem';
import { isGem } from '../domain/gem';
import {
  addGemToBackpack,
  backpack,
  findBackpackGemById,
  removeBackpackGemById,
} from './backpack';

// The gem stash is no longer a store of its own: loose gems now live in the
// backpack grid alongside items (the backpack IS the stash). This module is a
// thin compatibility shim so existing subscribers (Inspector, RestRoom) and
// callers (gem-move, rest) keep working unchanged - `gemStash` is a derived
// view of the loose gems in the backpack, and the add/remove/find helpers
// proxy to the backpack's gem ops.

// Loose gems currently sitting in the backpack, in slot order. Derived so any
// backpack mutation (stash, un-stash, sort, reset) re-flows to subscribers.
export const gemStash = derived(backpack, (slots) =>
  slots.filter((s): s is Gem => isGem(s)),
);

// No-op: the backpack reset (resetBackpack) already clears loose gems. Kept so
// run.ts's startNewRun call site stays valid without special-casing.
export function resetStash(): void {
  // intentionally empty - backpack reset covers loose gems.
}

// Drop a loose gem into the stash (= first empty backpack slot). If the
// backpack is full the gem is lost, matching the item drop policy.
export function addGemToStash(gem: Gem): void {
  addGemToBackpack(gem);
}

// Pull a specific gem out of the stash (the backpack) by its instance id,
// returning it (or null if it wasn't there).
export function removeGemFromStashById(gemId: string): Gem | null {
  return removeBackpackGemById(gemId);
}

// Peek a stash gem by id without removing it.
export function findStashGem(gemId: string): Gem | null {
  return findBackpackGemById(gemId);
}
