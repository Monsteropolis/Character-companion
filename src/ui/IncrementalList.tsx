import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './primitives';

/**
 * A long list that renders in slices.
 *
 * The spell catalogue is 319 entries and the equipment catalogue 237. Rendering all of them puts
 * a few thousand nodes on the page, which a phone feels as a stalled tap. This renders a first
 * slice and grows as the reader approaches the end.
 *
 * Deliberately not a virtualiser: these cards expand in place when tapped, and windowing by
 * absolute position fights variable heights. Slicing gets the same first-paint win with none of
 * the measurement bugs, and everything already rendered stays in the DOM -- so browser find,
 * screen-reader browse mode and Cmd+F still work on what you have scrolled through.
 */
export function IncrementalList<T>({
  items,
  renderItem,
  keyFor,
  initial = 24,
  step = 24,
  noun = 'items',
}: {
  items: T[];
  renderItem: (item: T) => ReactNode;
  keyFor: (item: T) => string;
  initial?: number;
  step?: number;
  /** Plural noun for the count line, e.g. "spells". */
  noun?: string;
}) {
  const [limit, setLimit] = useState(initial);
  const sentinel = useRef<HTMLDivElement>(null);

  // A new filter or search means a new list: start from the top again rather than keeping a
  // limit the reader grew for a different set of results.
  const signature = items.length > 0 ? `${items.length}:${keyFor(items[0]!)}` : '0';
  useEffect(() => setLimit(initial), [signature, initial]);

  const shown = Math.min(limit, items.length);
  const remaining = items.length - shown;

  useEffect(() => {
    const node = sentinel.current;
    // No IntersectionObserver (or no sentinel, because everything fits): the button still works.
    if (!node || remaining === 0 || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((current) => current + step);
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [remaining, step]);

  return (
    <>
      <ul className="space-y-2">
        {items.slice(0, shown).map((item) => (
          <li key={keyFor(item)}>{renderItem(item)}</li>
        ))}
      </ul>

      {remaining > 0 ? (
        <div ref={sentinel} className="mt-3 flex flex-col items-center gap-2">
          <p role="status" className="text-xs text-[var(--text-muted)]">
            Showing {shown} of {items.length} {noun}.
          </p>
          {/* Scrolling grows the list on its own; the button is the keyboard and no-JS-observer
              path, and a reader who wants everything at once. */}
          <Button variant="secondary" onClick={() => setLimit((current) => current + step)}>
            Show {Math.min(step, remaining)} more
          </Button>
        </div>
      ) : null}
    </>
  );
}
