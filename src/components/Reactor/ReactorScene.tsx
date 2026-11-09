import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useJarvisStore, type Quality, type ReactorState } from '../../hooks/useJarvisStore';
import { audioBus } from '../../utils/audioBus';

interface Palette {
  core: THREE.Color;
  ring: THREE.Color;
  accent: THREE.Color;
  spin: number;
  pulseSpeed: number;
}

const PALETTES: Record<ReactorState, Palette> = {
  idle: {
    core: new THREE.Color('#38e1ff'),
    ring: new THREE.Color('#1cc8f5'),
    accent: new THREE.Color('#9ff4ff'),
    spin: 0.35,
    pulseSpeed: 1.6,
  },
  listening: {
    core: new THREE.Color('#7ef9ff'),
    ring: new THREE.Color('#38e1ff'),
    accent: new THREE.Color('#ffffff'),
    spin: 0.65,
    pulseSpeed: 3.1,
  },
  thinking: {
    core: new THREE.Color('#4fb8ff'),
    ring: new THREE.Color('#38e1ff'),
    accent: new THREE.Color('#a8d8ff'),
    spin: 2.1,
    pulseSpeed: 5.2,
  },
  speaking: {
    core: new THREE.Color('#9ff4ff'),
    ring: new THREE.Color('#38e1ff'),
    accent: new THREE.Color('#ffffff'),
    spin: 0.95,
    pulseSpeed: 4.0,
  },
  error: {
    core: new THREE.Color('#ff5470'),
    ring: new THREE.Color('#ff7b54'),
    accent: new THREE.Color('#ffb547'),
    spin: 0.25,
    pulseSpeed: 2.4,
  },
};

