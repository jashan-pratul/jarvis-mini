import { useJarvisStore } from '../../hooks/useJarvisStore';

/** Static atmospheric layers behind everything (pure CSS, zero JS per frame). */
export function Backdrop() {
  const view = useJarvisStore((s) => s.view);
  const dim = view !== 'core' && view !== 'showcase';
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 70% at 50% 28%, #0a1d3d 0%, #061227 38%, #02060f 70%, #010309 100%)',
        }}
      />
      <div className="hud-grid absolute inset-0" />
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{ background: 'rgba(1,3,9,0.55)', opacity: dim ? 1 : 0 }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{ background: 'linear-gradient(to top, rgba(1,3,9,0.9), transparent)' }}
      />
    </div>
  );
}
