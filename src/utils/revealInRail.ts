import type { Action } from 'svelte/action';

// Scroll a freshly-mounted rail panel into view, so opening a panel (Item /
// Gem / bag) reveals it - the "swipe to the new panel" effect on narrow
// screens, and a no-op on wide screens where it is already visible. Runs once
// on mount, deferred a frame so the flex row has settled its layout first.
export const revealInRail: Action = (node) => {
  requestAnimationFrame(() => {
    node.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  });
};
