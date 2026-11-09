import { motion } from 'framer-motion';
import type { ReactorState } from '../../hooks/useJarvisStore';

const stateColor: Record<ReactorState, string> = {
  idle: '#38e1ff',
  listening: '#7ef9ff',
  thinking: '#4fb8ff',
  speaking: '#9ff4ff',
  error: '#ff5470',
};

const speed: Record<ReactorState, number> = {
  idle: 1,
  listening: 0.7,
  thinking: 0.3,
  speaking: 0.6,
  error: 1.4,
};

interface Props {
  state?: ReactorState;
  size?: number;
  className?: string;
}

/**
 * Lightweight SVG/CSS reactor — used during boot ignition, when WebGL is
 * unavailable, and in "2D" battery mode. Pure transforms, GPU-composited.
 */
export function Reactor2D({ state = 'idle', size = 220, className = '' }: Props) {
  const color = stateColor[state];
  const k = speed[state];
  const segments = Array.from({ length: 12 });

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }} aria-hidden>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${color}55 0%, ${color}18 35%, transparent 68%)`,
          filter: 'blur(6px)',
        }}
      />
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <radialGradient id="r2d-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="35%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        <g style={{ transformOrigin: '100px 100px', animation: `jv-spin ${18 * k}s linear infinite` }}>
          <circle cx="100" cy="100" r="92" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="2 6" />
          <circle cx="100" cy="100" r="84" fill="none" stroke={color} strokeOpacity="0.6" strokeWidth="1.4" strokeDasharray="60 20 10 20" />
        </g>
        <g style={{ transformOrigin: '100px 100px', animation: `jv-spin-rev ${11 * k}s linear infinite` }}>
          {segments.map((_, i) => (
            <rect
              key={i}
              x="96"
              y="30"
              width="8"
              height="14"
              rx="2"
              fill={color}
              fillOpacity={0.75}
              transform={`rotate(${i * 30} 100 100)`}
            />
          ))}
        </g>
        <g style={{ transformOrigin: '100px 100px', animation: `jv-spin ${7 * k}s linear infinite` }}>
          <circle cx="100" cy="100" r="56" fill="none" stroke={color} strokeOpacity="0.8" strokeWidth="2" strokeDasharray="90 40" />
        </g>
        <circle cx="100" cy="100" r="44" fill="none" stroke={color} strokeOpacity="0.4" strokeWidth="1" />
      </svg>
      <motion.div
        className="absolute rounded-full"
        style={{
          left: '30%',
          top: '30%',
          width: '40%',
          height: '40%',
          background: 'radial-gradient(circle, #fff 0%, ' + color + ' 40%, transparent 72%)',
          boxShadow: `0 0 40px ${color}, 0 0 90px ${color}66`,
        }}
        animate={{
          scale: state === 'speaking' ? [1, 1.12, 0.96, 1.08, 1] : state === 'thinking' ? [1, 1.06, 1] : [1, 1.04, 1],
          opacity: state === 'error' ? [1, 0.5, 1] : [0.92, 1, 0.92],
        }}
        transition={{ duration: state === 'speaking' ? 0.9 : state === 'thinking' ? 0.7 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}
