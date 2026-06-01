// One shared, tunable smooth-scroll for the panel rail. We drive every rail
// scroll (revealing a freshly-opened pane, the step-arrows, clamping back as
// panes close) through this instead of the browser's `scrollTo`/`scrollIntoView`
// `behavior: 'smooth'`, whose speed varies by engine and - combined with CSS
// scroll-snapping - lands harshly and at an unpredictable moment. A fixed-
// duration cubic-out glide reads the same everywhere and is slow enough that a
// pane opening off-screen is still entering as its fade/scale plays, so the
// entry animation is always visible.

const active = new WeakMap<Element, number>();

const cubicOut = (t: number): number => 1 - Math.pow(1 - t, 3);

export function animateScrollLeft(el: HTMLElement, to: number, duration = 300): void {
  const prev = active.get(el);
  if (prev) cancelAnimationFrame(prev);

  const from = el.scrollLeft;
  const max = el.scrollWidth - el.clientWidth;
  const target = Math.max(0, Math.min(max, to));
  const dist = target - from;
  if (Math.abs(dist) < 1) {
    el.scrollLeft = target;
    return;
  }

  // rAF's high-res timestamp drives the easing - no wall-clock needed.
  let start: number | null = null;
  const step = (ts: number): void => {
    if (start === null) start = ts;
    const t = Math.min(1, (ts - start) / duration);
    el.scrollLeft = from + dist * cubicOut(t);
    if (t < 1) active.set(el, requestAnimationFrame(step));
    else active.delete(el);
  };
  active.set(el, requestAnimationFrame(step));
}
