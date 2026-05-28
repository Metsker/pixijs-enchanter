# battler-2

Real-time autobattler. Player builds a loadout between fights; in fight, equipped items fire on their own cooldowns at enemies. Map is a Slay-the-Spire-style branching graph between fights.

## Language

### Fight

**Fight**:
One room's worth of combat. Resolves in real time. Ends when every **Enemy** in the room is dead (player wins) or the **Player** is dead (run ends).

**Player**:
The single hero avatar shown on-screen, viewed from behind, standing in front of the **Enemies**. Has its own HP. Does not attack directly; the **Items** in its **Inventory** do. Plays hit/death animations.

**Enemy**:
A hostile actor in a **Fight**. Stands to the right, faces the **Player**. Has HP, attack speed, attack damage, and possibly special abilities (e.g. **Taunt** on the Minotaur).

**Group**:
The set of **Enemies** present in one **Fight** at a given moment. A **Fight** is 1-vs-N: one **Player** against a **Group** of 1 or more.

**Target**:
The single **Enemy** the **Player** is currently focused on. The Player's auto-attack hits the Target. On fight start, a random Target is auto-selected from the **Group**. The Player can click any Enemy to switch Target. When the Target dies, a new random survivor is auto-selected.

**Taunt**:
An **Enemy** ability that forces the **Player**'s Target to be the taunter while taunt is active. Click-override is suppressed while taunt is in effect. Minotaur has Taunt.

**Splash** and **Chain** (per enchant) work outward FROM the current Target: splash hits grounded enemies near the Target; chain jumps from the Target to N nearest others.

### Items are passive

The **Player** has exactly one auto-attack. **Items do not act independently.** Every **Enchantment** on every equipped **Item** aggregates into one of two surfaces:

1. **Player's attack profile** (Weapons pool, and Jewelry / Unique enchants that touch attack stats): damage, damage types, attack interval, crit chance, crit multiplier, status chances, on-hit effects (Splash, Chain, Multistrike, Knockback, Lifesteal).

2. **Player's persistent stats and reactive procs** (Armor pool, and Jewelry / Unique enchants that touch defense): max HP, dodge chance, per-type resistance, regen, Thorns, status auras, Counter Attack, Defiance, Stoic, etc.

The Player's attack base (before any enchant) is `0 damage, 1.5s interval, physical type`. When the resulting attack would deal 0 damage (no weapon-pool damage enchants equipped), the **Unarmed** fallback kicks in: 50 physical damage at 3.0s interval, not modifiable by enchants.

### Stacking rule

Same-stat enchants stack additively, then the resulting value is clamped to sane bounds. Examples:

- Three `Swift` (-20% interval each) → -60% interval → 1.5s × 0.4 = 0.6s. Floor at 0.3s.
- Multiple `+max HP` flat values → simple sum.
- Multiple resistance enchants of the same type → simple sum, capped at 80%.

Multiplicative scaling is reserved for special enchants that explicitly say "multiplies" (none in the current catalogue).

### Visual conventions

**Icons and characters are emojis.** Enchants, item types, statuses, currencies, scroll tiles, the sealed-cell lock badge, AND the **Player** and **Enemies** themselves are rendered as Unicode emojis rather than custom art. Each entity declares its emoji as part of its data definition. Examples: `Sharpness → ⚔️`, `Pyroclasm → 🔥`, `Vitality → ❤️`, `Crystal → 💎`, `Gold → 🪙`, `Empty scroll → 📜`, `Loaded scroll → 📜` with a coloured border, `Unique scroll → 📜` with a gem-motif border, `Seal → 🔒`, `Burn → 🔥`, `Freeze → ❄️`, `Shock → ⚡`, `Bleed → 🩸`, `Poison → ☠️`, `Skeleton → 💀`, `Goblin → 👹`, `Slime → 🟢`, `Harpy → 🦅`, `Ogre → 👺`, `Minotaur → 🐂`, `Lich → 🧙`, `Player → 🧝`. Emojis render in colour everywhere via a bundled **Noto Color Emoji** font (used by both DOM CSS and Pixi `TextStyle`). Hit, death, and cast animations are tweens + shader filters on the emoji sprite - no skeletal rigs. Scroll variants (Empty / Loaded / Unique) use the same emoji with different border treatments rather than different emojis.

