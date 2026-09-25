import { useState, type DragEvent } from 'react';
import type { Knobs, KnobName, Strip } from '../machine/instruments';
import { Knob, type KnobSize } from './Knob';

interface Props {
  strip: Strip;
  knobs: Knobs;
  switchValue: number;
  selected: boolean;
  custom: boolean;
  /** 'column': a panel column (desktop); 'focus': the phone's editor for one instrument. */
  layout?: 'column' | 'focus';
  onKnob: (name: KnobName, v: number) => void;
  onSwitch: (v: number) => void;
  onSelect: () => void;
  onDropSample?: (file: File) => void;
}

/**
 * One instrument column: stacked knobs, the dual-voice switch (TOM/CONGA…), and the
 * silk-screened plate with its selection LED and CUSTOM badge. The plate selects the
 * instrument and plays it; the whole strip accepts a dropped audio file.
 */
export function ChannelStrip({ strip, knobs, switchValue, selected, custom, layout = 'column', onKnob, onSwitch, onSelect, onDropSample }: Props) {
  const [dropping, setDropping] = useState(false);
  const knobSize = (name: KnobName): KnobSize => (layout === 'focus' ? 'l' : name === 'level' ? 's' : 'm');

  const drop = onDropSample && strip.voices
    ? {
        onDragOver: (e: DragEvent) => {
          e.preventDefault();
          setDropping(true);
        },
        onDragLeave: () => setDropping(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDropping(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onDropSample(file);
        },
      }
    : {};

  const cls = ['strip', `strip--${layout}`];
  if (selected) cls.push('strip--selected');
  if (dropping) cls.push('strip--drop');

  return (
    <div className={cls.join(' ')} data-strip={strip.id} {...drop}>
      <div className="strip__knobs">
        {strip.knobs.map((name) => (
          <Knob
            key={name}
            label={name.toUpperCase()}
            value={knobs[name] ?? 0.5}
            defaultValue={name === 'level' ? 0.85 : 0.5}
            size={knobSize(name)}
            onChange={(v) => onKnob(name, v)}
          />
        ))}
      </div>
      {strip.switchLabels && (
        <button
          className="strip__switch"
          aria-label={`${strip.switchLabels[0]} / ${strip.switchLabels[1]}`}
          onClick={() => onSwitch(switchValue === 0 ? 1 : 0)}
        >
          <span className={switchValue === 0 ? 'on' : ''}>{strip.switchLabels[0]}</span>
          <span className={`strip__switch-lever${switchValue === 1 ? ' down' : ''}`} />
          <span className={switchValue === 1 ? 'on' : ''}>{strip.switchLabels[1]}</span>
        </button>
      )}
      {layout === 'column' && <Plate strip={strip} custom={custom} onSelect={onSelect} />}
    </div>
  );
}

/** The silk-screened name plate: tap to select and hear the instrument. */
export function Plate({ strip, custom, onSelect }: { strip: Strip; custom: boolean; onSelect: () => void }) {
  return (
    <button className="strip__plate" onClick={onSelect}>
      <span className="strip__led" />
      <span className="strip__name">{strip.plate}</span>
      {custom && <span className="strip__badge">CUSTOM</span>}
    </button>
  );
}
