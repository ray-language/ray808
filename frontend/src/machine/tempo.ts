export const TEMPO_MIN = 30;
export const TEMPO_MAX = 300;

/** The TEMPO knob's 0..1 position for a BPM, and back. */
export const tempoToKnob = (bpm: number) => (bpm - TEMPO_MIN) / (TEMPO_MAX - TEMPO_MIN);
export const knobToTempo = (v: number) => TEMPO_MIN + v * (TEMPO_MAX - TEMPO_MIN);