### Strings

All user-visible text - enchant names, descriptions, tooltips, CTAs, modal copy, status names - comes from an **i18n catalogue keyed by string ID**, not hard-coded in components. English is the only locale shipped initially; the structure supports adding more locales by translating the catalogue, with no code changes. The English names in `docs/enchant-catalogue.md` and `docs/enemies.md` serve as both the canonical IDs and the English values.

### Layout (UI)

Resolution: **1920×1080 on desktop, scales down to ~375px portrait on mobile**. Layout reflows on resize. On mobile, the **Inventory** column collapses into a bottom dock and the **Backpack** opens as a full-screen sheet; the **Battlefield** scales to fit the area between the **Top bar** and the Inventory dock.

**Input.** Single pointer-event layer (mouse, touch, pen). All hover behaviours have **tap-and-hold equivalents (~400ms) on touch**. Tap targets are at least **44×44px**. Keyboard shortcuts (`B`, `W`, `ESC`) have on-screen button equivalents so touch users never need a keyboard.

**Inventory**:
The **Player**'s equipped **Items** - exactly nine slots displayed as a vertical column down the LEFT side of the screen. Always visible during fight and Rest / Shop / Map screens. Clicking an equipped Item opens the **Inspector** with an `Unequip` CTA (sends the Item back to the **Backpack**; refused with a notice if the Backpack is full). The `Unequip` CTA is disabled during a **Fight** - inspection works but loadout changes are blocked until the Fight ends. Clicking an empty Inventory slot is a no-op - the Backpack is the source of items, not the Inventory.

**Backpack**:
A floating, toggleable window holding UNEQUIPPED **Items** only - consumables (**Scrolls**, **Seals**, crystals, gold) live in the **Top bar**, not in the Backpack. Hidden by default; opens via a hotkey (e.g. `B`) or a top-bar icon. 20-slot capacity (fixed) laid out as a 4×5 grid. Slots are a flat pool (any item type fits any slot). Drops land in the first empty slot in reading order (left-to-right, top-to-bottom). Tiles are drag-to-reorder. A toolbar `Sort` button groups by item type, then by tier descending - manual ordering survives until the next Sort click. Hovering a tile is passive (no tooltip); click opens the **Inspector** (or the **Workbench** during a **Rest** room).

