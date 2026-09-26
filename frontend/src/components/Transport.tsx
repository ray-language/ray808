import type { MouseEvent, PointerEvent } from 'react';
import { NUM_PATTERNS, type VariationMode } from '../machine/pattern';
import { knobToTempo, tempoToKnob } from '../machine/tempo';
import { Knob } from './Knob';

interface TempoProps {
  tempo: number;
  fine: number; // -5..+5 BPM
  swing: number;
  volume: number;
  onTempo: (bpm: number) => void;
  onFine: (delta: number) => void;
  onSwing: (v: number) => void;
  onVolume: (v: number) => void;
}

/** The big TEMPO knob with its FINE crown, SWING and MASTER volume. */
export function TempoSection({ tempo, fine, swing, volume, onTempo, onFine, onSwing, onVolume }: TempoProps) {
  return (
    <div className="tempo-section">
      <div className="transport__tempo">
        <Knob
          label="TEMPO"
          size="xl"
          value={tempoToKnob(tempo)}
          defaultValue={tempoToKnob(120)}
          format={(v) => `${Math.round(knobToTempo(v))} BPM`}
          onChange={(v) => onTempo(knobToTempo(v))}
        />
        <Knob
          label="FINE"
          size="s"
          value={fine / 10 + 0.5}
          format={(v) => `${((v - 0.5) * 10).toFixed(1)} BPM`}
          onChange={(v) => onFine((v - 0.5) * 10)}
        />
      </div>
      <div className="transport__minor">
        <Knob label="SWING" value={swing} defaultValue={0} onChange={onSwing} />
        <Knob label="MASTER" value={volume} defaultValue={0.8} onChange={onVolume} />
      </div>
    </div>
  );
}

interface PatternProps {
  pattern: number;
  variationMode: VariationMode;
  copyArmed: boolean;
  onVariation: (mode: VariationMode) => void;
  onPattern: (i: number) => void;
  onClear: () => void;
  onCopy: () => void;
}

/** BASIC VARIATION (A / AB / B), the 16 pattern memories, CLEAR and COPY. */
export function PatternSection({ pattern, variationMode, copyArmed, onVariation, onPattern, onClear, onCopy }: PatternProps) {
  return (
    <div className="pattern-section">
      <div className="variation">
        <div className="section-label">BASIC VARIATION</div>
        <div className="variation__row">
          {(['A', 'AB', 'B'] as VariationMode[]).map((mode) => (
            <button
              key={mode}
              className={`variation__btn${mode === variationMode ? ' variation__btn--on' : ''}`}
              aria-pressed={mode === variationMode}
              onClick={() => onVariation(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      <div className="patterns">
        <div className="section-label">PATTERN</div>
        <div className={`patterns__grid${copyArmed ? ' patterns__grid--copy' : ''}`}>
          {Array.from({ length: NUM_PATTERNS }, (_, i) => (
            <button
              key={i}
              className={`patterns__btn${i === pattern ? ' patterns__btn--on' : ''}`}
              aria-pressed={i === pattern}
              onClick={() => onPattern(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="patterns__ops">
          <button className="mini-btn" onClick={onClear}>
            CLEAR
          </button>
          <button className={`mini-btn${copyArmed ? ' mini-btn--armed' : ''}`} onClick={onCopy}>
            COPY
          </button>
        </div>
      </div>
    </div>
  );
}

interface RunProps {
  playing: boolean;
  onStartStop: () => void;
  onTap: () => void;
}

/** START/STOP and TAP tempo. */
export function RunButtons({ playing, onStartStop, onTap }: RunProps) {
  return (
    <div className="transport__run">
      <button className={`start-btn${playing ? ' start-btn--on' : ''}`} aria-pressed={playing} {...pressHandlers(onStartStop)}>
        <span className="start-btn__led" />
        START
        <br />
        STOP
      </button>
      <button className="tap-btn" {...pressHandlers(onTap)}>
        TAP
      </button>
    </div>
  );
}

/**
 * Acts on press, not on release: START and TAP are timing controls (a click fires only
 * when the finger lifts, and a mobile webview may drop it altogether). A keyboard press
 * (Enter/Space) still arrives as a click with `detail === 0`.
 */
function pressHandlers(action: () => void) {
  return {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      action();
    },
    onClick: (e: MouseEvent<HTMLButtonElement>) => {
      if (e.detail === 0) action();
    },
  };
}
