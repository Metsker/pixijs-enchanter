// Seven enemy types from docs/enemies.md. Numbers are placeholders for
// tuning; archetype shapes are locked.

import type { EnemyDef } from './enemy';

export const SKELETON: EnemyDef = {
  id: 'skeleton',
  nameKey: 'enemy.skeleton',
  emoji: '💀',
  // The "hard" common building block: low-ish HP but a heavy, slow burst.
  // Sized so a no-gem player takes ~one 300 spike before it dies (sweaty but
  // safe solo); dangerous in numbers where the spikes overlap.
  hp: 560,
  damage: 300,
  damageType: 'physical',
  interval: 4.2,
  resist: 0,
  dodge: 0,
  loc: 'grounded',
  kind: 'common',
  // Bone, no flesh: bleed / poison find nothing to rot. Teaches "DoT is not
  // universal." Dry bones catch fire, though.
  ailmentImmune: ['bleed', 'poison'],
  weakType: 'fire',
};

export const GOBLIN: EnemyDef = {
  id: 'goblin',
  nameKey: 'enemy.goblin',
  emoji: '👹',
  // The "weak" common building block: cheap, low HP, fast chip + a little
  // dodge. Trivial alone; the body that fills out late-game armies, where a
  // dozen fast chips add up faster than a couple of slow heavy hitters.
  hp: 320,
  damage: 65,
  damageType: 'physical',
  interval: 1.3,
  resist: 0,
  dodge: 0.12,
  loc: 'grounded',
  kind: 'common',
};

export const SLIME: EnemyDef = {
  id: 'slime',
  nameKey: 'enemy.slime',
  emoji: '🟢',
  // The "normal" common building block: its threat is the matchup, not raw
  // stats - it halves PHYSICAL (the default auto-attack) and poisons, so a
  // no-gem physical player grinds it down slowly while bleeding from poison.
  // Bring fire / an elemental proc and it folds. (Flat resist dropped to 0 -
  // the physical resistType is its identity, no need to double up.)
  hp: 480,
  damage: 70,
  damageType: 'chaos',
  interval: 2.6,
  resist: 0,
  dodge: 0,
  loc: 'grounded',
  kind: 'common',
  appliesStatus: 'poison',
  // Gelatinous: blades sink in uselessly. Rewards swapping to an elemental
  // damage type (fire especially), or bringing poison immunity.
  resistType: 'physical',
  weakType: 'fire',
};

export const HARPY: EnemyDef = {
  id: 'harpy',
  nameKey: 'enemy.harpy',
  emoji: '🦅',
  // Flying + 25% dodge already makes melee whiff ~70% of the time, so its raw
  // damage is kept modest - the threat is "your auto-attack barely connects,"
  // not big numbers. Bring procs / lightning and it dies fast.
  hp: 1300,
  damage: 150,
  damageType: 'physical',
  interval: 2.6,
  resist: 0.05,
  dodge: 0.25,
  loc: 'flying',
  kind: 'elite',
  // Airborne and evasive: melee auto-attacks whiff (see MELEE_VS_FLYING_MISS).
  // Bring procs / projectiles. A shock to the wings hurts.
  weakType: 'lightning',
};

export const OGRE: EnemyDef = {
  id: 'ogre',
  nameKey: 'enemy.ogre',
  emoji: '👺',
  // The wall: huge HP and one enormous, slow swing. Reward a timed shield /
  // heal for the spike and sustained damage to chew the wall down.
  hp: 2600,
  damage: 480,
  damageType: 'physical',
  interval: 7.0,
  resist: 0.10,
  dodge: 0,
  loc: 'grounded',
  kind: 'elite',
};

export const MINOTAUR: EnemyDef = {
  id: 'minotaur',
  nameKey: 'enemy.minotaur',
  emoji: '🐂',
  hp: 1700,
  damage: 200,
  damageType: 'physical',
  interval: 3.0,
  resist: 0.08,
  dodge: 0,
  loc: 'grounded',
  kind: 'elite',
  taunt: { intervalSec: 6, durationSec: 3 },
};

export const LICH: EnemyDef = {
  id: 'lich',
  nameKey: 'enemy.lich',
  emoji: '🧙',
  // The exam. HP wall + poison + skeleton adds at 66%/33% (fight.ts). Sized so
  // only a developed late-game build clears it in ~12s; a half-built run that
  // could faceroll commons still wipes here.
  hp: 7000,
  damage: 320,
  damageType: 'chaos',
  interval: 3.8,
  resist: 0.12,
  dodge: 0,
  loc: 'grounded',
  kind: 'boss',
};

export const ENEMY_CATALOGUE: Record<string, EnemyDef> = {
  skeleton: SKELETON,
  goblin: GOBLIN,
  slime: SLIME,
  harpy: HARPY,
  ogre: OGRE,
  minotaur: MINOTAUR,
  lich: LICH,
};

export const COMMONS: EnemyDef[] = [SKELETON, GOBLIN, SLIME];
export const ELITES: EnemyDef[] = [HARPY, OGRE, MINOTAUR];
