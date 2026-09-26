import { useCallback, useRef, useState, type UIEvent } from 'react';

/** Distance a swipe must travel in one direction before the header changes. */
const THRESHOLD = 12;
/** Near the top the header is always full size. */
const TOP_ZONE = 8;
/** How long the header takes to change size (keep in sync with phone.css). */
const TRANSITION_MS = 220;

/**
 * The phone header's compact mode, driven by the scroll direction of <main>: swiping the
 * content up (reading further down) compacts the header, swiping it down brings it back,
 * and at the top it is always full size.
 *
 * Changing the header's height resizes <main>. At the end of the page that makes the
 * browser clamp scrollTop, which looks like a scroll back up and would bounce the header
 * open and shut: scroll events are ignored while the header animates, and a scroll that
 * only follows the clamp at the bottom never expands it.
 */
export function useCompactOnScroll() {
  const [compact, setCompact] = useState(false);
  const last = useRef(0);
  const travel = useRef(0);
  const settleUntil = useRef(0);

  const toggle = useCallback((next: boolean) => {
    settleUntil.current = performance.now() + TRANSITION_MS + 60;
    travel.current = 0;
    setCompact(next);
  }, []);

  const onScroll = useCallback(
    (e: UIEvent<HTMLElement>) => {
      const el = e.currentTarget;
      const top = el.scrollTop;
      const delta = top - last.current;
      last.current = top;
      if (performance.now() < settleUntil.current) return;

      if (top <= TOP_ZONE) {
        if (compact) toggle(false);
        return;
      }
      const atBottom = top + el.clientHeight >= el.scrollHeight - 2;
      // Accumulate travel in one direction; a change of direction starts over.
      travel.current = Math.sign(delta) === Math.sign(travel.current) ? travel.current + delta : delta;
      if (!compact && travel.current > THRESHOLD) toggle(true);
      else if (compact && travel.current < -THRESHOLD && !atBottom) toggle(false);
    },
    [compact, toggle],
  );

  return { compact, onScroll };
}
