# Tier equals current enchant count; items are always full

In most ARPGs an item has a fixed rarity (rolled at drop) and a separate, mutable count of currently-applied modifiers. We collapsed both into one number: an Item's Tier (1-7) is exactly its current enchant slot count, and an Item is always full to that count. Adding an enchant promotes the Item by one tier (one new slot, typed per the main/utility alternation, filled immediately). Disenchanting pops the top and demotes the Item by one tier. Popping a tier-1 item's last enchant deletes the Item entirely.

The motivation is that the player only has to track one number per Item ("how many enchants does this have?") which is the same number that drives every Rest action's legality (can I Add? Can I Disenchant?) and tells the player at a glance how valuable the Item is. Reversing this would require introducing a separate "max slot capacity" stat per Item, which would show up on every item card, every drop tooltip, and every Rest action UI. It would also break the Rest action design that user grilled to a sharp finish (alternation pattern, Add/Reroll/Transfer/Disenchant/Destroy semantics).

## Considered options
- **Fixed slot capacity, current count separate** - rejected: doubles the surface; "tier-1 item with 6 latent slots" is an invisible second variable that confuses inventory decisions.
- **Tier rolled at drop, immutable** - rejected: incompatible with the Add / Transfer Rest actions, which need to promote items.

## Consequences
- A new slot's main-or-utility type is fully determined by the alternation rule (1m, 1m+1u, 2m+1u, 2m+2u, 3m+2u, 3m+3u, 3m+3u+1unique). Add via Roll therefore rolls only an enchant of the new slot's pre-determined layer.
- Transfer must check that the destination's next-slot layer matches the transferred enchant's layer (constrained by alternation).
- Tier 7 (Unique) breaks the alternation: it adds a dedicated unique slot that only accepts Unique-pool enchants via a boss-dropped Unique scroll.
