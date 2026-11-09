import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Globe, Mic, Play, RotateCcw, SkipForward, Sparkles, Square, Volume2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useJarvisStore, type Source } from '../../hooks/useJarvisStore';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';
import { streamChatReply } from '../../services/api';
import { bumpPulse } from '../../utils/audioBus';
import { tryEvaluateMath } from '../../utils/mathEval';
import { sfx } from '../../utils/sfx';
import { ReactorHost } from '../Reactor/ReactorHost';

interface DemoSpec {
  number: string;
  title: string;
  subtitle: string;
  prompt: string;
  webResearch: boolean;
  /** Optional local verification note (e.g. Demo 03 mathematical cross-check). */
  mathExpression?: string;
}

const SHOWCASE_INTRO = `Good evening, everyone.
I am JARVIS, Aadarsh's personal AI assistant.
I can answer questions, explain complex concepts, solve mathematical problems, assist with programming and help explore the world of technology.
Feel free to challenge my intelligence.
Shall we begin?`;

const DEMOS: DemoSpec[] = [
  {
    number: '01',
    title: 'MEET JARVIS',
    subtitle: 'Identity, architecture & live capabilities',
    prompt:
      "Introduce yourself to Aadarsh's friends in the room. Mention that you are Aadarsh's JARVIS, running on a real-time 3D WebGL reactor with voice synthesis and Gemini AI, and keep it crisp and impressive (under 110 words).",
    webResearch: false,
  },
  {
    number: '02',
    title: 'MIND-BLOWING SCIENCE',
    subtitle: 'Black holes, time dilation & quantum reality',
    prompt:
      'Give Aadarsh and his friends an awe-inspiring, vivid 4-sentence explanation of gravitational time dilation near a black hole — scientifically accurate and dramatic enough to impress everyone watching.',
    webResearch: false,
  },
  {
    number: '03',
    title: 'MATHEMATICAL INTELLIGENCE',
    subtitle: 'Multi-step reasoning + verified local check',
    prompt:
      'Calculate (987 * 654) + sqrt(14400) step by step clearly and concisely, showing each intermediate result.',
    webResearch: false,
    mathExpression: '(987 * 654) + sqrt(14400)',
  },
  {
    number: '04',
    title: 'CODING INTELLIGENCE',
    subtitle: 'Algorithm generation & explanation',
    prompt:
      'Write a clean, well-commented Python binary search function in a fenced code block and explain its O(log n) time complexity in two concise sentences.',
    webResearch: false,
  },
  {
    number: '05',
    title: 'FUN AND HUMOUR',
    subtitle: 'Smart humour, facts & a brain-teasing riddle',
    prompt:
      'Deliver one clever computer-science joke, one astonishing science fact, and one quick riddle for the friends in the room (include the riddle answer inside a short final line).',
    webResearch: false,
  },
  {
    number: '06',
    title: 'LIVE WEB INTELLIGENCE',
    subtitle: 'Real-time Google Search grounding + citations',
    prompt:
      'Summarise two major recent developments in artificial intelligence or space exploration right now in 3 crisp bullet points.',
    webResearch: true,
  },
  {
    number: '07',
    title: 'VOICE CHALLENGE',
    subtitle: 'Hand the phone to a friend — ask anything',
    prompt: '',
    webResearch: true,
  },
  {
    number: '08',
    title: 'PERSONALITY MODE',
    subtitle: 'Witty, calm, British-inspired Stark-tech banter',
    prompt:
      "Someone in the room just said: 'Are you smarter than Aadarsh?' Respond with classic witty, loyal JARVIS charm in 3 sentences.",
    webResearch: false,
  },
];

