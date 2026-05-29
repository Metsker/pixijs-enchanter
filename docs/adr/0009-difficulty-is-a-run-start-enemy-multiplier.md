# Difficulty is a global enemy-stat multiplier chosen at run start

_Part of the gems redesign (see [../gems.md](../gems.md)). Not yet implemented._

The game had no difficulty setting; enemies were a fixed roster that scaled only by floor. We add a player-chosen difficulty that scales enemy stats.

A persistent `settings` store holds `difficulty: 'easy' | 'normal' | 'hard'`. Difficulty applies a global multiplier to each enemy's **hp**, **damage**, **resist**, and **attack interval** when enemies are pre-rolled at map generation, and is **locked for the whole run** at run start. Settings persist across runs (a setting, not run state); the last-used difficulty is remembered. A Settings screen, reachable from the start screen, exposes the choice.

Placeholder multipliers:

| | hp | damage | resist | interval |
|---|---|---|---|---|
| Easy | ×0.75 | ×0.75 | ×0.5 | ×1.15 (slower) |
| Normal | ×1 | ×1 | ×1 | ×1 |
| Hard | ×1.4 | ×1.4 | ×1.5 | ×0.85 (faster) |

We chose global multipliers because they are the cheapest lever and cover exactly the stats the design cares about (hp, damage, armor, attack speed). Locking at run start keeps a run's difficulty coherent and prevents mid-run gaming. **Reward coupling** runs through gold and drop quality (harder -> more gold / higher-capacity, more pre-socketed items), **not** direct crystal drops, to stay consistent with ADR 0003 (enemies never drop crystals).

## Considered options
- **Per-floor difficulty selection** - rejected: a run with mixed difficulty has no coherent identity.
- **Scale rewards via crystal drops on harder modes** - rejected: violates ADR 0003's no-enemy-crystal-drops rule.
- **Bake difficulty permanently into the map seed** - rejected: difficulty is a replayable setting, not a one-off property of a saved run.

## Consequences
- Enemy pre-roll in map generation reads the locked difficulty multiplier.
- The save snapshot stores `settings` separately from run state so it survives `startNewRun()`.
