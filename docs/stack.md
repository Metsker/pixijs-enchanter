# Stack

## Runtime
- **PixiJS v8** - Battlefield region only (Player, Enemies, particles, post-fx).
- **Svelte 5 + TypeScript** - UI panels (Inspector, Workbench, Backpack, Top bar, Inventory column, Map, Shop).
- **Vite** - bundler and dev server.
- **Noto Color Emoji** - bundled font (`public/fonts/`), used by both DOM CSS and Pixi `TextStyle`. Single source of truth for every icon and character glyph.

## Why this split

DOM for text-dense UI gets free text reflow, hover, focus, accessibility, scrollbars, and native touch input. Pixi for the Battlefield gets per-frame combat ticks, particles, and shader filters. Shared Svelte stores are the single source of truth - both DOM components and Pixi scene code subscribe to them.

## Libraries
- **pixi-filters** - post-fx chain (see `docs/post-effects.md`).
- **GSAP (free tier)** - one-off tweens (hit flash, death scale-out, panel slide-ins). Use the Pixi ticker for per-frame game logic, not GSAP.
- **Custom `Filter.from(...)`** - character-level shader effects (white hit-flash, frozen tint, burn shimmer, electrified ripple). Reuse one parameterised filter rather than one per status.

## Domain layer

Pure TypeScript with no Pixi or Svelte imports. Catalogues (`enchants.ts`, `enemies.ts`, `items.ts`), the attack-profile resolver, the fight tick, and map generation all live here. Easier to test, easier to swap the renderer later if needed.

## State
- Svelte 5 runes (`$state`, `$derived`) for component-local state.
- Module-level Svelte stores for cross-cutting state: `run`, `inventory`, `topbar`, `currentRoom`, `fightClock`.

## Input

Single pointer-event layer. Pixi handles Battlefield clicks (`eventMode: 'static'`); DOM handles panel interactions. Hover behaviours have tap-and-hold equivalents on touch (see `docs/ux.md` § Input model). Tap targets >= 44×44px.

## Localization

All user-visible strings come from an i18n catalogue keyed by string ID, per `CONTEXT.md` § Strings. English is the only locale populated; structure supports adding more without code changes.

## Mobile

Layout reflows from 1920×1080 desktop down to ~375px portrait. Inventory column collapses into a bottom dock; Backpack opens as a full-screen sheet. Battlefield scales to fit the area between Top bar and Inventory dock. All hover-driven UX has tap-and-hold equivalents.

## Deferred
- Audio (`@pixi/sound` or Howler)
- Save / load (localStorage snapshot per state mutation)
- Skeletal animation library - not needed (emoji + tweens + shaders covers it)
