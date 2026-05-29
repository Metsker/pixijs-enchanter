# Gem catalogue (v1 starter pool)

26 gems: a curated, proc-driven starter set. Most effect gems are **active
abilities you can see fire**; a small backbone stays passive. The combo *feel*
lives here, so this is the cheapest thing to iterate. **Numbers are
placeholders** - lock the behaviours now, tune values in playtesting.

See [gems.md](gems.md) for socket / trigger / binding / resolution rules. Quick
terms: **effect** gems are `proc` (trigger + cooldown + visual) or `stat`
(passive); **support** gems modify the nearest effect to their right; a support
with no effect to its right is **inert**.

Visual key (primitive used): 🟰 strike-line · ⭕ expanding ring · ⬇️ falling body ·
🔵 drifting orb · 🌀 orbiting sprite · ✨ glow-on-player.

---

## Weapon gems (11) - offense

### Effects

| Gem | | Trigger | Effect (placeholder) | Visual |
|---|---|---|---|---|
| Chain Lightning | ⚡ | timer 3s | bolt a random enemy for 200 lightning | 🟰 |
| Meteor | ☄️ | timer 6s | random enemy: 350 fire + small splash | ⬇️ |
| Frost Nova | ❄️ | timer 5s | ring from you: 150 cold to all + Freeze chance | ⭕ |
| Whirlblade | 🗡️ | continuous | orbiting blade: 120 physical on contact | 🌀 |
| Soul Reap | 💀 | on-kill | burst at the corpse: 250 to nearby enemies | ⭕ |
| Vault Strike | 🌠 | on-crit | echo your auto-attack for 50% extra | 🟰 |
| Edge | ⚔️ | *stat* | +80 physical to your auto-attack | - |

### Supports

| Gem | | Knob | Effect on bound proc |
|---|---|---|---|
| Forking | 🔱 | count | +1 target |
| Overload | 💥 | damage | ×1.6 damage |
| Rapid | ⏱️ | cooldown | -30% cooldown |
| Igniting | 🔥 | rider | bound damage proc also applies Burn (35%) |

---

## Armor gems (7) - defense

### Effects

| Gem | | Trigger | Effect (placeholder) | Visual |
|---|---|---|---|---|
| Retaliate | 🌵 | on-hit-taken | blast the attacker for 200 | ⭕ |
| Sanctuary | ✨ | timer 8s | heal 15% max HP | ✨ |
| Searing Aura | 🔥 | continuous | nearby enemies take 60 fire/s | ⭕ |
| Bulwark | 🛡️ | timer 12s | gain a shield = 20% max HP | ✨ |
| Heart | ❤️ | *stat* | +400 max HP | - |

### Supports

| Gem | | Knob | Effect on bound proc |
|---|---|---|---|
| Lasting | ⏳ | cooldown | -30% cooldown / +duration on shields & auras |
| Chilling | 🧊 | rider | bound damage proc also applies Freeze (25%) |

---

## Jewelry gems (8) - utility / meta

### Effects

| Gem | | Trigger | Effect (placeholder) | Visual |
|---|---|---|---|---|
| Spirit Bolt | 👻 | timer 4s | homing orb to nearest enemy: 180 chaos | 🔵 |
| Time Warp | ⏳ | timer 10s | +50% attack speed for 3s | ✨ |
| Midas Burst | 💰 | on-kill | 30% chance: bonus gold | ✨ |
| Swiftness | ⏩ | *stat* | +12% attack speed | - |
| Keen | 🔎 | *stat* | +10% crit chance (auto-attack) | - |

### Supports

| Gem | | Knob | Effect on bound proc |
|---|---|---|---|
| Lethal | 🎯 | crit | the bound proc can crit (+25% crit chance on it) |
| Echo | 🔁 | rider | the bound proc fires twice (after 0.3s) |
| Amplify | 🔮 | damage | ×1.5 to the bound effect (proc damage or stat value) |

---

## Summary

| Class | Proc effects | Stat effects | Supports | Total |
|---|---|---|---|---|
| Weapon | 6 | 1 | 4 | 11 |
| Armor | 4 | 1 | 2 | 7 |
| Jewelry | 3 | 2 | 3 | 8 |
| **All** | **13** | **4** | **9** | **26** |

Support-knob coverage: count (Forking), damage (Overload, Amplify), cooldown
(Rapid, Lasting), crit (Lethal), rider (Igniting, Chilling, Echo).

## Balance notes / open questions

- **Crit on procs is a build choice.** Procs don't crit until `Lethal` is bound;
  the passive `Keen` is auto-attack only. Keeps crit builds intentional.
- **The 4 passives are the backbone** (Edge / Heart / Swiftness / Keen). If you
  want zero pure-number gems, Heart -> a shield proc and Edge -> an auto-attack
  proc; flagged but not assumed.
- **Cooldown is the strongest knob** (it scales damage *and* proc count over
  time), so `Rapid` / `Lasting` should be rarer in the craft/drop weights than
  flat damage supports.
- **Continuous procs** (Whirlblade, Searing Aura) have no cooldown, so cooldown
  supports (`Rapid` / `Lasting`) instead **raise their tick rate** - more damage
  instances per second.
- Crafting from crystals at Rest rolls from this pool, weighted by class and by
  effect-vs-support (supports rarer; procs rarer than stats). Weights = a knob.
- Candidate v2 additions: more triggers (on-dodge, every-Nth-hit), conditional
  knobs (low-HP, enrage), summon/minion procs, multi-class gems, a rare "unique"
  gem tier.
</content>
