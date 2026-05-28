import { derived } from 'svelte/store';
import { equipped, type EquippedItems } from './inventory';
import type { Enchantment } from '../domain/enchant';
import { resolveProfile, type AttackProfile } from '../domain/attack-profile';
import { resolveDefence, type DefenceProfile } from '../domain/defence-profile';

export interface PlayerProfile {
  attack: AttackProfile;
  defence: DefenceProfile;
}

function collectEnchants(eq: EquippedItems): Enchantment[] {
  const all: Enchantment[] = [];
  for (const item of Object.values(eq)) {
    if (!item) continue;
    for (const e of item.enchants) all.push(e);
  }
  return all;
}

// Live snapshot of what the player's equipped enchants currently
// translate to in combat math. Battlefield reads this via get() on
// every attack/tick instead of caching its own copy, so swapping gear
// in a Rest/Map (out-of-combat) is reflected immediately when the
// next fight starts.
export const playerProfile = derived(equipped, ($eq): PlayerProfile => {
  const enchants = collectEnchants($eq);
  return {
    attack: resolveProfile(enchants),
    defence: resolveDefence(enchants),
  };
});

// Flat list of every enchant on every equipped item. Combat hooks
// that need to scan for specific effect kinds (status-on-hit,
// aura-on-hit, knockback-on-hit, etc.) read from here so they don't
// have to walk the EquippedItems map themselves.
export const playerEnchants = derived(equipped, ($eq) => collectEnchants($eq));
