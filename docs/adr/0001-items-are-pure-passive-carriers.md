# Items are pure passive carriers

The MegaLoot autobattler reference (the spec's anchor) gives each equipped item its own cooldown bar; items fire independently and combat is the visible concert of those firings. We deliberately deviated: items in battler-2 have NO base stats and DO NOT act on their own. The Player has exactly one auto-attack; every Enchantment on every Item aggregates into either the Player's attack profile or the Player's persistent stats / reactive procs.

We chose this for two reasons. First, it simplifies the combat tick to a single timer and a single damage calculation, which is far cheaper to reason about and balance than 9 concurrent item timers. Second, it makes the Enchantment - not the Item - the unit of game-design content; an Item is just a slot pattern (tier alternation) that determines how many enchants of which layers it can hold. Reversing this would mean reintroducing per-item attack timers, retargeting per item, and a much larger UI burden (per-item cooldown bars in the inventory column). It would also invalidate the catalogue's design, which assumes additive stacking into a single attack profile.

## Considered options
- **Per-item firing (MegaLoot)** - rejected: cooldown UI density on 9 slots is hostile; per-item targeting felt opaque (resolved at Q20 where the user clarified "items are passive, only player attacks").
- **Hybrid (weapons fire individually, armor/jewelry passive)** - rejected: introduces a special case for the weapon pool that the rest of the system has to know about.
