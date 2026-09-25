import { NUM_STEPS, type Row } from '../machine/pattern';

/** The 808's colour groups: 1-4 red, 5-8 orange, 9-12 yellow, 13-16 cream. */
const GROUPS = ['red', 'orange', 'yellow', 'cream'];

interface Props {
  row: Row;
  running: number; // step being played, -1 when stopped
  onToggle: (step: number) => void;
}

/** The 16 step buttons with their LEDs, showing the selected instrument's row. */
export function StepButtons({ row, running, onToggle }: Props) {
  return (
    <div className="steps">
      {Array.from({ length: NUM_STEPS }, (_, i) => {
        const cls = ['step', `step--${GROUPS[Math.floor(i / 4)]}`];
        if (row[i] === 1) cls.push('step--on');
        if (i === running) cls.push('step--running');
        return (
          <div key={i} className={cls.join(' ')}>
            <div className="step__led" />
            <button
              className="step__btn"
              aria-label={`Step ${i + 1}`}
              aria-pressed={row[i] === 1}
              onPointerDown={(e) => {
                // Toggle on press, not on release: that is how the hardware feels, and it
                // keeps fast finger drumming on a phone from dropping taps.
                e.preventDefault();
                onToggle(i);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggle(i);
                }
              }}
            />
            <div className="step__num">{i + 1}</div>
          </div>
        );
      })}
    </div>
  );
}
