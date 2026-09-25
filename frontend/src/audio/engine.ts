import { factorySampleList, type VoiceId } from '../machine/instruments';

export interface MasterChain {
  input: GainNode;
}

export interface UserSample {
  name: string;
  buffer: AudioBuffer;
}

/**
 * Audio core: the AudioContext, the master chain and the AudioBuffer cache. The
 * context is created lazily: browsers and mobile webviews only let it sound after a
 * user gesture, so `ensureContext` is called from the first tap/click/key.
 */
export class Engine {
  ctx: AudioContext | null = null;
  master: MasterChain | null = null;
  /** Factory buffers, keyed by file name without .WAV. */
  buffers = new Map<string, AudioBuffer>();
  /** User samples per voice. */
  userSamples = new Map<VoiceId, UserSample>();
  volume = 0.8;

  ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.buildMasterChain(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Builds the master chain (gain + gentle bus compressor) on any context. */
  buildMasterChain(ctx: BaseAudioContext): MasterChain {
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    gain.connect(comp);
    // Web Audio's compressor applies automatic makeup gain: trim so it does not clip.
    const trim = ctx.createGain();
    trim.gain.value = 0.72;
    comp.connect(trim);
    trim.connect(ctx.destination);
    return { input: gain };
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx) this.master.input.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  private decoder(): BaseAudioContext {
    // decodeAudioData works on a silent offline context before any gesture.
    return this.ctx ?? new OfflineAudioContext(1, 1, 44100);
  }

  /** Preloads every factory sample, reporting progress. */
  async loadFactorySamples(onProgress: (done: number, total: number) => void = () => {}) {
    const ctx = this.decoder();
    const list = factorySampleList(import.meta.env.BASE_URL);
    let done = 0;
    const failed: string[] = [];
    const queue = [...list];
    const CONCURRENCY = 12;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          try {
            const res = await fetch(item.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.buffers.set(item.key, await ctx.decodeAudioData(await res.arrayBuffer()));
          } catch {
            failed.push(item.key);
          }
          onProgress(++done, list.length);
        }
      }),
    );
    return { total: list.length, failed };
  }

  /** Decodes and registers a user sample for a voice (throws if it is not audio). */
  async setUserSample(voiceId: VoiceId, name: string, data: ArrayBuffer): Promise<void> {
    const buffer = await this.decoder().decodeAudioData(data.slice(0));
    this.userSamples.set(voiceId, { name, buffer });
  }

  clearUserSample(voiceId: VoiceId): void {
    this.userSamples.delete(voiceId);
  }
}

export const engine = new Engine();
