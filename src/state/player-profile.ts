import { derived } from 'svelte/store';
import { equipped, type EquippedItems } from './inventory';
import type { EnchantEffect } from '../domain/enchant';
import { resolveItemGems, type ResolvedProc } from '../domain/gem-resolution';
import { resolveProfile, type AttackProfile } from '../domain/attack-profile';
import { resolveDefence, type DefenceProfile } from '../domain/defence-profile';

export interface PlayerProfile {
  attack: AttackProfile;
  defence: DefenceProfile;
}

// Resolve every equipped item's sockets and flat-map the two parallel
// outputs (see docs/gems.md § Resolution / Aggregation):
//   - stats -> EnchantEffect[] feeding the attack / defence profiles
//   - procs -> ResolvedProc[] feeding the battlefield proc engine
function collectEffects(eq: EquippedItems): EnchantEffect[] {
  const all: EnchantEffect[] = [];
  for (const item of Object.values(eq)) {
    if (!item) continue;
    all.push(...resolveItemGems(item.sockets).stats);
  }
  return all;
}

function collectProcs(eq: EquippedItems): ResolvedProc[] {
  const all: ResolvedProc[] = [];
  for (const item of Object.values(eq)) {
    if (!item) continue;
    all.push(...resolveItemGems(item.sockets).procs);
  }
  return all;
}

// Flat list of every gem-resolved stat effect on every equipped item.
// Combat hooks that need to scan for specific effect kinds
// (status-on-hit, aura-on-hit, knockback-on-hit, etc.) read from here so
// they don't have to walk the EquippedItems map themselves.
export const playerEffects = derived(equipped, ($eq) => collectEffects($eq));

// Flat list of every gem-resolved proc on every equipped item. The
// battlefield proc engine seeds activeProcs from here at fight start.
export const playerProcs = derived(equipped, ($eq) => collectProcs($eq));

// Live snapshot of what the player's equipped gems currently translate to
// in combat math. Battlefield reads this via get() on every attack/tick
// instead of caching its own copy, so swapping gear in a Rest/Map
// (out-of-combat) is reflected immediately when the next fight starts.
export const playerProfile = derived(equipped, ($eq): PlayerProfile => {
  const effects = collectEffects($eq);
  return {
    attack: resolveProfile(effects),
    defence: resolveDefence(effects),
  };
});
