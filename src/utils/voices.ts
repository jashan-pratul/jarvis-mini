import { speechSynthesisSupported } from './speechSupport';

/** Resolves with the browser's voices (Chrome loads them asynchronously). */
export function loadVoices(timeoutMs = 2500): Promise<SpeechSynthesisVoice[]> {
  if (!speechSynthesisSupported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const existing = synth.getVoices();
  if (existing.length) return Promise.resolve(existing);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener('voiceschanged', finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener('voiceschanged', finish);
    window.setTimeout(finish, timeoutMs);
  });
}

const MALE_HINTS = /male|daniel|arthur|george|oliver|ryan|thomas|guy|brian|james|harry|rishi/i;
const FEMALE_HINTS = /female|serena|kate|libby|sonia|susan|hazel|martha|fiona|moira|tessa|samantha|karen|veena/i;

/**
 * Scores voices to find the most JARVIS-like one available on this device:
 * British English first, male-sounding names preferred, local voices favoured
 * (they start faster and work offline).
 */
export function rankVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const score = (v: SpeechSynthesisVoice): number => {
    let s = 0;
    const lang = v.lang.toLowerCase().replace('_', '-');
    if (lang === 'en-gb') s += 100;
    else if (lang === 'en-in') s += 55;
    else if (lang === 'en-au' || lang === 'en-ie') s += 45;
    else if (lang.startsWith('en')) s += 35;
    else s -= 200;
    if (/uk english male|daniel|arthur/i.test(v.name)) s += 40;
    else if (MALE_HINTS.test(v.name)) s += 25;
    if (FEMALE_HINTS.test(v.name)) s -= 10;
    if (/google/i.test(v.name)) s += 8;
    if (/natural|neural|premium|enhanced/i.test(v.name)) s += 12;
    if (v.localService) s += 5;
    return s;
  };
  return [...voices].sort((a, b) => score(b) - score(a));
}

export function pickVoice(voices: SpeechSynthesisVoice[], preferredURI: string | null): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  if (preferredURI) {
    const chosen = voices.find((v) => v.voiceURI === preferredURI);
    if (chosen) return chosen;
  }
  return rankVoices(voices)[0] ?? null;
}
