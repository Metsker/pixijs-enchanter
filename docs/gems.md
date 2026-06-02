# Gems & sockets (combo system)

This supersedes the baked-enchant model (see ADR 0002) and **amends ADR 0001**.
Enchantments are now **gems**: free-floating objects the player moves between
item sockets and crafts at Rest. The fun is *arrangement* - a Noita-style
"what fires into what" puzzle - and most effect gems are **active abilities you
can see fire**, not passive numbers.

## Gems

A gem has a **class** and a **role**.

- **Class** = `weapon | armor | jewelry`, reused from the old enchant pools. A
  gem only fits a socket of its own class - this is what "compatible items"
  means.
- **Role** = `effect | support`.
  - **Effect gems** carry the payload. Two flavours:
    - **Proc** - an active ability with a **trigger**, a **cooldown**, and a
      battlefield **visual** (e.g. "every 3s, lightning strikes a random enemy").
      This is most of the content.
    - **Stat** - a passive that feeds the player's attack / defence profile
      (e.g. +max HP, +attack speed). A small, deliberate backbone.
  - **Support gems** carry no payload. They **modify the effect gem they bind
    to** - turning a proc's knobs (count, damage, cooldown, crit) or bolting on a
    rider (a status, a second cast). A support with nothing to bind to is
    **inert**.

## Triggers (proc effects)

| Trigger | Fires when | Notes |
|---|---|---|
| `timer` | every N seconds | self-driving; the headline kind |
| `continuous` | always (orbital / aura) | a persistent damage zone |
| `on-kill` | an enemy dies | |
| `on-crit` | the auto-attack crits | |
| `on-hit` | the auto-attack lands | reactive; fires every landed hit - the spellblade bridge, so attack speed scales the proc rate |
| `on-hit-taken` | the player is hit | reactive defence |

Procs do **not** crit by default; a crit support (`Lethal`) makes a proc critable.
The passive crit stat (`Keen`) applies to the auto-attack, not to procs.

## Sockets

- An item exposes an **ordered list of sockets**: `sockets: (Gem | null)[]`.
- Socket **count = item capacity** (1-6), replacing the old "tier = enchant
  count" idea. Higher floors drop higher-capacity items. (Supersedes ADR 0002.)
- A socket only accepts a gem of the item's class.
- Order within an item is player-controlled and is the whole game.

## The binding rule

> A support binds to the **nearest effect gem to its right**, within the same
> item, skipping over any intervening support gems. If there is no effect gem to
> its right, the support is inert.

- A **run of supports** left of an effect **all bind to that one effect**, applied
  left-to-right: `[S][S][S][E]` stacks three knobs on one proc.
- A support **right of every effect is wasted**.
- Capacity caps combo depth; sockets are scarce, so every gem is a decision.

## Support knobs

When a support binds to an effect it does one of:

| Kind | On a proc | On a stat |
|---|---|---|
| **damage / scale** | ×factor to **any** proc's magnitude (damage / heal / shield / buff / gold) | ×factor to the stat value |
| **cooldown** | -% cooldown on **any** proc; +tick rate on continuous; +duration on shields/auras | (inert) |
| **repeat** | **any** proc fires an extra time | (inert) |
| **count** | +N targets / projectiles | (inert) |
| **crit** | the proc may crit (+chance) | (inert) |
| **rider** | the damage proc also applies a status | (inert) |
| **potency** | the proc's riders deal ×more DoT and last longer (inert with no rider) | boosts a status-on-hit stat's ailment |
| **conditional** | ×factor when the target is frozen / shocked / low-HP, per hit | (inert) |

**scale / cooldown / repeat are universal** - never inert on a proc - so a
support is rarely a dead draw. The damage-shaped knobs (count / crit / rider /
conditional) need a damage proc; `potency` needs a rider (on a proc) or a
status-on-hit (on a stat).

A support whose kind doesn't apply to the effect it bound to simply does nothing
for that part (e.g. `Forking` on a stat gem is inert). Generic scale (`Amplify`)
works on both. Application order is **socket order, left to right**.

## Resolution (per item)

Each item is a self-contained mini-wand. It resolves to two outputs:

```
resolveItemGems(item) -> { stats: EnchantEffect[], procs: ResolvedProc[] }
  for each effect gem E in socket order:
      supports = [ supports whose nearest-effect-to-the-right is E ]
      if E is a proc:  push applyKnobs(E, supports) to procs
      else:            push applyScale(E, supports) to stats
```

Aggregation across all equipped items:

```
playerStats = equipped.flatMap(r => r.stats)   // -> attack-profile.ts / defence-profile.ts (unchanged)
playerProcs = equipped.flatMap(r => r.procs)   // -> the proc engine
```

ADR 0001 still holds: there is **one** player auto-attack and the `stats` path
aggregates into the single player profile exactly as before. Procs are the
amendment - see below.

## The proc engine (new core system)

