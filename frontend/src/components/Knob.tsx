import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

export type KnobSize = 's' | 'm' | 'l' | 'xl';

interface Props {
  label: string;
  value: number; // 0..1
  defaultValue?: number;
  size?: KnobSize;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const DOUBLE_TAP_MS = 300;

/**
 * Rotary knob: vertical drag (pointer captured — mouse, pen or finger), wheel,
 * double click / double tap to reset, and arrow keys when focused (ARIA slider).
 * Travel from -135° to +135°, like a real potentiometer.
 */
export function Knob({ label, value, defaultValue = 0.5, size = 'm', format = (v) => String(Math.round(v * 100)), onChange }: Props) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const lastTap = useRef(0);
  const [active, setActive] = useState(false);

  const set = (v: number) => {
    const next = clamp(v);
    if (next !== value) onChange(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const now = performance.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      set(defaultValue);
      return;
    }
    lastTap.current = now;
    drag.current = { y: e.clientY, v: value };
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    // Touch screens get a shorter throw: a thumb covers less ground than a mouse.
    const throw_ = e.pointerType === 'touch' ? 120 : 160;
    set(drag.current.v + (drag.current.y - e.clientY) / throw_);
  };

  const endDrag = () => {
    drag.current = null;
    setActive(false);
  };

  // The wheel listener must be non-passive to keep the page from scrolling under the
  // knob, which React's onWheel cannot do; it reads the latest value through a ref.
  const body = useRef<HTMLDivElement>(null);
  const latest = useRef({ value, set });
  useLayoutEffect(() => {
    latest.current = { value, set };
  });
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      latest.current.set(latest.current.value + (e.deltaY < 0 ? 0.03 : -0.03));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = ({ ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05 } as Record<string, number>)[e.key];
    if (delta !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      set(value + delta);
    }
  };

  const shown = format(value);
  return (
    <div className={`knob knob--${size}${active ? ' knob--active' : ''}`}>
      <div
        ref={body}
        className="knob__body"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={shown}
        title={`${label}: ${shown}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <div className="knob__cap" style={{ transform: `rotate(${-135 + value * 270}deg)` }}>
          <div className="knob__pointer" />
        </div>
      </div>
      <div className="knob__label">{active ? shown : label}</div>
    </div>
  );
}
