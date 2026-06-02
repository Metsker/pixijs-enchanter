# Gem catalogue

44 gems: a curated, proc-driven set. Most effect gems are **active abilities you
can see fire**; a passive backbone (now a richer one - see Balance notes) sits
alongside. The combo *feel* lives here, so this is the cheapest thing to iterate.
**Numbers are placeholders** - lock the behaviours now, tune values in
playtesting.

See [gems.md](gems.md) for socket / trigger / binding / resolution rules. Quick
terms: **effect** gems are `proc` (trigger + cooldown + visual) or `stat`
(passive); **support** gems modify the nearest effect to their right; a support
with no effect to its right is **inert**.

Visual key (primitive used): 🟰 strike-line · ⭕ expanding ring · ⬇️ falling body ·
🔵 drifting orb · 🌀 orbiting sprite · ✨ glow-on-player.

---

## Weapon gems (19) - offense

### Effects

| Gem | | Trigger | Effect (placeholder) | Visual |
|---|---|---|---|---|
| Chain Lightning | ⚡ | timer 3s | bolt a random enemy for 200 lightning | 🟰 |
| Meteor | ☄️ | timer 6s | random enemy: 350 fire + small splash | ⬇️ |
| Frost Nova | ❄️ | timer 5s | ring from you: 150 cold to all + Freeze chance | ⭕ |
| Whirlblade | 🗡️ | continuous | orbiting blade: 120 physical on contact | 🌀 |
| Soul Reap | 💀 | on-kill | burst at the corpse: 250 to nearby enemies | ⭕ |
| Vault Strike | 🌠 | on-crit | echo 60% of your auto-attack (scales with it) | 🟰 |
| Spellstrike | 🌩️ | on-hit | each auto-attack also bolts the target for 45 lightning | 🟰 |
| Edge | ⚔️ | *stat* | +150 physical to your auto-attack | - |
| Bloodthirst | 🧛 | *stat* | lifesteal 8% of damage dealt | - |
| Cull | 🪓 | *stat* | +100% damage vs enemies below 25% HP (execute) | - |
| Gutting | 🩸 | *stat* | 30% on auto-hit: also Bleed | - |

### Supports

| Gem | | Knob | Effect on bound proc |
|---|---|---|---|
| Forking | 🔱 | count | +1 target |
| Overload | 💥 | damage | ×1.6 damage |
| Rapid | ⏱️ | cooldown | -30% cooldown |
| Igniting | 🔥 | rider | bound damage proc also applies Burn |
| Serrated | 🪒 | rider | bound damage proc also applies Bleed |
| Conduction | 🔌 | rider | bound damage proc also applies Shock (the only Shock source on procs) |
| Ruthless | 🔪 | conditional | ×2 vs targets below 30% HP |
| Overcharge | ⚙️ | conditional | ×2 vs Shocked targets |

---

## Armor gems (12) - defense

### Effects

| Gem | | Trigger | Effect (placeholder) | Visual |
|---|---|---|---|---|
| Retaliate | 🌵 | on-hit-taken | blast the attacker for 200 | ⭕ |
| Sanctuary | ✨ | timer 6s | heal 15% max HP | ✨ |
| Searing Aura | 🔥 | continuous | nearby enemies take 60 fire/s | ⭕ |
| Bulwark | 🛡️ | timer 6s | gain a shield = 20% max HP | ✨ |
| Heart | ❤️ | *stat* | +700 max HP | - |
| Berserker | 😤 | *stat* | +8% damage per 10% HP missing (max +80%) | - |
| Giant's Blood | 🗿 | *stat* | auto-attack gains +3% of your max HP as damage | - |
| Evasion | 💨 | *stat* | +12% dodge | - |
| Regrowth | 🌿 | *stat* | regenerate 30 HP/s | - |
| Plating | 🧱 | *stat* | +10% flat damage reduction (armor) | - |

### Supports

| Gem | | Knob | Effect on bound proc |
|---|---|---|---|
| Lasting | ⏳ | cooldown | -30% cooldown / +duration on shields & auras |
| Chilling | 🧊 | rider | bound damage proc also applies Freeze |
| Shatter | 💠 | conditional | ×2.5 vs Frozen targets |

---

## Jewelry gems (13) - utility / meta

### Effects