A small scheduler in the fight loop owns all active procs (not per-item timers -
that's the ADR 0001 concern this preserves):

- `timer` procs keep a countdown; on zero they fire and reset.
- `continuous` procs apply on a fixed tick while equipped; cooldown supports
  raise that tick rate.
- reactive procs (`on-kill` / `on-crit` / `on-hit-taken`) fire from combat events.
- Firing = pick target(s) per the proc's targeting + count, deal damage (reusing
  the existing damage path), roll crit if granted, apply riders, then spawn a
  visual.

### Visual primitives (cheap, reused)

Each proc maps to one primitive (Graphics + a short tween in `battlefield.ts`):

- **strike-line** - sky/player to a target (lightning).
- **expanding ring** - from a point (nova, explosion, aura pulse).
- **falling body** - drop onto a target (meteor).
- **drifting orb** - travels to a target (spirit / homing).
- **orbiting sprite** - rotates around the player (whirlblade).
- **soft glow on player** - heal / buff / shield bubble.

## Worked examples

**1. Build a lightning storm.**
`[Forking] [Overload] [Rapid] [⚡ Chain Lightning]` - all three supports bind to
Chain Lightning. Cooldown 3s -> ~2.1s, targets 1 -> 2, damage 200 -> 320. Add a
5th socket `[Igniting]` and the bolts also Burn.

**2. The wasted support (the puzzle).**
`[⚡ Chain Lightning] [Overload]` -> Overload has no effect to its right and is
**inert**. Swap them.

**3. Crit-meteor.**
`[Lethal] [Overload] [☄️ Meteor]` -> Meteor can now crit and hits for ×1.6. With
the auto-attack's crit multiplier, a lucky meteor one-shots an elite.

**4. Reactive armor.**
`[Lasting] [🌵 Retaliate]` on a chest -> when you're hit, the retaliation blast
fires with extended reach/longer rider. (Knobs that don't apply are ignored.)

**5. Spellblade (on-hit bridge).**
`[Overload] [🌩️ Spellstrike] [Igniting]` on a weapon -> every auto-attack lands a
boosted, Burning lightning bolt. Stack `Swiftness` (attack speed) and the bolt
fires more often - the auto-attack and spell builds finally scale each other.

**6. Shock combo.**
`[🔌 Conduction]` on one proc applies Shock (+30% damage taken); `[⚙️ Overcharge]
[☄️ Meteor]` then hits shocked targets for ×2. Or skip the support and run
`🔋 Galvanize` (shock on auto-hit) to set the table for every proc you own.

**7. Ramping ailment.**
`[🧪 Envenom] [🧫 Virulent] [👻 Spirit Bolt]` -> the bolt applies Poison that
Virulent makes hit ×2 and last +50% longer. Pair `🩸 Gutting` (bleed on-hit) to
layer a second DoT from your auto-attack.

## Build archetypes

The pool is tuned so several distinct builds are reachable, and most *combine*:

- **Auto-attack** - `Edge` / `Swiftness` / `Keen` / `Brutality` (crit mult) /
  `Bloodthirst` (lifesteal) / `Cull` (execute). The weapon backbone.
- **Spellblade** - an `on-hit` proc (`Spellstrike`) turns auto-attacks into spell
  triggers; attack speed now scales spell frequency.
- **Spells / procs** - `timer` procs (Chain Lightning, Meteor, Spirit Bolt) stacked
  with `scale` / `cooldown` / `count` / `crit` supports.
- **Ailments / DoT** - reach all five statuses via riders (`Igniting`, `Chilling`,
  `Serrated`, `Conduction`, `Envenom`) or on-hit stats (`Gutting`, `Galvanize`),
  then scale them with `Virulent`. **Shock** doubles as a whole-build damage amp.
- **Crit** - `Keen` + `Brutality` + `Lethal` (procs crit too).
- **Combo / conditional** - `Shatter` (vs frozen), `Overcharge` (vs shocked),
  `Ruthless` (vs low-HP) reward setting an ailment / executing - they pay off the
  builds above instead of standing alone.
- **Defense / sustain** - `Heart`, `Bulwark`, `Sanctuary`, `Retaliate`, plus the
  passive layer `Plating` (flat damage reduction = "armor") / `Evasion` (dodge) /
  `Regrowth` (regen) / `Berserker` / `Giant's Blood` (max HP -> auto-attack
  damage, bridging tank and DPS). Mitigation is deliberately simple - dodge +
  flat damage reduction, **no per-element resist**.

## Out of scope (noted, not built)

- Multi-class gems; cross-item / global binding; trigger-chain execution
  (mana / multicast). v1 keeps a single per-item binding pass plus the proc
  engine. (Conditional knobs - "×2 vs frozen / low-HP" - are now **in** as the
  `conditional` support kind; see the knobs table.)

## See also

- [gem-catalogue.md](gem-catalogue.md) - the v1 gem pool.
- ADR 0001 - single player attack profile (amended: gems may also emit procs run
  by one central engine; still no per-item timers).
- ADR 0002 - tier = enchant count (superseded by socket capacity here).
</content>
