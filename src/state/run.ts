import { get, writable } from 'svelte/store';
import { generateMap, nodeById, type MapGraph, type RoomKind } from '../domain/map';
import { endFight, fight, startFightWith } from './fight';
import { closeShop, openShopForFloor } from './shop';

export type Screen = 'map' | 'fight' | 'shop' | 'rest' | 'run-complete' | 'run-lost';

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
  return 'rest';
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
}

export function completeRoom(): void {
  const state = get(run);
  if (!state.currentRoomId) return;
  const wasBoss = nodeById(state.map, state.currentRoomId)?.kind === 'boss';

  endFight();
  closeShop();

  run.update((s) => ({
    ...s,
    lastCompletedRoomId: s.currentRoomId,
    currentRoomId: null,
    screen: wasBoss ? 'run-complete' : 'map',
    fightWon: false,
  }));
}

export function startNewRun(): void {
  endFight();
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
  // Run-lost: player HP just crossed to 0 mid-fight.
  if (r.screen === 'fight' && state.inFight && prevPlayerHp > 0 && state.player.hp <= 0) {
    run.update((s) => ({ ...s, screen: 'run-lost' }));
  }
  prevEnemyCount = state.enemies.length;
  prevPlayerHp = state.player.hp;
});
