# Rest crafts and destroys gems; scrolls and seals are removed

_Part of the gems redesign (see [../gems.md](../gems.md)). Supersedes ADR 0004, amends ADR 0003. Not yet implemented._

The old Workbench ran nine actions (Add / Reroll-All / Reroll-Mains / Reroll-Utilities / Lock / Remove / Disenchant / Destroy / Transfer / Apply) over baked enchants, backed by **seals** and a three-state **scroll** family (ADR 0004). Once gems are free-floating, movable, and craftable, almost all of that loses its purpose.

Rest now has exactly two actions: **Craft gem** (spend crystals to roll a gem from the pool into the gem stash) and **Destroy gem** (delete a gem for a partial crystal refund, ~50% placeholder). Scrolls (Empty / Loaded / Unique) and seals are removed entirely, along with Reroll, Lock, Disenchant, Transfer, and Apply.

The crystal economy is preserved in spirit: **destroying unwanted gems is the new scrap loop**, replacing item-disenchant as the primary crystal faucet, with free pre-socketed drop gems as the fuel. We chose craft/destroy because moving and rearranging gems already does the work that Reroll/Transfer/Apply used to do, and seals protected baked enchants that no longer exist. Reversing this would resurrect the scroll entity family and the seal currency that the redesign deletes.

## Relationship to existing ADRs
- **Supersedes ADR 0004** (Transfer engraves onto a scroll): the entire scroll pipeline - Empty/Loaded/Unique scrolls, the Top-bar scroll tiles, Transfer, and Apply - is gone.
- **Amends ADR 0003** (crystals are loot-loop scoped): its intent stands - crystals come from sacrifice, the Shop sells a capped crystal stash as a safety valve, and enemies still do not drop crystals - but the sacrifice is now **destroying a gem**, not disenchanting an item.

## Considered options
- **Keep Reroll as a gem-reroll** - rejected for v1: Craft + Destroy already cover acquisition; can be revisited later.
- **Keep seals / a lock action** - rejected: with gems moving freely there is nothing left to protect.
- **Destroy refunds nothing** - rejected: the refund is what makes destroying the deliberate crystal faucet rather than pure deletion.
