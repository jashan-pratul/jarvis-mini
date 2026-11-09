/**
 * A tiny mutable bus read by the 3D reactor every frame (no React re-renders).
 * Values are written by real signal sources: the microphone analyser,
 * speech-synthesis word boundaries and speech-recognition events.
 */
export const audioBus = {
  /** 0..1 microphone level (real analyser, when enabled). */
  micLevel: 0,
  /** 64-bin normalised frequency snapshot from the mic analyser. */
  spectrum: new Float32Array(64),
  /** Whether `spectrum` currently holds live microphone data. */
  spectrumLive: false,
  /** Monotonic counter bumped on each spoken word boundary. */
  speechBoundary: 0,
  /** performance.now() of the last word boundary. */
  lastBoundaryAt: 0,
  /** Whether the active voice emits boundary events (detected at runtime). */
  boundarySupported: false,
  /** performance.now() of the last speech-recognition activity (interim result / speechstart). */
  lastRecognitionActivity: 0,
  /** One-shot pulse request (e.g. on a new answer); the reactor consumes it. */
  pulse: 0,
};

export function bumpPulse(): void {
  audioBus.pulse = performance.now();
}
