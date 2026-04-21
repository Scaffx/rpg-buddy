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
let campfireTimeoutId: number | null = null;
let campfireIntervalId: number | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctor) return null;
    ctx = new Ctor();
    masterGain = ctx.createGain();
    const volume = getVolume();
    const muted = isMuted();
    masterGain.gain.value = muted ? 0 : (volume / 100) * 0.6;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function resumeAudioContext() {
  const ctx = ensureContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(err => console.error('[SFX] Failed to resume audio context:', err));
  }
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

/** Aplica variação aleatória a um valor dentro de ±range (ex: range=0.12 = ±12%). */
function jitter(value: number, range: number): number {
  return value * (1 + (Math.random() * 2 - 1) * range);
}

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
    
    // Stop any existing campfire sound and intervals
    if (campfireAudioElement) {
      campfireAudioElement.pause();
      campfireAudioElement.currentTime = 0;
    }
    if (campfireTimeoutId !== null) {
      window.clearTimeout(campfireTimeoutId);
      campfireTimeoutId = null;
    }
    if (campfireIntervalId !== null) {
      window.clearInterval(campfireIntervalId);
      campfireIntervalId = null;
    }
    
    if (!durationSeconds) {
      // One-shot: play once and return
      if (typeof window === 'undefined') return 0;
      
      if (!campfireAudioElement) {
        campfireAudioElement = new Audio('/sounds/campfire.mp3');
        campfireAudioElement.crossOrigin = 'anonymous';
      }
      
      const volume = getVolume();
      const muted = isMuted();
      campfireAudioElement.volume = muted ? 0 : (volume / 100) * 0.6;
      campfireAudioElement.loop = false;
      campfireAudioElement.currentTime = 0;
      
      console.log(`[SFX] Playing one-shot campfire, volume: ${campfireAudioElement.volume}`);
      const playPromise = campfireAudioElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => console.log('[SFX] Campfire one-shot started'))
          .catch(err => console.error('[SFX] Failed to play campfire:', err));
      }
      return 0;
    }

    // Looping campfire sound for the specified duration
    if (typeof window === 'undefined') return 0;

    if (!campfireAudioElement) {
      campfireAudioElement = new Audio('/sounds/campfire.mp3');
      campfireAudioElement.crossOrigin = 'anonymous';
    }

    // Set volume based on current settings
    const volume = getVolume();
    const muted = isMuted();
    campfireAudioElement.volume = muted ? 0 : (volume / 100) * 0.6;
    campfireAudioElement.loop = true;
    campfireAudioElement.currentTime = 0;

    console.log(`[SFX] Starting looped campfire for ${durationSeconds}s, volume: ${campfireAudioElement.volume}, muted: ${muted}`);
    
    const playPromise = campfireAudioElement.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => console.log('[SFX] Campfire started successfully'))
        .catch(err => console.error('[SFX] Failed to play looped campfire:', err));
    }

    const endTimeMs = Date.now() + durationSeconds * 1000;
    const intervalId = window.setInterval(() => {
      if (Date.now() >= endTimeMs) {
        console.log('[SFX] Campfire loop finished - stopping');
        if (campfireAudioElement) {
          campfireAudioElement.pause();
          campfireAudioElement.currentTime = 0;
        }
        if (campfireIntervalId !== null) {
          window.clearInterval(campfireIntervalId);
          campfireIntervalId = null;
        }
        return;
      }
    }, 1000);

    campfireIntervalId = intervalId;
    return intervalId;
  },
  stopCampfire() {
    console.log('[SFX] Stopping campfire sound');
    if (campfireAudioElement) {
      campfireAudioElement.pause();
      campfireAudioElement.currentTime = 0;
      campfireAudioElement.loop = false;
    }
    if (campfireTimeoutId !== null) {
      window.clearTimeout(campfireTimeoutId);
      campfireTimeoutId = null;
    }
    if (campfireIntervalId !== null) {
      window.clearInterval(campfireIntervalId);
      campfireIntervalId = null;
    }
  },
  slash() {
    // Variação de ±15% no filtro e ±20% no pico para reduzir repetição
    playNoiseBurst({ duration: jitter(0.18, 0.1), peak: jitter(0.35, 0.2), filterFreq: jitter(3200, 0.15) });
    playTone({ freqStart: jitter(900, 0.12), freqEnd: jitter(200, 0.12), duration: 0.16, type: 'sawtooth', envelope: { peak: jitter(0.18, 0.2), attack: 0.003, release: 0.04 } });
  },
  hit() {
    // Variação de ±10% na frequência base e ±15% no pico
    playTone({ freqStart: jitter(180, 0.1), freqEnd: jitter(60, 0.1), duration: jitter(0.18, 0.08), type: 'square', envelope: { peak: jitter(0.38, 0.15), attack: 0.002, release: jitter(0.08, 0.1) } });
    playNoiseBurst({ duration: 0.12, peak: jitter(0.22, 0.15), filterFreq: jitter(600, 0.12) });
  },
  crit() {
    // Variação de ±10% em todas as freqs e ±15% nos picos para crits únicos
    playTone({ freqStart: jitter(320, 0.1), freqEnd: jitter(90, 0.1), duration: 0.22, type: 'sawtooth', envelope: { peak: jitter(0.45, 0.15), attack: 0.002, release: 0.1 } });
    playNoiseBurst({ duration: jitter(0.25, 0.1), peak: jitter(0.35, 0.15), filterFreq: jitter(2400, 0.12) });
    playTone({ freqStart: jitter(1400, 0.1), freqEnd: jitter(700, 0.1), duration: 0.18, type: 'triangle', envelope: { peak: jitter(0.3, 0.15), attack: 0.002, release: 0.1 }, delay: jitter(0.05, 0.1) });
  },
  diceRoll() {
    for (let i = 0; i < 5; i++) {
      playNoiseBurst({ duration: 0.04, peak: 0.18, filterFreq: 2200 + Math.random() * 800, delay: i * 0.06 });
    }
  },
  victory() {
    // Fanfarra triunfal: C - E - G - C com leve variação de timing e amplitude
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const delay = i * 0.14 + jitter(0, 0.04);
      playTone({ freqStart: jitter(freq, 0.02), duration: 0.28, type: 'triangle', envelope: { peak: jitter(0.32, 0.1), attack: 0.005, release: 0.18 }, delay });
      playTone({ freqStart: jitter(freq / 2, 0.02), duration: 0.28, type: 'sine', envelope: { peak: jitter(0.18, 0.1), attack: 0.005, release: 0.18 }, delay });
    });
    playTone({ freqStart: jitter(1046.5, 0.02), duration: 0.85, type: 'triangle', envelope: { peak: jitter(0.4, 0.1), attack: 0.01, release: 0.5 }, delay: jitter(0.6, 0.04) });
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
