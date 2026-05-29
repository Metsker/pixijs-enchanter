import { get } from 'svelte/store';
import { run, type RunState } from './run';
import { fight, type FightState } from './fight';
import { topbar, type TopbarState } from './topbar';
import { backpack } from './backpack';
import { equipped, type EquippedItems } from './inventory';
import { pendingRewards, type PendingRewards } from './rewards';
import { shopStock } from './shop';
import { itemOffer, type ItemOffer } from './item-offer';
import { scrolls, type CarriedScroll } from './scrolls';
import type { Item } from '../domain/item';
import type { ShopStock } from '../domain/shop';

// Single-slot save in localStorage. Schema is versioned so we can
// reject incompatible blobs from older builds (or migrate later if
// any field semantics change).
const SAVE_KEY = 'enchanter.save.v1';

interface SaveSnapshot {
  v: 1;
  run: RunState;
  fight: FightState;
  topbar: TopbarState;
  backpack: (Item | null)[];
  equipped: EquippedItems;
  pendingRewards: PendingRewards;
  shopStock: ShopStock | null;
  itemOffer: ItemOffer | null;
  scrolls: CarriedScroll[];
}

function snapshot(): SaveSnapshot {
  return {
    v: 1,
    run: get(run),
    fight: get(fight),
    topbar: get(topbar),
    backpack: get(backpack),
    equipped: get(equipped),
    pendingRewards: get(pendingRewards),
    shopStock: get(shopStock),
    itemOffer: get(itemOffer),
    scrolls: get(scrolls),
  };
}

function writeSave(): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot()));
  } catch {
    // localStorage disabled / quota exceeded - silently skip.
  }
}

// Restore every store from disk. Returns true if a valid save was
// found and applied. Order matters: writable atoms first, then run
// + fight last so their subscribers (run-lost detection, etc.) see
// the loaded state in one transition instead of replaying defaults.
export function loadSave(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as SaveSnapshot;
    if (!data || data.v !== 1) return false;
    topbar.set(data.topbar);
    backpack.set(data.backpack);
    equipped.set(data.equipped);
    pendingRewards.set(data.pendingRewards);
    shopStock.set(data.shopStock);
    itemOffer.set(data.itemOffer);
    scrolls.set(data.scrolls ?? []);
    run.set(data.run);
    fight.set(data.fight);
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

// Debounced auto-save so the high-frequency fight ticks (status
// drips, enemy cooldowns) don't thrash localStorage. 600ms feels
// like a sane upper bound on "how stale the save can be while
// actively playing" without burning CPU on JSON.stringify.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeSave();
  }, 600);
}

let started = false;
export function startAutoSave(): void {
  if (started) return;
  started = true;
  run.subscribe(scheduleSave);
  fight.subscribe(scheduleSave);
  topbar.subscribe(scheduleSave);
  backpack.subscribe(scheduleSave);
  equipped.subscribe(scheduleSave);
  pendingRewards.subscribe(scheduleSave);
  shopStock.subscribe(scheduleSave);
  itemOffer.subscribe(scheduleSave);
  scrolls.subscribe(scheduleSave);

  // Flush on tab close / page hide so the last debounce window
  // doesn't get lost.
  window.addEventListener('beforeunload', () => writeSave());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') writeSave();
  });
}
