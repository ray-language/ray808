/**
 * Look-ahead sequencer on the AudioContext clock (Chris Wilson's "A Tale of Two
 * Clocks"): a cheap interval wakes every LOOKAHEAD_MS and schedules, with sample
 * accuracy, every step that falls inside the horizon.
 */
const LOOKAHEAD_MS = 25;
const HORIZON_S = 0.12;
const MAX_DRAW_QUEUE = 512; // cap so the queue cannot grow without bound

export interface DrawStep {
  step: number;
  time: number;
}

export class Scheduler {
  tempo = 120;
  swing = 0; // 0..1 → delays the even sixteenths up to a triplet
  playing = false;
  private step = 0; // global sixteenth counter since START
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Schedules the sounds of a step: (global step, time). */
  onStep: (step: number, time: number) => void = () => {};
  /** Steps already scheduled, so the UI lights the LED on time (rAF). */
  private drawQueue: DrawStep[] = [];

  private getCtx: () => AudioContext;

  constructor(getCtx: () => AudioContext) {
    this.getCtx = getCtx;
  }

  get stepDuration(): number {
    return 60 / this.tempo / 4;
  }

  start(): void {
    if (this.playing) return;
    const ctx = this.getCtx();
    this.playing = true;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.tick(), LOOKAHEAD_MS);
    this.tick();
  }

  stop(): void {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.drawQueue.length = 0;
  }

  private tick(): void {
    const ctx = this.getCtx();
    while (this.nextTime < ctx.currentTime + HORIZON_S) {
      const swingDelay = this.step % 2 === 1 ? this.swing * this.stepDuration * (2 / 3) : 0;
      const time = this.nextTime + swingDelay;
      this.onStep(this.step, time);
      if (this.drawQueue.length < MAX_DRAW_QUEUE) this.drawQueue.push({ step: this.step, time });
      this.nextTime += this.stepDuration;
      this.step++;
    }
  }

  /** The last step whose instant has already sounded, or null. Consume from rAF. */
  currentDrawStep(): DrawStep | null {
    const ctx = this.getCtx();
    let current: DrawStep | null = null;
    while (this.drawQueue.length && this.drawQueue[0].time <= ctx.currentTime) {
      current = this.drawQueue.shift()!;
    }
    return current;
  }
}
