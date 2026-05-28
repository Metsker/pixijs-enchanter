import type { EnemyDef } from './enemy';
import { COMMONS, ELITES, LICH, MINOTAUR, SKELETON, GOBLIN, SLIME } from './enemy-catalogue';

export type RoomKind = 'common' | 'elite' | 'shop' | 'rest' | 'boss';

export interface MapNode {
  id: string;
  floor: number;
  kind: RoomKind;
  // Enemies are pre-rolled at map generation so the run is deterministic
  // once you start; encounters in CONTEXT.md are described per room type:
  // - Common: 1-3 commons mixed.
  // - Elite: 1 elite, possibly with 0-1 common escort (Minotaur always 1-2).
  // - Boss: Lich.
  enemies?: EnemyDef[];
  // ids of nodes on the next floor that this node connects to.
  children: string[];
}

export interface MapGraph {
  floors: number;
  nodes: MapNode[];
}

// Slay-the-Spire-ish single-act map. Forced common at floor 1, forced rest
// at floor N-1, forced Lich boss at floor N. Middle floors mix
// common / elite / shop / rest with a bias toward fights.
const FLOORS = 8;

function pickKind(rng: () => number): RoomKind {
  const r = rng();
  if (r < 0.5) return 'common';
  if (r < 0.7) return 'elite';
  if (r < 0.85) return 'shop';
  return 'rest';
}

function rollEnemies(kind: RoomKind, rng: () => number): EnemyDef[] {
  if (kind === 'common') {
    const count = 1 + Math.floor(rng() * 3); // 1..3
    return Array.from({ length: count }, () => COMMONS[Math.floor(rng() * COMMONS.length)]);
  }
  if (kind === 'elite') {
    const elite = ELITES[Math.floor(rng() * ELITES.length)];
    // Minotaur ALWAYS rolls 1-2 common escort per docs/enemies.md.
    if (elite.id === MINOTAUR.id) {
      const escortCount = 1 + Math.floor(rng() * 2);
      const escort: EnemyDef[] = Array.from({ length: escortCount }, () =>
        [SKELETON, GOBLIN, SLIME][Math.floor(rng() * 3)],
      );
      return [elite, ...escort];
    }
    // Harpy / Ogre roll 0-1 common escort.
    return rng() < 0.5
      ? [elite]
      : [elite, COMMONS[Math.floor(rng() * COMMONS.length)]];
  }
  if (kind === 'boss') {
    return [LICH];
  }
  return [];
}

export function generateMap(seed: number = Date.now()): MapGraph {
  // Simple LCG so the same seed reproduces a map.
  let state = seed;
  const rng = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  const nodes: MapNode[] = [];
  const byFloor: MapNode[][] = [];

  for (let floor = 1; floor <= FLOORS; floor++) {
    const count =
      floor === 1 || floor === FLOORS - 1 || floor === FLOORS
        ? 1
        : 2 + Math.floor(rng() * 2); // 2 or 3

    const floorNodes: MapNode[] = [];
    for (let i = 0; i < count; i++) {
      let kind: RoomKind;
      if (floor === 1) kind = 'common';
      else if (floor === FLOORS) kind = 'boss';
      else if (floor === FLOORS - 1) kind = 'rest';
      else kind = pickKind(rng);

      const node: MapNode = {
        id: `f${floor}-n${i}`,
        floor,
        kind,
        children: [],
      };
      if (kind === 'common' || kind === 'elite' || kind === 'boss') {
        node.enemies = rollEnemies(kind, rng);
      }
      floorNodes.push(node);
    }
    byFloor.push(floorNodes);
    nodes.push(...floorNodes);
  }

  // Wire edges: each parent picks 1-2 children on the next floor; ensure
  // every child has at least one parent.
  for (let floor = 1; floor < FLOORS; floor++) {
    const parents = byFloor[floor - 1];
    const children = byFloor[floor];

    for (const parent of parents) {
      const numChildren = Math.min(children.length, 1 + (rng() < 0.5 ? 0 : 1));
      const shuffled = [...children].sort(() => rng() - 0.5);
      parent.children = shuffled.slice(0, numChildren).map((c) => c.id);
    }

    const claimed = new Set<string>();
    for (const parent of parents) for (const cid of parent.children) claimed.add(cid);
    for (const child of children) {
      if (claimed.has(child.id)) continue;
      const adopter = parents[Math.floor(rng() * parents.length)];
      if (!adopter.children.includes(child.id)) adopter.children.push(child.id);
    }
  }

  return { floors: FLOORS, nodes };
}

export function nodeById(graph: MapGraph, id: string): MapNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

// Available next picks for the player: children of the last completed room;
// or all floor-1 nodes (just one) at run start.
export function reachableFrom(
  graph: MapGraph,
  lastCompletedRoomId: string | null,
): MapNode[] {
  if (lastCompletedRoomId === null) {
    return graph.nodes.filter((n) => n.floor === 1);
  }
  const last = nodeById(graph, lastCompletedRoomId);
  if (!last) return [];
  return last.children
    .map((id) => nodeById(graph, id))
    .filter((n): n is MapNode => n !== undefined);
}
