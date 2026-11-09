import { useCallback, useEffect, useState } from 'react';
import { Award, Brain, Calculator, CheckCircle2, Code2, Globe, Lightbulb, Play, RotateCcw, Smile, Trophy, Users, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useJarvisStore } from '../../hooks/useJarvisStore';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';
import { quizApi, type LeaderboardEntry } from '../../services/api';
import { sfx } from '../../utils/sfx';

type CategoryId = 'science' | 'math' | 'coding' | 'gk' | 'teasers' | 'fun';
type Difficulty = 'easy' | 'medium' | 'hard';

interface CategorySpec {
  id: CategoryId;
  label: string;
  apiName: string;
  desc: string;
  icon: typeof Brain;
  offlineCapable?: boolean;
}

const CATEGORIES: CategorySpec[] = [
  { id: 'science', label: 'Science Quiz', apiName: 'Science (Physics, Space, Biology & Technology)', desc: 'Space, physics, biology & tech', icon: Brain },
  { id: 'math', label: 'Mathematics', apiName: 'Mathematics Challenge', desc: 'Mental maths (works offline too)', icon: Calculator, offlineCapable: true },
  { id: 'coding', label: 'Coding Riddles', apiName: 'Coding Riddles & Computer Science Logic', desc: 'Programming puzzles & logic', icon: Code2 },
  { id: 'gk', label: 'General Knowledge', apiName: 'World General Knowledge', desc: 'History, geography & discoveries', icon: Globe },
  { id: 'teasers', label: 'Brain Teasers', apiName: 'Brain Teasers & Lateral Thinking Riddles', desc: 'Tricky riddles & logic traps', icon: Lightbulb },
  { id: 'fun', label: 'Fun Mode', apiName: 'Fun Mode (Weird Science, Pop Trivia & Humour)', desc: 'Humorous questions & fun challenges', icon: Smile },
];

interface ArenaQuestion {
  question: string;
  options: [string, string, string, string];
  /** Present only for locally generated mental-maths rounds; Gemini rounds keep answers server-side. */
  localCorrectIndex?: number;
  localExplanation?: string;
}

interface SessionPlayer {
  name: string;
  score: number;
  correct: number;
  total: number;
}

function generateLocalMathRound(difficulty: Difficulty, count = 5): ArenaQuestion[] {
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const out: ArenaQuestion[] = [];
  for (let i = 0; i < count; i++) {
    let question = '';
    let answer = 0;
    let explanation = '';

    if (difficulty === 'easy') {
      const a = rand(12, 65);
      const b = rand(11, 55);
      if (i % 2 === 0) {
        answer = a + b;
        question = `What is ${a} + ${b}?`;
        explanation = `${a} + ${b} = ${answer}.`;
      } else {
        const x = rand(6, 15);
        const y = rand(4, 12);
        answer = x * y;
        question = `What is ${x} × ${y}?`;
        explanation = `${x} multiplied by ${y} equals ${answer}.`;
      }
    } else if (difficulty === 'medium') {
      const a = rand(14, 38);
      const b = rand(12, 29);
      const c = rand(10, 50);
      if (i % 3 === 0) {
        answer = a * b;
        question = `Calculate ${a} × ${b}:`;
        explanation = `${a} × ${b} = ${a} × (${Math.floor(b / 10) * 10} + ${b % 10}) = ${answer}.`;
      } else if (i % 3 === 1) {
        answer = a * a;
        question = `What is ${a}² (square of ${a})?`;
        explanation = `${a} × ${a} = ${answer}.`;
      } else {
        answer = a * 4 + c;
        question = `Solve: (${a} × 4) + ${c}`;
        explanation = `${a} × 4 = ${a * 4}, plus ${c} = ${answer}.`;
      }
    } else {
      const a = rand(23, 89);
      const b = rand(17, 64);
      const d = rand(15, 95);
      if (i % 2 === 0) {
        answer = a * b - d;
        question = `Compute (${a} × ${b}) − ${d}`;
        explanation = `${a} × ${b} = ${a * b}, minus ${d} = ${answer}.`;
      } else {
        const pct = [15, 25, 35, 45][rand(0, 3)];
        const base = rand(4, 16) * 20;
        answer = (pct / 100) * base;
        question = `What is ${pct}% of ${base}?`;
        explanation = `${pct}% of ${base} = (${pct}/100) × ${base} = ${answer}.`;
      }
    }

    const distractors = new Set<number>();
    while (distractors.size < 3) {
      const offset = [rand(-15, -1), rand(1, 15), rand(-40, -10), rand(10, 40)][rand(0, 3)];
      const candidate = answer + offset;
      if (candidate !== answer && candidate >= 0) distractors.add(candidate);
    }

    const all = [answer, ...distractors];
    // Fisher-Yates shuffle
    for (let k = all.length - 1; k > 0; k--) {
      const j = rand(0, k);
      [all[k], all[j]] = [all[j], all[k]];
    }
    const correctIdx = all.indexOf(answer);

    out.push({
      question,
      options: [String(all[0]), String(all[1]), String(all[2]), String(all[3])],
      localCorrectIndex: correctIdx,
      localExplanation: explanation,
    });
  }
  return out;
}

