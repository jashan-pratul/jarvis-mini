import { useEffect, useState } from 'react';
import { Battery, Clock, Cpu, Globe, Mic, RefreshCw, Server, Wifi } from 'lucide-react';
import { useJarvisStore } from '../../hooks/useJarvisStore';
import { checkHealth } from '../../services/api';
import { detectWebGL } from '../../utils/device';
import { getISTTime, selectGreeting } from '../../utils/greetings';
import { getSpeechRecognitionCtor } from '../../utils/speechSupport';

interface BatteryState {
  supported: boolean;
  level: number | null;
  charging: boolean | null;
}

interface NetworkInfo {
  online: boolean;
  effectiveType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
}

export function useDeviceDiagnostics() {
  const startedAt = useJarvisStore((s) => s.startedAt);
  const backend = useJarvisStore((s) => s.backend);
  const setBackend = useJarvisStore((s) => s.setBackend);
  const fps = useJarvisStore((s) => s.fps);
  const activeQuality = useJarvisStore((s) => s.activeQuality);

  const [now, setNow] = useState(() => new Date());
  const [micPermission, setMicPermission] = useState<string>('Unavailable');
  const [battery, setBattery] = useState<BatteryState>({ supported: false, level: null, charging: null });
  const [network, setNetwork] = useState<NetworkInfo>(() => readNetwork());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    // Battery Status API (supported in Android Chrome; unavailable on Safari/Firefox)
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<EventTarget & { level: number; charging: boolean }>;
    };
    if (typeof nav.getBattery !== 'function') {
      setBattery({ supported: false, level: null, charging: null });
    } else {
      let alive = true;
      let ref: (EventTarget & { level: number; charging: boolean }) | null = null;
      const sync = () => {
        if (!alive || !ref) return;
        setBattery({ supported: true, level: Math.round(ref.level * 100), charging: ref.charging });
      };
      nav
        .getBattery()
        .then((b) => {
          ref = b;
          sync();
          b.addEventListener('levelchange', sync);
          b.addEventListener('chargingchange', sync);
        })
        .catch(() => {
          if (alive) setBattery({ supported: false, level: null, charging: null });
        });
      return () => {
        alive = false;
        ref?.removeEventListener('levelchange', sync);
        ref?.removeEventListener('chargingchange', sync);
      };
    }
    return undefined;
  }, []);

  useEffect(() => {
    // Network Information API + browser online/offline events
    const syncNet = () => setNetwork(readNetwork());
    window.addEventListener('online', syncNet);
    window.addEventListener('offline', syncNet);
    const conn = (navigator as Navigator & { connection?: EventTarget }).connection;
    conn?.addEventListener?.('change', syncNet);
    return () => {
      window.removeEventListener('online', syncNet);
      window.removeEventListener('offline', syncNet);
      conn?.removeEventListener?.('change', syncNet);
    };
  }, []);

  useEffect(() => {
    if (!getSpeechRecognitionCtor() && !navigator.mediaDevices?.getUserMedia) {
      setMicPermission('Unavailable');
      return;
    }
    if (!('permissions' in navigator) || typeof navigator.permissions.query !== 'function') {
      setMicPermission('Prompt (API unavailable)');
      return;
    }
    let active = true;
    let statusObj: PermissionStatus | null = null;
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((s) => {
        if (!active) return;
        statusObj = s;
        setMicPermission(s.state.toUpperCase());
        s.onchange = () => {
          if (active) setMicPermission(s.state.toUpperCase());
        };
      })
      .catch(() => {
        if (active) setMicPermission('Unavailable');
      });
    return () => {
      active = false;
      if (statusObj) statusObj.onchange = null;
    };
  }, []);

  const refreshBackend = async () => {
    const h = await checkHealth();
    setBackend(h);
  };

  const uptimeSec = Math.max(0, Math.floor((now.getTime() - startedAt) / 1000));
  const gl = detectWebGL();

  return {
    now,
    uptimeSec,
    battery,
    network,
    micPermission,
    backend,
    fps,
    activeQuality,
    gl,
    userAgent: navigator.userAgent,
    refreshBackend,
  };
}