/** Procedural radial glow sprite texture — avoids postprocessing bloom cost on Mali-G57. */
function createGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.22, 'rgba(159, 244, 255, 0.85)');
  grad.addColorStop(0.5, 'rgba(56, 225, 255, 0.28)');
  grad.addColorStop(1, 'rgba(56, 225, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

interface Props {
  state: ReactorState;
  quality: Exclude<Quality, 'auto' | '2d'>;
}

const WAVE_SEGMENTS = 64;

export function ReactorScene({ state, quality }: Props) {
  const rootRef = useRef<THREE.Group>(null);
  const coreMeshRef = useRef<THREE.Mesh>(null);
  const innerCageRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Group>(null);
  const ring2Ref = useRef<THREE.Group>(null);
  const ring3Ref = useRef<THREE.Group>(null);
  const pulseRingRef = useRef<THREE.Mesh>(null);
  const glowSpriteRef = useRef<THREE.Sprite>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const waveLineRef = useRef<THREE.LineLoop>(null);
  const trail1Ref = useRef<THREE.Mesh>(null);
  const trail2Ref = useRef<THREE.Mesh>(null);

  const setFps = useJarvisStore((s) => s.setFps);
  const setActiveQuality = useJarvisStore((s) => s.setActiveQuality);

  const particleCount = quality === 'high' ? 360 : quality === 'balanced' ? 200 : 80;
  const sphereDetail = quality === 'saver' ? 24 : 36;

  const glowTexture = useMemo(() => createGlowTexture(), []);

  // Materials mutated smoothly in useFrame (zero React re-allocations)
  const materials = useMemo(() => {
    const core = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#9ff4ff'),
      transparent: true,
      opacity: 0.95,
    });
    const cage = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffffff'),
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringPrimary = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#38e1ff'),
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ringSecondary = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#1cc8f5'),
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const pulse = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#7ef9ff'),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const glow = new THREE.SpriteMaterial({
      map: glowTexture,
      color: new THREE.Color('#38e1ff'),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.PointsMaterial({
      size: quality === 'saver' ? 0.045 : 0.038,
      map: glowTexture,
      color: new THREE.Color('#7eeaff'),
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const wave = new THREE.LineBasicMaterial({
      color: new THREE.Color('#9ff4ff'),
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    return { core, cage, ringPrimary, ringSecondary, pulse, glow, particles, wave };
  }, [glowTexture, quality]);

  // Orbital particle cloud positions & per-particle orbital seed
  const particleData = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const seeds = new Float32Array(particleCount * 3); // radius, angle, inclination
    for (let i = 0; i < particleCount; i++) {
      const r = 1.05 + Math.random() * 1.45;
      const theta = Math.random() * Math.PI * 2;
      const tilt = (Math.random() - 0.5) * 1.35;
      seeds[i * 3] = r;
      seeds[i * 3 + 1] = theta;
      seeds[i * 3 + 2] = tilt;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.sin(theta * 1.3) * tilt;
      positions[i * 3 + 2] = Math.sin(theta) * r;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geom, seeds };
  }, [particleCount]);

  // Dynamic 64-segment circular waveform geometry
  const waveGeom = useMemo(() => {
    const positions = new Float32Array(WAVE_SEGMENTS * 3);
    for (let i = 0; i < WAVE_SEGMENTS; i++) {
      const a = (i / WAVE_SEGMENTS) * Math.PI * 2;
      positions[i * 3] = Math.cos(a) * 1.28;
      positions[i * 3 + 1] = Math.sin(a) * 1.28;
      positions[i * 3 + 2] = 0;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, []);

  // Arc segment angles for the mechanical stator ring
  const statorSegments = useMemo(() => Array.from({ length: 12 }, (_, i) => (i * Math.PI * 2) / 12), []);

  // FPS sampling & smooth state values
  const fpsCounter = useRef({ frames: 0, lastSample: performance.now(), lowStreak: 0 });
  const currentSpin = useRef(0.35);
  const pulsePhase = useRef(0);

  useFrame((ctx, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = performance.now();
    const elapsed = ctx.clock.elapsedTime;

    // 1. Real FPS measurement (once per second) + adaptive quality when set to 'auto'
    const fc = fpsCounter.current;
    fc.frames += 1;
    if (now - fc.lastSample >= 1000) {
      const fps = Math.round((fc.frames * 1000) / (now - fc.lastSample));
      fc.frames = 0;
      fc.lastSample = now;
      setFps(fps);
      const userPref = useJarvisStore.getState().settings.quality;
      if (userPref === 'auto') {
        if (fps < 32) {
          fc.lowStreak += 1;
          if (fc.lowStreak >= 2 && quality !== 'saver') {
            setActiveQuality('saver');
          }
        } else {
          fc.lowStreak = 0;
        }
      }
    }

    const target = PALETTES[state];
    const lerpFactor = 1 - Math.exp(-dt * 4.5);

    // Smooth colour transitions
    materials.core.color.lerp(target.accent, lerpFactor);
    materials.cage.color.lerp(target.core, lerpFactor);
    materials.ringPrimary.color.lerp(target.core, lerpFactor);
    materials.ringSecondary.color.lerp(target.ring, lerpFactor);
    materials.glow.color.lerp(target.core, lerpFactor);
    materials.particles.color.lerp(target.accent, lerpFactor);
    materials.wave.color.lerp(target.accent, lerpFactor);
    materials.pulse.color.lerp(target.core, lerpFactor);

    currentSpin.current = THREE.MathUtils.lerp(currentSpin.current, target.spin, lerpFactor);
    const spin = currentSpin.current;

    // Compute real audio / speech reactivity level (0..1)
    let voiceEnergy = 0;
    if (state === 'listening') {
      if (audioBus.spectrumLive) {
        voiceEnergy = Math.min(1, audioBus.micLevel * 2.2);
      } else {
        const sinceRec = (now - audioBus.lastRecognitionActivity) / 1000;
        voiceEnergy = sinceRec < 0.45 ? (1 - sinceRec / 0.45) * 0.65 : 0.14 + Math.sin(elapsed * 4) * 0.08;
      }
    } else if (state === 'speaking') {
      const sinceWord = (now - audioBus.lastBoundaryAt) / 1000;
      if (audioBus.boundarySupported && sinceWord < 0.35) {
        voiceEnergy = Math.exp(-sinceWord * 9) * 0.9 + 0.15;
      } else {
        // Syllabic cadence envelope for browser voices that omit boundary events
        voiceEnergy =
          0.35 +
          0.28 * Math.sin(elapsed * 9.5) +
          0.2 * Math.sin(elapsed * 15.3 + 1.1) +
          0.12 * Math.cos(elapsed * 23.1);
      }
    } else if (state === 'thinking') {
      voiceEnergy = 0.28 + 0.22 * Math.sin(elapsed * 6.5);
    }

    // Subtle floating motion on root
    if (rootRef.current) {
      rootRef.current.position.y = Math.sin(elapsed * 0.9) * 0.04;
      rootRef.current.rotation.y = Math.sin(elapsed * 0.35) * 0.14;
    }

    // Core sphere & wireframe cage
    const baseBreath = 1 + Math.sin(elapsed * target.pulseSpeed) * 0.045;
    const coreScale = baseBreath + voiceEnergy * 0.22;
    if (coreMeshRef.current) {
      coreMeshRef.current.scale.setScalar(coreScale);
    }
    if (innerCageRef.current) {
      innerCageRef.current.scale.setScalar(coreScale * 1.24);
      innerCageRef.current.rotation.x += dt * spin * 1.4;
      innerCageRef.current.rotation.y -= dt * spin * 1.1;
    }
    if (glowSpriteRef.current) {
      const glowScale = 2.35 + voiceEnergy * 0.75 + Math.sin(elapsed * target.pulseSpeed) * 0.12;
      glowSpriteRef.current.scale.set(glowScale, glowScale, 1);
      materials.glow.opacity = state === 'error' ? 0.55 + Math.sin(elapsed * 7) * 0.25 : 0.78 + voiceEnergy * 0.2;
    }

    // Gyroscopic holographic rings
    if (ring1Ref.current) {
      ring1Ref.current.rotation.z += dt * spin * 0.95;
      ring1Ref.current.rotation.x = Math.sin(elapsed * 0.5) * 0.28;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z -= dt * spin * 0.68;
      ring2Ref.current.rotation.y = Math.cos(elapsed * 0.42) * 0.42 + 0.35;
    }
    if (ring3Ref.current) {
      ring3Ref.current.rotation.z += dt * spin * 0.42;
      ring3Ref.current.rotation.x = -0.55 + Math.sin(elapsed * 0.3) * 0.2;
      ring3Ref.current.rotation.y += dt * spin * 0.25;
    }

    // Light-trail orbital arcs
    if (trail1Ref.current) {
      trail1Ref.current.rotation.z += dt * (spin * 2.2 + 0.6);
    }
    if (trail2Ref.current) {
      trail2Ref.current.rotation.z -= dt * (spin * 1.7 + 0.45);
    }

    // Expanding energy pulse wave (continuous in thinking/listening, or triggered via audioBus.pulse)
    if (pulseRingRef.current) {
      const manualAge = (now - audioBus.pulse) / 1000;
      if (manualAge < 1.1) {
        const p = manualAge / 1.1;
        pulseRingRef.current.scale.setScalar(0.55 + p * 1.85);
        materials.pulse.opacity = (1 - p) * 0.75;
      } else if (state === 'thinking' || state === 'listening') {
        pulsePhase.current = (pulsePhase.current + dt * (state === 'thinking' ? 1.15 : 0.65)) % 1;
        const p = pulsePhase.current;
        pulseRingRef.current.scale.setScalar(0.6 + p * 1.65);
        materials.pulse.opacity = (1 - p) * 0.45;
      } else {
        materials.pulse.opacity = THREE.MathUtils.lerp(materials.pulse.opacity, 0, lerpFactor);
      }
    }

    // Sound-reactive circular waveform
    if (waveLineRef.current) {
      const pos = waveGeom.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const active = state === 'listening' || state === 'speaking' || state === 'thinking';
      materials.wave.opacity = THREE.MathUtils.lerp(
        materials.wave.opacity,
        active ? 0.85 : 0.28,
        lerpFactor,
      );
      for (let i = 0; i < WAVE_SEGMENTS; i++) {
        const angle = (i / WAVE_SEGMENTS) * Math.PI * 2;
        let amp = 0.015 * Math.sin(angle * 6 + elapsed * 2);
        if (state === 'listening' && audioBus.spectrumLive) {
          amp += audioBus.spectrum[i % audioBus.spectrum.length] * 0.36;
        } else if (active) {
          amp +=
            voiceEnergy *
            (0.14 * Math.sin(angle * 5 + elapsed * 8) + 0.09 * Math.cos(angle * 9 - elapsed * 11));
        }
        const r = 1.24 + amp;
        arr[i * 3] = Math.cos(angle) * r;
        arr[i * 3 + 1] = Math.sin(angle) * r;
      }
      pos.needsUpdate = true;
      waveLineRef.current.rotation.z = elapsed * 0.12;
    }

    // Orbital particle field (skip per-vertex CPU update in saver mode — rotate whole cloud instead)
    if (particlesRef.current) {
      if (quality === 'saver') {
        particlesRef.current.rotation.y += dt * spin * 0.45;
        particlesRef.current.rotation.z += dt * 0.08;
      } else {
        const pos = particleData.geom.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        const seeds = particleData.seeds;
        const speedMul = 0.25 + spin * 0.38;
        for (let i = 0; i < particleCount; i++) {
          const r = seeds[i * 3];
          const theta = seeds[i * 3 + 1] + elapsed * speedMul * (1.6 / r);
          const tilt = seeds[i * 3 + 2];
          arr[i * 3] = Math.cos(theta) * r;
          arr[i * 3 + 1] = Math.sin(theta * 1.5) * tilt * 0.55;
          arr[i * 3 + 2] = Math.sin(theta) * r * 0.65;
        }
        pos.needsUpdate = true;
      }
    }
  });

  return (
    <group ref={rootRef}>
      {/* Soft radial additive core halo */}
      <sprite ref={glowSpriteRef} material={materials.glow} scale={[2.4, 2.4, 1]} />

      {/* Central energy sphere */}
      <mesh ref={coreMeshRef} material={materials.core}>
        <sphereGeometry args={[0.42, sphereDetail, sphereDetail]} />
      </mesh>

      {/* Geodesic plasma lattice */}
      <mesh ref={innerCageRef} material={materials.cage}>
        <icosahedronGeometry args={[0.46, quality === 'saver' ? 1 : 2]} />
      </mesh>

      {/* Ring 1: Segmented mechanical stator + inner containment torus */}
      <group ref={ring1Ref}>
        <mesh material={materials.ringPrimary}>
          <torusGeometry args={[0.88, 0.016, 12, 72]} />
        </mesh>
        {statorSegments.map((angle, idx) => (
          <mesh
            key={idx}
            material={materials.ringPrimary}
            position={[Math.cos(angle) * 0.98, Math.sin(angle) * 0.98, 0]}
            rotation={[0, 0, angle]}
          >
            <boxGeometry args={[0.09, 0.032, 0.02]} />
          </mesh>
        ))}
      </group>

      {/* Ring 2: Tilted gimbal arc + light trails */}
      <group ref={ring2Ref}>
        <mesh material={materials.ringSecondary}>
          <torusGeometry args={[1.14, 0.011, 10, 80]} />
        </mesh>
        <mesh ref={trail1Ref} material={materials.ringPrimary}>
          <torusGeometry args={[1.14, 0.024, 10, 40, Math.PI * 0.55]} />
        </mesh>
      </group>

      {/* Ring 3: Outer orbital ring + counter light trail */}
      <group ref={ring3Ref}>
        <mesh material={materials.ringSecondary}>
          <torusGeometry args={[1.48, 0.01, 10, 90]} />
        </mesh>
        <mesh ref={trail2Ref} material={materials.ringPrimary}>
          <torusGeometry args={[1.48, 0.022, 10, 44, Math.PI * 0.42]} />
        </mesh>
      </group>

      {/* Sound / recognition waveform ring */}
      <lineLoop ref={waveLineRef} geometry={waveGeom} material={materials.wave} />

      {/* Expanding energy pulse ring */}
      <mesh ref={pulseRingRef} material={materials.pulse}>
        <ringGeometry args={[0.92, 0.97, 64]} />
      </mesh>

      {/* Orbital particles */}
      <points ref={particlesRef} geometry={particleData.geom} material={materials.particles} />
    </group>
  );
}
