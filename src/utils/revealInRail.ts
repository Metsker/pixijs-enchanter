import type { Action } from 'svelte/action';
import { animateScrollLeft } from './railScroll';

// Scroll a freshly-mounted rail panel into view, so opening a panel reveals it -
// the "swipe to the new panel" effect when the rail overflows, and a no-op when
// it already fits. New panes append at the right end, so revealing the newest is
// simply scrolling to the rail's max. Driven by our own gentle eased glide (see
// railScroll) so the pane is still sliding in as its entry animation plays -
// rather than the browser's faster, variable smooth-scroll, which often revealed
// the pane only after its fade had already finished. Deferred a frame so the
// flex row has settled its layout first.
export const revealInRail: Action = (node) => {
  requestAnimationFrame(() => {
    const rail = node.parentElement as HTMLElement | null;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    if (max - rail.scrollLeft > 1) animateScrollLeft(rail, max);
  });
};
