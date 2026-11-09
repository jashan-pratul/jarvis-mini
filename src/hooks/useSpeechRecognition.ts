import { useCallback, useEffect, useRef, useState } from 'react';
import { useJarvisStore } from '../hooks/useJarvisStore';
import { audioBus } from '../utils/audioBus';
import { getAudioContext, sfx } from '../utils/sfx';
import {
  getSpeechRecognitionCtor,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from '../utils/speechSupport';

export type MicPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported' | 'unknown';

interface UseSpeechRecognitionOpts {
  onTranscript: (text: string) => void;
  onBeforeStart?: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access was denied. Enable it in Chrome site settings.',
  'service-not-allowed': 'Speech recognition is blocked by this browser or device policy.',
  'audio-capture': 'No working microphone was detected on this device.',
  network: 'Speech recognition requires an active internet connection.',
  'no-speech': 'I did not catch any speech. Tap the mic and speak clearly.',
  aborted: '',
};

export function useSpeechRecognition({ onTranscript, onBeforeStart }: UseSpeechRecognitionOpts) {
  const ctor = getSpeechRecognitionCtor();
  const supported = ctor !== null;

  const [listening, setListening] = useState(false);
  const [permission, setPermission] = useState<MicPermissionState>(supported ? 'unknown' : 'unsupported');
  const [error, setError] = useState<string | null>(null);

  const recognitionLang = useJarvisStore((s) => s.settings.recognitionLang);
  const micVisualizer = useJarvisStore((s) => s.settings.micVisualizer);
  const setReactorState = useJarvisStore((s) => s.setReactorState);
  const setInterim = useJarvisStore((s) => s.setInterim);
  const toast = useJarvisStore((s) => s.toast);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalBufferRef = useRef('');
  const latestTranscriptRef = useRef('');
  const deliveredRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onBeforeStartRef = useRef(onBeforeStart);
  onBeforeStartRef.current = onBeforeStart;

  // Query microphone permission honestly via Permissions API (without forcing a prompt).
  useEffect(() => {
    if (!supported) {
      setPermission('unsupported');
      return;
    }
    if (!('permissions' in navigator) || typeof navigator.permissions.query !== 'function') return;
    let permStatus: PermissionStatus | null = null;
    let active = true;
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((status) => {
        if (!active) return;
        permStatus = status;
        setPermission(status.state as MicPermissionState);
        status.onchange = () => {
          if (active) setPermission(status.state as MicPermissionState);
        };
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (permStatus) permStatus.onchange = null;
    };
  }, [supported]);

  const stopVisualizer = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    audioBus.spectrumLive = false;
    audioBus.micLevel = 0;
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) track.stop();
      mediaStreamRef.current = null;
    }
  }, []);

  const startVisualizer = useCallback(async () => {
    if (!micVisualizer || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      mediaStreamRef.current = stream;
      const ctx = getAudioContext();
      if (!ctx) return;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      const bins = new Uint8Array(analyser.frequencyBinCount);
      audioBus.spectrumLive = true;

      const sample = () => {
        if (!mediaStreamRef.current) return;
        analyser.getByteFrequencyData(bins);
        let sum = 0;
        const n = Math.min(bins.length, audioBus.spectrum.length);
        for (let i = 0; i < n; i++) {
          const val = bins[i] / 255;
          audioBus.spectrum[i] = val;
          sum += val;
        }
        audioBus.micLevel = sum / Math.max(1, n);
        rafRef.current = requestAnimationFrame(sample);
      };
      rafRef.current = requestAnimationFrame(sample);
    } catch {
      // Never fake visualizer data if mic stream fails.
      audioBus.spectrumLive = false;
    }
  }, [micVisualizer]);

  const stop = useCallback(() => {
    stopVisualizer();
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* already stopped */
      }
    }
  }, [stopVisualizer]);

  const start = useCallback(() => {
    if (!ctor) {
      const msg = 'Speech recognition is not available in this browser — type below instead.';
      setError(msg);
      toast(msg, 'warning');
      return;
    }
    if (recRef.current) {
      stop();
      return;
    }

    onBeforeStartRef.current?.();
    setError(null);
    setInterim('');
    finalBufferRef.current = '';
    latestTranscriptRef.current = '';
    deliveredRef.current = false;

    const rec = new ctor();
    rec.lang = recognitionLang || 'en-IN';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      // Only claim listening once the browser confirms recognition started.
      setListening(true);
      setPermission('granted');
      setReactorState('listening');
      sfx.listenStart();
      void startVisualizer();
    };

    rec.onspeechstart = () => {
      audioBus.lastRecognitionActivity = performance.now();
    };

    rec.onresult = (ev: SpeechRecognitionEventLike) => {
      audioBus.lastRecognitionActivity = performance.now();
      let interim = '';
      let finals = '';
      for (let i = 0; i < ev.results.length; i++) {
        const res = ev.results[i];
        const part = res[0]?.transcript ?? '';
        if (res.isFinal) finals += `${part} `;
        else interim += part;
      }
      finalBufferRef.current = finals.trim();
      const combined = [finalBufferRef.current, interim.trim()].filter(Boolean).join(' ').trim();
      latestTranscriptRef.current = combined;
      setInterim(combined);
    };

    rec.onerror = (ev: SpeechRecognitionErrorEventLike) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        setPermission('denied');
      }
      const message = ERROR_MESSAGES[ev.error] ?? `Microphone error (${ev.error}).`;
      if (message) {
        setError(message);
        toast(message, ev.error === 'no-speech' ? 'info' : 'error');
        if (ev.error !== 'no-speech') {
          setReactorState('error');
          sfx.error();
          window.setTimeout(() => {
            if (useJarvisStore.getState().reactorState === 'error') setReactorState('idle');
          }, 1600);
        }
      }
    };

    rec.onend = () => {
      recRef.current = null;
      stopVisualizer();
      setListening(false);
      setInterim('');
      sfx.listenStop();
      if (useJarvisStore.getState().reactorState === 'listening') {
        setReactorState('idle');
      }
      const text = (finalBufferRef.current || latestTranscriptRef.current).trim();
      if (text && !deliveredRef.current) {
        deliveredRef.current = true;
        onTranscriptRef.current(text);
      }
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
      setListening(false);
      setError('Could not activate microphone. Please check browser permissions.');
    }
  }, [ctor, recognitionLang, setInterim, setReactorState, startVisualizer, stop, stopVisualizer, toast]);

  useEffect(() => () => {
    stopVisualizer();
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
    recRef.current = null;
  }, [stopVisualizer]);

  return {
    supported,
    listening,
    permission,
    error,
    start,
    stop,
    toggle: listening ? stop : start,
  };
}
