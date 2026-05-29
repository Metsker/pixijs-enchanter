# Effect gems may be procs run by one central proc engine

_Part of the gems redesign (see [../gems.md](../gems.md)). Amends ADR 0001. Not yet implemented._

ADR 0001 routed every enchant into a single passive attack / defence profile (it already allowed *reactive* procs). Pure-number gems felt flat, so the design now wants active, visible abilities - the archetype being "every 3 seconds lightning strikes a random enemy."

An effect gem is now either a **stat** gem (passive; feeds the player profile exactly as ADR 0001 describes) or a **proc** gem (active: a **trigger** - `timer` / `continuous` / `on-kill` / `on-crit` / `on-hit-taken` - plus a cooldown, a payload, and a battlefield visual). All procs are owned by **one central proc engine** in the fight loop. Support gems tune a proc's knobs (count / damage / cooldown / crit / riders). Procs do not crit unless a crit support is bound to them; the passive crit stat applies only to the auto-attack.

We chose this because active abilities are where the fun and the visible combos live. Routing every proc through one central scheduler - rather than giving each Item its own timer - preserves ADR 0001's real concern: no per-item cooldown bars cluttering the 9-slot inventory column. The stat path is untouched, so the single-player-profile model still holds for passives. This **amends** ADR 0001 rather than superseding it: there is still exactly one player auto-attack and one aggregated profile; procs are an added, centrally-scheduled layer that renders on the battlefield, not in the inventory.

## Considered options
- **Keep everything passive (ADR 0001 as-is)** - rejected: the flat "pure numbers" feel the user explicitly disliked.
- **Per-item firing timers (MegaLoot)** - rejected again for ADR 0001's reason: cooldown-UI density on 9 slots.
- **Full trigger-chain wand engine (mana, multicast, wrap-around)** - rejected for v1: a much larger build; the binding rule (ADR 0006) plus the proc engine is enough.

## Consequences
- The proc engine plus ~6 reusable visual primitives (strike-line, expanding ring, falling body, drifting orb, orbiting sprite, glow-on-player) become the core v1 build.
- Per-item resolution now returns `{ stats, procs }`; stats feed the existing profile builders, procs feed the engine.
- The recommended first vertical slice is Chain Lightning end-to-end (data model -> resolution -> engine -> one visual).