Available in every room, but read-only during a **Fight**: the Backpack opens and the **Inspector** works (so the player can check what they're carrying), but the `Equip` and `Unequip` CTAs are disabled until the Fight ends. The Fight clock keeps running while the Backpack is open - inspection is not a stall mechanism. Loadout is committed before combat starts and held for its duration.

Drops from enemies and items bought from the **Shop** land in the Backpack, not directly into the **Inventory**. **If the Backpack is full when a drop lands, the dropped item is destroyed - no refund, no notification queue.** Player must manage capacity.

Equip flow: open Backpack → click an item → **Inspector** opens with an **Equip** CTA. Clicking Equip places the item in the first empty legal slot (in canonical slot order: `weapon, offhand, helm, chest, gloves, boots, ring1, ring2, amulet`). If no legal slot is empty, Equip expands into a picker so the player chooses which equipped item to displace; the displaced item returns to the Backpack (which is why capacity management matters).

**Battlefield**:
The central + right region where the **Player** and the **Group** are drawn. Player is in the foreground (back view), **Enemies** stand opposite. The camera does not pan.

**Top bar**:
Always-visible strip across the top. Shows gold counter, crystals counter, Empty-scroll counter, Seal counter, run progress (act/floor), and a toggle for the **Backpack**. Held **Loaded scrolls** and **Unique scrolls** appear as named tiles (Unique scrolls use a distinct icon).

**Inspector**:
A right-side panel that slides in when an **Item** is clicked (in **Inventory**, **Backpack**, or **Shop**) outside of a **Rest** room. Renders the Item's enchants as a canonical vertical 6-cell **Enchant stack** in alternation order (`m, u, m, u, m, u` reading bottom-to-top, slot 1 at the base): cells the Item has grown into are filled with the enchant's icon + name and stacked atop the base; cells beyond its **Tier** are empty placeholders pre-typed Main or Utility above the filled run. The newest enchant is the visible top of the stack - which is what **Disenchant top** targets. A separate Unique cell is pinned above the stack only when the Item is tier 7. Hovering a cell reveals the **Hint**. The CTA bar at the foot of the panel varies by source: `Equip` (Backpack), `Unequip` (Inventory), or `Buy` with gold price (Shop). Clicking away from the panel closes it. Inside a Rest room the Inspector is replaced by the **Workbench**.

**Enchant stack**:
The vertical 6-cell rendering of an Item's enchants used by the **Inspector** and the **Workbench**. Slot 1 sits at the base; new tiers stack upward in `m, u, m, u, m, u` alternation. The trailing filled cell is the stack's "top" and the target of **Disenchant top**. A separate Unique cell sits above the stack only when the Item is tier 7.

**Workbench**:
The modal overlay that opens when an **Item** is clicked during a **Rest** room - the Rest-time replacement for the **Inspector**. Two-column layout: the picked Item's **Enchant stack** on the left, the **Rest action** set on the right. Multi-step actions (picking a stack cell for Lock / Remove / Transfer) resolve inside the Workbench. Accepts items from either the **Inventory** or the **Backpack**.

**Hint**:
A detail block inside the **Inspector**, populated on hover over an enchant cell. Shows the full description of the hovered enchant, plus a side-by-side comparison against whichever enchant currently occupies the same equipment slot + enchant slot on the equipped Item.

### Player

**HP**:
The **Player**'s single health pool. Starts at a base value. When it reaches 0, the run ends. Hits from **Enemies** subtract from HP. **Enchantments** can increase max HP, reduce incoming damage, add dodge / block / regen, etc. HP belongs to the **Player**, not to **Items** (armor is not piecewise destructible).

### Items

**Item**:
An equipped object in the **Inventory**. Pure enchant carrier - has NO inherent stats of its own. An item with zero **Enchantments** does nothing. An **Item** has an **item type** (weapon, shield, armor, ring, amulet) that determines its legal **Equipment slot**(s); item type ≠ **Enchantment pool**, e.g. rings and amulets are distinct item types but share the Jewelry pool. Exposes 1-6 enchant slots (plus an optional unique slot at tier 7).

**Equipment slot**:
A worn slot on the **Player**. Nine slots total: `weapon`, `offhand`, `helm`, `chest`, `gloves`, `boots`, `ring` (×2), `amulet`. Each slot determines which item types fit and which **Enchantment pool** the enchants on that **Item** must come from:

| Slot | Legal item types | Pool |
|---|---|---|
| weapon | weapon | Weapons |
| offhand | weapon OR shield | Weapons (if weapon) / Armor (if shield); shield is just an armor item with no special block mechanic |
| helm, chest, gloves, boots | armor | Armor |
| ring (×2) | ring | Jewelry |
| amulet | amulet | Jewelry |

**Enchantment pool**:
One of four: **Weapons**, **Armor**, **Jewelry**, **Unique**. Each **Enchantment** has a SET of compatible pools (one or more) - e.g. "Fireball" is Weapons-only, "+5% all resist" is Armor+Jewelry, "Lifesteal 2%" is Weapons+Jewelry. A pool-flexible enchant may legally land on any item in any of its compatible pools.

Pool-to-slot legality:
- **Weapons / Armor / Jewelry** enchants fill main and utility slots on items whose pool intersects the enchant's compatible set.
- **Unique** enchants fill the dedicated unique slot on tier-7 items only; the unique slot is item-type-agnostic.

**Enchantment layer**:
Each **Enchantment** is tagged as exactly one of **Main** or **Utility** - never both. Each enchant slot on an **Item** is pre-typed for one layer; a Main enchant only fits a main slot, a Utility enchant only fits a utility slot. Layer is strict; pool is flexible.

**Main**:
The headline effects in a pool. Big numbers, defining identity (e.g. weapon main: Fireball, Cleave, Arrow Volley; armor main: Aegis, Vitality; jewelry main: Bloodlust, Resonance).

**Utility**:
Smaller modifiers in a pool (e.g. weapon utility: +5% attack speed, lifesteal on hit; armor utility: +1 regen, thorns; jewelry utility: gold-find, crit-on-low-hp).

**Tier**:
An **Item**'s rarity, 1-7. Equals the item's total enchant slot count. Slot types follow this pattern (main/utility alternate; tier 7 adds a unique slot):

| Tier | Name | Slots |
|---|---|---|
| 1 | Common | 1 main |
| 2 | Uncommon | 1 main + 1 utility |
| 3 | Rare | 2 main + 1 utility |
| 4 | Mythic | 2 main + 2 utility |
| 5 | Epic | 3 main + 2 utility |
| 6 | Legendary | 3 main + 3 utility |
| 7 | Unique | 3 main + 3 utility + 1 unique |

Tier 7 is reached only by applying a **Unique scroll** to a tier-6 (Legendary) item via the **Add: Unique-apply** action.

### Rest actions

The **Rest** room is where owned **Items** are modified between **Fights**. Actions target any owned Item (in **Inventory** or **Backpack**) via the **Workbench** - a modal overlay opened by clicking an Item during a Rest. Multi-step actions (e.g. **Transfer**) resolve inside the Workbench. Nine actions:

**Add**:
Promote an **Item** by one **Tier**. Adds one new enchant slot (typed per the alternation rule) and fills it. Two mechanisms:
- **Roll**: pay **Crystals**; new enchant rolled randomly from the item's pool, matching the new slot's layer.
- **Apply scroll**: consume a **Loaded scroll**, planting its carried enchant in the new slot. Legality: the carried enchant's pool must match the target's pool and the new slot's layer. **Unique scrolls** are the only scrolls whose carried enchant matches the Unique-slot layer, so they are the only scrolls that promote a tier-6 item to tier 7.

Illegal on a tier-6 item via Roll (already maxed).

**Reroll All**:
Re-roll EVERY enchant on the **Item**. **Tier** unchanged. **Sealed** slots are skipped. Costs **Crystals**.

**Reroll Mains**:
Re-roll ONLY main-layer enchants on the Item. Sealed slots skipped. Costs **1 Seal + Crystals**.

**Reroll Utilities**:
Re-roll ONLY utility-layer enchants on the Item. Sealed slots skipped. Costs **1 Seal + Crystals**.

**Transfer**:
Salvage one enchant from a source item onto an **Empty scroll**, sacrificing the source. Costs the scroll itself plus **Crystals**. Player picks ANY one unsealed enchant from the source item; the scroll becomes a **Loaded scroll** carrying that named enchant. Source destroyed - no crystal refund. The loaded scroll is later consumed by **Add: Apply scroll** on a legal target. Decoupling the destructive step (source destroyed) from the constructive step (target augmented) means a mis-click never fork-spears two items at once.

**Disenchant top**:
Pop the topmost unsealed enchant from an **Item**'s 6-stack. Sealed slots are skipped (the next unsealed slot down is popped). The Unique cell of a tier-7 item is treated as un-poppable here - only **Destroy** removes a Unique enchant. **Tier** drops by 1. Refunds **Crystals**. Illegal cases: (a) only sealed enchants remain in the 6-stack; (b) the Item is tier 7 (popping a 6-stack cell would invalidate the alternation pattern, and Unique itself is not a Disenchant target). Use Destroy in these cases.

**Remove selected**:
Pick ANY unsealed enchant in the stack (not just the top), remove it. Sealed slots cannot be targeted. Tier drops by 1. NO refund. Costs **1 Seal + Crystals**.

**Lock selected**:
Apply a **Seal** to a chosen enchant slot. The seal is embedded into the slot permanently - it cannot be removed except by Destroying the item. Sealed slots are protected from Reroll All, Reroll Mains, Reroll Utilities, Disenchant top, and Remove selected. Costs **1 Seal + Crystals**.

**Destroy**:
Delete the **Item** entirely. Refunds the same total **Crystals** as disenchanting slot-by-slot would, in one click. The differentiator is that Destroy pops sealed slots too - which **Disenchant top** can't. So Destroy is the only tool that can clear an item carrying sealed enchants the player no longer wants.

### Scrolls and Seals

**Scroll**:
A consumable carrier for one enchant. Three states: **Empty scroll** (purchased blank), **Loaded scroll** (engraved by **Transfer**, carrying one named enchant from a destroyed source Item), and **Unique scroll** (a Loaded scroll from a boss drop or Shop purchase that carries a Unique-pool enchant, marked with a distinct icon). Loaded and Unique scrolls are held as named tiles in the **Top bar**. Consumed by **Add: Apply scroll**.

**Empty scroll**:
A blank **Scroll** bought from the **Shop**. Consumed by **Transfer** to become a **Loaded scroll** carrying one named enchant.

**Loaded scroll**:
A **Scroll** that has been engraved by **Transfer**, carrying one named enchant from a destroyed source Item. Consumed by **Add: Apply scroll** to plant its carried enchant on a legal target.

**Unique scroll**:
A **Loaded scroll** whose carried enchant is from the **Unique** pool, with a distinct icon to mark its origin. Drops from the **Boss** (guaranteed) or appears rarely in the **Shop** - never produced by Transfer (Unique enchants only live on tier-7 items' unique slots, and Transferring would require destroying that tier-7 item). Consumed by **Add: Apply scroll** on a **Legendary** item, promoting it to tier 7.

**Seal**:
A consumable bought from the **Shop**. Universal precision-action material. Consumed by Reroll Mains, Reroll Utilities, Remove selected, and Lock selected at Rest. When used in Lock selected, the seal becomes embedded in the targeted enchant slot, protecting that enchant from future Reroll / Disenchant top / Remove selected actions. Sealing is permanent - the only way to remove a sealed enchant is to Destroy the entire item.

**Unique enchantment**:
A named enchant from the **Unique** pool. Only applies to **Legendary** (tier-6) items via a **Unique scroll**; promotes the item to tier 7 by adding the dedicated unique slot and filling it. Pool-agnostic - any Unique scroll can target any Legendary regardless of base item type.

### Economy

Two currencies.

**Crystals** (alias: **Dust**):
Enchant fuel. Primary source: Disenchant / Destroy popping enchants off your own items. Secondary source: limited stash bought from the **Shop** with **Gold** (safety valve, not a stream replacement). **Enemies do not drop crystals.**

Sinks:
- Add (Roll), Reroll All - crystals only
- Reroll Mains, Reroll Utilities, Remove selected, Lock selected - crystals + 1 Seal
- Transfer - crystals + 1 Empty scroll
- Add (Apply scroll) - the **Loaded scroll** itself is the entire cost (no extra crystals)

**Gold**:
Open-market currency. Source: dropped by all enemies (common, elite, boss). Sole sink: the Shop.

Shop inventory: Items (random), Empty scrolls, Seals, limited Crystals, low-chance Unique scroll. See `docs/shop.md` for quantities and prices.

### Drops

| Source | Gold | Crystals | Items | Unique scroll |
|---|---|---|---|---|
| Common enemy | yes | NO | rare, low-tier only | NO |
| Elite enemy | yes | NO | mid-tier guaranteed | NO |
| Boss | yes | NO | high-tier guaranteed | guaranteed |

**Unique scrolls only drop from bosses.** This makes the boss room the gateway to tier-7 items.

### Disenchant economics

- **Disenchant top**: pop top unsealed enchant, refund crystals proportional to that slot's pool/layer. Popping the last unsealed enchant when only sealed enchants remain is illegal (must Destroy first). Per-slot, slow.
- **Destroy**: scrap the item in one click. Refunds the **same total crystals** as disenchanting every slot would - but pops sealed slots too, which Disenchant top can't. Use Destroy when you want to clear a sealed enchant OR when slot-by-slot disenchanting would just waste clicks.

### Map

**Run**:
One play-through. Starts on a fresh **Map**, ends when the player dies OR kills the **Boss**. No meta-progression - every Run starts from a blank inventory.

**Map**:
A single-act branching node graph in the Slay-the-Spire idiom. Generated at Run start, fully visible to the player from the first screen. Player picks one node per floor; no backtracking; paths fork and re-converge.

Fixed structure:
- Floor 1: forced common-enemies room (single entry point).
- Floor N (penultimate): forced **Rest**.
- Floor N+1 (final): forced **Boss** (Lich).
- Middle floors: mix of common, **Elite**, **Shop**, **Rest** nodes.

Per-path constraint: every routable path from start to boss passes through **2-3 Elite** rooms. Path planning IS the meta-decision; some paths trade more elites for more shops, etc.

**Room** types:
- **Common-enemies room**: one **Fight** vs a **Group** of 1-3 commons (Skeleton / Goblin / Slime mix).
- **Elite-enemies room**: one Fight vs an Elite (Harpy / Ogre / Minotaur), possibly with a small common escort.
- **Boss room**: one Fight vs the **Boss**.
- **Shop**: no fight, browse inventory of empty scrolls + random items, gold-priced.
- **Rest**: no fight, perform Rest actions on inventory.

### Combat stats

**Fighter stats** (both Player and Enemy):
- **HP** (current / max)
- **Dodge chance** (0-100%)
- Player only: **Per-type resistance** (one value per damage type: % reduction vs physical / fire / cold / lightning / chaos)
- Enemy only: **Damage resistance** (single % value, reduces all incoming damage regardless of type)

**Unarmed**: when no weapon-main is equipped on either weapon or offhand, the Player auto-attacks for 50 physical damage every 3.0s. Cannot be modified by enchants - it's the floor.

**Numeric scale**: damage values, HP pools, gold, and crystals are in the low hundreds to thousands. Flat numbers on enchants (e.g. "Conduction: flat 500 chain damage") read big; percent enchants (e.g. "+30% damage") read small. Avoid sub-100 damage numbers except for unarmed and trivial flavour.

**Attack** (one per item-main on Player side; one per enemy attack profile):
- **Damage**: integer
- **Damage type**: `physical`, `fire`, `cold`, `lightning`, `chaos`
- **Attack interval**: seconds between fires
- **Crit chance** (clamped 0-100%) + **crit multiplier** (default ×2)
- Built-in chance to apply matching **Status** on hit (per damage type)

**Damage type ↔ Status mapping**:
| Type | Status applied |
|---|---|
| physical | Bleed (flat DoT) |
| fire | Burn (flat DoT) |
| cold | Freeze (slows attack interval) |
| lightning | Shock (amplifies damage taken) |
| chaos | Poison (stacking DoT, refreshes on reapply) |

**Targeting/AoE verbs** (enchant-driven):
- **Splash**: AoE around primary target. ONLY hits grounded enemies. Deals a percentage of the firing attack's damage.
- **Chain**: jumps to N additional enemies after primary. Any target (grounded or flying). Deals FLAT damage (not %-of-damage).
- **Lifesteal**: % of damage dealt heals Player
- **Thorns**: % of incoming damage reflected back
- **Knockback**: delays enemy's next attack by X seconds

**Enemy locomotion flag**:
- `grounded` (default) — eligible for Splash
- `flying` — Splash misses; Chain still works. Harpy is flying.

## Reference docs

- `docs/stack.md` - implementation stack (Pixi v8, Svelte 5, TypeScript, Noto Color Emoji, pixi-filters, GSAP)
- `docs/enchant-catalogue.md` - all 54 enchants
- `docs/enemies.md` - all 7 enemy stat blocks
- `docs/post-effects.md` - filter chain and per-scene overrides
- `docs/shop.md` - Shop stock, pricing, and tier distribution by floor
- `docs/ux.md` - out-of-fight UX behaviours (Inspector, Workbench, Backpack, Rest action flows)
- `docs/adr/` - architecture decision records, including ADR-0004 on Transfer engraving onto scrolls
