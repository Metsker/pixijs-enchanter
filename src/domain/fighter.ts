export type FighterKind = 'player' | 'enemy';

export interface Fighter {
  id: string;
  kind: FighterKind;
  name: string;
  emoji: string;
  hp: number;
  maxHp: number;
}
