import { ROW_IDS, STRIPS, type Knobs, type StripId } from './instruments';

export const NUM_PATTERNS = 16;
export const NUM_STEPS = 16;

export type Row = number[];
export type Variation = Record<StripId, Row>;
export interface Pattern {
  A: Variation;
  B: Variation;
}
export type VariationMode = 'A' | 'AB' | 'B';

export interface MachineState {
  version: number;
  tempo: number;
  swing: number;
  volume: number;
  pattern: number; // selected slot 0..15
  variationMode: VariationMode;
  selected: StripId; // strip whose steps are being edited
  knobs: Record<StripId, Knobs>;
  switches: Partial<Record<StripId, number>>;
  patterns: Pattern[];
}

export function emptyVariation(): Variation {
  const rows = {} as Variation;
  for (const id of ROW_IDS) rows[id] = new Array(NUM_STEPS).fill(0);
  return rows;
}

export function emptyPattern(): Pattern {
  return { A: emptyVariation(), B: emptyVariation() };
}

export function defaultKnobs(): Record<StripId, Knobs> {
  const knobs = {} as Record<StripId, Knobs>;
  for (const strip of STRIPS) {
    knobs[strip.id] = {};
    for (const k of strip.knobs) knobs[strip.id][k] = k === 'level' ? 0.85 : 0.5;
  }
  return knobs;
}

export function defaultSwitches(): Partial<Record<StripId, number>> {
  const sw: Partial<Record<StripId, number>> = {};
  for (const strip of STRIPS) if (strip.voices?.length === 2) sw[strip.id] = 0;
  return sw;
}

/**
 * Demo pattern (slot 1): the classic four-on-the-floor with clap and hats, so the
 * machine grooves as soon as START is pressed.
 */
export function demoPattern(): Pattern {
  const p = emptyPattern();
  const on = (rows: Variation, id: StripId, steps: number[]) => steps.forEach((s) => (rows[id][s] = 1));
  on(p.A, 'BD', [0, 4, 8, 12]);
  on(p.A, 'SD', [4, 12]);
  on(p.A, 'CH', [0, 2, 4, 6, 8, 10, 12, 14]);
  on(p.A, 'OH', [2, 10]);
  on(p.A, 'AC', [0, 8]);
  on(p.B, 'BD', [0, 4, 8, 10, 12]);
  on(p.B, 'SD', [4, 12]);
  on(p.B, 'CP', [4, 12]);
  on(p.B, 'CH', [0, 2, 4, 6, 8, 10, 12, 14]);
  on(p.B, 'CB', [2, 7]);
  on(p.B, 'AC', [0, 8]);
  return p;
}

export function defaultState(): MachineState {
  const patterns = Array.from({ length: NUM_PATTERNS }, emptyPattern);
  patterns[0] = demoPattern();
  return {
    version: 1,
    tempo: 122,
    swing: 0,
    volume: 0.8,
    pattern: 0,
    variationMode: 'A',
    selected: 'BD',
    knobs: defaultKnobs(),
    switches: defaultSwitches(),
    patterns,
  };
}

/**
 * Defensive merge of a loaded state over the defaults: any field a newer version
 * added falls back to its default, and a malformed value is dropped.
 */
export function mergeState(loaded: unknown): MachineState {
  const base = defaultState();
  if (!loaded || typeof loaded !== 'object') return base;
  const s = loaded as Partial<MachineState>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    ...base,
    tempo: num(s.tempo, base.tempo),
    swing: num(s.swing, base.swing),
    volume: num(s.volume, base.volume),
    pattern: Math.min(NUM_PATTERNS - 1, Math.max(0, Math.floor(num(s.pattern, 0)))),
    variationMode: s.variationMode === 'B' || s.variationMode === 'AB' ? s.variationMode : 'A',
    selected: ROW_IDS.includes(s.selected as StripId) ? (s.selected as StripId) : base.selected,
    knobs: { ...base.knobs, ...(s.knobs ?? {}) },
    switches: { ...base.switches, ...(s.switches ?? {}) },
    patterns: Array.isArray(s.patterns) && s.patterns.length === NUM_PATTERNS ? s.patterns : base.patterns,
  };
}

/** Variation that plays in a given bar for the A / B / AB mode. */
export function variationForBar(mode: VariationMode, barIndex: number): 'A' | 'B' {
  if (mode === 'AB') return barIndex % 2 === 0 ? 'A' : 'B';
  return mode;
}

/** The variation the step buttons edit (AB edits A, like the hardware's first bar). */
export function editVariation(mode: VariationMode): 'A' | 'B' {
  return mode === 'B' ? 'B' : 'A';
}