export function FriendsChallengeView() {
  const ownerName = useJarvisStore((s) => s.settings.ownerName);
  const toast = useJarvisStore((s) => s.toast);
  const tts = useSpeechSynthesis();

  const [phase, setPhase] = useState<'lobby' | 'playing' | 'summary'>('lobby');
  const [category, setCategory] = useState<CategorySpec>(CATEGORIES[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [playersInput, setPlayersInput] = useState(`${ownerName}, Friend 1`);
  const [sessionPlayers, setSessionPlayers] = useState<SessionPlayer[]>([]);
  const [turnIdx, setTurnIdx] = useState(0);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ArenaQuestion[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<{
    correct: boolean;
    correctIndex: number;
    explanation: string;
  } | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const loadLeaderboard = useCallback(() => {
    quizApi
      .leaderboard()
      .then((res) => setLeaderboard(res.items))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const startRound = async () => {
    const names = playersInput
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 6);
    const activeNames = names.length ? names : [ownerName];
    const count = Math.max(5, activeNames.length * 2);

    setLoading(true);
    setVerdict(null);
    setSelectedIdx(null);
    setQIdx(0);
    setTurnIdx(0);
    setSessionPlayers(activeNames.map((name) => ({ name, score: 0, correct: 0, total: 0 })));

    try {
      if (category.id === 'math') {
        const localBatch = generateLocalMathRound(difficulty, Math.min(8, count));
        setSessionId(null);
        setQuestions(localBatch);
        setPhase('playing');
        tts.speak(`Mathematics Challenge started! First up: ${activeNames[0]}. ${localBatch[0].question}`);
      } else {
        const res = await quizApi.generate(category.apiName, difficulty, Math.min(8, count));
        setSessionId(res.sessionId);
        setQuestions(res.questions);
        setPhase('playing');
        tts.speak(`${category.label} started! First up: ${activeNames[0]}. ${res.questions[0].question}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start challenge.';
      toast(msg, 'warning');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = async (optIdx: number) => {
    if (selectedIdx !== null || verdict) return;
    const q = questions[qIdx];
    if (!q) return;

    setSelectedIdx(optIdx);
    const pointsPerCorrect = difficulty === 'hard' ? 150 : difficulty === 'medium' ? 100 : 75;

    let result: { correct: boolean; correctIndex: number; explanation: string };
    if (typeof q.localCorrectIndex === 'number') {
      result = {
        correct: optIdx === q.localCorrectIndex,
        correctIndex: q.localCorrectIndex,
        explanation: q.localExplanation ?? '',
      };
    } else if (sessionId) {
      try {
        result = await quizApi.checkAnswer(sessionId, qIdx, optIdx);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not verify answer.', 'error');
        setSelectedIdx(null);
        return;
      }
    } else {
      return;
    }

    setVerdict(result);
    if (result.correct) sfx.success();
    else sfx.error();

    const currentPlayerIdx = turnIdx % sessionPlayers.length;
    setSessionPlayers((prev) =>
      prev.map((p, idx) =>
        idx === currentPlayerIdx
          ? {
              ...p,
              score: p.score + (result.correct ? pointsPerCorrect : 0),
              correct: p.correct + (result.correct ? 1 : 0),
              total: p.total + 1,
            }
          : p,
      ),
    );

    const feedback = result.correct
      ? `Spot on! ${result.explanation}`
      : `Not quite. The right answer was ${q.options[result.correctIndex]}. ${result.explanation}`;
    tts.speak(feedback);
  };

  const handleNextQuestion = async () => {
    tts.stop();
    if (qIdx + 1 < questions.length) {
      const nextQ = qIdx + 1;
      const nextTurn = turnIdx + 1;
      setQIdx(nextQ);
      setTurnIdx(nextTurn);
      setSelectedIdx(null);
      setVerdict(null);
      const nextPlayer = sessionPlayers[nextTurn % sessionPlayers.length]?.name ?? ownerName;
      tts.speak(`Next up, ${nextPlayer}. ${questions[nextQ].question}`);
      return;
    }

    // Round finished — persist top scores to SQLite leaderboard
    setPhase('summary');
    for (const p of sessionPlayers) {
      if (p.total > 0) {
        try {
          await quizApi.submitScore({
            name: p.name,
            score: p.score,
            correct: p.correct,
            total: p.total,
            category: category.label,
            difficulty,
          });
        } catch {
          /* non-fatal */
        }
      }
    }
    loadLeaderboard();
  };

  const currentPlayer = sessionPlayers[turnIdx % Math.max(1, sessionPlayers.length)];
  const currentQ = questions[qIdx];

  return (
    <section className="scroll-area mx-auto h-full w-full max-w-3xl px-3 py-3" aria-label="Friends Challenge Arena">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="hud-label text-[10px] text-cyan">Multiplayer · Pass the phone</p>
          <h2 className="font-display text-lg font-bold text-white">Friends Challenge Arena</h2>
        </div>
        {phase !== 'lobby' && (
          <button
            type="button"
            onClick={() => {
              tts.stop();
              setPhase('lobby');
            }}
            className="btn-hud h-12 px-3 text-xs"
          >
            <RotateCcw size={15} /> New Setup
          </button>
        )}
      </div>

      {phase === 'lobby' && (
        <div className="space-y-4 pb-6">
          {/* Players Input */}
          <div className="glass rounded-2xl p-3.5">
            <label htmlFor="players-input" className="hud-label flex items-center gap-1.5 text-[10px]">
              <Users size={13} /> Challengers (comma separated for turn-by-turn play)
            </label>
            <input
              id="players-input"
              type="text"
              value={playersInput}
              onChange={(e) => setPlayersInput(e.target.value)}
              placeholder="Aadarsh, Riya, Kabir"
              className="field mt-2 text-sm"
            />
          </div>

          {/* Categories Grid */}
          <div>
            <p className="hud-label mb-2 text-[10px]">Select Challenge Category</p>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const active = category.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`flex min-h-[76px] flex-col items-start justify-between rounded-2xl border p-3 text-left transition ${
                      active
                        ? 'border-cyan bg-cyan/15 shadow-[0_0_20px_-6px_rgba(56,225,255,0.6)]'
                        : 'glass hover:border-cyan/40'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <Icon size={18} className={active ? 'text-cyan' : 'text-steel'} />
                      {c.offlineCapable && (
                        <span className="rounded-md bg-success/15 px-1.5 py-0.5 font-mono text-[9px] text-success">
                          OFFLINE OK
                        </span>
                      )}
                    </div>
                    <div className="mt-2">
                      <p className="font-display text-xs font-bold text-white">{c.label}</p>
                      <p className="mt-0.5 text-[11px] text-steel">{c.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Difficulty Selector */}
          <div className="glass rounded-2xl p-3.5">
            <p className="hud-label mb-2 text-[10px]">Difficulty Level</p>
            <div className="grid grid-cols-3 gap-2">
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`min-h-[48px] rounded-xl border font-display text-xs uppercase tracking-wider transition ${
                    difficulty === d
                      ? 'border-cyan bg-cyan text-[#01121d] font-bold'
                      : 'border-cyan/20 bg-navy/50 text-steel'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void startRound()}
            disabled={loading}
            className="btn-hud btn-primary w-full py-3 text-sm"
          >
            <Play size={17} fill="currentColor" />
            <span>{loading ? 'Generating questions…' : `Start ${category.label}`}</span>
          </button>

          {/* Persistent SQLite Hall of Fame */}
          <div className="glass rounded-2xl p-3.5">
            <p className="hud-label flex items-center gap-1.5 text-[10px]">
              <Trophy size={13} className="text-amber" /> All-Time Hall of Fame
            </p>
            {leaderboard.length === 0 ? (
              <p className="mt-2 text-xs text-steel">No scores recorded yet. Play the first round!</p>
            ) : (
              <ul className="mt-2.5 space-y-1.5">
                {leaderboard.slice(0, 6).map((entry, idx) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between rounded-xl border border-cyan/10 bg-abyss/60 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-cyan">#{idx + 1}</span>
                      <span className="truncate font-semibold text-white">{entry.name}</span>
                      <span className="truncate text-[10px] text-steel">
                        {entry.category} · {entry.difficulty}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono font-bold text-amber">{entry.score} pts</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {phase === 'playing' && currentQ && (
        <div className="space-y-3 pb-6">
          {/* Turn & Progress Banner */}
          <div className="glass flex items-center justify-between rounded-2xl px-4 py-3">
            <div>
              <p className="hud-label text-[9px]">Current turn</p>
              <p className="font-display text-base font-bold text-cyan">{currentPlayer?.name}</p>
            </div>
            <div className="text-right font-mono text-xs">
              <p className="text-white">
                Question {qIdx + 1} / {questions.length}
              </p>
              <p className="text-amber">{currentPlayer?.score ?? 0} pts</p>
            </div>
          </div>

          {/* Question Card */}
          <motion.div
            key={qIdx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-4"
          >
            <p className="text-base font-semibold leading-snug text-white">{currentQ.question}</p>

            <div className="mt-4 space-y-2.5">
              {currentQ.options.map((opt, idx) => {
                const chosen = selectedIdx === idx;
                const isCorrect = verdict?.correctIndex === idx;
                let style = 'border-cyan/25 bg-navy/45 text-[#dceaf7] hover:border-cyan/60';
                if (verdict) {
                  if (isCorrect) style = 'border-success bg-success/15 text-white';
                  else if (chosen) style = 'border-danger bg-danger/15 text-[#ffd4dc]';
                  else style = 'border-cyan/10 bg-abyss/40 text-steel opacity-65';
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={selectedIdx !== null}
                    onClick={() => void handleSelectOption(idx)}
                    className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${style}`}
                  >
                    <span>
                      <strong className="mr-2 font-mono text-cyan">{String.fromCharCode(65 + idx)}.</strong>
                      {opt}
                    </span>
                    {verdict && isCorrect && <CheckCircle2 size={18} className="shrink-0 text-success" />}
                    {verdict && chosen && !isCorrect && <XCircle size={18} className="shrink-0 text-danger" />}
                  </button>
                );
              })}
            </div>

            {verdict && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 border-t border-cyan/15 pt-3"
              >
                <p className={`text-sm font-bold ${verdict.correct ? 'text-success' : 'text-amber'}`}>
                  {verdict.correct ? 'Correct answer!' : 'Incorrect — good try!'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[#cfe5f5]">{verdict.explanation}</p>
                <button
                  type="button"
                  onClick={() => void handleNextQuestion()}
                  className="btn-hud btn-primary mt-3 w-full text-sm"
                >
                  {qIdx + 1 < questions.length ? 'Next Question' : 'View Final Leaderboard'}
                </button>
              </motion.div>
            )}
          </motion.div>
        </div>
      )}

      {phase === 'summary' && (
        <div className="space-y-4 pb-6">
          <div className="glass rounded-2xl p-4 text-center">
            <Award size={36} className="mx-auto text-amber" />
            <h3 className="mt-2 font-display text-lg font-bold text-white">Session Leaderboard</h3>
            <div className="mt-4 space-y-2 text-left">
              {[...sessionPlayers]
                .sort((a, b) => b.score - a.score)
                .map((p, idx) => (
                  <div
                    key={p.name}
                    className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 ${
                      idx === 0 ? 'border-amber/60 bg-amber/10' : 'border-cyan/15 bg-navy/40'
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-white">
                        #{idx + 1} {p.name}
                      </p>
                      <p className="text-xs text-steel">
                        {p.correct}/{p.total} accurate
                      </p>
                    </div>
                    <span className="font-mono text-base font-bold text-amber">{p.score} pts</span>
                  </div>
                ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => void startRound()} className="btn-hud btn-primary flex-1 text-sm">
                Play Again
              </button>
              <button type="button" onClick={() => setPhase('lobby')} className="btn-hud flex-1 text-sm">
                Change Category
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
