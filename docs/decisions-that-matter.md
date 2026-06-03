# Making decisions matter - the adaptation loop

A design vision for giving the player's choices real weight. Grounded in the
current engine (see [enemies.md](enemies.md), [gems.md](gems.md),
[gem-ideas.md](gem-ideas.md)) and tagged by how much new code each piece needs.

**Numbers are placeholders** - lock the behaviours, tune in playtesting (same
rule as [gem-catalogue.md](gem-catalogue.md)).

> Status: **Design vision, not yet implemented.** Milestone A is the proof of
> concept; B and C build on it.

**Engine cost legend** (shared with [gem-ideas.md](gem-ideas.md)):

- 🟢 **pure data** - fits an existing field / payload / effect
- 🟡 **small addition** - one new field, knob, or UI panel
- 🔴 **new system** - a new subsystem or combat rule

---

## The diagnosis

Fights are fully automated. The player picks a target and a sim speed, nothing
else - so combat is not where decisions live. **The build _is_ the gameplay.**
Every meaningful choice happens _between_ fights: map path, shop/forge spend,
and above all which gems go in which sockets in which order.

A choice only matters when it has four properties. Today we have two:

| Property | Meaning | Today |
|---|---|---|
| **Trade-off** | Choosing A means _not_ getting B | ❌ mostly additive - more gems = strictly better |
| **Legibility** | You can reason about the outcome beforehand | ✅ the Inspector is genuinely good |
| **Feedback** | You can observe the consequence | ⚠️ you watch the fight but can't tell _why_ you won/lost |
| **Commitment** | The consequence persists | ➖ free respec by design (see below) |

The two weak rows - trade-off and feedback - are the whole problem. Most
"decisions" today are just _acquisition order_ of strictly-good things. That is
optimisation, not decision-making.

## Free respec is the engine, not a compromise

We keep free respec. When re-socketing is free, "mattering" does not disappear -
it moves up a layer:

| Layer | What it is | Reversible? | Where the decision lives |
|---|---|---|---|
| **Acquisition** | What you _own_ - gems, gear, gold/crystals spent, path taken | ❌ permanent | Scarcity. You cannot own everything. |
| **Configuration** | How you _arrange_ what you own | ✅ free | Reading the fight and adapting |

This is a deckbuilder: you can rearrange your deck before every fight, but you
cannot play cards you do not own. **The collection is the commitment; the
arrangement is the skill.** Free respec turns the core verb into _read-and-adapt_
instead of _commit-and-pray_.

Crucially, free respec does not weaken the other levers - it _needs_ them:

- **Telegraphed threats** give you something to adapt _to_. Without them, free
  respec is pointless; with them it is the whole game.
- **Gem trade-offs** stop free respec from being a solved problem. Because
  socket colours and support-adjacency are scarce, **countering threat A costs
  you against threat B** - so every fight's config is a real choice even though
  it is free to change.
- **Build-around uniques** become _swappable tools in a kit_: equip the
  swarm-buster for the swarm fight.
- **The post-fight breakdown** grades the adaptation and teaches the
  threat -> counter language.

## The loop

```
See threats ahead on the map  ->  pick a path (which fights, given what I own)
   ->  reconfigure owned gems to counter it (free, fast)
   ->  fight (one shot - the read is tested)
   ->  post-fight breakdown grades the read
   ->  loot / shop / forge to expand what you OWN  ->  repeat
```

## The risk, and its antidotes

Free respec plus perfect information could collapse into "slot the obvious
counter, autowin." Three antidotes, all built into the design:

1. **Trade-offs** (lever 2) - no configuration is optimal against everything.
2. **Progressive information** - a bestiary that fills in as you fight: threat
   tags first, exact numbers only after you have met an enemy.
3. **Real stakes** - one shot per fight; defeat ends the run.

---

## Lever 1 - Telegraphed enemy threats (the keystone)

Today the seven enemies in [enemy-catalogue.ts](../src/domain/enemy-catalogue.ts)
differ only in hp / damage / interval. `EnemyDef`
([enemy.ts:6](../src/domain/enemy.ts)) already carries `damageType`,
`appliesStatus`, `loc` (grounded/flying), `interval`, `taunt`, and a flat
`resist` - but `damageType` is **catalogued and ignored** by the damage math
(player -> enemy at [battlefield.ts:685](../src/pixi/battlefield.ts), enemy ->
player at [battlefield.ts:1335](../src/pixi/battlefield.ts)), and there is **no
per-element resist** ([defence-profile.ts:12](../src/domain/defence-profile.ts))
and **no enemy ailment immunity**.

Give each enemy a threat identity that _demands_ a build answer, and surface it
before the player commits. Two tiny new fields cover most of it: `resistType?`
and `ailmentImmune?` on `EnemyDef`. 🟡

### The seven-enemy curriculum

