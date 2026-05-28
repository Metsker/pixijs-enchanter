import { get, writable } from 'svelte/store';
import { generateMap, nodeById, type MapGraph, type RoomKind } from '../domain/map';
import { endFight, fight, startFightWith } from './fight';
import { closeShop, openShopForFloor } from './shop';
import { resetPendingRewards } from './rewards';
import { resetBackpack } from './backpack';
import { resetEquipped } from './inventory';
import { resetTopbar } from './topbar';
import { closeInspector, inspectItem } from './inspector';
import { equipped } from './inventory';
import { EQUIPMENT_SLOT_ORDER, type EquipmentSlotId } from '../domain/equipment';
import type { Item } from '../domain/item';
import { closeItemOffer, openItemOffer } from './item-offer';

export type Screen =
  | 'item-select'
  | 'map'
  | 'fight'
  | 'shop'
  | 'rest'
  | 'run-complete'
  | 'run-lost';

export interface RunState {
  map: MapGraph;
  lastCompletedRoomId: string | null;
  currentRoomId: string | null;
  screen: Screen;
  // True once all enemies in the current fight room are dead; the player
  // sees a victory overlay with a Continue button that calls completeRoom().
  fightWon: boolean;
}

function makeInitial(): RunState {
  return {
    map: generateMap(),
    lastCompletedRoomId: null,
    currentRoomId: null,
    screen: 'map',
    fightWon: false,
  };
}

export const run = writable<RunState>(makeInitial());

function screenFor(kind: RoomKind): Screen {
  if (kind === 'common' || kind === 'elite' || kind === 'boss') return 'fight';
  if (kind === 'shop') return 'shop';
  if (kind === 'item-select') return 'item-select';
  return 'rest';
}

// Walks the equipped slots and inspects the item with the most
// enchants (ties broken by canonical slot order). Used to auto-pop
// the Inspector on the player's "best" gear at room entry so the
// fight / rest / shop opens with their key item already in focus.
function inspectHighestTierEquipped(): void {
  const eq = get(equipped);
  let best: { slotId: EquipmentSlotId; item: Item } | null = null;
  for (const slotId of EQUIPMENT_SLOT_ORDER) {
    const item = eq[slotId];
    if (!item) continue;
    if (!best || item.enchants.length > best.item.enchants.length) {
      best = { slotId, item };
    }
  }
  if (best) inspectItem({ source: 'inventory', slotId: best.slotId, item: best.item });
}

export function enterRoom(roomId: string): void {
  const state = get(run);
  const node = nodeById(state.map, roomId);
  if (!node) return;

  const screen = screenFor(node.kind);
  run.update((s) => ({
    ...s,
    currentRoomId: roomId,
    screen,
    fightWon: false,
  }));

  if (screen === 'fight' && node.enemies) {
    startFightWith(node.enemies);
  }
  if (screen === 'shop') {
    openShopForFloor(node.floor);
  }
  if (screen === 'item-select' && node.offerItems) {
    openItemOffer(node.offerItems);
  }

  // Auto-inspect the player's best equipped item on room entry
  // (skip item-select rooms - the offer choices need to stay
  // centre-stage).
  if (screen !== 'item-select') {
    inspectHighestTierEquipped();
  }
}

export function completeRoom(): void {
  const state = get(run);
  if (!state.currentRoomId) return;
  const wasBoss = nodeById(state.map, state.currentRoomId)?.kind === 'boss';

  endFight();
  closeShop();
  closeItemOffer();

  run.update((s) => ({
    ...s,
    lastCompletedRoomId: s.currentRoomId,
    currentRoomId: null,
    screen: wasBoss ? 'run-complete' : 'map',
    fightWon: false,
  }));
}

export function startNewRun(): void {
  // Full wipe: nothing carries between runs - same policy on a defeat
  // and on a boss-clear, so the loot loop starts fresh each time.
  endFight();
  resetPendingRewards();
  resetBackpack();
  resetEquipped();
  resetTopbar();
  closeInspector();
  closeShop();
  closeItemOffer();
  run.set(makeInitial());
}

// Victory detection: when in a fight and the enemy list collapses to empty,
// flip fightWon so the RoomOverlay shows its Continue button. Module-level
// subscribe runs for the life of the page.
let prevEnemyCount = 0;
let prevPlayerHp = Infinity;
fight.subscribe((state) => {
  const r = get(run);
  if (r.screen === 'fight' && state.inFight && prevEnemyCount > 0 && state.enemies.length === 0) {
    run.update((s) => ({ ...s, fightWon: true }));
  }
  // Run-lost: player HP just crossed to 0 mid-fight. The overlay
  // waits ~400ms so the Battlefield's death animation (DEATH_DURATION
  // = 0.3s, same one enemies use) can play out before "Defeated."
  // covers the screen.
  if (r.screen === 'fight' && state.inFight && prevPlayerHp > 0 && state.player.hp <= 0) {
    setTimeout(() => {
      if (get(run).screen === 'fight') {
        run.update((s) => ({ ...s, screen: 'run-lost' }));
      }
    }, 400);
  }
  prevEnemyCount = state.enemies.length;
  prevPlayerHp = state.player.hp;
});
