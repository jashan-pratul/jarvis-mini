import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { config, ownerRoutesOpen, validateConfig } from './config.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { dbHealth } from './services/dbService.js';
import { geminiStatus } from './services/geminiService.js';
import { chatRouter } from './routes/chat.js';
import { memoryRouter } from './routes/memory.js';
import { quizRouter } from './routes/quiz.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const startedAt = Date.now();

const app = express();
app.disable('x-powered-by');
if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        // Framer Motion & R3F write inline style attributes.
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'media-src': ["'self'", 'blob:'],
        'worker-src': ["'self'", 'blob:'],
        'manifest-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'upgrade-insecure-requests': config.isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    // Allow the microphone for our own origin only.
    permittedCrossDomainPolicies: false,
  }),
);
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=(), payment=()');
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin requests (no Origin header) and configured origins only.
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      if (!config.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.)/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
  }),
);

app.use(
  compression({
    filter: (req, res) => {
      // Never buffer Server-Sent Events.
      if (req.path.startsWith('/api/chat')) return false;
      return compression.filter(req, res);
    },
  }),
);
app.use(express.json({ limit: '1mb' }));

// ── API ─────────────────────────────────────────────────────
app.use('/api', apiLimiter);

app.get('/api/health', (_req, res) => {
  const db = dbHealth();
  const gemini = geminiStatus();
  res.set('Cache-Control', 'no-store');
  res.json({
    status: 'online',
    app: "Aadarsh's JARVIS",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    serverTime: new Date().toISOString(),
    ai: { configured: gemini.configured, model: gemini.model },
    database: { ok: db.ok },
    owner: { protected: !ownerRoutesOpen },
  });
});

app.use('/api/chat', chatRouter);
app.use('/api/memory', memoryRouter);
app.use('/api/quiz', quizRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Unknown API endpoint.' });
});

// ── Static client (production) ──────────────────────────────
const clientDir = path.resolve(__dirname, '../dist');
if (fs.existsSync(path.join(clientDir, 'index.html'))) {
  app.use(
    '/assets',
    express.static(path.join(clientDir, 'assets'), { immutable: true, maxAge: '1y', index: false }),
  );
  app.use(
    express.static(clientDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('sw.js') || filePath.endsWith('manifest.json')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

// ── Errors ──────────────────────────────────────────────────
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    typeof err === 'object' && err && 'status' in err && typeof (err as { status: unknown }).status === 'number'
      ? (err as { status: number }).status
      : 500;
  if (status >= 500) console.error('[server] Unhandled error:', err);
  res.status(status).json({
    error: status === 413 ? 'payload_too_large' : status >= 500 ? 'server_error' : 'bad_request',
    message: status === 413 ? 'That request is too large.' : status >= 500 ? 'Something went wrong on the server.' : 'Bad request.',
  });
});

app.listen(config.port, () => {
  console.log(`\n  ◉ Aadarsh's JARVIS server online → http://localhost:${config.port}`);
  for (const warning of validateConfig()) console.warn(`  ⚠ ${warning}`);
});
