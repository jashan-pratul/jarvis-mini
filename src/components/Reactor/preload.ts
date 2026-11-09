let preloadPromise: Promise<unknown> | null = null;

/** Preloads the Three.js / R3F reactor chunk during the boot sequence. */
export function preloadReactor(): Promise<unknown> {
  if (!preloadPromise) {
    preloadPromise = import('./ReactorCanvas');
  }
  return preloadPromise;
}
