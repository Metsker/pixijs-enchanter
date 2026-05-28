# Enemies

Seven enemy types: three commons, three elites, one boss. Stats are placeholders for tuning; archetype shapes are locked.

## Stat columns
- **HP** — total health
- **Damage** — per attack
- **Type** — damage type (physical / fire / cold / lightning / chaos)
- **Interval** — seconds between attacks
- **% Resist** — flat % damage reduction (any type)
- **Dodge** — % chance to fully avoid incoming attacks
- **Loc** — grounded or flying (flying immune to Splash)

## Commons (groups of 1-3 per common room)

| Enemy | HP | Damage | Type | Interval | % Resist | Dodge | Loc | Notes |
|---|---|---|---|---|---|---|---|---|
| Skeleton | 800 | 400 | physical | 2.5s | 0% | 0% | grounded | Slow hard-hitter. Test of incoming-damage mitigation. |
| Goblin | 400 | 80 | physical | 0.7s | 0% | 10% | grounded | Fast chip-attacker. Stresses status-resist and dodge math (many rolls). |
| Slime | 1200 | 150 | chaos | 1.5s | 7% | 0% | grounded | Tanky, attacks apply Poison. Rewards chaos resist + Cleanse equivalents. |

## Elites (one per elite room, possibly escorted)

| Enemy | HP | Damage | Type | Interval | % Resist | Dodge | Loc | Notes |
|---|---|---|---|---|---|---|---|---|
| Harpy | 1500 | 250 | physical | 1.2s | 5% | 25% | flying | Dodgy; Splash builds whiff. Encourages Chain + single-target damage. |
| Ogre | 4000 | 600 | physical | 3.0s | 15% | 0% | grounded | HP wall + heavy slams. Tests sustained DPS. |
| Minotaur | 2500 | 300 | physical | 1.5s | 10% | 0% | grounded | Taunt: every 6s, locks Target onto Minotaur for 3s. Always escorted by 1-2 commons (Skeleton / Goblin / Slime rolled). |

## Boss

| Enemy | HP | Damage | Type | Interval | % Resist | Dodge | Loc | Notes |
|---|---|---|---|---|---|---|---|---|
| Lich | 12000 | 500 | chaos | 2.0s | 20% | 0% | grounded | Spawns 2 Skeleton adds when HP crosses 66% and 33% thresholds. Chaos attacks apply Poison stacks. |

## Encounter composition rules

- **Common room**: 1-3 commons, mixed freely.
- **Elite room (Harpy / Ogre)**: solo or with 0-1 common escort, rolled per spawn.
- **Elite room (Minotaur)**: ALWAYS escorted by 1-2 commons. The escort attacks the Player while Taunt forces Target onto Minotaur, creating the room's core tension.
- **Boss room**: Lich alone at start. Adds spawn instantly at HP thresholds; group cap is "1 Lich + up to 2 active Skeleton adds".

## Mechanics referenced
- **Taunt**: forces the Player's Target onto the taunter for the duration; click-override suppressed.
- **Splash / Chain**: anchored to current Target. Splash misses flying enemies; Chain hits any.
- **Phase spawn**: spawning fresh enemies into the active fight when boss HP crosses thresholds.
