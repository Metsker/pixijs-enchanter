export type EnchantPool = 'weapons' | 'armor' | 'jewelry' | 'unique';
export type EnchantLayer = 'main' | 'utility';
export type DamageType = 'physical' | 'fire' | 'cold' | 'lightning' | 'chaos';

export type EnchantEffect = { kind: 'damage-add'; amount: number; type: DamageType };

export interface Enchantment {
  id: string;
  name: string;
  emoji: string;
  pool: EnchantPool;
  layer: EnchantLayer;
  effect: EnchantEffect;
}
