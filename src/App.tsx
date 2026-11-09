import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Settings, Share2 } from 'lucide-react';
import { BootSequence } from './components/BootSequence/BootSequence';
import { Backdrop } from './components/Dashboard/Backdrop';
import { BottomNav } from './components/Dashboard/BottomNav';
import { Toasts } from './components/Dashboard/Toasts';
import { TopBar } from './components/Dashboard/TopBar';
import { CoreView } from './components/Chat/CoreView';
import { ShowcaseView } from './components/Showcase/ShowcaseView';
import { FriendsChallengeView } from './components/FriendsChallenge/FriendsChallengeView';
import { MemoryVaultView } from './components/MemoryVault/MemoryVaultView';
import { DiagnosticsView } from './components/Diagnostics/DiagnosticsView';
import { ShareModal } from './components/ShareModal/ShareModal';
import { SettingsModal } from './components/VoiceAssistant/SettingsModal';
import { useJarvisStore, type View } from './hooks/useJarvisStore';
import { checkHealth } from './services/api';

const AVAILABLE_VIEWS: View[] = ['core', 'showcase', 'arena', 'vault', 'system'];

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function ActiveView({ view }: { view: View }) {
  switch (view) {
    case 'showcase':
      return <ShowcaseView />;
    case 'arena':
      return <FriendsChallengeView />;
    case 'vault':
      return <MemoryVaultView />;
    case 'system':
      return <DiagnosticsView />;
    case 'core':
    default:
      return <CoreView />;
  }
}

export default function App() {
  const booted = useJarvisStore((s) => s.booted);
  const setBooted = useJarvisStore((s) => s.setBooted);
  const view = useJarvisStore((s) => s.view);
  const setBackend = useJarvisStore((s) => s.setBackend);
  const setShareOpen = useJarvisStore((s) => s.setShareOpen);
  const setSettingsOpen = useJarvisStore((s) => s.setSettingsOpen);

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Capture Android Chrome PWA install prompt cleanly when available.
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => undefined);
    setInstallPrompt(null);
  };

  // Keep the backend status honest while the app is open.
  useEffect(() => {
    if (!booted) return;
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const health = await checkHealth();
      if (!cancelled) setBackend(health);
    };
    const id = window.setInterval(tick, 30000);
    window.addEventListener('online', tick);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('online', tick);
    };
  }, [booted, setBackend]);

  const handleIgnite = useCallback(() => undefined, []);
  const handleComplete = useCallback(() => setBooted(true), [setBooted]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-void text-[#dceaf7]">
      <Backdrop />

      {booted && (
        <motion.div
          className="relative z-10 flex h-full flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <TopBar
            actions={
              <>
                {installPrompt && (
                  <button
                    type="button"
                    onClick={() => void handleInstall()}
                    className="icon-btn text-cyan"
                    aria-label="Install Aadarsh's JARVIS app"
                    title="Install App"
                  >
                    <Download size={20} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  className="icon-btn"
                  aria-label="Share Aadarsh's JARVIS"
                  title="Share & QR"
                >
                  <Share2 size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="icon-btn"
                  aria-label="Settings and voice preferences"
                  title="Settings"
                >
                  <Settings size={20} />
                </button>
              </>
            }
          />
          <main className="relative min-h-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                className="absolute inset-0"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <ActiveView view={view} />
              </motion.div>
            </AnimatePresence>
          </main>
          <BottomNav available={AVAILABLE_VIEWS} />
        </motion.div>
      )}

      <AnimatePresence>
        {!booted && <BootSequence key="boot" onIgnite={handleIgnite} onComplete={handleComplete} />}
      </AnimatePresence>

      <ShareModal />
      <SettingsModal />
      <Toasts />
    </div>
  );
}
