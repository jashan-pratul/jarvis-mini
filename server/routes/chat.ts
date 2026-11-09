import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { aiLimiter } from '../middleware/rateLimiter.js';
import { sanitizeText, validateBody } from '../middleware/validate.js';
import { geminiStatus, streamChat } from '../services/geminiService.js';

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'jarvis']),
        text: z.string().min(1).max(4000),
      }),
    )
    .max(20)
    .default([]),
  ownerName: z.string().min(1).max(40).default('Aadarsh'),
  webResearch: z.boolean().default(true),
  includeMemory: z.boolean().default(true),
});

type ChatBody = z.infer<typeof ChatRequestSchema>;

export const chatRouter = Router();

chatRouter.post('/', aiLimiter, validateBody(ChatRequestSchema), async (req: Request, res: Response) => {
  const body = req.body as ChatBody;
  const cleanMessage = sanitizeText(body.message);
  if (!cleanMessage) {
    res.status(400).json({ error: 'empty_message', message: 'Please provide a non-empty message.' });
    return;
  }

  if (!geminiStatus().configured) {
    res.status(503).json({
      error: 'ai_unconfigured',
      message:
        'Gemini API key is not configured on the server yet. Add GEMINI_API_KEY to .env to unlock live AI responses. Local commands (calculator, time, notes, opening apps, mental maths) still work!',
    });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) abortController.abort();
  });

  const sendEvent = (event: string, data: unknown) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await streamChat(
      {
        message: cleanMessage,
        history: body.history.map((h) => ({ role: h.role, text: sanitizeText(h.text) })).filter((h) => h.text),
        ownerName: sanitizeText(body.ownerName) || 'Aadarsh',
        webResearch: body.webResearch,
        includeMemory: body.includeMemory,
      },
      {
        onChunk(text) {
          sendEvent('chunk', { text });
        },
        onMeta(meta) {
          sendEvent('meta', meta);
        },
      },
      abortController.signal,
    );
    sendEvent('done', { ok: true });
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini request failed.';
    console.error('[chat] Stream error:', message);
    sendEvent('error', { message: 'JARVIS could not complete that Gemini request. Please try again shortly.' });
    res.end();
  }
});
