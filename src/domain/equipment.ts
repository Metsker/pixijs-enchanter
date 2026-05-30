// One slot per item type now (a single ring, a new belt where the 2nd ring
// used to be, a shield-only offhand), so equips are always a 1:1 swap with the
// slot's current occupant - which is what lets the player compare a new item
// against the one it would replace. No more doubled slots, so no slot-select
// step. The belt is just a second jewelry accessory dodging the duplicate ring.
export type EquipmentSlotId =
  | 'weapon'
  | 'offhand'
  | 'helm'
  | 'chest'
  | 'gloves'
  | 'boots'
  | 'ring'
  | 'belt'
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
  'ring',
  'belt',
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
  ring: { id: 'ring', nameKey: 'inventory.slot.ring', emoji: '💍' },
  belt: { id: 'belt', nameKey: 'inventory.slot.belt', emoji: '🎗️' },
  amulet: { id: 'amulet', nameKey: 'inventory.slot.amulet', emoji: '📿' },
};
