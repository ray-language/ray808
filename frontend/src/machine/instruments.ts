/**
 * The 16 voices and 12 channel strips of the TR-808.
 *
 * Michael Fischer's set samples each instrument at every knob position of the
 * hardware: the 00/10/25/50/75 axes are the potentiometer positions. Turning
 * TONE/DECAY/SNAPPY/TUNING picks the nearest real sample, as if the knob of the
 * original machine had been moved.
 */

export const AXIS_VALUES = [0, 0.1, 0.25, 0.5, 0.75];
export const AXIS_LABELS = ['00', '10', '25', '50', '75'];

export type KnobName = 'level' | 'tone' | 'decay' | 'snappy' | 'tuning';
export type Knobs = Partial<Record<KnobName, number>>;

type VoiceDef =
  | { name: string; kind: 'matrix'; folder: string; prefix: string; axes: [KnobName, KnobName]; choke?: string }
  | { name: string; kind: 'row'; folder: string; prefix: string; axes: [KnobName]; choke?: string }
  | { name: string; kind: 'single'; folder: string; file: string; choke?: string };

export const VOICES = {
  BD: { name: 'Bass Drum', kind: 'matrix', folder: '808bd', prefix: 'BD', axes: ['tone', 'decay'] },
  SD: { name: 'Snare Drum', kind: 'matrix', folder: '808sd', prefix: 'SD', axes: ['tone', 'snappy'] },
  LT: { name: 'Low Tom', kind: 'row', folder: '808lt', prefix: 'LT', axes: ['tuning'] },
  LC: { name: 'Low Conga', kind: 'row', folder: '808lc', prefix: 'LC', axes: ['tuning'] },
  MT: { name: 'Mid Tom', kind: 'row', folder: '808mt', prefix: 'MT', axes: ['tuning'] },
  MC: { name: 'Mid Conga', kind: 'row', folder: '808mc', prefix: 'MC', axes: ['tuning'] },
  HT: { name: 'Hi Tom', kind: 'row', folder: '808ht', prefix: 'HT', axes: ['tuning'] },
  HC: { name: 'Hi Conga', kind: 'row', folder: '808hc', prefix: 'HC', axes: ['tuning'] },
  RS: { name: 'Rim Shot', kind: 'single', folder: '808', file: 'RS.WAV' },
  CL: { name: 'Claves', kind: 'single', folder: '808', file: 'CL.WAV' },
  CP: { name: 'Hand Clap', kind: 'single', folder: '808', file: 'CP.WAV' },
  MA: { name: 'Maracas', kind: 'single', folder: '808', file: 'MA.WAV' },
  CB: { name: 'Cow Bell', kind: 'single', folder: '808', file: 'CB.WAV' },
  CY: { name: 'Cymbal', kind: 'matrix', folder: '808cy', prefix: 'CY', axes: ['tone', 'decay'] },
  OH: { name: 'Open Hihat', kind: 'row', folder: '808oh', prefix: 'OH', axes: ['decay'], choke: 'hat' },
  CH: { name: 'Closed Hihat', kind: 'single', folder: '808', file: 'CH.WAV', choke: 'hat' },
} satisfies Record<string, VoiceDef>;

export type VoiceId = keyof typeof VOICES;
export const VOICE_IDS = Object.keys(VOICES) as VoiceId[];

export function voiceDef(id: VoiceId): VoiceDef {
  return VOICES[id] as VoiceDef;
}

export type StripId = 'AC' | 'BD' | 'SD' | 'LT' | 'MT' | 'HT' | 'RS' | 'CP' | 'CB' | 'CY' | 'OH' | 'CH';

export interface Strip {
  id: StripId;
  plate: string;
  knobs: KnobName[];
  voices?: VoiceId[];
  switchLabels?: [string, string];
  accent?: boolean;
}

/**
 * The panel's channel strips, left to right as on the hardware. Strips with two
 * voices carry the physical switch (TOM/CONGA, RIM/CLAVES, CLAP/MARACAS). `AC` is
 * the accent channel: it is programmed per step but makes no sound; its knob sets
 * the strength of the global accent.
 */
