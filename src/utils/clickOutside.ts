interface ClickOutsideOptions {
  onOutside: () => void;
  ignoreSelectors?: string[];
}

// Svelte action: fires `onOutside` when a click lands outside `node` AND does
// NOT hit any of `ignoreSelectors`. Inspector uses this with the tile-source
// selector so clicking a different item switches the subject rather than
// closing-then-reopening (per CONTEXT.md § Inspector).
export function clickOutside(node: HTMLElement, options: ClickOutsideOptions) {
  let current = options;

  function handle(event: Event): void {
    const target = event.target as Node | null;
    if (!target || node.contains(target)) return;

    if (current.ignoreSelectors && target instanceof Element) {
      for (const sel of current.ignoreSelectors) {
        if (target.closest(sel)) return;
      }
    }

    current.onOutside();
  }

  document.addEventListener('click', handle, true);

  return {
    update(next: ClickOutsideOptions) {
      current = next;
    },
    destroy() {
      document.removeEventListener('click', handle, true);
    },
  };
}
