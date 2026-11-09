import { RotateCcw, Volume2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useJarvisStore, type DayPeriod, type Quality } from '../../hooks/useJarvisStore';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';
import { GREETING_SIGNATURE } from '../../utils/greetings';
import { rankVoices } from '../../utils/voices';

const QUALITY_OPTIONS: { id: Quality; label: string }[] = [
  { id: 'auto', label: 'Auto (Adaptive)' },
  { id: 'high', label: 'High 3D' },
  { id: 'balanced', label: 'Balanced (A16)' },
  { id: 'saver', label: 'Battery Saver' },
  { id: '2d', label: '2D Hologram' },
];

const PERIODS: { id: DayPeriod; label: string }[] = [
  { id: 'morning', label: 'Morning (05:00–11:59)' },
  { id: 'afternoon', label: 'Afternoon (12:00–16:59)' },
  { id: 'evening', label: 'Evening (17:00–21:59)' },
  { id: 'night', label: 'Night (22:00–04:59)' },
];

export function SettingsModal() {
  const open = useJarvisStore((s) => s.settingsOpen);
  const setOpen = useJarvisStore((s) => s.setSettingsOpen);
  const settings = useJarvisStore((s) => s.settings);
  const updateSettings = useJarvisStore((s) => s.updateSettings);
  const tts = useSpeechSynthesis();

  const rankedVoices = rankVoices(tts.voices).slice(0, 30);

  const setCustomGreeting = (period: DayPeriod, val: string) => {
    updateSettings({
      customGreetings: {
        ...settings.customGreetings,
        [period]: val,
      },
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-2 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="JARVIS configuration"
            className="glass-strong scroll-area max-h-[90dvh] w-full max-w-lg rounded-3xl p-4"
            initial={{ y: 32, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 24, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="hud-label text-[10px] text-cyan">System Preferences</p>
                <h2 className="font-display text-base font-bold text-white">Voice, Reactor & Greetings</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="icon-btn"
                aria-label="Close settings"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-3 space-y-4">
              {/* Owner Identity */}
              <div className="glass rounded-2xl p-3.5">
                <label htmlFor="owner-name-field" className="hud-label text-[10px]">
                  Owner Name
                </label>
                <input
                  id="owner-name-field"
                  type="text"
                  value={settings.ownerName}
                  onChange={(e) => updateSettings({ ownerName: e.target.value })}
                  className="field mt-1.5 text-sm"
                />
              </div>

              {/* Voice Synthesis */}
              <div className="glass space-y-3 rounded-2xl p-3.5">
                <div className="flex items-center justify-between">
                  <p className="hud-label text-[10px]">Voice Synthesis (British-preferred ranking)</p>
                  <button
                    type="button"
                    onClick={() =>
                      tts.speak(
                        `Hello ${settings.ownerName || 'Aadarsh'}. All JARVIS voice systems are calibrated and ready, sir.`,
                        { force: true },
                      )
                    }
                    className="btn-hud h-10 min-h-[42px] px-3 text-xs"
                  >
                    <Volume2 size={14} /> Test Voice
                  </button>
                </div>

                <select
                  aria-label="Select speech voice"
                  value={settings.voiceURI ?? ''}
                  onChange={(e) => updateSettings({ voiceURI: e.target.value || null })}
                  className="field text-xs"
                >
                  <option value="">Auto-select best British / English voice</option>
                  {rankedVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <label className="flex flex-col gap-1">
                    <span className="text-steel">Volume ({Math.round(settings.volume * 100)}%)</span>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={settings.volume}
                      onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-steel">Rate ({settings.rate.toFixed(2)}×)</span>
                    <input
                      type="range"
                      min="0.75"
                      max="1.35"
                      step="0.05"
                      value={settings.rate}
                      onChange={(e) => updateSettings({ rate: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-steel">Pitch ({settings.pitch.toFixed(2)})</span>
                    <input
                      type="range"
                      min="0.7"
                      max="1.3"
                      step="0.05"
                      value={settings.pitch}
                      onChange={(e) => updateSettings({ pitch: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </div>

              {/* 3D Reactor Quality */}
              <div className="glass rounded-2xl p-3.5">
                <p className="hud-label mb-2 text-[10px]">3D Holographic Reactor Mode</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {QUALITY_OPTIONS.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => updateSettings({ quality: q.id })}
                      className={`min-h-[44px] rounded-xl border px-2.5 text-xs font-semibold transition ${
                        settings.quality === q.id
                          ? 'border-cyan bg-cyan text-[#01121d]'
                          : 'border-cyan/20 bg-navy/40 text-steel'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Greetings */}
              <div className="glass space-y-2.5 rounded-2xl p-3.5">
                <div className="flex items-center justify-between">
                  <p className="hud-label text-[10px]">Personalised Greetings (use {'{name}'} for owner)</p>
                  <button
                    type="button"
                    onClick={() => updateSettings({ customGreetings: {} })}
                    className="inline-flex min-h-[40px] items-center gap-1 px-2 text-xs text-cyan hover:underline"
                  >
                    <RotateCcw size={12} /> Reset
                  </button>
                </div>
                {PERIODS.map((p) => (
                  <div key={p.id}>
                    <label className="text-[11px] text-steel">{p.label}</label>
                    <input
                      type="text"
                      value={settings.customGreetings[p.id] ?? ''}
                      onChange={(e) => setCustomGreeting(p.id, e.target.value)}
                      placeholder={GREETING_SIGNATURE[p.id]}
                      className="field mt-1 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
