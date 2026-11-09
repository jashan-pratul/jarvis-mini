import { useCallback, useRef, useState } from 'react';
import { checkHealth } from '../../services/api';
import { useJarvisStore } from '../../hooks/useJarvisStore';
import { detectWebGL } from '../../utils/device';
import { getSpeechRecognitionCtor } from '../../utils/speechSupport';
import { loadVoices } from '../../utils/voices';
import { preloadReactor } from '../Reactor/preload';

export type CheckStatus = 'pending' | 'online' | 'degraded' | 'offline';

export interface BootCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

const initialChecks: BootCheck[] = [
  { id: 'link', label: 'Neural link', status: 'pending', detail: 'Contacting server' },
  { id: 'ai', label: 'Gemini cognition core', status: 'pending', detail: 'Awaiting link' },
  { id: 'memory', label: 'Memory core', status: 'pending', detail: 'Awaiting link' },
  { id: 'renderer', label: 'Holographic renderer', status: 'pending', detail: 'Compiling' },
  { id: 'voice', label: 'Voice synthesis', status: 'pending', detail: 'Loading voices' },
  { id: 'ears', label: 'Speech recognition', status: 'pending', detail: 'Probing' },
  { id: 'sensors', label: 'Device sensors', status: 'pending', detail: 'Probing' },
];

/**
 * Runs genuine readiness checks. Each line resolves only when its real check
 * completes — the progress bar is the fraction of finished checks.
 */
export function useBootChecks() {
  const [checks, setChecks] = useState<BootCheck[]>(initialChecks);
  const started = useRef(false);
  const setBackend = useJarvisStore((s) => s.setBackend);

  const update = useCallback((id: string, status: CheckStatus, detail: string) => {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, status, detail } : c)));
  }, []);

  const run = useCallback(async () => {
    if (started.current) return;
    started.current = true;

    const link = checkHealth().then((health) => {
      setBackend(health);
      if (!health.reachable) {
        update('link', 'offline', 'Server unreachable');
        update('ai', 'offline', 'No server link');
        update('memory', 'offline', 'No server link');
        return;
      }
      update('link', 'online', `${health.latencyMs ?? '?'} ms round trip`);
      update(
        'ai',
        health.aiConfigured ? 'online' : 'degraded',
        health.aiConfigured ? (health.model ?? 'Configured') : 'API key not configured',
      );
      update('memory', health.databaseOk ? 'online' : 'degraded', health.databaseOk ? 'SQLite ready' : 'Database error');
    });

    const renderer = (async () => {
      const gl = detectWebGL();
      if (!gl.supported) {
        update('renderer', 'degraded', 'WebGL unavailable — 2D mode');
        return;
      }
      try {
        await preloadReactor();
        update('renderer', 'online', gl.webgl2 ? 'WebGL 2 ready' : 'WebGL 1 ready');
      } catch {
        update('renderer', 'degraded', '3D module failed — 2D mode');
      }
    })();

    const voice = loadVoices(2500).then((voices) => {
      if (!('speechSynthesis' in window)) update('voice', 'offline', 'Not supported by this browser');
      else if (voices.length === 0) update('voice', 'degraded', 'No voices reported');
      else update('voice', 'online', `${voices.length} voices available`);
    });

    const ears = Promise.resolve().then(() => {
      const ctor = getSpeechRecognitionCtor();
      update('ears', ctor ? 'online' : 'offline', ctor ? 'Push-to-talk ready' : 'Unsupported — text mode');
    });

    const sensors = Promise.resolve().then(() => {
      const nav = navigator as Navigator & { getBattery?: unknown; connection?: unknown };
      const found = [
        typeof nav.getBattery === 'function' ? 'battery' : null,
        nav.connection ? 'network' : null,
        'permissions' in navigator ? 'permissions' : null,
      ].filter(Boolean);
      update('sensors', found.length ? 'online' : 'degraded', found.length ? found.join(' · ') : 'Limited browser APIs');
    });

    await Promise.allSettled([link, renderer, voice, ears, sensors]);
  }, [setBackend, update]);

  const done = checks.filter((c) => c.status !== 'pending').length;
  return { checks, run, progress: done / checks.length, complete: done === checks.length };
}