| Enemy | Threat identity | The build answer | Teaches |
|---|---|---|---|
| **Skeleton** 🦴 | Bone - immune to bleed & poison; bursty (400/5s) | Direct damage, not DoT; a shield for the spike | DoT is not universal |
| **Goblin** 👺 | Fast chip + 10% dodge, low HP | Lifesteal / regen shrugs it off | Sustained vs burst (low stakes) |
| **Slime** ☠️ | Applies poison; resists physical | Status-immunity gem _(already wired)_ + elemental damage | The existing immunity gem matters |
| **Harpy** 🕊️ | Flying + 25% dodge - melee auto-attacks whiff | Procs / projectiles that bypass accuracy (Chain Lightning, Meteor) | Auto-attack is not everything |
| **Ogre** 💥 | One huge hit / 8s + tanky wall + resist | Timed shield/heal; burst it down; penetration | Burst defence + penetration |
| **Minotaur** 🌀 | Taunt-locks your target | AoE so the lock does not matter, or thorns to punish face-tanking | Multi-target value |
| **Lich** 👑 | The exam: HP wall + poison + waves of bone adds (DoT-immune) | Sustained direct damage + AoE for adds + poison immunity | Demands the whole toolkit |

Each common teaches one axis, elites combine two, the boss demands the kit the
run assembled. Free respec is what lets the player _answer_ each one from their
owned collection.

### Engineering hooks

- Wire `damageType` into the damage math so per-type resistance bites. 🟡
- Add `resistType?: DamageType` and `ailmentImmune?: StatusType[]` to
  `EnemyDef`; gate status application
  ([fight.ts:309](../src/state/fight.ts)) and the resist multiplier
  ([battlefield.ts:685](../src/pixi/battlefield.ts)) on them. 🟡
- Make `loc: 'flying'` / dodge actually punish melee auto-attacks (procs ignore
  it). 🟡
- **Telegraph** - `node.enemies[]` is already pre-rolled at map generation
  ([map.ts:21](../src/domain/map.ts)) and currently unused by the UI
  ([Map.svelte](../src/ui/Map.svelte) shows only a room emoji). Render 1-2
  threat-tag icons per fight node. 🟡

## Lever 2 - Gem trade-offs / anti-synergy

With commitment off the table (free respec), trade-offs carry the weight.
Countering one threat must cost something against another. The richest source is
already here: **support-adjacency** (ADR 0006 - a support only boosts its
neighbours) plus **socket-colour scarcity** (red/green/blue, fixed per item
tier). Sharpen it with gems that pay for power, drawn from the
[gem-ideas.md](gem-ideas.md) backlog (Brink, Covenant, etc.):

- **Glass-cannon stats** - e.g. Shaped Glass (max HP x0.5, damage x2). 🟡
- **Anti-synergy supports** - a support that doubles a proc but disables
  lifesteal, or costs current HP per fire. 🟡
- **Colour tension** - the counter you want competes for the same socket colour
  as your core damage, so adapting visibly weakens you elsewhere. 🟢

The test: no single configuration should be optimal against the whole map.

## Lever 3 - Build-around uniques

The classic answer to "higher tier is always strictly better": items so weird
they reshape the plan. Under free respec they become **swappable tools** - you
keep a toolkit and equip the right one per fight, rather than locking one build.
See the transformative-uniques tier already sketched in
[gem-ideas.md](gem-ideas.md) (Polyphemus, Brimstone, Deadeye). Examples:

- A weapon that cannot crit but triples on-hit ailments (the DoT tool). 🟡
- 6 blue sockets but converts all damage to one element (the elemental tool). 🔴
- Great against swarms, weak against single targets (the add-clear tool). 🟡

## Lever 4 - Post-fight breakdown

Cheap, high payoff. After a fight, show damage and threat attribution:
"Chain Lightning did 41% of your damage; 80% of damage taken came from the
Ogre; Sanctuary healed 1,200." This closes the
decision -> consequence -> _learning_ loop, which retroactively makes every build
decision legible. Needs per-source accumulators during the fight tick plus a
results panel. 🟡

---

## Build order

1. **Milestone A - make the loop visible.** Lever 1 (sharpen the seven enemies +
   wire resistances / ailment immunity / flying) + map threat tags + lever 4
   (breakdown). These three together prove the whole idea end to end.
2. **Milestone B - make adaptation cost something.** Lever 2 anti-synergy gems +
   socket-colour tension, balanced against the now-real threats.
3. **Milestone C - build-around uniques** as swappable tools, on top of the
   threat vocabulary.

## Decisions to promote to ADRs once locked

- Wiring `damageType` into the damage math + per-enemy `resistType` /
  `ailmentImmune` (changes core combat math).
- Free respec as the load-bearing core verb (acquisition is the only permanent
  layer) - frames every future system.