export function ShowcaseView() {
  const settings = useJarvisStore((s) => s.settings);
  const reactorState = useJarvisStore((s) => s.reactorState);
  const setReactorState = useJarvisStore((s) => s.setReactorState);
  const setView = useJarvisStore((s) => s.setView);
  const interimTranscript = useJarvisStore((s) => s.interimTranscript);

  const [demoIdx, setDemoIdx] = useState(-1); // -1 = intro splash
  const [output, setOutput] = useState(SHOWCASE_INTRO);
  const [sources, setSources] = useState<Source[]>([]);
  const [verifiedCheck, setVerifiedCheck] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [friendPrompt, setFriendPrompt] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const introPlayedRef = useRef(false);
  const tts = useSpeechSynthesis();

  const runPrompt = useCallback(
    async (promptText: string, webResearch: boolean, mathExpr?: string) => {
      abortRef.current?.abort();
      tts.stop();
      setRunning(true);
      setOutput('');
      setSources([]);
      setVerifiedCheck(null);
      setReactorState('thinking');

      if (mathExpr) {
        const local = tryEvaluateMath(mathExpr);
        if (local) {
          setVerifiedCheck(`Local exact parser check: ${local.formatted}`);
        }
      }

      const controller = new AbortController();
      abortRef.current = controller;
      let assembled = '';

      try {
        await streamChatReply({
          message: promptText,
          history: [],
          ownerName: settings.ownerName,
          webResearch,
          includeMemory: false,
          signal: controller.signal,
          onChunk(chunk) {
            assembled += chunk;
            setOutput(assembled);
          },
          onMeta(meta) {
            if (meta.sources.length) setSources(meta.sources);
          },
        });
        bumpPulse();
        if (assembled.trim()) tts.speak(assembled);
        else setReactorState('idle');
      } catch (err) {
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : 'Unable to run live demonstration.';
          setOutput(
            mathExpr && verifiedCheck
              ? `${msg}\n\n**Verified locally:** \`${mathExpr}\` = **${tryEvaluateMath(mathExpr)?.formatted ?? ''}**`
              : msg,
          );
          setReactorState('error');
        } else {
          setReactorState('idle');
        }
      } finally {
        setRunning(false);
      }
    },
    [settings.ownerName, setReactorState, tts, verifiedCheck],
  );

  // Trigger Showcase theatrical intro on entry.
  useEffect(() => {
    if (introPlayedRef.current) return;
    introPlayedRef.current = true;
    sfx.showcase();
    bumpPulse();
    if (!settings.voiceMuted) {
      const t = window.setTimeout(() => tts.speak(SHOWCASE_INTRO), 300);
      return () => window.clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      tts.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectDemo = useCallback(
    (nextIndex: number) => {
      abortRef.current?.abort();
      tts.stop();
      setDemoIdx(nextIndex);
      setSources([]);
      setVerifiedCheck(null);
      const demo = DEMOS[nextIndex];
      if (!demo) return;
      if (demo.number === '07') {
        setOutput(
          "Voice Challenge active! Pass the phone to a friend — tap the microphone below or type any tricky question to test JARVIS's intelligence.",
        );
        return;
      }
      void runPrompt(demo.prompt, demo.webResearch, demo.mathExpression);
    },
    [runPrompt, tts],
  );

  const mic = useSpeechRecognition({
    onBeforeStart: () => tts.stop(),
    onTranscript: (text) => {
      setFriendPrompt(text);
      void runPrompt(text, true);
    },
  });

  const currentDemo = demoIdx >= 0 ? DEMOS[demoIdx] : null;

  return (
    <section
      className="relative flex h-full flex-col bg-[#010309]/80"
      aria-label="Aadarsh's JARVIS Showcase Mode"
    >
      {/* Showcase Header */}
      <div className="mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between px-3 pt-2">
        <div className="min-w-0">
          <p className="hud-label text-[10px] text-cyan">AARADH'S JARVIS SHOWCASE MODE</p>
          <p className="truncate font-display text-sm font-bold text-white">
            {currentDemo ? `DEMO ${currentDemo.number} — ${currentDemo.title}` : 'SHOWCASE MODE ACTIVATED'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            abortRef.current?.abort();
            tts.stop();
            setView('core');
          }}
          className="btn-hud h-12 shrink-0 px-3 text-xs"
        >
          <X size={16} />
          <span>Exit</span>
        </button>
      </div>

      {/* Glowing Reactor Stage */}
      <div className="flex shrink-0 flex-col items-center py-1">
        <ReactorHost state={reactorState} size={172} />
        <p className="mt-1 text-center text-xs text-steel">
          {currentDemo ? currentDemo.subtitle : '8 live interactive demonstrations'}
        </p>
      </div>

      {/* Demonstration Stepper Dots */}
      <div className="no-scrollbar mx-auto flex w-full max-w-3xl shrink-0 gap-1.5 overflow-x-auto px-3 py-1.5">
        {DEMOS.map((d, idx) => (
          <button
            key={d.number}
            type="button"
            onClick={() => selectDemo(idx)}
            className={`min-h-[40px] shrink-0 rounded-xl border px-3 font-display text-[11px] tracking-wider transition ${
              demoIdx === idx
                ? 'border-cyan bg-cyan text-[#01121d] font-bold shadow-[0_0_16px_rgba(56,225,255,0.6)]'
                : 'border-cyan/20 bg-navy/50 text-steel hover:border-cyan/45 hover:text-white'
            }`}
          >
            {d.number}
          </button>
        ))}
      </div>

      {/* Live Output Stage */}
      <div className="scroll-area mx-auto min-h-0 w-full max-w-3xl flex-1 px-3 py-2">
        <motion.div
          key={demoIdx}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-4"
        >
          {verifiedCheck && (
            <div className="mb-3 rounded-xl border border-success/40 bg-success/10 px-3 py-2 font-mono text-xs text-success">
              ✓ {verifiedCheck}
            </div>
          )}

          {running && !output ? (
            <div className="flex items-center gap-2 py-4 text-sm text-cyan-soft">
              <span className="h-2.5 w-2.5 animate-ping rounded-full bg-cyan" />
              <span>Running live demonstration…</span>
            </div>
          ) : (
            <div className="prose-jarvis text-[15px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
            </div>
          )}

          {sources.length > 0 && (
            <div className="mt-3 border-t border-cyan/15 pt-2.5">
              <p className="hud-label text-[9px]">Live web sources</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {sources.slice(0, 6).map((s) => (
                  <a
                    key={s.uri}
                    href={s.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-cyan/25 bg-cyan/5 px-2.5 py-1 text-xs text-cyan-soft"
                  >
                    <Globe size={12} />
                    <span className="max-w-[180px] truncate">{s.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Demo 07 interactive friend prompt */}
          {currentDemo?.number === '07' && (
            <form
              className="mt-4 flex items-center gap-2 border-t border-cyan/15 pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (friendPrompt.trim()) void runPrompt(friendPrompt.trim(), true);
              }}
            >
              <button
                type="button"
                onClick={mic.toggle}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${
                  mic.listening ? 'border-cyan bg-cyan text-[#01121d]' : 'border-cyan/40 bg-cyan/10 text-cyan'
                }`}
                aria-label={mic.listening ? 'Stop mic' : 'Friend voice question'}
              >
                <Mic size={20} />
              </button>
              <input
                type="text"
                value={mic.listening ? interimTranscript || 'Listening…' : friendPrompt}
                onChange={(e) => setFriendPrompt(e.target.value)}
                placeholder="Friend's question for JARVIS…"
                className="field min-w-0 flex-1 text-sm"
                disabled={mic.listening || running}
              />
              <button type="submit" disabled={!friendPrompt.trim() || running} className="btn-hud btn-primary px-4">
                Ask
              </button>
            </form>
          )}
        </motion.div>
      </div>

      {/* Bottom Showcase Controls */}
      <div className="mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between gap-2 px-3 py-2">
        {demoIdx < 0 ? (
          <>
            <button
              type="button"
              onClick={() => tts.speak(SHOWCASE_INTRO)}
              className="btn-hud flex-1 text-xs"
            >
              <Volume2 size={16} /> Replay Intro
            </button>
            <button
              type="button"
              onClick={() => selectDemo(0)}
              className="btn-hud btn-primary flex-[1.5] text-sm"
            >
              <Play size={16} fill="currentColor" /> Begin Demo 01
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => selectDemo(Math.max(0, demoIdx - 1))}
              disabled={demoIdx === 0}
              className="btn-hud px-3 text-xs"
            >
              <ChevronLeft size={16} /> Prev
            </button>

            {running || tts.speaking ? (
              <button
                type="button"
                onClick={() => {
                  abortRef.current?.abort();
                  tts.stop();
                  setRunning(false);
                }}
                className="btn-hud border-amber/50 text-amber px-3 text-xs"
              >
                <Square size={14} fill="currentColor" /> Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => selectDemo(demoIdx)}
                className="btn-hud px-3 text-xs"
              >
                <RotateCcw size={14} /> Re-run
              </button>
            )}

            <button
              type="button"
              onClick={() => selectDemo((demoIdx + 1) % DEMOS.length)}
              className="btn-hud btn-primary flex-1 text-xs"
            >
              <Sparkles size={15} />
              <span>{demoIdx === DEMOS.length - 1 ? 'Restart 01' : 'Next Demo'}</span>
              <ChevronRight size={16} />
            </button>

            <button
              type="button"
              onClick={() => selectDemo((demoIdx + 1) % DEMOS.length)}
              className="icon-btn border border-cyan/25"
              aria-label="Skip demonstration"
            >
              <SkipForward size={16} />
            </button>
          </>
        )}
      </div>
    </section>
  );
}
