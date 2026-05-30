import { get } from 'svelte/store';
import { run, type RunState } from './run';
import { fight, primeDifficulty, type FightState } from './fight';
import { topbar, type TopbarState } from './topbar';
import { addGemToBackpack, backpack, type BackpackSlot } from './backpack';
import { equipped, type EquippedItems } from './inventory';
import { pendingRewards, type PendingRewards } from './rewards';
import { shopStock } from './shop';
import { itemOffer, type ItemOffer } from './item-offer';
import type { Gem, SocketColor } from '../domain/gem';
import { isItem, type Item } from '../domain/item';
import { gemColor } from '../domain/gem-fit';
import { rollSocketColorForType } from '../domain/random';
import type { ShopStock } from '../domain/shop';

// Single-slot save in localStorage. Schema is versioned so we can
// reject incompatible blobs from older builds (or migrate later if
// any field semantics change). v2 = the gem-socket model: Items carry
// `sockets` instead of `enchants`, and scrolls/seals are gone. Old v1
// saves are ignored (fresh start, no migration).
const SAVE_KEY = 'enchanter.save.v2';

interface SaveSnapshot {
  v: 2;
  run: RunState;
  fight: FightState;
  topbar: TopbarState;
  // The backpack now carries loose gems alongside items (gem stash merged in).
  // Both Item and Gem round-trip as plain JSON. `gemStash` is no longer
  // serialized separately; legacy saves that still carry it are merged on load.
  backpack: BackpackSlot[];
  equipped: EquippedItems;
  // Optional + legacy-only: older saves stored loose gems in their own array.
  // New saves omit it; loadSave folds any present entries into the backpack.
  gemStash?: Gem[];
  pendingRewards: PendingRewards;
  shopStock: ShopStock | null;
  itemOffer: ItemOffer | null;
}

function snapshot(): SaveSnapshot {
  return {
    v: 2,
    run: get(run),
    fight: get(fight),
    topbar: get(topbar),
    backpack: get(backpack),
    equipped: get(equipped),
    pendingRewards: get(pendingRewards),
    shopStock: get(shopStock),
    itemOffer: get(itemOffer),
  };
}

// --- socketColors backfill (old saves) ---------------------------------
//
// Items from pre-colour saves carry `sockets` but no `socketColors`. Build a
// parallel colour list of the right length: a socket holding a gem takes that
// gem's colour (so the existing gem stays a legal fit), an empty socket gets a
// colour rolled from the item type's socket-colour pool. Items already carrying
// a well-formed socketColors array are returned untouched. Idempotent.
function backfillItemColors(item: Item): Item {
  const len = item.sockets.length;
  const existing = item.socketColors;
  if (Array.isArray(existing) && existing.length === len) return item;
  const socketColors: SocketColor[] = item.sockets.map(
    (gem) => (gem ? gemColor(gem) : null) ?? rollSocketColorForType(item.itemType),
  );
  return { ...item, socketColors };
}

// Normalise every owned item (equipped + backpack) so they all carry a
// well-formed socketColors array after a load.
function backfillEquipped(eq: EquippedItems): EquippedItems {
  const next = { ...eq };
  for (const [slotId, item] of Object.entries(next)) {
    if (item) next[slotId as keyof EquippedItems] = backfillItemColors(item);
  }
  return next;
}

function backfillBackpack(slots: BackpackSlot[]): BackpackSlot[] {
  return slots.map((s) => (isItem(s) ? backfillItemColors(s) : s));
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
    if (!data || data.v !== 2) return false;
    topbar.set(data.topbar);
    // Backfill socketColors for items from pre-colour saves (no save wipe).
    backpack.set(backfillBackpack(data.backpack));
    equipped.set(backfillEquipped(data.equipped));
    // Legacy migration: pre-merge saves stashed loose gems in their own array.
    // Fold each into the backpack's first empty slot so no gem is lost.
    if (Array.isArray(data.gemStash)) {
      for (const gem of data.gemStash) addGemToBackpack(gem);
    }
    pendingRewards.set(data.pendingRewards);
    shopStock.set(data.shopStock);
    itemOffer.set(data.itemOffer);
    // Older v2 saves predate run-locked difficulty; default to normal so
    // a mid-fight Lich phase spawn still scales its adds correctly.
    const restoredRun: RunState = { ...data.run, difficulty: data.run.difficulty ?? 'normal' };
    primeDifficulty(restoredRun.difficulty);
    run.set(restoredRun);
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

  // Flush on tab close / page hide so the last debounce window
  // doesn't get lost.
  window.addEventListener('beforeunload', () => writeSave());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') writeSave();
  });
}
