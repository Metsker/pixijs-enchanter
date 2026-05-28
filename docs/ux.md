# Out-of-fight UX

`CONTEXT.md` defines the entities (Inspector, Hint, Enchant stack, Workbench, Backpack, Scrolls). This doc defines the *interactions* - the click patterns, hover behaviours, keyboard shortcuts, and visual treatments that bind those entities together. Implementation detail only - terms come from `CONTEXT.md`.

## Input model

Interactions below are described in mouse + keyboard terms (click, hover, `B`, `W`, `ESC`). On touch, the following equivalences apply uniformly:

| Mouse / keyboard | Touch equivalent |
|---|---|
| Hover an enchant cell or scroll tile | Tap-and-hold (~400ms) on the same target |
| `B` toggle Backpack | Backpack icon in the Top bar (always visible) |
| `W` reopen Workbench | "Reopen workbench" pill (bottom-right of Rest screen, always visible during Rest) |
| `ESC` close topmost modal | Modal `X` close button (top-right of every modal); also tap-outside where allowed |
| Drag-to-reorder in Backpack | Long-press to pick up, drag, release to drop |

All tap targets are at least 44×44px. The Keybindings reference at the bottom of this doc is the desktop-specific subset.

## Inspector

**Open.** Single click on an Item tile (Inventory, Backpack, Shop). Outside a Rest room only; inside Rest the Workbench takes over.

**Close.** Click anywhere outside the panel (including empty space, the top bar, or the Battlefield region). Clicking a *different* Item switches the Inspector's subject rather than closing-then-reopening.

**Hover.** Hovering an Enchant-stack cell populates the Hint. Hovering elsewhere in the panel does nothing.

