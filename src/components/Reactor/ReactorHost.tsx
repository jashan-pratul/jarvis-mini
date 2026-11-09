import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { useJarvisStore, type Quality, type ReactorState } from '../../hooks/useJarvisStore';
import { detectWebGL, isMobile, prefersReducedMotion } from '../../utils/device';
import { Reactor2D } from './Reactor2D';

const LazyReactorCanvas = lazy(() => import('./ReactorCanvas'));

class ReactorErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface BatteryLike extends EventTarget {
  level: number;
  charging: boolean;
}

interface Props {
  state?: ReactorState;
  size?: number;
  paused?: boolean;
  className?: string;
}

/**
 * Renders the 3D holographic WebGL reactor with automatic Samsung Galaxy A16
 * DPR scaling, battery-saver awareness, and instant 2D SVG fallback.
 */
export function ReactorHost({ state, size = 240, paused = false, className = '' }: Props) {
  const storeState = useJarvisStore((s) => s.reactorState);
  const qualityPref = useJarvisStore((s) => s.settings.quality);
  const activeQuality = useJarvisStore((s) => s.activeQuality);
  const setActiveQuality = useJarvisStore((s) => s.setActiveQuality);
  const toast = useJarvisStore((s) => s.toast);

  const [contextLost, setContextLost] = useState(false);
  const effectiveState = state ?? storeState;

  // Choose sensible initial quality tier and watch real battery status when in 'auto' mode.
  useEffect(() => {
    if (qualityPref !== 'auto') {
      setActiveQuality(qualityPref);
      return;
    }
    const gl = detectWebGL();
    if (!gl.supported || prefersReducedMotion()) {
      setActiveQuality('2d');
      return;
    }
    setActiveQuality(isMobile() ? 'balanced' : 'high');

    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (typeof nav.getBattery !== 'function') return;
    let mounted = true;
    let batteryRef: BatteryLike | null = null;
    const evaluateBattery = () => {
      if (!mounted || !batteryRef) return;
      if (!batteryRef.charging && batteryRef.level <= 0.2) {
        if (useJarvisStore.getState().activeQuality !== 'saver') {
          setActiveQuality('saver');
          toast('Battery below 20% — reactor switched to power-saving mode.', 'info');
        }
      }
    };
    nav
      .getBattery()
      .then((b) => {
        if (!mounted) return;
        batteryRef = b;
        evaluateBattery();
        b.addEventListener('levelchange', evaluateBattery);
        b.addEventListener('chargingchange', evaluateBattery);
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
      if (batteryRef) {
        batteryRef.removeEventListener('levelchange', evaluateBattery);
        batteryRef.removeEventListener('chargingchange', evaluateBattery);
      }
    };
  }, [qualityPref, setActiveQuality, toast]);

  const resolvedQuality: Exclude<Quality, 'auto'> = qualityPref === 'auto' ? activeQuality : qualityPref;
  const glSupported = detectWebGL().supported;
  const use2D = !glSupported || contextLost || resolvedQuality === '2d' || prefersReducedMotion();

  const fallback = <Reactor2D state={effectiveState} size={Math.round(size * 0.86)} />;

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
      data-reactor-state={effectiveState}
      data-reactor-mode={use2D ? '2d' : resolvedQuality}
    >
      {/* Subtle outer HUD reticle */}
      <svg
        viewBox="0 0 260 260"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-55"
        aria-hidden
      >
        <circle
          cx="130"
          cy="130"
          r="124"
          fill="none"
          stroke="#38e1ff"
          strokeOpacity="0.22"
          strokeWidth="0.8"
          strokeDasharray="3 9"
        />
        <path
          d="M 22 92 A 114 114 0 0 1 92 22 M 168 22 A 114 114 0 0 1 238 92 M 238 168 A 114 114 0 0 1 168 238 M 92 238 A 114 114 0 0 1 22 168"
          fill="none"
          stroke="#7eeaff"
          strokeOpacity="0.32"
          strokeWidth="1.1"
        />
      </svg>

      {use2D ? (
        fallback
      ) : (
        <ReactorErrorBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <div className="h-full w-full">
              <LazyReactorCanvas
                state={effectiveState}
                quality={resolvedQuality}
                paused={paused}
                onContextLost={() => setContextLost(true)}
              />
            </div>
          </Suspense>
        </ReactorErrorBoundary>
      )}
    </div>
  );
}