function readNetwork(): NetworkInfo {
  const conn = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; downlink?: number; rtt?: number };
    }
  ).connection;
  return {
    online: navigator.onLine,
    effectiveType: conn?.effectiveType ? conn.effectiveType.toUpperCase() : null,
    downlinkMbps: typeof conn?.downlink === 'number' ? conn.downlink : null,
    rttMs: typeof conn?.rtt === 'number' ? conn.rtt : null,
  };
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function DiagnosticsView() {
  const diag = useDeviceDiagnostics();
  const settings = useJarvisStore((s) => s.settings);
  const [refreshing, setRefreshing] = useState(false);

  const ist = getISTTime(diag.now);
  const currentGreeting = selectGreeting({
    ownerName: settings.ownerName,
    date: diag.now,
    avoidRepeat: false,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await diag.refreshBackend();
    setRefreshing(false);
  };

  const batteryLabel = diag.battery.supported && diag.battery.level !== null
    ? `${diag.battery.level}%${diag.battery.charging ? ' · Charging' : ' · On battery'}`
    : 'Unavailable (blocked or unsupported by browser)';

  const networkDetail = diag.network.online
    ? [
        'Online',
        diag.network.effectiveType,
        diag.network.downlinkMbps !== null ? `~${diag.network.downlinkMbps} Mbps` : null,
        diag.network.rttMs !== null ? `${diag.network.rttMs} ms RTT` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Offline';

  return (
    <section className="scroll-area mx-auto h-full w-full max-w-3xl px-3 py-3" aria-label="Live device diagnostics">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="hud-label text-[10px] text-cyan">Honest Telemetry · Zero Fabricated Metrics</p>
          <h2 className="font-display text-lg font-bold text-white">Live Device Diagnostics</h2>
        </div>
        <button type="button" onClick={() => void handleRefresh()} className="btn-hud h-12 px-3 text-xs">
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          <span>Ping Server</span>
        </button>
      </div>

      {/* Live Indian Standard Time (IST) Clock & Greeting Status */}
      <div className="glass-panel mb-3 p-3.5 border border-cyan/30 bg-gradient-to-r from-cyan/10 via-space/60 to-transparent">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-cyan animate-pulse" />
            <span className="hud-label text-[11px] text-cyan font-bold tracking-wider">
              INDIAN STANDARD TIME (IST · UTC+05:30)
            </span>
          </div>
          <span className="rounded bg-cyan/15 px-2 py-0.5 font-mono text-[10px] text-cyan uppercase font-semibold">
            {ist.periodLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mt-1">
          <div className="font-mono text-2xl font-bold tracking-tight text-white text-glow">
            {ist.timeString}
          </div>
          <div className="font-sans text-xs text-steel">
            {ist.dateString} · {ist.weekday}
          </div>
        </div>
        <p className="mt-2 text-xs italic text-[#cfe9f7] border-t border-cyan/15 pt-2">
          &ldquo;{currentGreeting.text}&rdquo;
        </p>
      </div>

      <div className="grid gap-2.5 pb-6 sm:grid-cols-2">
        <MetricCard
          icon={Battery}
          label="Battery Status"
          value={batteryLabel}
          tone={diag.battery.supported ? (diag.battery.level !== null && diag.battery.level <= 20 ? 'amber' : 'ok') : 'muted'}
        />

        <MetricCard
          icon={Wifi}
          label="Network Connection"
          value={networkDetail}
          tone={diag.network.online ? 'ok' : 'bad'}
        />

        <MetricCard
          icon={Clock}
          label="Local Time & Session Uptime"
          value={`${diag.now.toLocaleTimeString('en-IN')} · Uptime ${formatUptime(diag.uptimeSec)}`}
          sub={diag.now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
          tone="ok"
        />

        <MetricCard
          icon={Mic}
          label="Microphone Permission"
          value={diag.micPermission}
          sub={getSpeechRecognitionCtor() ? 'Web Speech Recognition supported' : 'SpeechRecognition unavailable'}
          tone={diag.micPermission === 'GRANTED' ? 'ok' : diag.micPermission === 'DENIED' ? 'bad' : 'muted'}
        />

        <MetricCard
          icon={Server}
          label="Backend & Gemini Link"
          value={
            diag.backend?.reachable
              ? `Connected (${diag.backend.latencyMs ?? '?'} ms) · AI ${diag.backend.aiConfigured ? 'Ready' : 'Key Missing'}`
              : 'Server Unreachable'
          }
          sub={
            diag.backend?.reachable
              ? `Model: ${diag.backend.model ?? 'n/a'} · SQLite: ${diag.backend.databaseOk ? 'OK' : 'Error'}`
              : 'Check server status'
          }
          tone={diag.backend?.reachable ? (diag.backend.aiConfigured ? 'ok' : 'amber') : 'bad'}
        />

        <MetricCard
          icon={Cpu}
          label="3D Graphics & Renderer"
          value={
            diag.gl.supported
              ? `${diag.gl.webgl2 ? 'WebGL 2' : 'WebGL 1'} · Mode: ${diag.activeQuality}${diag.fps !== null ? ` (${diag.fps} FPS)` : ''}`
              : 'WebGL Unavailable (2D fallback)'
          }
          sub={diag.gl.renderer ?? 'GPU string hidden by browser'}
          tone={diag.gl.supported ? 'ok' : 'muted'}
        />

        <div className="glass min-w-0 overflow-hidden rounded-2xl p-3.5 sm:col-span-2">
          <div className="flex items-center gap-2 text-cyan">
            <Globe size={16} />
            <p className="hud-label text-[10px]">Browser & Viewport Environment</p>
          </div>
          <p className="mt-1.5 break-words font-mono text-xs text-white">
            Viewport: {window.innerWidth}×{window.innerHeight} px · DPR {window.devicePixelRatio} · Hardware cores:{' '}
            {navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} logical` : 'Unavailable'}
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-steel">{diag.userAgent}</p>
          <p className="mt-2 text-[11px] text-steel">
            Note: Browser sandboxes do not expose live CPU % or physical RAM usage, so JARVIS never fabricates those numbers.
          </p>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Battery;
  label: string;
  value: string;
  sub?: string;
  tone: 'ok' | 'amber' | 'bad' | 'muted';
}) {
  const dot =
    tone === 'ok'
      ? 'bg-success'
      : tone === 'amber'
        ? 'bg-amber'
        : tone === 'bad'
          ? 'bg-danger'
          : 'bg-steel';

  return (
    <div className="glass min-w-0 overflow-hidden rounded-2xl p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-cyan">
          <Icon size={16} className="shrink-0" />
          <p className="hud-label truncate text-[10px]">{label}</p>
        </div>
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      </div>
      <p className="mt-2 break-words text-sm font-semibold text-white">{value}</p>
      {sub && <p className="mt-1 truncate text-xs text-steel">{sub}</p>}
    </div>
  );
}
