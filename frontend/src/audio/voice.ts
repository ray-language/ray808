import { AXIS_VALUES, nearestAxisIndex, sampleKeyFor, voiceDef, type Knobs, type VoiceId } from '../machine/instruments';
import type { UserSample } from './engine';

export interface Playing {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Choke groups (CH/OH cut each other off: they share a circuit on the hardware). */
export type Chokes = Record<string, Playing | undefined>;

/**
 * Fires one voice. Pure with respect to the context: it serves both the live
 * AudioContext and the OfflineAudioContext of the WAV export.
 *
 * - Factory samples: TONE/DECAY/SNAPPY pick the real sample from the matrix
 *   (detented at 5 positions, as the set was sampled). TUNING also adds a
 *   continuous fine tune between the sampled points.
 * - User samples: the knobs degrade to processing: tone→low-pass,
 *   snappy→high-pass, decay→envelope, tuning→playbackRate.
 */
export function triggerVoice(
  ctx: BaseAudioContext,
  destination: AudioNode,
  buffers: Map<string, AudioBuffer>,
  userSamples: Map<VoiceId, UserSample>,
  voiceId: VoiceId,
  knobs: Knobs,
  time: number,
  { accentGain = 1, chokes = null as Chokes | null } = {},
): Playing | undefined {
  const def = voiceDef(voiceId);
  const user = userSamples.get(voiceId);
  const buffer = user ? user.buffer : buffers.get(sampleKeyFor(voiceId, knobs));
  if (!buffer) return undefined;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  const level = (knobs.level ?? 0.8) ** 2 * accentGain;
  gain.gain.setValueAtTime(level, time);

  let head: AudioNode = source;

  if (user) {
    if (knobs.tuning !== undefined) source.playbackRate.value = 2 ** ((knobs.tuning - 0.5) * 2);
    if (knobs.tone !== undefined) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 200 * (12000 / 200) ** knobs.tone;
      head.connect(lp);
      head = lp;
    }
    if (knobs.snappy !== undefined) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 20 * (2000 / 20) ** knobs.snappy;
      head.connect(hp);
      head = hp;
    }
    if (knobs.decay !== undefined) {
      const dur = 0.06 * (2.5 / 0.06) ** knobs.decay;
      gain.gain.setValueAtTime(level, time + dur * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      source.stop(time + dur + 0.05);
    }
  } else if (knobs.tuning !== undefined) {
    // Continuous fine tune between the 5 sampled points of the row.
    const frac = knobs.tuning - AXIS_VALUES[nearestAxisIndex(knobs.tuning)];
    source.playbackRate.value = 2 ** (frac * 0.9);
  }

  head.connect(gain);
  gain.connect(destination);

  // Choke group: starting a voice of the group silences the previous one at `time`.
  if (def.choke && chokes) {
    const prev = chokes[def.choke];
    if (prev) {
      prev.gain.gain.setTargetAtTime(0, time, 0.008);
      try {
        prev.source.stop(time + 0.06);
      } catch {
        /* already stopped */
      }
    }
    chokes[def.choke] = { source, gain };
  }

  source.start(time);
  return { source, gain };
}
