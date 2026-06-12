/**
 * Table sounds, synthesized with WebAudio — no asset files, mixed quiet,
 * never slot-machine. Nothing plays before the first user interaction
 * (browser policy), and one persistent mute switch rules them all.
 */

let ctx: AudioContext | null = null;
let unlocked = false;

const MUTE_KEY = "uos-poker:muted";

export function isMuted(): boolean {
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setMuted(muted: boolean): void {
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

/** Call from any user gesture; safe to call repeatedly. */
export function unlockAudio(): void {
  if (unlocked) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    unlocked = true;
  } catch {
    /* no audio available */
  }
}

function withCtx(fn: (ctx: AudioContext) => void): void {
  if (isMuted() || !unlocked || !ctx || ctx.state !== "running") return;
  fn(ctx);
}

function blip(opts: {
  freq: number;
  endFreq?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}): void {
  withCtx((ctx) => {
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.endFreq) osc.frequency.exponentialRampToValueAtTime(opts.endFreq, t0 + opts.duration);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(opts.gain ?? 0.05, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + opts.duration + 0.02);
  });
}

/** Short filtered-noise burst — card slides and shuffles. */
function hiss(duration: number, gain = 0.03, delay = 0): void {
  withCtx((ctx) => {
    const t0 = ctx.currentTime + delay;
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 3200;
    filter.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t0);
  });
}

export const sounds = {
  cardSlide(): void {
    hiss(0.09, 0.025);
  },
  cardFlip(): void {
    hiss(0.05, 0.02);
    blip({ freq: 900, duration: 0.04, type: "triangle", gain: 0.02 });
  },
  /** Chip clinks scale with the amount — more chips, more clinks. */
  chips(amount: number): void {
    const clinks = Math.min(4, 1 + Math.floor(Math.log10(Math.max(10, amount)) - 1));
    for (let i = 0; i < clinks; i++) {
      blip({
        freq: 2400 + (i % 2) * 320,
        duration: 0.05,
        type: "triangle",
        gain: 0.028,
        delay: i * 0.055,
      });
    }
  },
  yourTurn(): void {
    blip({ freq: 660, duration: 0.12, gain: 0.045 });
    blip({ freq: 880, duration: 0.16, gain: 0.04, delay: 0.1 });
  },
  potWin(): void {
    blip({ freq: 392, duration: 0.25, gain: 0.04 });
    blip({ freq: 523, duration: 0.25, gain: 0.04, delay: 0.12 });
    blip({ freq: 659, duration: 0.35, gain: 0.045, delay: 0.24 });
  },
  timerTick(): void {
    blip({ freq: 1180, duration: 0.03, type: "square", gain: 0.012 });
  },
};
