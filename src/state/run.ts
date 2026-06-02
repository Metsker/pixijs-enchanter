import { get, writable } from 'svelte/store';
import { generateMap, nodeById, resolvedKind, type MapGraph, type RoomKind } from '../domain/map';
import { endFight, fight, grantGuaranteedDrop, startFightWith, type RoomKindLoot } from './fight';
import { closeShop, openShopForFloor } from './shop';
import { resetPendingRewards, claimVictoryHaul, clearVictoryHaul } from './rewards';
import { resetBackpack } from './backpack';
import { resetEquipped } from './inventory';
import { resetStash } from './gem-stash';
import { resetHeldGem } from './gem-move';
import { resetTopbar } from './topbar';
import { closeInspector } from './inspector';
import { closeGemInspector } from './gem-inspector';
import { closeItemsSplit, closeGemsSplit, closeStatsSplit, closeSettings } from './ui';
import { closeItemOffer, openItemOffer } from './item-offer';
import { settings, type Difficulty } from './settings';

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
  // Difficulty captured (LOCKED) at run start per docs/adr/0009. Enemy
  // stat scaling reads this, not the live settings store, so changing
  // the setting mid-run only affects the NEXT run.
  difficulty: Difficulty;
}

function makeInitial(): RunState {
  return {
    map: generateMap(),
    lastCompletedRoomId: null,
    currentRoomId: null,
    screen: 'map',
    fightWon: false,
    // Lock in the player's currently-chosen difficulty for this run.
    difficulty: get(settings).difficulty,
  };
}

export const run = writable<RunState>(makeInitial());

function screenFor(kind: RoomKind): Screen {
  if (kind === 'common' || kind === 'elite' || kind === 'boss') return 'fight';
  if (kind === 'shop') return 'shop';
  if (kind === 'item-select') return 'item-select';
  return 'rest';
}

export function enterRoom(roomId: string): void {
  const state = get(run);
  const node = nodeById(state.map, roomId);
  if (!node) return;

  // A 'secret' node resolves to its hidden kind (Item room / common / elite)
  // here; the map keeps showing "?" but entry behaves like the real room.
  const screen = screenFor(resolvedKind(node));
  run.update((s) => ({
    ...s,
    currentRoomId: roomId,
    screen,
    fightWon: false,
  }));

  if (screen === 'fight' && node.enemies) {
    startFightWith(node.enemies, state.difficulty);
  }
  if (screen === 'shop') {
    openShopForFloor(node.floor);
  }
  if (screen === 'item-select' && node.offerItems) {
    openItemOffer(node.offerItems);
  }
}

export function completeRoom(): void {
  const state = get(run);
  if (!state.currentRoomId) return;
  const wasBoss = nodeById(state.map, state.currentRoomId)?.kind === 'boss';

  endFight();
  closeShop();
  closeItemOffer();

  const nextScreen = wasBoss ? 'run-complete' : 'map';
  // Back to the map: close every rail pane so the map shows uncluttered (panes
  // can be reopened over the map afterwards), and drop the victory summary (the
  // loot was already claimed into the bag). The boss path keeps the haul so the
  // run-complete celebration can show the final loot.
  if (nextScreen === 'map') {
    clearVictoryHaul();
    closeInspector();
    closeGemInspector();
    closeItemsSplit();
    closeGemsSplit();
    closeStatsSplit();
  }

  run.update((s) => ({
    ...s,
    lastCompletedRoomId: s.currentRoomId,
    currentRoomId: null,
    screen: nextScreen,
    fightWon: false,
  }));
}

export function startNewRun(): void {
  // Full wipe: nothing carries between runs - same policy on a defeat
  // and on a boss-clear, so the loot loop starts fresh each time.
  endFight();
  resetPendingRewards();
  clearVictoryHaul();
  resetBackpack();
  resetEquipped();
  resetStash();
  // Drop any in-flight held gem before the stash reset settles, so the
  // Inspector's close-effect can't dump it back into the new run's stash.
  resetHeldGem();
  resetTopbar();
  // Close every rail panel + popup so a new run starts on a clean board.
  closeInspector();
  closeGemInspector();
  closeItemsSplit();
  closeGemsSplit();
  closeStatsSplit();
  closeSettings();
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
    // Per-room drop guarantee (Stage 2): the room is cleared, so make
    // sure at least one pre-socketed item landed in the chest. Common
    // rooms only roll a 50% per-kill chance, so this is the backstop.
    const node = r.currentRoomId ? nodeById(r.map, r.currentRoomId) : null;
    const kind = node ? resolvedKind(node) : null;
    if (kind === 'common' || kind === 'elite' || kind === 'boss') {
      grantGuaranteedDrop(kind as RoomKindLoot);
    }
    run.update((s) => ({ ...s, fightWon: true }));
    // Auto-claim the whole haul straight into the bag (gold credited, items +
    // gems stashed) and snapshot it for the victory screen's interactive
    // summary - no more "Take" step.
    claimVictoryHaul();
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
