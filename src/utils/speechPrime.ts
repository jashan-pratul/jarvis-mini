import { speechSynthesisSupported } from './speechSupport';

/**
 * Android Chrome only allows speechSynthesis after a user activation.
 * Speaking a silent utterance inside the tap handler unlocks later speech.
 */
export function primeSpeech(): void {
  if (!speechSynthesisSupported()) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}
