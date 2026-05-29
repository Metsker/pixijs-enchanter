# Items hold movable gems in capacity-sized, class-typed sockets

_Part of the gems redesign (see [../gems.md](../gems.md)). Supersedes ADR 0002. Not yet implemented._

ADR 0002 collapsed an Item's tier and its current enchant count into one number, kept items always full, and typed each new slot by a fixed main/utility alternation. The gems redesign replaces baked enchants with free-floating **gems** the player moves between items and crafts at Rest, so that single-number model no longer fits.

An Item now exposes an **ordered list of sockets**, `sockets: (Gem | null)[]`. The socket count is the Item's **capacity** (1-6), rolled at drop and fixed for the Item's life; individual sockets may be empty. A socket accepts only a gem whose **class** matches the Item (weapon / armor / jewelry), reusing the old enchant pools as gem classes - this is what "compatible items" means. Order within an Item is fully player-controlled and drives the combo (see ADR 0006).

We chose this because movability and arrangement are the new core fun (a Noita-style "what feeds what" puzzle), which a baked stack cannot express. Capacity-as-a-rolled-stat - rather than "always full to tier" - is required because gems are now scarce and crafted, so an empty socket is a normal, meaningful state the player fills deliberately. Reversing this would mean re-baking enchants into items and deleting the gem stash, socket UI, and the entire craft/move loop.

## Considered options
- **Keep baked enchants (ADR 0002)** - rejected: no movability, the premise of the redesign.
- **Universal gems / count-only sockets** - rejected: loses the "compatible items" flavor the design wants.
- **Socket colors decoupled from item type (PoE)** - rejected for v1: needs a colour system and drop logic; deferred.

## Consequences
- The main/utility **layer** alternation is dropped. A gem's **role** (effect / support) replaces layer, and role placement is the player's choice, not a fixed pattern.
- `sealedSlots` is removed (seals are gone - see ADR 0008).
- Drop and shop generation roll a capacity and pre-socket 1-2 class-matched gems, leaving the rest empty.
