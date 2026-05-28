# Crystals are loot-loop scoped; enemies don't drop them

Enemies drop gold and (sometimes) items. They do NOT drop crystals. The primary source of crystals is the Disenchant / Destroy Rest actions on the player's own Items: crystals are extracted from the loot economy by deliberate sacrifice. A secondary source is a CAPPED stash sold at the Shop for gold (50-100 crystals per shop visit) - this is a safety valve that lets gold-rich, crystal-poor players patch a shortage without replacing the disenchant loop as the main pipeline.

The design intent is to keep the inventory loop active: hoarding items means starving for enchant fuel, since the cap on shop-bought crystals is too low to fund a full enchant build. Combined with the 20-slot Backpack cap (drops past the cap are destroyed with no refund), this creates constant pressure to make scrap-or-keep decisions. Reversing this - i.e. adding direct crystal drops from enemies, or removing the shop cap so gold freely converts to crystals - would let players bypass the scrap loop and the Rest design would feel under-used.

## Considered options
- **Crystals drop from common enemies** (original spec wording) - rejected at Q9: would create a second passive crystal stream alongside disenchanting, undermining the scrap economy.
- **Shop sells unlimited crystals for gold** - rejected: gold becomes a crystal proxy and the disenchant loop is optional. The capped-stash compromise (50-100 per shop) keeps the loop intact while preventing crystal-starvation softlocks.
- **Crystal conversion either direction (player-controlled)** - rejected: only the shop direction (gold → crystals) is open, and only at a fixed price/cap. Crystals never convert back to gold.