| Gem | | Trigger | Effect (placeholder) | Visual |
|---|---|---|---|---|
| Spirit Bolt | 👻 | timer 4s | homing orb to nearest enemy: 180 chaos | 🔵 |
| Time Warp | ⏳ | timer 5s | +50% attack speed for 2.5s | ✨ |
| Midas Burst | 💰 | on-kill | 30% chance: bonus gold | ✨ |
| Swiftness | ⏩ | *stat* | +20% attack speed | - |
| Keen | 🔎 | *stat* | +18% crit chance (auto-attack) | - |
| Galvanize | 🔋 | *stat* | 25% on auto-hit: also Shock (+30% damage taken) | - |
| Brutality | 💪 | *stat* | +0.5 crit multiplier (crits hit ×2.5) | - |
| Hunter | 🏹 | *stat* | +40% damage vs enemies above 75% HP | - |

### Supports

| Gem | | Knob | Effect on bound proc |
|---|---|---|---|
| Lethal | 🎯 | crit | the bound proc can crit (+25% crit chance on it) |
| Echo | 🔁 | repeat | the bound proc fires twice (after 0.3s) |
| Amplify | 🔮 | damage | ×1.5 to the bound effect (proc damage or stat value) |
| Envenom | 🧪 | rider | bound damage proc also applies Poison |
| Virulent | 🧫 | potency | the bound proc's ailments deal ×2 DoT and last +50% longer |

---

## Summary

| Class | Proc effects | Stat effects | Supports | Total |
|---|---|---|---|---|
| Weapon | 7 | 4 | 8 | 19 |
| Armor | 4 | 6 | 3 | 13 |
| Jewelry | 3 | 5 | 5 | 13 |
| **All** | **14** | **15** | **16** | **45** |

Support-knob coverage: count (Forking), damage (Overload, Amplify), cooldown
(Rapid, Lasting), crit (Lethal), repeat (Echo), rider (Igniting, Chilling,
Serrated, Conduction, Envenom), potency (Virulent), conditional (Shatter,
Overcharge, Ruthless).

## Balance notes / open questions

- **Crit on procs is a build choice.** Procs don't crit until `Lethal` is bound;
  the passive `Keen` is auto-attack only. Keeps crit builds intentional.
- **Both active and passive backbones now coexist** (the deferred "pure-active"
  direction, landed as additive content). The pure-number passives stay (Edge /
  Heart / Swiftness / Keen), and richer conditional passives sit beside them -
  Berserker (low-HP scaling), Giant's Blood (max-HP -> damage), Cull / Hunter
  (HP-threshold damage), Bloodthirst (lifesteal), Brutality (crit mult). Their
  active counterparts also exist: Spellstrike (an on-hit auto-attack proc) and
  the shield/heal procs (Bulwark / Sanctuary) cover the Edge / Heart "make it a
  proc" idea without dropping the passives. Pick by feel.
- **Ailments are a real build now.** All five statuses are reachable - Burn
  (Igniting), Freeze (Chilling), Bleed (Serrated / Gutting), Poison (Envenom),
  Shock (Conduction / Galvanize) - and `Virulent` (potency) scales their DoT.
  Shock doubles as a global damage amp (+30% taken), so `Overcharge` / a shock
  source is a force multiplier, not just another DoT.
- **Conditional supports are the combo payoff.** Shatter / Overcharge / Ruthless
  do nothing on their own; they cash in a state another gem (or your attack) set
  up - freeze, shock, or a low-HP target. Keep them slightly rarer than flat
  damage so the payoff feels earned.
- **Cooldown is the strongest knob** (it scales damage *and* proc count over
  time), so `Rapid` / `Lasting` should be rarer in the craft/drop weights than
  flat damage supports.
- **Continuous procs** (Whirlblade, Searing Aura) have no cooldown, so cooldown
  supports (`Rapid` / `Lasting`) instead **raise their tick rate** - more damage
  instances per second.
- Crafting from crystals at Rest rolls from this pool, weighted by class and by
  effect-vs-support (supports rarer; procs rarer than stats). Weights = a knob.
- Candidate next additions: more triggers (on-dodge, every-Nth-hit), summon /
  minion procs, multi-class gems, a rare "unique" gem tier. (On-hit triggers and
  conditional knobs, once on this list, are now **in**.)
</content>
