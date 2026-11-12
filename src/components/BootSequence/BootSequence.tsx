import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Power, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useJarvisStore } from '../../hooks/useJarvisStore';
import { sfx, unlockAudio } from '../../utils/sfx';
import { primeSpeech } from '../../utils/speechPrime';
import { Reactor2D } from '../Reactor/Reactor2D';
import { useBootChecks, type CheckStatus } from './useBootChecks';

type Stage = 'gate' | 'init' | 'ignite' | 'title' | 'done';

const statusStyle: Record<CheckStatus, { text: string; color: string }> = {
  pending: { text: 'WAIT', color: 'text-steel' },
  online: { text: 'ONLINE', color: 'text-success' },
  degraded: { text: 'LIMITED', color: 'text-amber' },
  offline: { text: 'OFFLINE', color: 'text-danger' },
};

interface Props {
  onIgnite: () => void;
  onComplete: () => void;
}

export function BootSequence({ onIgnite, onComplete }: Props) {
  const [stage, setStage] = useState<Stage>('gate');
  const [revealed, setRevealed] = useState(0);
  const { checks, run, progress, complete, onlineCount, offlineCount } = useBootChecks();
  const soundFx = useJarvisStore((s) => s.settings.soundFx);
  const updateSettings = useJarvisStore((s) => s.updateSettings);
  const initStartedAt = useRef(0);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setStage('done');
    onIgnite();
    onComplete();
  }, [onComplete, onIgnite]);

  const activate = useCallback(async () => {
    // This tap is the user gesture that legitimately unlocks audio + speech on Android.
    await unlockAudio();
    primeSpeech();
    sfx.bootHum();
    initStartedAt.current = performance.now();
    setStage('init');
    void run();
  }, [run]);

  const skip = useCallback(async () => {
    await unlockAudio();
    primeSpeech();
    void run();
    finish();
  }, [finish, run]);

  // Reveal subsystem lines one by one for a cinematic cadence.
  useEffect(() => {
    if (stage !== 'init') return;
    if (revealed >= checks.length) return;
    const t = window.setTimeout(() => {
      setRevealed((r) => r + 1);
      sfx.subsystem(revealed);
    }, 190);
    return () => window.clearTimeout(t);
  }, [stage, revealed, checks.length]);

  // Advance once every real check has finished and all lines are on screen.
  useEffect(() => {
    if (stage !== 'init' || !complete || revealed < checks.length) return;
    const elapsed = performance.now() - initStartedAt.current;
    const t = window.setTimeout(() => {
      setStage('ignite');
      onIgnite();
    }, Math.max(450, 1700 - elapsed));
    return () => window.clearTimeout(t);
  }, [stage, complete, revealed, checks.length, onIgnite]);

  useEffect(() => {
    if (stage === 'ignite') {
      const t = window.setTimeout(() => {
        setStage('title');
        sfx.online();
      }, 1500);
      return () => window.clearTimeout(t);
    }
    if (stage === 'title') {
      const t = window.setTimeout(finish, 2300);
      return () => window.clearTimeout(t);
    }
  }, [stage, finish]);

  const transparent = stage === 'ignite' || stage === 'title';

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ backgroundColor: transparent ? 'rgba(1,3,9,0.35)' : 'rgba(1,3,9,1)' }}
      exit={{ opacity: 0, transition: { duration: 0.7 } }}
      transition={{ duration: 1.2 }}
    >
      {/* Controls */}
      <div className="safe-top relative z-10 flex items-center justify-between px-3 pt-2">
        <button
          type="button"
          className="icon-btn"
          aria-label={soundFx ? 'Mute sound effects' : 'Enable sound effects'}
          onClick={() => updateSettings({ soundFx: !soundFx })}
        >
          {soundFx ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
        <button type="button" className="btn-hud h-12 text-sm" onClick={skip}>
          Skip intro <SkipForward size={16} />
        </button>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-6">
        <AnimatePresence mode="wait">
          {stage === 'gate' && (
            <motion.div
              key="gate"
              className="flex flex-col items-center text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.8 }}
            >
              <button
                type="button"
                onClick={activate}
                className="group relative flex h-36 w-36 items-center justify-center rounded-full"
                aria-label="Touch to initialise Aadarsh's JARVIS"
              >
                <span
                  className="absolute inset-0 rounded-full border border-cyan/40"
                  style={{ animation: 'jv-pulse-ring 2.4s ease-out infinite' }}
                />
                <span
                  className="absolute inset-0 rounded-full border border-cyan/30"
                  style={{ animation: 'jv-pulse-ring 2.4s ease-out 1.2s infinite' }}
                />
                <span className="absolute inset-3 rounded-full border border-cyan/50 bg-cyan/5 shadow-[0_0_40px_-6px_rgba(56,225,255,0.6)] transition group-active:scale-95" />
                <Power className="relative text-cyan drop-shadow-[0_0_12px_rgba(56,225,255,0.9)]" size={40} />
              </button>
              <p className="hud-label mt-10">Touch to initialise</p>
              <p className="mt-3 max-w-[18rem] text-sm text-steel">
                Aadarsh's JARVIS uses sound and voice. Tap once to authorise audio on this device.
              </p>
            </motion.div>
          )}

          {stage === 'init' && (
            <motion.div
              key="init"
              className="w-full max-w-sm"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.5 }}
            >
              <p className="text-center font-display text-sm tracking-[0.35em] text-cyan text-glow animate-flicker">
                INITIALIZING SYSTEM
              </p>
              <div className="mx-auto mt-5 h-[3px] w-full overflow-hidden rounded-full bg-cyan/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-deep via-cyan to-arc shadow-[0_0_12px_rgba(56,225,255,0.8)]"
                  animate={{ width: `${Math.round(progress * 100)}%` }}
                  transition={{ duration: 0.35 }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between font-mono text-[11px]">
                <span className={offlineCount > 0 ? 'text-amber font-semibold' : 'text-cyan'}>
                  {offlineCount > 0
                    ? `${offlineCount} subsystem(s) offline`
                    : `${onlineCount}/${checks.length} online`}
                </span>
                <span className="text-steel">
                  {onlineCount}/{checks.length} operational
                </span>
              </div>
              <ul className="mt-5 space-y-2.5 font-mono text-[12.5px]">
                {checks.slice(0, revealed).map((c) => (
                  <motion.li
                    key={c.id}
                    className="flex items-center gap-3"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        c.status === 'pending' ? 'bg-steel' : c.status === 'online' ? 'bg-success' : c.status === 'degraded' ? 'bg-amber' : 'bg-danger'
                      }`}
                      style={c.status === 'pending' ? { animation: 'jv-blink 0.8s infinite' } : undefined}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[#cfe9f7]">{c.label}</span>
                      <span className="block truncate text-[11px] text-steel">{c.detail}</span>
                    </span>
                    <span className={`shrink-0 text-[11px] tracking-widest ${statusStyle[c.status].color}`}>
                      {statusStyle[c.status].text}
                    </span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          )}

          {stage === 'ignite' && (
            <motion.div
              key="ignite"
              className="flex flex-col items-center"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.4 }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
            >
              <Reactor2D state="thinking" size={210} className="reactor-boot" />
              <p className="hud-label mt-8">Reactor ignition</p>
            </motion.div>
          )}

          {stage === 'title' && (
            <motion.div
              key="title"
              className="flex flex-col items-center text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.h1
                className="font-display text-[2.05rem] font-bold leading-tight tracking-[0.08em] text-white text-glow sm:text-5xl"
                initial={{ opacity: 0, letterSpacing: '0.6em', filter: 'blur(10px)' }}
                animate={{ opacity: 1, letterSpacing: '0.08em', filter: 'blur(0px)' }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              >
                AADARSH'S
                <br />
                <span className="text-cyan">JARVIS</span>
              </motion.h1>
              <motion.div
                className="metal-line mt-5 w-56"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.6, duration: 0.8 }}
              />
              <motion.p
                className="mt-4 font-display text-xs tracking-[0.5em] text-success"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
              >
                SYSTEM ONLINE
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
