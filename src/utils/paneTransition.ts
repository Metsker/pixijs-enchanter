import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

// Rail pane enter / leave. Split into separate in: / out: transitions so each
// direction can be tuned independently and the leave's gap-closing margin never
// bleeds into an enter.

// ENTER: a soft pop - opacity + scale(0.96..1). Scale never exceeds 1, so the
// pane stays inside its own box and can't extend the rail's scrollable width
// (no stray horizontal scroll when the rail is already full - the 4th pane). The
// width never changes, so inner content never reflows.
export function paneEnter(
  _node: HTMLElement,
  { duration = 180 }: { duration?: number } = {},
): TransitionConfig {
  return {
    duration,
    easing: cubicOut,
    css: (t) => `opacity:${t}; transform: scale(${0.96 + t * 0.04});`,
  };
}

// LEAVE: fade + scale out, plus margin-right animating 0..-width. The pane's box
// stays full size (so its content never reflows), but its flex footprint
// collapses to zero, so the panes AFTER it slide left to close the gap (smooth,
// no snap) as it fades out in place beneath them. Closing the rightmost pane has
// nothing following it, so the margin is simply invisible there.
export function paneLeave(
  node: HTMLElement,
  { duration = 220 }: { duration?: number } = {},
): TransitionConfig {
  const width = node.getBoundingClientRect().width;
  return {
    duration,
    easing: cubicOut,
    // t: 1 -> 0 on leave; u = 1 - t.
    css: (t, u) =>
      `opacity:${t}; transform: scale(${0.96 + t * 0.04}); margin-right:${-u * width}px;`,
  };
}
