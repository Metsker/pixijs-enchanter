# Gem ideas backlog

A menu of build directions for future gem expansion, drawn from roguelike
touchstones (Binding of Isaac, Slay the Spire, Risk of Rain 2, Vampire
Survivors, Hades). Each direction is grounded in the current engine (see
[gems.md](gems.md) for triggers / riders / condscale / the player-HP axis) and
tagged by how much new code it needs.

**Numbers are placeholders** - lock the behaviours, tune in playtesting (same
rule as [gem-catalogue.md](gem-catalogue.md)).

**Engine cost legend:**

- 🟢 **pure data** - fits an existing payload / effect / support kind
- 🟡 **small addition** - one new support knob, payload, stat, or status
- 🔴 **new system** - a new trigger or a new runtime subsystem

> Status: **Familiars & swarm (#3) is being implemented first.** The rest are
> parked here for later.

---

## 1. Brink - glass-cannon risk/reward 🩸

*Isaac devil deals · RoR2 Shaped Glass.* You deliberately stay one hit from
death because that's where you hit hardest. The natural payoff for the
**player-HP axis** we kept (Berserker) after dropping target-HP execute.

- **Shaped Glass** 💎 *(unique stat)* - max HP ×0.5, all your damage ×2. 🟡
  (`hp-max-mul` already exists in the union; needs a global-damage-mul stat)
- **Blood Pact** 🫀 *(support)* - the bound proc costs 4% of current HP to fire,
  deals ×1.8. 🟡
- **Covenant** ⛧ *(stat)* - you can no longer heal; +60% damage. 🟡

**Marquee combo:** Shaped Glass + **Berserker** (already in pool, +80% near
death) + **Bloodthirst** (lifesteal is your only safety net, clawing you back
from 1 HP).

## 2. Contagion - the ailment detonator 🦠

*Spire poison · Hades' Doom · Isaac contagion.* The DoT build gets an explosive
payoff instead of just ticking. Cheapest "interesting" win - plugs straight into
the five statuses and `condscale`.

- **Contagion** 🦠 *(support)* - when an enemy carrying the bound proc's status
  dies, its statuses leap to nearby enemies. 🟡 (hooks the existing on-kill path)
- **Detonate** 💢 *(support)* - the bound proc consumes all DoT on the target and
  deals the remaining damage instantly, ×1.5. 🟡
- **Wildfire** 🌋 *(support)* - Burn the bound proc applies spreads to adjacent
  enemies each tick. 🟡

**Marquee combo:** **Frost Nova** → **Chilling** → Contagion → **Shatter** =
freeze the pack, the first kill spreads freeze, Shatter cashes ×2.5 on all of
them. A genuine chain reaction.

## 3. Familiars & swarm - summoner 🐺 *(implementing first)*

*Vampire Survivors, Isaac familiars, RoR2 drones.* A "count-scaling" identity:
you don't attack, your minions do. **Whirlblade** is already a baby version.

- **Spirit Wolf** 🐺 *(proc)* - summon a wolf that independently hunts the
  nearest enemy for the fight. 🔴 (new minion payload + autonomous entity)
- **Swarm** 🐝 *(proc)* - three bees orbit you, chipping anything close. 🔴
- Scales with existing **Forking** (+1 minion) and **Echo** (re-summon).

## 4. Crit Assassin - extend the kept crit package 🎯

*Gungeon / Spire crit conversion.* We already have Keen + Brutality + Lethal +
Vault Strike; give them a finisher loop.

- **Deadeye** 🎯 *(unique)* - 100% crit chance, but crit multiplier drops to
  ×1.5. Trade variance for certainty. 🟡 (`all-crit-replace-mul` already exists
  for Vorpal Edge - same machinery)
- **Mortal Wound** 🗡️ *(support)* - the bound proc's crits apply a heavy Bleed.
  🟡
- **Brittle** 🪟 *(new status)* - afflicted enemies always take crits / +crit
  damage; pairs with a new `condscale` condition. 🟡

**Marquee combo:** Keen + Brutality + Lethal + **Vault Strike** (on-crit echo) +
Mortal Wound = every crit echoes *and* bleeds - a self-feeding cascade.

## 5. Heavy - charge & cleave 🪓

*Polyphemus / Vampire Survivors charged weapons.* The slow-but-huge counter to
the fast spellblade build.

- **Heavy Draw** 🪓 *(every-Nth-hit trigger)* - every 4th auto-attack is a ×4
  cleave hitting all nearby. 🔴 (new trigger: count landed hits)
- **Polyphemus** 👁️ *(unique)* - attack speed ×0.5, auto-attack ×3 and pierces
  every enemy in line. 🟡

## 6. Untouchable - dodge & counter 🤺

*Isaac dodge builds.* Gives lonely **Evasion** a build to anchor.

- **Riposte** 🤺 *(on-dodge proc)* - when you dodge, blast the attacker. 🔴 (new
  trigger)
- **Phantom** 👤 *(stat)* - after a dodge, +40% damage for 3s. 🟢
  (`on-dodge-damage-buff` already in the union)
- **Untouchable** 🌫️ - a dodge also negates the next status that would land on
  you. 🟡

## 7. Gambler - chaos & lottery 🎲

*Isaac D6/D20, gambling.* Embrace variance.

- **Wild Die** 🎲 *(stat/support)* - 12% on hit to deal ×5 (lottery crit). 🟡
- **Jackpot** 🎰 *(on-kill proc)* - rare chance to dump gold + full heal + a
  random buff. 🟢-ish
- **Reroll** 🔀 *(support)* - the bound proc's damage is randomized 0.5×-2.5×
  each fire (averages up, high variance). 🟡

## 8. Greed - economy as power 🪙

*Isaac Steam Sale / Keeper.* Creates a real "spend in the shop vs. hoard for
power" tension with the existing economy.

- **Avarice** 🪙 *(stat)* - +1% damage per 200 gold held (money = power). 🟡 (new
  `damage-per-gold` stat)
- **Tithe** ⛪ *(stat)* - spend 3 gold per auto-attack for +X flat damage. 🟡
- **Hoard** 💠 - +damage the more unspent crystals you carry. 🟡

---

## Transformative uniques (a rare tier)

Build-defining, 1-of effects - the catalogue's wished-for "unique gem tier".

- **Shaped Glass** 💎 - halve HP, double damage (see #1).
- **Deadeye** 🎯 - always crit, smaller multiplier (see #4).
- **Polyphemus** 👁️ - slow, huge, piercing auto-attack (see #5).
- **Brimstone** 🔆 - auto-attack becomes a beam hitting all enemies in a line,
  scaling with attack damage. Build-defining AoE conversion. 🔴

## Marquee emergent combos

The Isaac magic - where two or three gems do something neither does alone:

1. **Frost-lock detonation:** Frost Nova → Chilling → Contagion → Shatter.
2. **Brink:** Shaped Glass + Berserker + Bloodthirst (live on the edge; lifesteal
   saves you).
3. **Crit cascade:** Keen + Brutality + Lethal + Vault Strike + Mortal Wound.
</content>
</invoke>
