interface Props {
  tempo: number;
  pattern: number;
  variation: string;
  swing: number;
  message: string;
}

/** The machine's LED window: tempo, pattern, variation, swing and the last message. */
export function Display({ tempo, pattern, variation, swing, message }: Props) {
  return (
    <div className="display" aria-live="polite">
      <div className="display__row">
        <span className="display__bpm">{Math.round(tempo)}</span>
        <span className="display__unit">BPM</span>
      </div>
      <div className="display__row display__row--small">
        <span>PT {String(pattern + 1).padStart(2, '0')}</span>
        <span>{variation}</span>
        <span>{swing > 0.01 ? `SW ${Math.round(swing * 100)}` : ''}</span>
      </div>
      <div className="display__msg">{message}</div>
    </div>
  );
}
