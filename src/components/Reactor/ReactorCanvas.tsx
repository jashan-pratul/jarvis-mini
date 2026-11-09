import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { Quality, ReactorState } from '../../hooks/useJarvisStore';
import { ReactorScene } from './ReactorScene';

interface Props {
  state: ReactorState;
  quality: Exclude<Quality, 'auto' | '2d'>;
  paused?: boolean;
  onContextLost?: () => void;
}

export default function ReactorCanvas({ state, quality, paused = false, onContextLost }: Props) {
  const [tabHidden, setTabHidden] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false,
  );

  useEffect(() => {
    const onVis = () => setTabHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const dpr: [number, number] = quality === 'saver' ? [1, 1] : [1, 1.5];
  const halt = paused || tabHidden;

  return (
    <Canvas
      dpr={dpr}
      frameloop={halt ? 'never' : 'always'}
      camera={{ position: [0, 0, 3.85], fov: 45, near: 0.1, far: 20 }}
      gl={{
        alpha: true,
        antialias: quality === 'high',
        powerPreference: quality === 'saver' ? 'low-power' : 'high-performance',
        stencil: false,
        depth: true,
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        const canvas = gl.domElement;
        const handleLost = (e: Event) => {
          e.preventDefault();
          onContextLost?.();
        };
        canvas.addEventListener('webglcontextlost', handleLost, { once: true });
      }}
    >
      <ReactorScene state={state} quality={quality} />
    </Canvas>
  );
}
