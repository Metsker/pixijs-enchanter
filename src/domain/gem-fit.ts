// Gem <-> socket COLOUR compatibility (see docs/gems.md § Sockets, ADR 0005).
//
// PoE-style: a gem carries a colour (derived from its class) and a socket
// carries a colour (item.socketColors[i]). A gem fits a socket iff their
// colours match - fit follows the SOCKET, not the item type. The item type
// drives only the drop / add-socket socket-colour POOLS (random.ts), which
// exclude some colours per type without gating which gems can ever go in.

import { colorForClass, type Gem, type GemClass, type GemDef, type SocketColor } from './gem';
import { GEM_CATALOGUE } from './gem-catalogue';
import type { Item, ItemType } from './item';

// The raw item-type -> gem-class mapping. weapon / shield lean red; ring /
// amulet lean blue; armor leans green. No longer a fit gate.
export function gemClassForItemType(itemType: ItemType): GemClass {
  if (itemType === 'weapon' || itemType === 'shield') return 'weapon';
  if (itemType === 'armor') return 'armor';
  return 'jewelry';
}

// The catalogue definition a placed gem instance refers to (undefined for an
// unknown defId, which should not happen for catalogue-sourced gems).
function defOf(gem: Gem): GemDef | undefined {
  return GEM_CATALOGUE[gem.defId];
}

// A gem's colour: its class mapped through colorForClass. An unknown defId has
// no colour (null) so it can never fit any socket (defensive; keeps a corrupt
// save from slotting a phantom gem).
export function gemColor(gem: Gem): SocketColor | null {
  const def = defOf(gem);
  return def ? colorForClass(def.class) : null;
}

// True when `gem` may be placed into socket `index` of `item` - i.e. the gem's
// colour matches that socket's colour. An unknown defId or an out-of-range /
// missing socket colour never fits.
export function gemFitsSocketAt(gem: Gem, item: Item, index: number): boolean {
  const color = gemColor(gem);
  if (!color) return false;
  return item.socketColors[index] === color;
}
