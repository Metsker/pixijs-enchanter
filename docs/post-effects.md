# Post-effects chain

A composited filter chain over the Battlefield (and other scenes where noted). Implemented with `pixi-filters` and applied as `container.filters = [...]` on the scene's root container.

## Default chain (battlefield, common / elite rooms)

`Vignette -> Filmgrain (Noise) -> Glow (AdvancedBloom) -> Chromatic separation (RGBSplit)`

Parameters (placeholders - tune at integration):
- Vignette: radius 0.8, opacity 0.5
- Noise (filmgrain): noise 0.15, seed per-frame
- AdvancedBloomFilter: threshold 0.6, bloomScale 1.0, brightness 1.0, blur 4
- RGBSplitFilter: red / green / blue offsets at ±1px (very subtle)

Rationale:
- **Vignette** focuses attention on the battlefield centre where the action is.
- **Filmgrain** hides flat-colour banding in emoji and vector shapes and adds grit.
- **Glow / bloom** makes elemental damage (fire, lightning) pop visually.
- **Chromatic separation** at low offset adds a haunted-CRT vibe fitting the Lich-themed run.

## Per-scene overrides

| Scene | Override |
|---|---|
| Boss fight (Lich) | Vignette opacity -> 0.7 (darker). Add `CRTFilter` at low scanline opacity. |
| Map screen | Disable bloom and filmgrain (clean UI readability). Keep vignette + chromatic separation. |
| Rest room | Vignette only. Calm, contemplative. |
| Shop | Default chain. |

Toggle per scene by mutating the filter chain on the scene container (`container.filters = [...]`) rather than rebuilding from scratch each time.

## Character-level filters (separate from scene chain)

Hit, status, and death effects sit on the individual character sprite, not the scene chain. One parameterised `Filter.from(...)` per effect family, reused across all characters:

- **Hit flash**: white tint pulse for ~80ms after taking damage.
- **Frozen**: blue tint + slowed shader-driven warp.
- **Burning**: orange shimmer overlay.
- **Shocked**: brief electric ripple distortion.
- **Poisoned**: green pulse on each tick of DoT.

## Skipped effects
- **Heavy CRT / scanlines** as default - too aggressive for general play; reserved for the boss room as flair.
- **Pixelate** - emoji sprites already have a distinct silhouette; pixelation fights it.
- **Heavy gaussian blur** - too expensive as a full-frame default.
- **Godsray, posterize** - flavour mismatch; revisit only if a specific room needs it.
