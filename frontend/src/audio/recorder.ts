import { NUM_STEPS, variationForBar, type MachineState } from '../machine/pattern';
import type { Engine } from './engine';
import { scheduleStep } from './playback';
import type { Chokes } from './voice';

/**
 * Renders the current pattern to WAV (16-bit PCM stereo, 44.1 kHz) with an
 * OfflineAudioContext: the same engine, faster than real time. In AB mode it
 * renders two bars (A then B); otherwise one.
 */
export async function renderPatternToWav(engine: Engine, state: MachineState): Promise<Blob> {
  const SR = 44100;
  const stepDur = 60 / state.tempo / 4;
  const bars = state.variationMode === 'AB' ? 2 : 1;
  const tail = 1.6;
  const duration = bars * NUM_STEPS * stepDur + tail;

  const ctx = new OfflineAudioContext(2, Math.ceil(SR * duration), SR);
  const master = engine.buildMasterChain(ctx);
  const chokes: Chokes = {};

  for (let bar = 0; bar < bars; bar++) {
    const variation = variationForBar(state.variationMode, bar);
    for (let s = 0; s < NUM_STEPS; s++) {
      const swingDelay = s % 2 === 1 ? state.swing * stepDur * (2 / 3) : 0;
      const time = (bar * NUM_STEPS + s) * stepDur + swingDelay + 0.02;
      scheduleStep(ctx, master.input, engine.buffers, engine.userSamples, state, variation, s, time, chokes);
    }
  }

  return encodeWav(await ctx.startRendering());
}

/** AudioBuffer → WAV Blob (RIFF, PCM 16-bit little-endian). */
export function encodeWav(audioBuffer: AudioBuffer): Blob {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const frames = audioBuffer.length;
  const bytesPerFrame = channels * 2;
  const dataSize = frames * bytesPerFrame;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const chans = Array.from({ length: channels }, (_, c) => audioBuffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
