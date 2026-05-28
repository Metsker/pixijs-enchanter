export type EquipmentSlotId =
  | 'weapon'
  | 'offhand'
  | 'helm'
  | 'chest'
  | 'gloves'
  | 'boots'
  | 'ring1'
  | 'ring2'
  | 'amulet';

// Canonical order per CONTEXT.md § Equip flow (Path A: "first empty
// legal slot in canonical order").
export const EQUIPMENT_SLOT_ORDER: readonly EquipmentSlotId[] = [
  'weapon',
  'offhand',
  'helm',
  'chest',
  'gloves',
  'boots',
  'ring1',
  'ring2',
  'amulet',
];

export interface EquipmentSlotDef {
  id: EquipmentSlotId;
  nameKey: string;
  emoji: string;
}

export const EQUIPMENT_SLOTS: Record<EquipmentSlotId, EquipmentSlotDef> = {
  weapon: { id: 'weapon', nameKey: 'inventory.slot.weapon', emoji: '⚔️' },
  offhand: { id: 'offhand', nameKey: 'inventory.slot.offhand', emoji: '🛡️' },
  helm: { id: 'helm', nameKey: 'inventory.slot.helm', emoji: '🪖' },
  chest: { id: 'chest', nameKey: 'inventory.slot.chest', emoji: '🦺' },
  gloves: { id: 'gloves', nameKey: 'inventory.slot.gloves', emoji: '🧤' },
  boots: { id: 'boots', nameKey: 'inventory.slot.boots', emoji: '🥾' },
  ring1: { id: 'ring1', nameKey: 'inventory.slot.ring', emoji: '💍' },
  ring2: { id: 'ring2', nameKey: 'inventory.slot.ring', emoji: '💍' },
  amulet: { id: 'amulet', nameKey: 'inventory.slot.amulet', emoji: '📿' },
};
