import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

const handlerMessage = (message: string) => ({
  error: 'rate_limited',
  message,
});

/** Broad limiter for every /api route. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.apiPer15Min,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: handlerMessage('Too many requests. Please slow down a little.'),
});

/** Tight limiter for endpoints that spend Gemini quota. */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.aiPerMinute,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: handlerMessage('JARVIS is receiving too many questions at once. Give it a moment and try again.'),
});

/** Brute-force protection for owner passcode verification. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: handlerMessage('Too many passcode attempts. Try again in 15 minutes.'),
});
