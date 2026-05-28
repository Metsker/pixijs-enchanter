import type { EnemyDef } from './enemy';
import { COMMONS, ELITES, LICH, MINOTAUR, SKELETON, GOBLIN, SLIME } from './enemy-catalogue';
import type { Item } from './item';
import { randomWeapon } from './random';

export type RoomKind = 'item-select' | 'common' | 'elite' | 'shop' | 'rest' | 'boss';

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
  // Pre-rolled items for an item-select room. Like enemies, these are
  // fixed at map generation so the run is deterministic per seed. The
  // floor-1 starter uses 3 T1 weapons; later acts can drop in their
  // own roll (e.g. T3 armor after a boss) by setting this field.
  offerItems?: Item[];
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

// Weighted random RoomKind for middle floors, biased toward fights.
// `forbidden` lets the caller exclude kinds that would create a back-to-back
// repeat with a parent on the previous floor (e.g. no rest after rest).
function pickKind(rng: () => number, forbidden: ReadonlySet<RoomKind> = new Set()): RoomKind {
  const allWeights: { kind: RoomKind; weight: number }[] = [
    { kind: 'common', weight: 0.5 },
    { kind: 'elite', weight: 0.2 },
    { kind: 'shop', weight: 0.15 },
    { kind: 'rest', weight: 0.15 },
  ];
  const weights = allWeights.filter((c) => !forbidden.has(c.kind));
  const total = weights.reduce((s, c) => s + c.weight, 0);
  let r = rng() * total;
  for (const c of weights) {
    if (r < c.weight) return c.kind;
    r -= c.weight;
  }
  return weights[weights.length - 1].kind;
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

  // Pass 1: create empty nodes (kind picked later). Forced nodes (floor 1,
  // floor N-1 = Rest, floor N = Boss) are tagged now but their enemy rolls
  // wait until kinds are finalised.
  const nodes: MapNode[] = [];
  const byFloor: MapNode[][] = [];

  for (let floor = 1; floor <= FLOORS; floor++) {
    const count =
      floor === 1 || floor === FLOORS - 1 || floor === FLOORS
        ? 1
        : 2 + Math.floor(rng() * 2); // 2 or 3

    const floorNodes: MapNode[] = [];
    for (let i = 0; i < count; i++) {
      floorNodes.push({
        id: `f${floor}-n${i}`,
        floor,
        kind: 'common', // placeholder; resolved in pass 3
        children: [],
      });
    }
    byFloor.push(floorNodes);
    nodes.push(...floorNodes);
  }

  // Wire edges: each parent picks 1-2 children on the NEXT floor, constrained
  // to children within ~1 column of the parent's x position so the rendered
  // graph has no long horizontal jumps. Then any orphan child gets adopted
  // by its closest parent.
  const CLOSENESS = 0.3; // normalized x distance (0..1)

  function relX(idx: number, count: number): number {
    return (idx + 1) / (count + 1);
  }

  for (let floor = 1; floor < FLOORS; floor++) {
    const parents = byFloor[floor - 1];
    const children = byFloor[floor];

    for (let pi = 0; pi < parents.length; pi++) {
      const px = relX(pi, parents.length);
      const ranked = children
        .map((_, ci) => ({ ci, dist: Math.abs(px - relX(ci, children.length)) }))
        .sort((a, b) => a.dist - b.dist);

      const within = ranked.filter((r) => r.dist <= CLOSENESS);
      const pool = within.length > 0 ? within : ranked.slice(0, 1);
      const numChildren = Math.min(pool.length, 1 + (rng() < 0.5 ? 0 : 1));
      parents[pi].children = pool.slice(0, numChildren).map((r) => children[r.ci].id);
    }

    const claimed = new Set<string>();
    for (const parent of parents) for (const cid of parent.children) claimed.add(cid);
    for (let ci = 0; ci < children.length; ci++) {
      const child = children[ci];
      if (claimed.has(child.id)) continue;
      const cx = relX(ci, children.length);
      let bestPi = 0;
      let bestDist = Infinity;
      for (let pi = 0; pi < parents.length; pi++) {
        const d = Math.abs(cx - relX(pi, parents.length));
        if (d < bestDist) {
          bestDist = d;
          bestPi = pi;
        }
      }
      if (!parents[bestPi].children.includes(child.id)) {
        parents[bestPi].children.push(child.id);
      }
    }
  }

  // Pass 3: assign kinds. Floor 1 = common, floor N = boss, floor N-1 =
  // forced rest. Middle floors pick weighted-random but exclude kinds that
  // would land back-to-back with any parent on the previous floor (no
  // rest -> rest, no shop -> shop). Floor N-2 also forbids rest so the
  // forced rest on N-1 doesn't end up immediately after another rest.
  for (let floor = 1; floor <= FLOORS; floor++) {
    const floorNodes = byFloor[floor - 1];
    const parents = floor > 1 ? byFloor[floor - 2] : [];
    for (const node of floorNodes) {
      if (floor === 1) {
        // Forced starter room: the player picks 1 of 3 random T1
        // weapons here before any fight. Item-select rooms can be
        // reused later with different offerItems.
        node.kind = 'item-select';
        node.offerItems = [
          randomWeapon(1, 'starter'),
          randomWeapon(1, 'starter'),
          randomWeapon(1, 'starter'),
        ];
      } else if (floor === FLOORS) {
        node.kind = 'boss';
      } else if (floor === FLOORS - 1) {
        node.kind = 'rest';
      } else {
        const myParents = parents.filter((p) => p.children.includes(node.id));
        const parentKinds = new Set(myParents.map((p) => p.kind));
        const forbidden = new Set<RoomKind>();
        if (parentKinds.has('rest')) forbidden.add('rest');
        if (parentKinds.has('shop')) forbidden.add('shop');
        if (parentKinds.has('elite')) forbidden.add('elite');
        // Floor N-2 forbids rest to keep the forced N-1 rest from being a
        // back-to-back repeat.
        if (floor === FLOORS - 2) forbidden.add('rest');
        node.kind = pickKind(rng, forbidden);
      }
      if (node.kind === 'common' || node.kind === 'elite' || node.kind === 'boss') {
        node.enemies = rollEnemies(node.kind, rng);
      }
    }
  }

  // Pass 4: minimum guarantees. Convert middle-floor nodes to shop / rest
  // until we have at least 2 of each total (the forced N-1 rest counts).
  // Two-tier search: prefer candidates that don't create a back-to-back
  // repeat; if none fit, fall back to ANY eligible middle node to honour
  // the min-count guarantee. Rest conversions skip floor N-2 either way
  // since that would always be back-to-back with the forced N-1 rest.
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  function ensureMinimum(target: RoomKind, min: number): void {
    let current = nodes.filter((n) => n.kind === target).length;
    if (current >= min) return;

    const middleFloors = nodes.filter(
      (n) =>
        n.floor >= 2 &&
        n.floor <= FLOORS - 2 &&
        n.kind !== target &&
        !(target === 'rest' && n.floor === FLOORS - 2),
    );
    const shuffled = middleFloors.slice().sort(() => rng() - 0.5);

    function isCleanFor(node: MapNode): boolean {
      const myParents = nodes.filter((p) => p.children.includes(node.id));
      if (myParents.some((p) => p.kind === target)) return false;
      const myChildren = node.children
        .map((id) => byId.get(id))
        .filter((c): c is MapNode => !!c);
      return !myChildren.some((c) => c.kind === target);
    }

    function convert(node: MapNode): void {
      node.kind = target;
      if (target === 'common' || target === 'elite' || target === 'boss') {
        node.enemies = rollEnemies(target, rng);
      } else {
        delete node.enemies;
      }
      current += 1;
    }

    // First pass: convert clean COMMON nodes only. Protects existing shops /
    // rests / elites - we don't want shop-min to cannibalise a rest.
    for (const node of shuffled) {
      if (current >= min) return;
      if (node.kind === 'common' && isCleanFor(node)) convert(node);
    }
    // Second pass: any clean non-target (may eat into rest/shop/elite).
    for (const node of shuffled) {
      if (current >= min) return;
      if (isCleanFor(node)) convert(node);
    }
    // Third pass: accept back-to-back if needed to hit the minimum.
    for (const node of shuffled) {
      if (current >= min) return;
      if (node.kind !== target) convert(node);
    }
  }

  ensureMinimum('rest', 2);
  ensureMinimum('shop', 2);
  ensureMinimum('elite', 2);

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
