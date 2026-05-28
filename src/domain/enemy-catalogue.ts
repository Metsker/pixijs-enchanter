// Seven enemy types from docs/enemies.md. Numbers are placeholders for
// tuning; archetype shapes are locked.

import type { EnemyDef } from './enemy';

export const SKELETON: EnemyDef = {
  id: 'skeleton',
  nameKey: 'enemy.skeleton',
  emoji: '💀',
  hp: 800,
  damage: 400,
  damageType: 'physical',
  interval: 2.5,
  resist: 0,
  dodge: 0,
  loc: 'grounded',
  kind: 'common',
};

export const GOBLIN: EnemyDef = {
  id: 'goblin',
  nameKey: 'enemy.goblin',
  emoji: '👹',
  hp: 400,
  damage: 80,
  damageType: 'physical',
  interval: 0.7,
  resist: 0,
  dodge: 0.1,
  loc: 'grounded',
  kind: 'common',
};

export const SLIME: EnemyDef = {
  id: 'slime',
  nameKey: 'enemy.slime',
  emoji: '🟢',
  hp: 1200,
  damage: 150,
  damageType: 'chaos',
  interval: 1.5,
  resist: 0.07,
  dodge: 0,
  loc: 'grounded',
  kind: 'common',
  appliesStatus: 'poison',
};

export const HARPY: EnemyDef = {
  id: 'harpy',
  nameKey: 'enemy.harpy',
  emoji: '🦅',
  hp: 1500,
  damage: 250,
  damageType: 'physical',
  interval: 1.2,
  resist: 0.05,
  dodge: 0.25,
  loc: 'flying',
  kind: 'elite',
};

export const OGRE: EnemyDef = {
  id: 'ogre',
  nameKey: 'enemy.ogre',
  emoji: '👺',
  hp: 4000,
  damage: 600,
  damageType: 'physical',
  interval: 3.0,
  resist: 0.15,
  dodge: 0,
  loc: 'grounded',
  kind: 'elite',
};

export const MINOTAUR: EnemyDef = {
  id: 'minotaur',
  nameKey: 'enemy.minotaur',
  emoji: '🐂',
  hp: 2500,
  damage: 300,
  damageType: 'physical',
  interval: 1.5,
  resist: 0.1,
  dodge: 0,
  loc: 'grounded',
  kind: 'elite',
};

export const LICH: EnemyDef = {
  id: 'lich',
  nameKey: 'enemy.lich',
  emoji: '🧙',
  hp: 12000,
  damage: 500,
  damageType: 'chaos',
  interval: 2.0,
  resist: 0.2,
  dodge: 0,
  loc: 'grounded',
  kind: 'boss',
  appliesStatus: 'poison',
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
