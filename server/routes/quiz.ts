import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { aiLimiter } from '../middleware/rateLimiter.js';
import { sanitizeText, validateBody } from '../middleware/validate.js';
import { scores } from '../services/dbService.js';
import {
  classifyGeminiError,
  geminiStatus,
  recordGeminiDiagnostic,
  generateQuizBatch,
  type GeneratedQuizQuestion,
} from '../services/geminiService.js';

export const quizRouter = Router();

interface StoredSession {
  questions: GeneratedQuizQuestion[];
  createdAt: number;
}

// Keep correct answers strictly server-side so players cannot inspect them in DevTools.
const activeSessions = new Map<string, StoredSession>();

function pruneSessions() {
  const cutoff = Date.now() - 45 * 60 * 1000;
  for (const [id, s] of activeSessions.entries()) {
    if (s.createdAt < cutoff) activeSessions.delete(id);
  }
}

const GenerateSchema = z.object({
  category: z.string().min(2).max(60),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  count: z.number().int().min(3).max(10).default(5),
});

const AnswerSchema = z.object({
  sessionId: z.string().min(10).max(80),
  questionIndex: z.number().int().min(0).max(20),
  selectedIndex: z.number().int().min(0).max(3),
});

const ScoreSchema = z.object({
  name: z.string().min(1).max(32),
  score: z.number().int().min(0).max(50000),
  correct: z.number().int().min(0).max(50),
  total: z.number().int().min(1).max(50),
  category: z.string().min(2).max(60),
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

quizRouter.post('/generate', aiLimiter, validateBody(GenerateSchema), async (req: Request, res: Response) => {
  pruneSessions();
  if (!geminiStatus().configured) {
    res.status(503).json({
      error: 'ai_unconfigured',
      message: 'Gemini API key is not configured — switch to Mathematics Challenge for instant offline rounds.',
    });
    return;
  }
  const { category, difficulty, count } = req.body as z.infer<typeof GenerateSchema>;
  try {
    const batch = await generateQuizBatch({ category: sanitizeText(category), difficulty, count });
    if (batch.length === 0) {
      res.status(502).json({ error: 'empty_quiz', message: 'Could not generate quiz questions. Try again.' });
      return;
    }
    const sessionId = crypto.randomUUID();
    activeSessions.set(sessionId, { questions: batch, createdAt: Date.now() });
    res.json({
      sessionId,
      questions: batch.map((q) => ({ question: q.question, options: q.options })),
    });
  } catch (error) {
    const diag = classifyGeminiError(error);
    recordGeminiDiagnostic(diag);
    console.error(`[quiz] Generation error (${diag.code}):`, error instanceof Error ? error.message : error);
    res.status(502).json({ error: diag.code, message: diag.message });
  }
});

quizRouter.post('/answer', validateBody(AnswerSchema), (req: Request, res: Response) => {
  const { sessionId, questionIndex, selectedIndex } = req.body as z.infer<typeof AnswerSchema>;
  const session = activeSessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'session_expired', message: 'This quiz session expired. Start a new round.' });
    return;
  }
  const q = session.questions[questionIndex];
  if (!q) {
    res.status(400).json({ error: 'invalid_question', message: 'Question index out of range.' });
    return;
  }
  const correct = selectedIndex === q.correctIndex;
  res.json({
    correct,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
  });
});

quizRouter.get('/leaderboard', (_req: Request, res: Response) => {
  res.json({ items: scores.top(12) });
});

quizRouter.post('/leaderboard', validateBody(ScoreSchema), (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof ScoreSchema>;
  const cleanName = sanitizeText(body.name) || 'Challenger';
  const saved = scores.add({
    name: cleanName,
    score: body.score,
    correct: Math.min(body.correct, body.total),
    total: body.total,
    category: sanitizeText(body.category),
    difficulty: body.difficulty,
  });
  res.status(201).json({ item: saved });
});
