import type { EnemyDef } from './enemy';
import { COMMONS, ELITES, LICH, MINOTAUR, SKELETON, GOBLIN, SLIME } from './enemy-catalogue';
import type { Item } from './item';
import { randomItem, rollStarterWeapons } from './random';

// 'secret' is drawn as "?" on the map; its true content (an Item room or a
// common / elite fight) is pre-rolled but hidden until the player enters it.
export type RoomKind =
  | 'item-select'
  | 'common'
  | 'elite'
  | 'shop'
  | 'rest'
  | 'boss'
  | 'secret';

// What a 'secret' node resolves to once entered. A subset of RoomKind: a secret
// is only ever an item room or a fight (never a shop / rest / boss).
export type SecretKind = 'item-select' | 'common' | 'elite';

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
  // For a 'secret' node only: the room it actually resolves to once entered.
  // Pre-rolled at generation (with its enemies / offerItems) so the run stays
  // deterministic per seed, but the map keeps rendering "?" so it reads as a
  // surprise. resolvedKind(node) reads this for entry + loot.
  secretKind?: SecretKind;
  // ids of nodes on the next floor that this node connects to.
  children: string[];
}

export interface MapGraph {
  floors: number;
  nodes: MapNode[];
}

// Slay-the-Spire-ish single-act map. Forced common at floor 1, forced rest
// at floor N-1, forced Lich boss at floor N. Middle floors mix
// common / elite / shop / rest with a bias toward fights. FLOORS sets the
// act length (path to the boss); the first/second-half difficulty split and
// the forced rest/boss positions all derive from it.
const FLOORS = 16;

// Weighted random RoomKind for middle floors, biased toward fights.
// `forbidden` lets the caller exclude kinds that would create a back-to-back
// repeat with a parent on the previous floor (e.g. no rest after rest).
function pickKind(rng: () => number, forbidden: ReadonlySet<RoomKind> = new Set()): RoomKind {
  const allWeights: { kind: RoomKind; weight: number }[] = [
    { kind: 'common', weight: 0.5 },
    { kind: 'elite', weight: 0.2 },
    { kind: 'shop', weight: 0.15 },
    { kind: 'rest', weight: 0.15 },
    { kind: 'secret', weight: 0.14 },
  ];
  // Fall back to the full set if every kind is forbidden (a heavily-constrained
  // fork) - a rare repeat beats returning undefined.
  const filtered = allWeights.filter((c) => !forbidden.has(c.kind));
  const weights = filtered.length > 0 ? filtered : allWeights;
  const total = weights.reduce((s, c) => s + c.weight, 0);
  let r = rng() * total;
  for (const c of weights) {
    if (r < c.weight) return c.kind;
    r -= c.weight;
  }
  return weights[weights.length - 1].kind;
}

// Encounter size: the first half of the act is solo fights (one common, or a
// lone elite); the second half RAMPS with depth, growing past the old 2-3 cap
// toward MAX_ENEMIES on the deepest floors. The boss is always just the Lich.
const MAX_ENEMIES = 3;
function encounterSize(rng: () => number, floor: number): number {
  const half = Math.floor(FLOORS / 2);
  if (floor <= half) return 1; // first half: solo
  const depth = floor - half; // 1.. into the second half
  const centre = Math.min(MAX_ENEMIES, 2 + Math.floor(depth / 2));
  return Math.max(2, Math.min(MAX_ENEMIES, centre + (rng() < 0.5 ? 0 : 1)));
}

function rollEnemies(kind: RoomKind, rng: () => number, floor: number): EnemyDef[] {
  if (kind === 'boss') return [LICH];
  const total = encounterSize(rng, floor);
  if (kind === 'common') {
    return Array.from({ length: total }, () => COMMONS[Math.floor(rng() * COMMONS.length)]);
  }
  if (kind === 'elite') {
    const elite = ELITES[Math.floor(rng() * ELITES.length)];
    const escortCount = total - 1;
    if (escortCount <= 0) return [elite]; // solo (first half)
    // Minotaur keeps its skeleton/goblin/slime escort signature; others pull
    // commons. Either way the escort fills out to the floor's encounter size.
    const pool = elite.id === MINOTAUR.id ? [SKELETON, GOBLIN, SLIME] : COMMONS;
    const escort: EnemyDef[] = Array.from(
      { length: escortCount },
      () => pool[Math.floor(rng() * pool.length)],
    );
    return [elite, ...escort];
  }
  return [];
}

// A secret resolves to an Item room, a common fight, or an elite fight - more
// often a reward than a fight, with elite the rarest of the three.
const SECRET_WEIGHTS: { kind: SecretKind; weight: number }[] = [
  { kind: 'item-select', weight: 0.4 },
  { kind: 'common', weight: 0.35 },
  { kind: 'elite', weight: 0.25 },
];

