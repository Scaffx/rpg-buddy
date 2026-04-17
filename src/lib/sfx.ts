// Lightweight Web Audio API SFX engine for combat & UI feedback.
// Sounds are synthesized procedurally so we don't need any audio assets.

const STORAGE_KEY = 'lifeonrpg-sfx-muted';
const MUTE_EVENT = 'lifeonrpg-sfx-mute-changed';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctor) return null;
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = isMuted() ? 0 : 0.6;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

export function setMuted(muted: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  if (masterGain && ctx) {
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.05);
  }
  window.dispatchEvent(new CustomEvent(MUTE_EVENT, { detail: { muted } }));
}

export function toggleMute(): boolean {
  const next = !isMuted();
  setMuted(next);
  return next;
}

export function subscribeMute(listener: (muted: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ muted: boolean }>).detail;
    listener(!!detail?.muted);
  };
  window.addEventListener(MUTE_EVENT, handler as EventListener);
  return () => window.removeEventListener(MUTE_EVENT, handler as EventListener);
}

type EnvelopeOptions = {
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  peak?: number;
};

function playTone(opts: {
  freqStart: number;
  freqEnd?: number;
  duration: number;
  type?: OscillatorType;
  envelope?: EnvelopeOptions;
  delay?: number;
  detune?: number;
}) {
  const audio = ensureContext();
  if (!audio || !masterGain) return;
  const now = audio.currentTime + (opts.delay ?? 0);
  const osc = audio.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freqStart, now);
  if (opts.freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), now + opts.duration);
  }
  if (opts.detune) osc.detune.setValueAtTime(opts.detune, now);

  const gain = audio.createGain();
  const peak = opts.envelope?.peak ?? 0.4;
  const attack = opts.envelope?.attack ?? 0.005;
  const decay = opts.envelope?.decay ?? 0.05;
  const sustain = opts.envelope?.sustain ?? 0.0;
  const release = opts.envelope?.release ?? 0.08;

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + attack);
  gain.gain.linearRampToValueAtTime(peak * sustain, now + attack + decay);
  gain.gain.linearRampToValueAtTime(0, now + opts.duration + release);

  osc.connect(gain).connect(masterGain);
  osc.start(now);
  osc.stop(now + opts.duration + release + 0.05);
}

function playNoiseBurst(opts: { duration: number; peak?: number; filterFreq?: number; delay?: number }) {
  const audio = ensureContext();
  if (!audio || !masterGain) return;
  const now = audio.currentTime + (opts.delay ?? 0);
  const bufferSize = Math.max(1, Math.floor(audio.sampleRate * opts.duration));
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = audio.createBufferSource();
  noise.buffer = buffer;

  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = opts.filterFreq ?? 1200;
  filter.Q.value = 0.8;

  const gain = audio.createGain();
  const peak = opts.peak ?? 0.3;
  gain.gain.setValueAtTime(peak, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + opts.duration);

  noise.connect(filter).connect(gain).connect(masterGain);
  noise.start(now);
  noise.stop(now + opts.duration + 0.05);
}

export const sfx = {
  slash() {
    playNoiseBurst({ duration: 0.18, peak: 0.35, filterFreq: 3200 });
    playTone({ freqStart: 900, freqEnd: 200, duration: 0.16, type: 'sawtooth', envelope: { peak: 0.18, attack: 0.003, release: 0.04 } });
  },
  hit() {
    playTone({ freqStart: 180, freqEnd: 60, duration: 0.18, type: 'square', envelope: { peak: 0.38, attack: 0.002, release: 0.08 } });
    playNoiseBurst({ duration: 0.12, peak: 0.22, filterFreq: 600 });
  },
  crit() {
    playTone({ freqStart: 320, freqEnd: 90, duration: 0.22, type: 'sawtooth', envelope: { peak: 0.45, attack: 0.002, release: 0.1 } });
    playNoiseBurst({ duration: 0.25, peak: 0.35, filterFreq: 2400 });
    playTone({ freqStart: 1400, freqEnd: 700, duration: 0.18, type: 'triangle', envelope: { peak: 0.3, attack: 0.002, release: 0.1 }, delay: 0.05 });
  },
  diceRoll() {
    for (let i = 0; i < 5; i++) {
      playNoiseBurst({ duration: 0.04, peak: 0.18, filterFreq: 2200 + Math.random() * 800, delay: i * 0.06 });
    }
  },
  victory() {
    // Triumphant fanfare: C - E - G - C
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      playTone({ freqStart: freq, duration: 0.28, type: 'triangle', envelope: { peak: 0.32, attack: 0.005, release: 0.18 }, delay: i * 0.14 });
      playTone({ freqStart: freq / 2, duration: 0.28, type: 'sine', envelope: { peak: 0.18, attack: 0.005, release: 0.18 }, delay: i * 0.14 });
    });
    playTone({ freqStart: 1046.5, duration: 0.85, type: 'triangle', envelope: { peak: 0.4, attack: 0.01, release: 0.5 }, delay: 0.6 });
  },
  defeat() {
    // Descending dirge
    const notes = [392, 311, 261, 196];
    notes.forEach((freq, i) => {
      playTone({ freqStart: freq, freqEnd: freq * 0.92, duration: 0.5, type: 'sawtooth', envelope: { peak: 0.32, attack: 0.02, release: 0.25 }, delay: i * 0.25 });
    });
    playNoiseBurst({ duration: 1.4, peak: 0.18, filterFreq: 200, delay: 0.3 });
  },
  levelUp() {
    // Ascending arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      playTone({ freqStart: freq, duration: 0.18, type: 'triangle', envelope: { peak: 0.35, attack: 0.003, release: 0.12 }, delay: i * 0.08 });
    });
    playTone({ freqStart: 1568, duration: 0.9, type: 'triangle', envelope: { peak: 0.4, attack: 0.01, release: 0.6 }, delay: 0.5 });
    playNoiseBurst({ duration: 0.4, peak: 0.18, filterFreq: 4500, delay: 0.45 });
  },
};
