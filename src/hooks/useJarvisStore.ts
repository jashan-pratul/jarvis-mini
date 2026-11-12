import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getDayPeriod } from '../utils/greetings';

export type View = 'core' | 'showcase' | 'arena' | 'vault' | 'system';
export type ReactorState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
export type Quality = 'auto' | 'high' | 'balanced' | 'saver' | '2d';
export type DayPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

export interface Source {
  title: string;
  uri: string;
}

export interface ChatAction {
  label: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'jarvis';
  text: string;
  createdAt: number;
  kind?: 'text' | 'error' | 'system';
  sources?: Source[];
  searchQueries?: string[];
  action?: ChatAction;
  pending?: boolean;
  /** Where the reply came from — shown honestly in the UI. */
  origin?: 'gemini' | 'local';
}

export interface Settings {
  ownerName: string;
  soundFx: boolean;
  voiceMuted: boolean;
  volume: number;
  rate: number;
  pitch: number;
  voiceURI: string | null;
  recognitionLang: string;
  quality: Quality;
  skipIntro: boolean;
  webResearch: boolean;
  micVisualizer: boolean;
  wakeWord: boolean;
  customGreetings: Partial<Record<DayPeriod, string>>;
}

export interface BackendHealth {
  reachable: boolean;
  aiConfigured: boolean;
  model: string | null;
  databaseOk: boolean;
  ownerProtected: boolean;
  latencyMs: number | null;
  checkedAt: number;
  offlineReason?: string | null;
}

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

export const defaultSettings: Settings = {
  ownerName: 'Aadarsh',
  soundFx: true,
  voiceMuted: false,
  volume: 1,
  rate: 1,
  pitch: 0.95,
  voiceURI: null,
  recognitionLang: 'en-IN',
  quality: 'auto',
  skipIntro: false,
  webResearch: true,
  // On Android, a parallel getUserMedia stream can starve SpeechRecognition — opt-in only.
  micVisualizer: !isAndroid,
  wakeWord: false,
  customGreetings: {},
};

interface JarvisState {
  // persisted
  settings: Settings;
  messages: ChatMessage[];
  // session
  booted: boolean;
  view: View;
  reactorState: ReactorState;
  interimTranscript: string;
  backend: BackendHealth | null;
  ownerKey: string | null;
  toasts: Toast[];
  settingsOpen: boolean;
  shareOpen: boolean;
  fps: number | null;
  activeQuality: Exclude<Quality, 'auto'>;
  startedAt: number;
  sessionGreeted: boolean;
  currentDayPeriod: DayPeriod;

  setBooted: (v: boolean) => void;
  setView: (v: View) => void;
  setReactorState: (s: ReactorState) => void;
  setInterim: (t: string) => void;
  setBackend: (b: BackendHealth | null) => void;
  setOwnerKey: (k: string | null) => void;
  setSessionGreeted: (v: boolean) => void;
  setCurrentDayPeriod: (p: DayPeriod) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  addMessage: (m: Omit<ChatMessage, 'id' | 'createdAt'> & { id?: string }) => string;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clearMessages: () => void;
  toast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  setSettingsOpen: (v: boolean) => void;
  setShareOpen: (v: boolean) => void;
  setFps: (v: number | null) => void;
  setActiveQuality: (q: Exclude<Quality, 'auto'>) => void;
}

const MAX_STORED_MESSAGES = 80;
let toastSeq = 0;

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const useJarvisStore = create<JarvisState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      messages: [],
      booted: false,
      view: 'core',
      reactorState: 'idle',
      interimTranscript: '',
      backend: null,
      ownerKey: typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('jarvis-owner-key') : null,
      toasts: [],
      settingsOpen: false,
      shareOpen: false,
      fps: null,
      activeQuality: 'balanced',
      startedAt: Date.now(),
      sessionGreeted: false,
      currentDayPeriod: getDayPeriod(),

      setBooted: (booted) => set({ booted }),
      setView: (view) => set({ view }),
      setReactorState: (reactorState) => set({ reactorState }),
      setInterim: (interimTranscript) => set({ interimTranscript }),
      setBackend: (backend) => set({ backend }),
      setSessionGreeted: (sessionGreeted) => set({ sessionGreeted }),
      setCurrentDayPeriod: (currentDayPeriod) => set({ currentDayPeriod }),
      setOwnerKey: (ownerKey) => {
        if (ownerKey) sessionStorage.setItem('jarvis-owner-key', ownerKey);
        else sessionStorage.removeItem('jarvis-owner-key');
        set({ ownerKey });
      },
      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      addMessage: (m) => {
        const id = m.id ?? newId();
        const message: ChatMessage = { ...m, id, createdAt: Date.now() };
        set({ messages: [...get().messages, message].slice(-MAX_STORED_MESSAGES) });
        return id;
      },
      updateMessage: (id, patch) =>
        set({ messages: get().messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }),
      clearMessages: () => set({ messages: [] }),
      toast: (message, tone = 'info') => {
        const id = ++toastSeq;
        set({ toasts: [...get().toasts, { id, message, tone }].slice(-3) });
        window.setTimeout(() => get().dismissToast(id), tone === 'error' ? 6000 : 3800);
      },
      dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setShareOpen: (shareOpen) => set({ shareOpen }),
      setFps: (fps) => set({ fps }),
      setActiveQuality: (activeQuality) => set({ activeQuality }),
    }),
    {
      name: 'aadarshs-jarvis',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
        messages: state.messages.filter((m) => !m.pending),
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<JarvisState>;
        return {
          ...current,
          ...p,
          settings: { ...defaultSettings, ...(p.settings ?? {}) },
          messages: Array.isArray(p.messages) ? p.messages : [],
        };
      },
    },
  ),
);
