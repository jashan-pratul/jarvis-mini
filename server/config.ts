import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Explicitly load .env from project root regardless of launch working directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });
if (!process.env.GEMINI_API_KEY) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  isProduction,
  port: toInt(process.env.PORT, 8787),
  geminiApiKey: (process.env.GEMINI_API_KEY ?? '').trim(),
  geminiModel: (process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview').trim(),
  thinkingBudget: toInt(process.env.GEMINI_THINKING_BUDGET, 512),
  ownerPasscode: (process.env.OWNER_PASSCODE ?? '').trim(),
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  trustProxy: toInt(process.env.TRUST_PROXY, 0),
  databasePath: path.resolve(process.env.DATABASE_PATH ?? './database/jarvis.sqlite'),
  aiPerMinute: toInt(process.env.RATE_LIMIT_AI_PER_MINUTE, 20),
  apiPer15Min: toInt(process.env.RATE_LIMIT_API_PER_15_MIN, 300),
} as const;

/** Owner routes are open only in development when no passcode is configured. */
export const ownerRoutesOpen = !config.isProduction && config.ownerPasscode.length === 0;

export function validateConfig(): string[] {
  const warnings: string[] = [];
  if (!config.geminiApiKey) {
    warnings.push('GEMINI_API_KEY is not set — AI features will report themselves as offline.');
  }
  if (config.isProduction && config.ownerPasscode.length < 6) {
    warnings.push(
      'OWNER_PASSCODE is missing or shorter than 6 characters — owner routes (memory, notes) are LOCKED.',
    );
  }
  if (ownerRoutesOpen) {
    warnings.push('Development mode without OWNER_PASSCODE — owner routes are open to anyone on this network.');
  }
  return warnings;
}