**CTA bar.**
- Backpack source: `Equip`.
- Inventory source: `Unequip` (greyed during a Fight; tooltip reads "Unavailable during combat").
- Shop source: `Buy <gold>` (greyed if the player can't afford or the Backpack is full; tooltip explains which).

## Hint

The detail block populated when an Enchant-stack cell is hovered. Three sections:

1. **Full description** of the hovered enchant (numbers, type, layer, pool).
2. **Comparison** against the enchant currently occupying the same equipment slot + same stack position on the equipped Item, if any. e.g. hovering `Cleave 60%` on a Backpack sword's slot-3 cell while a different sword is equipped → compare with whatever sits at slot 3 of the equipped sword. If the equipped item is a lower tier (no slot 3 yet), the comparison shows "(empty)".
3. **Empty-cell variant.** Hovering an empty placeholder cell shows "Empty <Main|Utility> slot - Add (Roll) would fill this for X crystals". Teaches the alternation rule by hovering.

## Equip flow

1. Player clicks an Item in the Backpack.
2. Inspector slides in with an `Equip` CTA.
3. Click `Equip`:
   - **Path A - at least one empty legal slot exists.** Item lands in the *first empty* legal slot in canonical order (`weapon, offhand, helm, chest, gloves, boots, ring1, ring2, amulet`). Inspector closes.
   - **Path B - all legal slots full.** `Equip` button expands inline into a tile row showing the equipped item(s) in each legal slot. Click one to displace; the chosen equipped item returns to the Backpack. Inspector closes.
   - **Path C - Path B is selected but the Backpack is also full.** Reject with a "Backpack full" notice; loadout unchanged. (The displaced item would have nowhere to go.)

`Unequip` is the symmetric flow from the Inventory side: click equipped Item → Inspector → `Unequip` → item lands in first empty Backpack slot, or refused if Backpack full.

## Backpack

**Layout.** 4×5 grid.

**Drag.** Tiles can be dragged between Backpack cells to reorder. Drop onto an occupied cell swaps the two. Drop onto an empty cell moves the tile there.

**Sort.** A `Sort` button on the Backpack's toolbar groups by item type (weapons, shields, armor by sub-slot, rings, amulets), then by tier descending within each group. Manual ordering survives until the next Sort click.

**During Fight.** The Backpack is openable but read-only - the Inspector still opens on click and the Hint works, but the `Equip` and `Unequip` CTAs grey out until the Fight ends. The Fight clock keeps running while the Backpack is open; inspection is not a stall mechanism.

**Drop placement.** New drops land in the first empty cell in reading order (left-to-right, top-to-bottom). If the Backpack is full, the drop is destroyed - no refund, no notification queue (per the spec's deliberate capacity pressure).

**Empty Backpack cell click** is a no-op (mirrors empty Inventory slot click). The cell renders as a faint outlined placeholder; nothing opens on click.

## Workbench

**Open.** Single click on an Item tile (Inventory or Backpack) during a Rest room.

**Layout.** Two columns inside the modal: the Item's Enchant stack on the left (vertical, slot 1 at the base, newest on top; Unique cell pinned above the stack only if tier 7), the action set on the right.

**Action set (right column).** Nine buttons grouped:

```
Add               (Roll / Apply scroll)
Reroll All
Reroll Mains
Reroll Utilities
Transfer
Disenchant top
Remove selected
Lock selected
Destroy
```

Each button is **hidden** (not just greyed) when not legal. Examples:

- `Add: Roll` hidden at tier 6 (already maxed via Roll).
- `Add: Apply scroll` hidden when no held scroll is legal for this Item.
- The whole `Add` button hidden if both Roll and Apply scroll are illegal.
- `Reroll Mains` / `Reroll Utilities` / `Remove selected` / `Lock selected` hidden when the player holds no Seal (all four cost 1 Seal + crystals).
- `Transfer` hidden when the player holds no Empty scroll.
- `Disenchant top` hidden when only sealed enchants remain in the 6-stack, AND hidden on all tier-7 Items (Unique cell isn't a valid target; popping a 6-stack cell would break the alternation pattern). Destroy is the only demotion path in those cases.
- `Destroy` always shown.

The action set shrinks dynamically based on the player's currently held resources (top-bar counters) and the picked Item's state.

**Multi-step action pattern (arm → click cell).** `Reroll Mains`, `Reroll Utilities`, `Lock selected`, `Remove selected`, and the source-pick step of `Transfer` all follow the same shape:

1. Player clicks the action button. The button enters an "armed" visual state.
2. The legal cells in the Enchant stack become clickable (highlighted; non-legal cells are dimmed and unclickable).
3. Player clicks a cell. The action resolves immediately - no separate confirm step.
4. Workbench remains open with the updated stack.

**`Add` button collapse rule.** Add has up to two sub-actions: Roll and Apply scroll. The button's behaviour depends on how many of those sub-actions are legal for the picked Item:

| Legal sub-actions | Behaviour |
|---|---|
| 0 | `Add` button hidden entirely |
| 1 (only Roll, or only Apply scroll) | `Add` behaves as that single sub-action directly - clicking it skips the expansion and goes straight to the action (Roll resolves immediately; Apply scroll opens the picker) |
| 2 (both legal) | `Add` expands inline into `Roll` and `Apply scroll` sub-buttons |

**`Apply scroll` flow.**
1. Click `Apply scroll` (either as a sub-button under Add, or directly when it's the only legal Add sub-action).
2. A picker overlay shows **only the scrolls whose carried enchant is legal** for this Item (right pool, right next-slot layer). Owned scrolls that don't fit are hidden from the picker - strictly consistent with the "hide unavailable" rule. The player can still see all owned scrolls in the Top bar tiles; learning what could go where happens by hovering those tiles (each shows its carried enchant in the Hint), not inside an item-specific picker.
3. Click a scroll tile. Action resolves; scroll consumed; tier increments.

**Hovering a button** previews its target. `Disenchant top` highlights the actual top-unsealed cell (skipping past any sealed top); `Reroll All` highlights every unsealed filled cell; `Reroll Mains` and `Reroll Utilities` highlight their layer's unsealed filled cells.

**Confirm modals.** Three actions get an explicit confirmation step because they're irrecoverable:

| Action | Confirm trigger | Modal copy (template) |
|---|---|---|
| Destroy | Click `Destroy` | `Destroy <item name>? Refunds <N> crystals (same as disenchanting slot-by-slot, but clears sealed slots).` |
| Remove selected | After cell-pick | `Remove <enchant name>? Tier drops to <N-1>. No refund. Costs 1 Seal.` |
| Transfer | After cell-pick | `Transfer <enchant name> off <source>? Source item destroyed. Loaded scroll lands in your Top bar.` |

All other actions (Disenchant top, Lock selected, Reroll All / Mains / Utilities, Add: Roll, Add: Apply scroll) resolve immediately on click - confirming each would feel like the game is second-guessing every player decision.

Confirm modals **capture input** (the Workbench stays disabled until the modal closes). Click `Cancel`, press `ESC`, or click outside the modal to cancel - click-away on confirm modals **does** cancel, breaking the Workbench's "click-away does nothing" rule because a confirm modal's whole purpose is to ask one question.

**Close.** `ESC` or the `X` close button on the Workbench frame. Click-away on empty space does NOT close (protects half-finished multi-step actions).

**Subject switch.** Clicking a different Item tile in the Inventory or Backpack while the Workbench is open replaces the subject in place - no close-and-reopen flicker. Any armed action is dropped on switch.

**Armed-action bail-out.** If an action is armed (button highlighted but no cell picked yet), the first `ESC` or `X` press disarms the action. A second press closes the Workbench. Same pattern for the inline `Add` → `Roll`/`Apply scroll` expansion.

**Reopen.** After the Workbench is closed, the last-worked-on Item for the current Rest session is remembered. Pressing `W`, or clicking the floating "Reopen workbench" pill that appears in the bottom-right corner of the Rest screen, reopens the Workbench loaded with that Item. Armed-action state is *not* restored - only the subject. Memory clears when the player leaves the Rest room.

## Sealed cells

A sealed cell renders with a **chained border** treatment around the cell plus a **small lock icon in the bottom-right corner**. The chain motif visually says "this is bound; you can't act on it without Destroy".

When an action that cannot target sealed cells is armed (`Reroll All`, `Reroll Mains`, `Reroll Utilities`, `Disenchant top`, `Remove selected`, `Lock selected`), sealed cells become dimmed and unclickable. The action's hover-preview skips sealed cells - so the player sees exactly which cell will be hit before clicking.

`Disenchant top` is the subtlest: if the stack's literal top cell is sealed, the action targets the next-down unsealed cell. Hovering the button highlights that actual target so the player can verify.

## Top bar

**Counters.** Gold, Crystals (Dust), Empty-scroll count, Seal count, run progress (act / floor).

**Loaded scroll tiles.** Each held Loaded scroll appears as a named tile showing the carried enchant's icon and name. Hovering a tile populates a Hint-like detail panel inline showing the enchant's full description.

**Unique scroll tiles.** Same as Loaded scroll tiles but with a visually distinct icon (e.g. a different border colour and a gem motif) to mark Unique origin. Hover behaviour identical.

**Backpack toggle.** Single icon on the right side of the top bar. Clicking toggles the Backpack window open / closed. Always active - the Backpack is openable in every room (read-only during Fight, fully interactive elsewhere).

## Modal stacking

Three modal surfaces can be on screen at once. Their stacking rules:

1. **Inspector** (right-side slide-in) and **Workbench** (centre modal) are **mutually exclusive** by room: Inspector outside Rest, Workbench inside Rest. The same click that would open the Inspector opens the Workbench instead when the player is in a Rest room.
2. **Confirm modal** (Destroy / Remove selected / Transfer) stacks on top of the Workbench. The Workbench's action set and stack cells become non-clickable until the modal closes. Confirm modals capture input.
3. **Apply-scroll picker** (overlay inside the Workbench) sits between the Workbench and a confirm modal in stack order. While the picker is open, clicks outside the picker close it (return to the Workbench without applying a scroll). Clicking a different Inventory / Backpack Item is NOT routed through the picker - the picker captures input until dismissed.
4. **Backpack window** is non-modal - it can be open simultaneously with the Inspector or Workbench. Clicking a Backpack tile while the Inspector / Workbench is open switches the subject in place (per the "Subject switch" rules in those sections).

## Keybindings reference

| Key | Action |
|---|---|
| `B` | Toggle the Backpack window. |
| `W` | Reopen the Workbench loaded with the last-worked-on Item for the current Rest session (Rest only; no-op elsewhere). |
| `ESC` | Close the topmost modal. If a Workbench action is armed, the first press disarms; the second press closes the Workbench. Cancels a confirm modal. Closes the Apply-scroll picker. |
