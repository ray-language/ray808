import { useCallback, useEffect, useRef, useState, type RefObject, type UIEvent } from 'react';

/** Distance a swipe must travel in one direction before the header changes. */
const THRESHOLD = 12;

/**
 * The phone header's compact mode, driven by <main>'s scroll.
 *
 * The header floats over <main> (it does not push it), and <main> reserves the FULL
 * header's height at its top: resizing the header never moves the content, it only
 * uncovers or covers what lies beneath. The header compacts on a swipe up only once the
 * content has scrolled up to the compact header's edge (scrollTop ≥ full − compact
 * height), so no gap ever opens above the content; below that point it is always full.
 * A swipe down restores it.
 *
 * It also publishes the full header's height as `--header-h` on `root` (the padding
 * <main> reserves), measured while the header is full.
 */
export function useCompactOnScroll(
  header: RefObject<HTMLElement | null>,
  root: RefObject<HTMLElement | null>,
  /** Whether the phone header is mounted (it is not while the app boots, or on desktop). */
  mounted: boolean,
) {
  const [compact, setCompact] = useState(false);
  const last = useRef(0);
  const travel = useRef(0);
  // full = 0 until measured; compact defaults to the CSS's compact size.
  const heights = useRef({ full: 0, compact: 48 });

  useEffect(() => {
    const el = header.current;
    if (!mounted || !el) return;
    const publish = (h: number) => {
      heights.current.full = h;
      root.current?.style.setProperty('--header-h', `${Math.round(h)}px`);
    };
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      if (el.classList.contains('phone-header--compact')) {
        heights.current.compact = Math.min(heights.current.compact, h);
      } else if (h > heights.current.full) {
        // Only ever grows: while the header animates back from compact it passes through
        // smaller heights, and following them would move the content.
        publish(h);
      }
    });
    ro.observe(el);
    // A rotation or a resize may legitimately change the full height: measure afresh.
    const onResize = () => {
      if (!el.classList.contains('phone-header--compact')) publish(el.getBoundingClientRect().height);
    };
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [header, root, mounted]);

  const onScroll = useCallback(
    (e: UIEvent<HTMLElement>) => {
      const top = e.currentTarget.scrollTop;
      const delta = top - last.current;
      last.current = top;
      const collapseAt = Math.max(0, heights.current.full - heights.current.compact);

      if (top < collapseAt) {
        // The content has not reached the compact header's edge: compacting now would
        // open a gap above it.
        travel.current = 0;
        if (compact) setCompact(false);
        return;
      }
      // Accumulate travel in one direction; a change of direction starts over.
      travel.current = Math.sign(delta) === Math.sign(travel.current) ? travel.current + delta : delta;
      if (!compact && travel.current > THRESHOLD) {
        travel.current = 0;
        setCompact(true);
      } else if (compact && travel.current < -THRESHOLD) {
        travel.current = 0;
        setCompact(false);
      }
    },
    [compact],
  );

  return { compact, onScroll };
}
