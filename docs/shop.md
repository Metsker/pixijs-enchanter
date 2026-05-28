# Shop

Each Shop room is one-shot. Inventory generated on entry; leftovers are gone when you leave. No restock, no inventory reroll service.

## Stock per visit

| Slot | Quantity | Price (gold) | Notes |
|---|---|---|---|
| Items | 6 | range per tier (P2 model) | Random equipment slot types. Tier distribution biased by floor depth. |
| Empty scrolls | 3 | 150g each | Consumable for the Transfer Rest action. |
| Seals | 3-4 | 200-300g each | Universal precision-action material (Reroll Mains/Utilities, Remove selected, Lock selected). |
| Crystals (dust) | 50-100 cap | 5g each | Emergency stash. Caps exist so the shop can't replace the disenchant loop, only patch it. |
| Unique scroll | 0-1 | ~800g | Low chance per shop visit. The non-boss source of uniques. |

## Pricing model (P2: random within tier)

Item prices roll within a tier-specific range at shop generation, so the same item type can be cheaper at one shop and pricier at another.

| Tier | Price range (placeholder) |
|---|---|
| 1 (Common) | 80-150 |
| 2 (Uncommon) | 200-350 |
| 3 (Rare) | 500-800 |
| 4 (Mythic) | 1200-1800 |
| 5 (Epic) | 2500-3500 |
| 6 (Legendary) | 5000-7000 |

Tier 7 (Unique) items do not appear in shops as items - only as Unique scrolls.

## Tier distribution by floor

Lower floors get worse items; later floors get better. Placeholder distribution (single-act, ~10 floors):

| Floor | Likely tier roll |
|---|---|
| 1-3 | T1 mostly, occasional T2 |
| 4-6 | T2-T3 mostly, rare T4 |
| 7-9 | T3-T5 mostly, rare T6 |

Per-shop floor depth determines the bias; exact distribution tunes during playtesting.

## No reroll button

Shop inventory is fixed on generation. Players cannot pay gold to re-roll the offerings. This forces commitment to whatever the room rolled — part of the run's variance.