function pickSecretKind(rng: () => number): SecretKind {
  const total = SECRET_WEIGHTS.reduce((s, c) => s + c.weight, 0);
  let r = rng() * total;
  for (const c of SECRET_WEIGHTS) {
    if (r < c.weight) return c.kind;
    r -= c.weight;
  }
  return SECRET_WEIGHTS[SECRET_WEIGHTS.length - 1].kind;
}

// Item tier for a secret Item room: scales with depth across the act, so an
// early secret yields ~T1 gear and a deep one ~T5-6.
function secretItemTier(floor: number): number {
  return Math.max(1, Math.min(6, Math.round((floor / FLOORS) * 6)));
}

// Pre-roll a secret node's hidden content. An Item room offers three
// random-type items at a floor-scaled tier (reusing the item-offer screen); a
// fight pre-rolls its encounter like any common / elite.
function resolveSecret(node: MapNode, rng: () => number): void {
  const sk = pickSecretKind(rng);
  node.secretKind = sk;
  if (sk === 'item-select') {
    const tier = secretItemTier(node.floor);
    node.offerItems = [
      randomItem(tier, 'secret'),
      randomItem(tier, 'secret'),
      randomItem(tier, 'secret'),
    ];
  } else {
    node.enemies = rollEnemies(sk, rng, node.floor);
  }
}

// The effective room kind for ENTRY and LOOT: a 'secret' node uses its hidden
// resolved kind; every other node is itself. The map still renders 'secret' as
// "?" - this only drives screen selection + drop tables once entered.
export function resolvedKind(node: MapNode): RoomKind {
  return node.kind === 'secret' && node.secretKind ? node.secretKind : node.kind;
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
      // Favour 2 children so the map forks often (the branch-guarantee pass
      // below tops up any stretch that still went flat).
      const numChildren = Math.min(pool.length, 1 + (rng() < 0.6 ? 1 : 0));
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

  // Branch guarantee: no path should run more than 2 floors without a fork.
  // Walk the floors; once two have gone by with no node offering a choice
  // (>=2 children), force the next eligible floor to branch by giving a
  // single-child node its nearest unused second child. The funnel into the
  // forced rest + boss (single-node floors) is exempt - nothing to branch to.
  let sinceBranch = 0;
  for (let floor = 1; floor < FLOORS; floor++) {
    const parents = byFloor[floor - 1];
    const next = byFloor[floor];
    if (parents.some((n) => n.children.length >= 2)) {
      sinceBranch = 0;
      continue;
    }
    sinceBranch += 1;
    if (sinceBranch <= 2 || next.length < 2) continue;

    const pi = parents.findIndex((n) => n.children.length === 1);
    if (pi === -1) continue;
    const px = relX(pi, parents.length);
    let best = -1;
    let bestDist = Infinity;
    for (let ci = 0; ci < next.length; ci++) {
      if (parents[pi].children.includes(next[ci].id)) continue;
      const d = Math.abs(px - relX(ci, next.length));
      if (d < bestDist) {
        bestDist = d;
        best = ci;
      }
    }
    if (best !== -1) {
      parents[pi].children.push(next[best].id);
      sinceBranch = 0;
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
    // Kinds already committed on THIS floor, so a fork never offers two children
    // of the same kind (no "shop or shop"). We assign left-to-right and forbid a
    // node's already-assigned siblings (other children of a shared parent).
    const assignedOnFloor = new Set<string>();
    for (const node of floorNodes) {
      if (floor === 1) {
        // Forced starter room: the player picks 1 of 3 random T1
        // weapons here before any fight. Item-select rooms can be
        // reused later with different offerItems.
        node.kind = 'item-select';
        node.offerItems = rollStarterWeapons(3);
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
        // Sibling distinctness: forbid kinds already taken by an earlier-assigned
        // child of any shared parent, so a fork never offers two of one kind.
        for (const p of myParents) {
          for (const cid of p.children) {
            if (cid === node.id || !assignedOnFloor.has(cid)) continue;
            const sib = floorNodes.find((n) => n.id === cid);
            if (sib) forbidden.add(sib.kind);
          }
        }
        node.kind = pickKind(rng, forbidden);
      }
      if (node.kind === 'common' || node.kind === 'elite' || node.kind === 'boss') {
        node.enemies = rollEnemies(node.kind, rng, node.floor);
      } else if (node.kind === 'secret') {
        resolveSecret(node, rng);
      }
      assignedOnFloor.add(node.id);
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
      // Sibling collision: a fork mustn't end up offering two of `target`.
      const collidesSibling = myParents.some((p) =>
        p.children.some((cid) => cid !== node.id && byId.get(cid)?.kind === target),
      );
      if (collidesSibling) return false;
      const myChildren = node.children
        .map((id) => byId.get(id))
        .filter((c): c is MapNode => !!c);
      return !myChildren.some((c) => c.kind === target);
    }

    function convert(node: MapNode): void {
      node.kind = target;
      // Shed any pre-rolled secret content - this node is now a plain room.
      delete node.secretKind;
      delete node.offerItems;
      if (target === 'common' || target === 'elite' || target === 'boss') {
        node.enemies = rollEnemies(target, rng, node.floor);
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
