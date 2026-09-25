import { STRIPS, type VoiceId } from '../machine/instruments';
import type { MachineState } from '../machine/pattern';
import type { UserSample } from './engine';
import { triggerVoice, type Chokes } from './voice';

/**
 * Schedules every sound of one step of the current pattern. Shared by the live
 * sequencer and by the offline render of the WAV export.
 */
export function scheduleStep(
  ctx: BaseAudioContext,
  destination: AudioNode,
  buffers: Map<string, AudioBuffer>,
  userSamples: Map<VoiceId, UserSample>,
  state: MachineState,
  variation: 'A' | 'B',
  stepIdx: number,
  time: number,
  chokes: Chokes,
): void {
  const rows = state.patterns[state.pattern][variation];
  const accented = rows.AC?.[stepIdx] === 1;
  const accentGain = accented ? 1 + (state.knobs.AC?.level ?? 0.5) * 1.2 : 1;

  for (const strip of STRIPS) {
    if (!strip.voices || rows[strip.id]?.[stepIdx] !== 1) continue;
    const voiceId = strip.voices[state.switches[strip.id] ?? 0];
    triggerVoice(ctx, destination, buffers, userSamples, voiceId, state.knobs[strip.id], time, { accentGain, chokes });
  }
}
