# Support gems bind to the nearest effect gem to their right

_Part of the gems redesign (see [../gems.md](../gems.md)). Not yet implemented._

Gems split into **effect** gems (the payload) and **support** gems (modifiers). We need a deterministic rule for which effect a support modifies, and it has to make socket *order* the interesting decision.

Within a single Item, a support binds to the **nearest effect gem to its right**, skipping over any intervening support gems. A run of supports to the left of an effect therefore all bind to that one effect and apply left-to-right. A support with no effect gem to its right is **inert**. Binding never crosses Item boundaries.

We chose the directional "to the right" rule because it is Noita-faithful (a modifier card affects the spell after it), it makes ordering a real puzzle rather than a sort-supports-leftward chore, and the "stack a run of supports onto one effect" behaviour produces the satisfying single-monster-hit combo. Per-item binding keeps each Item a self-contained mini-wand and bounds combo complexity to one Item's capacity. Reversing it would require a different resolution pass and would invalidate the worked examples and the socket-ordering UI.

## Considered options
- **All effect gems to the right** - rejected: supports trivially want to be leftmost, so order barely matters.
- **Explicit link-groups (PoE)** - rejected for v1: needs link data on items plus a linking UI.
- **Both immediate neighbours** - rejected: order matters far less than adjacency.
- **Global cross-item board** - rejected: blurs item identity and makes the ordering UI complex.

## Consequences
- Item capacity caps combo depth (a 6-socket weapon stacks at most 5 supports onto 1 effect).
- A support's outcome depends on what it bound to; knob kinds that don't apply to the bound effect (e.g. a count knob on a stat gem) are simply inert.
