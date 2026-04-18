// Lightweight Web Audio API SFX engine for combat & UI feedback.
// Sounds are synthesized procedurally so we don't need any audio assets.

const STORAGE_KEY = 'lifeonrpg-sfx-muted';
const VOLUME_KEY = 'lifeonrpg-sfx-volume';
const MUTE_EVENT = 'lifeonrpg-sfx-mute-changed';
const VOLUME_EVENT = 'lifeonrpg-sfx-volume-changed';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let campfireAudioElement: HTMLAudioElement | null = null;
let levelupAudioElement: HTMLAudioElement | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctor) return null;
    ctx = new Ctor();
    masterGain = ctx.createGain();
    const volume = getVolume();
    const isMuted = window.localStorage.getItem(STORAGE_KEY) === '1';
    masterGain.gain.value = isMuted ? 0 : (volume / 100) * 0.6;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  const muted = window.localStorage.getItem(STORAGE_KEY) === '1';
  console.log(`[SFX] isMuted() = ${muted}`);
  return muted;
}

export function getVolume(): number {
  if (typeof window === 'undefined') return 100;
  const volume = parseInt(window.localStorage.getItem(VOLUME_KEY) || '100', 10);
  console.log(`[SFX] getVolume() = ${volume}`);
  return volume;
}

export function setVolume(volume: number) {
  if (typeof window === 'undefined') return;
  const clamped = Math.max(0, Math.min(100, volume));
  window.localStorage.setItem(VOLUME_KEY, String(clamped));
  if (masterGain && ctx) {
    const isMuted = window.localStorage.getItem(STORAGE_KEY) === '1';
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.setTargetAtTime(isMuted ? 0 : (clamped / 100) * 0.6, ctx.currentTime, 0.05);
  }
  window.dispatchEvent(new CustomEvent(VOLUME_EVENT, { detail: { volume: clamped } }));
}

export function setMuted(muted: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  if (masterGain && ctx) {
    const volume = getVolume();
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.setTargetAtTime(muted ? 0 : (volume / 100) * 0.6, ctx.currentTime, 0.05);
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

export function subscribeVolume(listener: (volume: number) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ volume: number }>).detail;
    listener(detail?.volume ?? 100);
  };
  window.addEventListener(VOLUME_EVENT, handler as EventListener);
  return () => window.removeEventListener(VOLUME_EVENT, handler as EventListener);
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
  click() {
    // Short, bright beep for UI clicks
    console.log('[SFX] click() called');
    playTone({ freqStart: 800, freqEnd: 600, duration: 0.08, type: 'sine', envelope: { peak: 0.25, attack: 0.001, release: 0.04 } });
  },
  campfire(durationSeconds?: number) {
    // Crackling fire sound for meditation/rest - uses real audio file
    console.log(`[SFX] campfire() called with duration: ${durationSeconds} seconds`);
    
    if (!durationSeconds) {
      // One-shot: play once and return
      if (typeof window === 'undefined') return 0;
      
      if (!campfireAudioElement) {
        campfireAudioElement = new Audio('/sounds/campfire.mp3');
        campfireAudioElement.volume = (getVolume() / 100) * 0.6;
      }
      campfireAudioElement.currentTime = 0;
      campfireAudioElement.play().catch(err => console.error('[SFX] Failed to play campfire:', err));
      return 0;
    }

    // Looping campfire sound for the specified duration
    if (typeof window === 'undefined') return 0;

    if (!campfireAudioElement) {
      campfireAudioElement = new Audio('/sounds/campfire.mp3');
    }

    // Set volume based on current settings
    const volume = getVolume();
    const isMuted = isMuted();
    campfireAudioElement.volume = isMuted ? 0 : (volume / 100) * 0.6;
    campfireAudioElement.loop = true;
    campfireAudioElement.currentTime = 0;

    console.log(`[SFX] Starting looped campfire for ${durationSeconds}s, volume: ${campfireAudioElement.volume}`);
    
    campfireAudioElement.play().catch(err => console.error('[SFX] Failed to play looped campfire:', err));

    const endTimeMs = Date.now() + durationSeconds * 1000;
    const intervalId = window.setInterval(() => {
      if (Date.now() >= endTimeMs) {
        console.log('[SFX] Campfire loop finished - stopping');
        if (campfireAudioElement) {
          campfireAudioElement.pause();
          campfireAudioElement.currentTime = 0;
        }
        window.clearInterval(intervalId);
        return;
      }
    }, 1000);

    return intervalId;
  },
  stopCampfire() {
    console.log('[SFX] Stopping campfire sound');
    if (campfireAudioElement) {
      campfireAudioElement.pause();
      campfireAudioElement.currentTime = 0;
      campfireAudioElement.loop = false;
    }
  },
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
    // Play level up sound from audio file
    console.log('[SFX] levelUp() called');
    if (typeof window === 'undefined') return;

    if (!levelupAudioElement) {
      levelupAudioElement = new Audio('/sounds/levelup.mp3');
    }

    // Set volume based on current settings
    const volume = getVolume();
    const muted = isMuted();
    levelupAudioElement.volume = muted ? 0 : (volume / 100) * 0.6;
    levelupAudioElement.currentTime = 0;

    levelupAudioElement.play().catch(err => console.error('[SFX] Failed to play levelup:', err));
  },
  testSound() {
    // Test sound to verify audio system is working
    console.log('[SFX] Test sound - click + small tone');
    this.click();
    setTimeout(() => {
      playTone({ freqStart: 440, freqEnd: 440, duration: 0.5, type: 'sine', envelope: { peak: 0.3, attack: 0.1, release: 0.2 } });
    }, 150);
  },
};
