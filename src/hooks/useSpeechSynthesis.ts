import { useCallback, useEffect, useRef, useState } from 'react';
import { useJarvisStore } from '../hooks/useJarvisStore';
import { audioBus } from '../utils/audioBus';
import { speechSynthesisSupported } from '../utils/speechSupport';
import { loadVoices, pickVoice } from '../utils/voices';

/**
 * Cleanly strips markdown syntax so JARVIS reads answers naturally instead of
 * reading asterisks, backticks, or raw URLs aloud.
 */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' Here is the code on screen. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#*_~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const supported = speechSynthesisSupported();

  const voiceMuted = useJarvisStore((s) => s.settings.voiceMuted);
  const volume = useJarvisStore((s) => s.settings.volume);
  const rate = useJarvisStore((s) => s.settings.rate);
  const pitch = useJarvisStore((s) => s.settings.pitch);
  const voiceURI = useJarvisStore((s) => s.settings.voiceURI);
  const setReactorState = useJarvisStore((s) => s.setReactorState);

  const activeUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const watchdogRef = useRef<number | null>(null);

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    const sync = () => {
      if (alive) setVoices(window.speechSynthesis.getVoices());
    };
    void loadVoices(2500).then((list) => {
      if (alive && list.length) setVoices(list);
    });
    window.speechSynthesis.addEventListener('voiceschanged', sync);
    return () => {
      alive = false;
      window.speechSynthesis.removeEventListener('voiceschanged', sync);
    };
  }, [supported]);

  const stop = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
    activeUtterance.current = null;
    if (supported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    setSpeaking(false);
    if (useJarvisStore.getState().reactorState === 'speaking') {
      setReactorState('idle');
    }
  }, [supported, setReactorState]);

  const speak = useCallback(
    (rawText: string, options?: { onEnd?: () => void; force?: boolean }) => {
      const text = cleanForSpeech(rawText);
      if (!text) {
        options?.onEnd?.();
        return;
      }
      if (!supported || (voiceMuted && !options?.force)) {
        options?.onEnd?.();
        return;
      }

      stop();

      const synth = window.speechSynthesis;
      const utt = new SpeechSynthesisUtterance(text);
      const list = voices.length ? voices : synth.getVoices();
      const chosen = pickVoice(list, voiceURI);
      if (chosen) {
        utt.voice = chosen;
        utt.lang = chosen.lang;
      } else {
        utt.lang = 'en-GB';
      }
      utt.volume = Math.max(0, Math.min(1, volume));
      utt.rate = Math.max(0.6, Math.min(1.6, rate));
      utt.pitch = Math.max(0.5, Math.min(1.6, pitch));

      audioBus.boundarySupported = false;

      utt.onstart = () => {
        setSpeaking(true);
        setReactorState('speaking');
      };
      utt.onboundary = () => {
        audioBus.boundarySupported = true;
        audioBus.speechBoundary += 1;
        audioBus.lastBoundaryAt = performance.now();
      };

      const finish = () => {
        if (activeUtterance.current !== utt) return;
        if (watchdogRef.current !== null) {
          window.clearInterval(watchdogRef.current);
          watchdogRef.current = null;
        }
        activeUtterance.current = null;
        setSpeaking(false);
        if (useJarvisStore.getState().reactorState === 'speaking') {
          setReactorState('idle');
        }
        options?.onEnd?.();
      };

      utt.onend = finish;
      utt.onerror = finish;
      activeUtterance.current = utt;

      // Chrome Android sometimes pauses long utterances after ~15s unless nudged.
      watchdogRef.current = window.setInterval(() => {
        if (synth.speaking && synth.paused) {
          synth.resume();
        } else if (!synth.speaking && activeUtterance.current === utt) {
          // Guard against dropped onend on older WebViews
          window.setTimeout(() => {
            if (!synth.speaking && activeUtterance.current === utt) finish();
          }, 250);
        }
      }, 4000);

      try {
        synth.speak(utt);
      } catch {
        finish();
      }
    },
    [supported, voiceMuted, voices, voiceURI, volume, rate, pitch, stop, setReactorState],
  );

  // Stop speech cleanly if the user toggles mute mid-sentence.
  useEffect(() => {
    if (voiceMuted && speaking) stop();
  }, [voiceMuted, speaking, stop]);

  useEffect(() => () => stop(), [stop]);

  const activeVoice = pickVoice(voices, voiceURI);

  return {
    supported,
    speaking,
    voices,
    activeVoice,
    speak,
    stop,
  };
}
