/**
 * Synthesised interface sounds (Web Audio API) — no audio files to download.
 * Browsers require a user gesture before audio can start, so `unlockAudio()`
 * is called from the boot "touch to initialise" tap.
 */
import { useJarvisStore } from '../hooks/useJarvisStore';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

export async function unlockAudio(): Promise<boolean> {
  const c = getCtx();
  if (!c) return false;
  if (c.state === 'suspended') {
    try {
      await c.resume();
    } catch {
      return false;
    }
  }
  return c.state === 'running';
}

export function getAudioContext(): AudioContext | null {
  return getCtx();
}

const enabled = () => useJarvisStore.getState().settings.soundFx;

interface ToneOpts {
  freq: number;
  to?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  attack?: number;
}

function tone({ freq, to, duration, type = 'sine', gain = 0.08, delay = 0, attack = 0.01 }: ToneOpts) {
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function noiseSweep(duration: number, from: number, to: number, gain = 0.05, delay = 0) {
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  const t0 = c.currentTime + delay;
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * duration), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 6;
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + duration * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter).connect(g).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  tick() {
    if (!enabled()) return;
    tone({ freq: 1800, duration: 0.05, type: 'square', gain: 0.018 });
  },
  tap() {
    if (!enabled()) return;
    tone({ freq: 880, to: 1320, duration: 0.08, gain: 0.04 });
  },
  bootHum() {
    if (!enabled()) return;
    tone({ freq: 55, to: 110, duration: 2.6, type: 'sawtooth', gain: 0.035, attack: 0.8 });
    tone({ freq: 110, to: 220, duration: 2.6, type: 'sine', gain: 0.05, attack: 0.8 });
    noiseSweep(2.2, 200, 4000, 0.03, 0.2);
  },
  subsystem(index: number) {
    if (!enabled()) return;
    tone({ freq: 600 + index * 90, duration: 0.09, type: 'triangle', gain: 0.04 });
  },
  online() {
    if (!enabled()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ freq: f, duration: 0.5, type: 'sine', gain: 0.05, delay: i * 0.09 }),
    );
  },
  listenStart() {
    if (!enabled()) return;
    tone({ freq: 660, to: 990, duration: 0.12, gain: 0.05 });
  },
  listenStop() {
    if (!enabled()) return;
    tone({ freq: 990, to: 560, duration: 0.12, gain: 0.04 });
  },
  error() {
    if (!enabled()) return;
    tone({ freq: 220, duration: 0.18, type: 'square', gain: 0.03 });
    tone({ freq: 180, duration: 0.22, type: 'square', gain: 0.03, delay: 0.16 });
  },
  success() {
    if (!enabled()) return;
    tone({ freq: 784, duration: 0.14, gain: 0.05 });
    tone({ freq: 1175, duration: 0.24, gain: 0.05, delay: 0.1 });
  },
  showcase() {
    if (!enabled()) return;
    noiseSweep(1.6, 120, 6000, 0.06);
    tone({ freq: 65.4, to: 130.8, duration: 2.4, type: 'sawtooth', gain: 0.04, attack: 0.5 });
    [261.63, 329.63, 392, 523.25].forEach((f, i) =>
      tone({ freq: f, duration: 1.4, type: 'sine', gain: 0.04, delay: 0.9 + i * 0.12, attack: 0.05 }),
    );
  },
};
