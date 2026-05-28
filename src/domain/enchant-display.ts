import type { Enchantment } from './enchant';
import { t } from '../i18n';

// Some enchants carry a per-instance rolled parameter (Avatar of
// Fire / Cold / Lightning / Chaos rolls its element once at item-gen
// time). The catalogue entry's nameKey / descriptionKey uses a
// {element} placeholder; this helper looks at the enchant's effects
// for the rolled value and feeds it into t(). Non-rolled enchants
// fall through to a plain t(key) lookup.
const ELEMENT_LABELS: Record<string, string> = {
  fire: 'Fire',
  cold: 'Cold',
  lightning: 'Lightning',
  chaos: 'Chaos',
  physical: 'Physical',
};

function rolledElement(enchant: Enchantment): string | null {
  for (const eff of enchant.effects) {
    if (eff.kind === 'convert-physical-rolled') {
      return ELEMENT_LABELS[eff.toType] ?? eff.toType;
    }
  }
  return null;
}

export function enchantName(enchant: Enchantment): string {
  const element = rolledElement(enchant);
  return element
    ? t(enchant.nameKey, { element })
    : t(enchant.nameKey);
}

export function enchantDescription(enchant: Enchantment): string {
  const element = rolledElement(enchant);
  return element
    ? t(enchant.descriptionKey, { element })
    : t(enchant.descriptionKey);
}