export const STRIPS: Strip[] = [
  { id: 'AC', plate: 'AC CENT', knobs: ['level'], accent: true },
  { id: 'BD', plate: 'BASS DRUM', knobs: ['level', 'tone', 'decay'], voices: ['BD'] },
  { id: 'SD', plate: 'SNARE DRUM', knobs: ['level', 'tone', 'snappy'], voices: ['SD'] },
  { id: 'LT', plate: 'LOW TOM', knobs: ['level', 'tuning'], voices: ['LT', 'LC'], switchLabels: ['TOM', 'CONGA'] },
  { id: 'MT', plate: 'MID TOM', knobs: ['level', 'tuning'], voices: ['MT', 'MC'], switchLabels: ['TOM', 'CONGA'] },
  { id: 'HT', plate: 'HI TOM', knobs: ['level', 'tuning'], voices: ['HT', 'HC'], switchLabels: ['TOM', 'CONGA'] },
  { id: 'RS', plate: 'RIM SHOT', knobs: ['level'], voices: ['RS', 'CL'], switchLabels: ['RIM', 'CLAVES'] },
  { id: 'CP', plate: 'HAND CLAP', knobs: ['level'], voices: ['CP', 'MA'], switchLabels: ['CLAP', 'MARACAS'] },
  { id: 'CB', plate: 'COW BELL', knobs: ['level'], voices: ['CB'] },
  { id: 'CY', plate: 'CYMBAL', knobs: ['level', 'tone', 'decay'], voices: ['CY'] },
  { id: 'OH', plate: 'OPEN HIHAT', knobs: ['level', 'decay'], voices: ['OH'] },
  { id: 'CH', plate: 'CLSD HIHAT', knobs: ['level'], voices: ['CH'] },
];

export const ROW_IDS = STRIPS.map((s) => s.id);

export function stripById(id: StripId): Strip {
  return STRIPS.find((s) => s.id === id)!;
}

/** Index of the axis value nearest to a 0..1 knob. */
export function nearestAxisIndex(value: number): number {
  let best = 0;
  for (let i = 1; i < AXIS_VALUES.length; i++) {
    if (Math.abs(AXIS_VALUES[i] - value) < Math.abs(AXIS_VALUES[best] - value)) best = i;
  }
  return best;
}

/** Buffer key (= file name without extension) for a voice and its knobs. */
export function sampleKeyFor(voiceId: VoiceId, knobs: Knobs = {}): string {
  const def = voiceDef(voiceId);
  if (def.kind === 'single') return def.file.replace(/\.WAV$/i, '');
  const idx = (axis: KnobName) => AXIS_LABELS[nearestAxisIndex(knobs[axis] ?? 0.5)];
  if (def.kind === 'row') return `${def.prefix}${idx(def.axes[0])}`;
  return `${def.prefix}${idx(def.axes[0])}${idx(def.axes[1])}`;
}

export interface FactorySample {
  voiceId: VoiceId;
  key: string;
  url: string;
}

/** Every factory sample to preload. */
export function factorySampleList(baseUrl = ''): FactorySample[] {
  const list: FactorySample[] = [];
  for (const voiceId of VOICE_IDS) {
    const def = voiceDef(voiceId);
    if (def.kind === 'single') {
      list.push({ voiceId, key: def.file.replace(/\.WAV$/i, ''), url: `${baseUrl}samples/808/${def.folder}/${def.file}` });
    } else if (def.kind === 'row') {
      for (const a of AXIS_LABELS) {
        list.push({ voiceId, key: `${def.prefix}${a}`, url: `${baseUrl}samples/808/${def.folder}/${def.prefix}${a}.WAV` });
      }
    } else {
      for (const a of AXIS_LABELS) {
        for (const b of AXIS_LABELS) {
          list.push({ voiceId, key: `${def.prefix}${a}${b}`, url: `${baseUrl}samples/808/${def.folder}/${def.prefix}${a}${b}.WAV` });
        }
      }
    }
  }
  return list;
}
