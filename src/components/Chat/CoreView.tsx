import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  Globe,
  Mic,
  MicOff,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useJarvisStore, type ChatMessage } from '../../hooks/useJarvisStore';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';
import { ApiError, memoryApi, streamChatReply, type SecretCommandItem } from '../../services/api';
import { bumpPulse } from '../../utils/audioBus';
import { parseLocalCommand } from '../../utils/commandParser';
import { getDayPeriod, selectGreeting } from '../../utils/greetings';
import { sfx } from '../../utils/sfx';
import { ReactorHost } from '../Reactor/ReactorHost';

const STATE_LABEL = {
  idle: 'Standing by',
  listening: 'Listening',
  thinking: 'Processing',
  speaking: 'Speaking',
  error: 'Attention required',
} as const;

const QUICK_PROMPTS = [
  'JARVIS, who is the boss?',
  'Calculate 987 multiplied by 654',
  'Explain black holes and time dilation',
  'Latest breakthroughs in AI',
  'JARVIS, activate showcase mode',
  'Challenge my friends',
];

interface PendingMemoryConsent {
  content: string;
}

export function CoreView() {
  const settings = useJarvisStore((s) => s.settings);
  const updateSettings = useJarvisStore((s) => s.updateSettings);
  const messages = useJarvisStore((s) => s.messages);
  const addMessage = useJarvisStore((s) => s.addMessage);
  const updateMessage = useJarvisStore((s) => s.updateMessage);
  const clearMessages = useJarvisStore((s) => s.clearMessages);
  const reactorState = useJarvisStore((s) => s.reactorState);
  const setReactorState = useJarvisStore((s) => s.setReactorState);
  const interimTranscript = useJarvisStore((s) => s.interimTranscript);
  const setView = useJarvisStore((s) => s.setView);
  const setShareOpen = useJarvisStore((s) => s.setShareOpen);
  const ownerKey = useJarvisStore((s) => s.ownerKey);
  const toast = useJarvisStore((s) => s.toast);
  const sessionGreeted = useJarvisStore((s) => s.sessionGreeted);
  const setSessionGreeted = useJarvisStore((s) => s.setSessionGreeted);
  const currentDayPeriod = useJarvisStore((s) => s.currentDayPeriod);
  const setCurrentDayPeriod = useJarvisStore((s) => s.setCurrentDayPeriod);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [customSecrets, setCustomSecrets] = useState<SecretCommandItem[]>([]);
  const [pendingConsent, setPendingConsent] = useState<PendingMemoryConsent | null>(null);
  const [greetingBanner, setGreetingBanner] = useState<string>('');

  const abortRef = useRef<AbortController | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const tts = useSpeechSynthesis();

  useEffect(() => {
    memoryApi
      .listSecretCommands()
      .then((res) => setCustomSecrets(res.items))
      .catch(() => undefined);
  }, []);

  // Speak & display personalised time-aware greeting on session boot.
  useEffect(() => {
    const { text, period } = selectGreeting({
      ownerName: settings.ownerName,
      customGreetings: settings.customGreetings,
    });
    setGreetingBanner(text);
    setCurrentDayPeriod(period);

    const SESSION_GREETED_KEY = 'jarvis_session_greeted';
    const alreadyGreeted =
      sessionGreeted ||
      (typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(SESSION_GREETED_KEY) === 'true');

    if (alreadyGreeted) {
      if (!sessionGreeted) setSessionGreeted(true);
      return;
    }

    setSessionGreeted(true);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_GREETED_KEY, 'true');
    }

    const last = messages[messages.length - 1];
    // Check if the last item is already an automated greeting to prevent duplicate back-to-back greetings
    const isLastGreeting =
      last &&
      last.role === 'jarvis' &&
      last.origin === 'local' &&
      /^(Good morning|Good afternoon|Good evening|Working late|Morning|Evening|Burning the midnight oil|Night mode engaged|A fresh start|Welcome back)/i.test(
        last.text.trim(),
      );

    if (isLastGreeting) {
      // Refresh the existing greeting to match current IST period rather than appending a duplicate
      updateMessage(last.id, { text, createdAt: Date.now() });
    } else {
      addMessage({ role: 'jarvis', text, origin: 'local' });
    }

    if (!settings.voiceMuted) {
      const t = window.setTimeout(() => {
        try {
          tts.speak(text);
        } catch {
          /* browser autoplay restrictions gracefully handled */
        }
      }, 350);
      return () => window.clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionGreeted]);

  // Seamlessly update greeting context across day-period transitions without interrupting conversations
  useEffect(() => {
    const timer = window.setInterval(() => {
      const p = getDayPeriod();
      if (p !== currentDayPeriod) {
        setCurrentDayPeriod(p);
        const { text } = selectGreeting({
          ownerName: settings.ownerName,
          customGreetings: settings.customGreetings,
        });
        setGreetingBanner(text);
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [currentDayPeriod, setCurrentDayPeriod, settings.ownerName, settings.customGreetings]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pendingConsent, interimTranscript]);

  const handleConfirmMemory = async () => {
    if (!pendingConsent) return;
    const content = pendingConsent.content;
    setPendingConsent(null);
    try {
      await memoryApi.addMemory(content, ownerKey);
      sfx.success();
      const reply = `Stored in your Memory Vault, ${settings.ownerName}: "${content}"`;
      addMessage({ role: 'jarvis', text: reply, origin: 'local' });
      tts.speak(reply);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? 'Memory Vault is locked. Unlock it with your owner passcode in the Vault tab first.'
          : err instanceof Error
            ? err.message
            : 'Could not save memory.';
      addMessage({ role: 'jarvis', text: msg, kind: 'error', origin: 'local' });
      toast(msg, 'warning');
    }
  };

  const sendQuery = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || busy) return;

      tts.stop();
      setInput('');
      addMessage({ role: 'user', text });
      bumpPulse();

      const cmd = parseLocalCommand(text, {
        ownerName: settings.ownerName,
        customSecrets,
      });

      if (cmd) {
        let finalReply = cmd.reply;
        const action = cmd.action;

        if (cmd.effect.type === 'open_url') {
          const opened = window.open(cmd.effect.url, '_blank', 'noopener,noreferrer');
          if (!opened) {
            finalReply = `Your browser blocked the automatic pop-up for **${cmd.effect.label}**. Tap the button below to open it directly.`;
          }
        } else if (cmd.effect.type === 'create_note') {
          try {
            await memoryApi.addNote(cmd.effect.content, ownerKey);
            sfx.success();
          } catch (err) {
            finalReply =
              err instanceof ApiError && err.status === 401
                ? 'Your Vault is locked, so I could not save that note. Unlock the Vault tab with your owner passcode first.'
                : 'I could not reach the database to save that note.';
          }
        } else if (cmd.effect.type === 'save_memory_prompt') {
          setPendingConsent({ content: cmd.effect.content });
        } else if (cmd.effect.type === 'mute') {
          updateSettings({ voiceMuted: cmd.effect.muted });
        } else if (cmd.effect.type === 'stop_speaking') {
          tts.stop();
        } else if (cmd.effect.type === 'clear_chat') {
          clearMessages();
          return;
        } else if (cmd.effect.type === 'navigate') {
          const targetView = cmd.effect.view;
          window.setTimeout(() => setView(targetView), 650);
        } else if (cmd.effect.type === 'open_share') {
          setShareOpen(true);
        }

        addMessage({
          role: 'jarvis',
          text: finalReply,
          action,
          origin: 'local',
        });

        if (cmd.effect.type !== 'mute' || !cmd.effect.muted) {
          tts.speak(finalReply);
        }
        return;
      }

      const historySnapshot = useJarvisStore
        .getState()
        .messages.filter((m) => !m.pending && m.kind !== 'error')
        .slice(-14)
        .map((m) => ({ role: m.role, text: m.text }));

      const assistantId = addMessage({
        role: 'jarvis',
        text: '',
        pending: true,
        origin: 'gemini',
      });

      setBusy(true);
      setReactorState('thinking');
      const controller = new AbortController();
      abortRef.current = controller;

      let assembled = '';

      try {
        await streamChatReply({
          message: text,
          history: historySnapshot.slice(0, -1),
          ownerName: settings.ownerName,
          webResearch: settings.webResearch,
          includeMemory: true,
          signal: controller.signal,
          onChunk(chunk) {
            assembled += chunk;
            updateMessage(assistantId, { text: assembled, pending: false });
          },
          onMeta(meta) {
            if (meta.sources.length || meta.searchQueries.length) {
              updateMessage(assistantId, {
                sources: meta.sources,
                searchQueries: meta.searchQueries,
              });
            }
          },
        });

        bumpPulse();
        if (assembled.trim()) {
          tts.speak(assembled);
        } else {
          updateMessage(assistantId, {
            text: 'I received an empty response. Please try phrasing that again.',
            pending: false,
            kind: 'error',
          });
          setReactorState('idle');
        }
      } catch (err) {
        if (controller.signal.aborted) {
          updateMessage(assistantId, {
            text: assembled || 'Cancelled.',
            pending: false,
          });
          setReactorState('idle');
        } else {
          const msg = err instanceof Error ? err.message : 'Something went wrong.';
          updateMessage(assistantId, {
            text: msg,
            pending: false,
            kind: 'error',
          });
          setReactorState('error');
          sfx.error();
          window.setTimeout(() => {
            if (useJarvisStore.getState().reactorState === 'error') setReactorState('idle');
          }, 1800);
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [
      busy,
      tts,
      addMessage,
      settings.ownerName,
      settings.webResearch,
      customSecrets,
      ownerKey,
      updateSettings,
      clearMessages,
      setView,
      setShareOpen,
      setReactorState,
      updateMessage,
      toast,
    ],
  );

  const mic = useSpeechRecognition({
    onBeforeStart: () => tts.stop(),
    onTranscript: (transcript) => {
      void sendQuery(transcript);
    },
  });

  const handleCancel = () => {
    abortRef.current?.abort();
    tts.stop();
  };

  return (
    <section className="mx-auto flex h-full w-full max-w-3xl flex-col" aria-label="JARVIS core">
      <div className="relative flex shrink-0 flex-col items-center justify-center pt-1">
        <div className="relative flex flex-col items-center justify-center">
          <ReactorHost state={reactorState} size={172} />
          <span className="hud-label mt-0.5 whitespace-nowrap">
            {STATE_LABEL[reactorState]}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 px-3">
          <button
            type="button"
            onClick={() => updateSettings({ webResearch: !settings.webResearch })}
            className={`chip min-h-[42px] transition ${
              settings.webResearch ? 'border-cyan/60 bg-cyan/15 text-cyan-soft' : 'text-steel'
            }`}
            aria-pressed={settings.webResearch}
          >
            <Globe size={14} />
            <span>Web search {settings.webResearch ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!settings.voiceMuted) tts.stop();
              updateSettings({ voiceMuted: !settings.voiceMuted });
            }}
            className={`chip min-h-[42px] transition ${
              !settings.voiceMuted ? 'border-cyan/40 text-[#dceaf7]' : 'border-amber/40 text-amber'
            }`}
            aria-pressed={settings.voiceMuted}
          >
            {settings.voiceMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span>{settings.voiceMuted ? 'Muted' : 'Voice ON'}</span>
          </button>

          {tts.speaking && (
            <button
              type="button"
              onClick={tts.stop}
              className="chip min-h-[42px] border-amber/60 bg-amber/15 text-amber"
            >
              <Square size={12} fill="currentColor" />
              <span>Stop speaking</span>
            </button>
          )}
        </div>
      </div>

      {greetingBanner && messages.length <= 1 && (
        <div className="mx-3 mt-2 rounded-2xl border border-cyan/20 bg-navy/40 px-3.5 py-2 text-center">
          <p className="hud-label text-[9px]">Owner: {settings.ownerName}</p>
          <p className="mt-0.5 text-xs text-cyan-soft">{greetingBanner}</p>
        </div>
      )}

      <div className="scroll-area mt-2 min-h-0 flex-1 space-y-3 px-3 pb-3">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        <AnimatePresence>
          {mic.listening && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm border border-cyan/45 bg-cyan/10 px-3.5 py-2.5 text-sm text-cyan-soft"
            >
              <span className="hud-label mr-2 text-[9px]">Live mic</span>
              {interimTranscript || 'Listening… speak clearly'}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {pendingConsent && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass rounded-2xl border-cyan/35 p-3.5"
            >
              <p className="hud-label text-[10px] text-cyan">Consent required · Memory Vault</p>
              <p className="mt-1.5 text-sm text-white">Save "{pendingConsent.content}" to persistent memory?</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={handleConfirmMemory} className="btn-hud btn-primary flex-1 text-sm">
                  <Check size={16} /> Remember
                </button>
                <button
                  type="button"
                  onClick={() => setPendingConsent(null)}
                  className="btn-hud flex-1 text-sm"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={listEndRef} />
      </div>

      {!busy && (
        <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-3 pb-2">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void sendQuery(q)}
              className="chip min-h-[42px] hover:border-cyan/60 hover:bg-cyan/12 active:scale-95 transition"
            >
              <Sparkles size={12} className="text-cyan" />
              <span>{q}</span>
            </button>
          ))}
        </div>
      )}

      <form
        className="glass mx-2 mb-2 flex shrink-0 items-center gap-1.5 rounded-2xl p-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void sendQuery(input);
        }}
      >
        <button
          type="button"
          onClick={mic.toggle}
          aria-label={mic.listening ? 'Stop listening' : 'Tap to speak'}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition ${
            mic.listening
              ? 'border-cyan bg-cyan text-[#01121d] shadow-[0_0_20px_rgba(56,225,255,0.8)]'
              : mic.permission === 'denied' || !mic.supported
                ? 'border-danger/40 bg-danger/10 text-danger'
                : 'border-cyan/35 bg-cyan/10 text-cyan hover:bg-cyan/20'
          }`}
        >
          {mic.listening ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mic.listening ? 'Listening…' : `Ask JARVIS anything, ${settings.ownerName}…`}
          className="h-12 min-w-0 flex-1 bg-transparent px-2 text-[15px] text-white placeholder:text-steel/70 focus:outline-none"
          disabled={busy}
        />

        {messages.length > 1 && !busy && !input.trim() && (
          <button
            type="button"
            onClick={() => {
              clearMessages();
              toast('Conversation cleared', 'info');
            }}
            className="icon-btn shrink-0 text-steel"
            aria-label="Clear conversation"
          >
            <Trash2 size={18} />
          </button>
        )}

        {busy ? (
          <button
            type="button"
            onClick={handleCancel}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-danger/50 bg-danger/15 text-danger"
            aria-label="Stop response"
          >
            <Square size={18} fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan text-[#01121d] transition disabled:opacity-35"
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        )}
      </form>
    </section>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isError = message.kind === 'error';

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
    >
      <div
        className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm ${
          isUser
            ? 'rounded-br-sm border border-cyan/35 bg-cyan/15 text-white'
            : isError
              ? 'rounded-bl-sm border border-danger/40 bg-danger/10 text-[#ffd5dc]'
              : 'glass rounded-bl-sm text-[#e0effa]'
        }`}
      >
        {isError && (
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-danger">
            <ShieldAlert size={14} />
            <span>Notice</span>
          </div>
        )}

        {message.pending && !message.text ? (
          <div className="flex items-center gap-2 py-1 text-xs text-cyan-soft">
            <span className="h-2 w-2 animate-ping rounded-full bg-cyan" />
            <span>Thinking…</span>
          </div>
        ) : isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        ) : (
          <div className="prose-jarvis">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
          </div>
        )}

        {message.action && (
          <a
            href={message.action.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-hud mt-2.5 h-11 min-h-[44px] text-xs"
          >
            <span>{message.action.label}</span>
            <ExternalLink size={14} />
          </a>
        )}

        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 border-t border-cyan/15 pt-2">
            <p className="hud-label text-[9px]">Verified web sources</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {message.sources.slice(0, 6).map((src) => (
                <a
                  key={src.uri}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-cyan/25 bg-cyan/5 px-3 py-1 text-[11px] text-cyan-soft hover:bg-cyan/15"
                >
                  <Globe size={12} />
                  <span className="max-w-[170px] truncate">{src.title}</span>
                  <ExternalLink size={11} />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.article>
  );
}
