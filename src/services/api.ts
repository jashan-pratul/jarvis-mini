import type { BackendHealth, ChatMessage, Source } from '../hooks/useJarvisStore';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Resolves the API endpoint. In local dev or with a Vercel rewrite, VITE_API_URL can be omitted
 * to use relative /api paths. If pointing directly to a separate backend (e.g. Render),
 * set VITE_API_URL=https://<your-service>.onrender.com in Vercel environment variables.
 */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '');

export function apiUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${clean}` : clean;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  ownerKey?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, ownerKey, signal, timeoutMs = 30000 } = options;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), timeoutMs);
  signal?.addEventListener('abort', () => controller.abort(signal.reason), { once: true });

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (ownerKey) headers['x-owner-key'] = ownerKey;

    let res: Response;
    try {
      res = await fetch(apiUrl(path), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted && !signal?.aborted) {
        throw new ApiError(0, 'timeout', 'The server took too long to respond.');
      }
      if (signal?.aborted) throw error;
      throw new ApiError(0, 'network', navigator.onLine ? 'Could not reach the JARVIS server.' : 'You appear to be offline.');
    }

    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      throw new ApiError(
        res.status,
        typeof data?.error === 'string' ? data.error : 'http_error',
        typeof data?.message === 'string' ? data.message : `Request failed (${res.status}).`,
      );
    }
    return data as T;
  } finally {
    window.clearTimeout(timer);
  }
}

interface HealthResponse {
  status: string;
  ai: { configured: boolean; model: string };
  database: { ok: boolean };
  owner: { protected: boolean };
}

/** Pings the backend and measures the real round-trip latency. */
export async function checkHealth(): Promise<BackendHealth> {
  const started = performance.now();
  try {
    const data = await request<HealthResponse>('/api/health', { timeoutMs: 8000 });
    return {
      reachable: data.status === 'online',
      aiConfigured: data.ai.configured,
      model: data.ai.model,
      databaseOk: data.database.ok,
      ownerProtected: data.owner.protected,
      latencyMs: Math.round(performance.now() - started),
      checkedAt: Date.now(),
      offlineReason: null,
    };
  } catch (err) {
    const reason =
      err instanceof ApiError && err.status === 404
        ? 'Backend endpoint returned 404 (configure VITE_API_URL or deploy Render backend)'
        : err instanceof Error
          ? err.message
          : 'Could not contact server';
    return {
      reachable: false,
      aiConfigured: false,
      model: null,
      databaseOk: false,
      ownerProtected: true,
      latencyMs: null,
      checkedAt: Date.now(),
      offlineReason: reason,
    };
  }
}

export interface StreamChatParams {
  message: string;
  history: Pick<ChatMessage, 'role' | 'text'>[];
  ownerName: string;
  webResearch: boolean;
  includeMemory?: boolean;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
  onMeta?: (meta: { sources: Source[]; searchQueries: string[] }) => void;
}

/** Streams a Gemini reply from `/api/chat` over Server-Sent Events. */
export async function streamChatReply(params: StreamChatParams): Promise<void> {
  let res: Response;
  try {
    res = await fetch(apiUrl('/api/chat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        message: params.message,
        history: params.history.slice(-14).map((m) => ({ role: m.role, text: m.text })),
        ownerName: params.ownerName,
        webResearch: params.webResearch,
        includeMemory: params.includeMemory ?? true,
      }),
      signal: params.signal,
    });
  } catch (err) {
    if (params.signal?.aborted) throw err;
    throw new ApiError(
      0,
      'network',
      navigator.onLine ? 'Could not reach the JARVIS server.' : 'You appear to be offline.',
    );
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    throw new ApiError(
      res.status,
      typeof data?.error === 'string' ? data.error : 'http_error',
      typeof data?.message === 'string' ? data.message : `Request failed (${res.status}).`,
    );
  }

  if (!res.body) {
    throw new ApiError(500, 'empty_stream', 'Server returned an empty response stream.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatchEvent = (block: string) => {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const rawLine of block.split(/\r?\n/)) {
      if (rawLine.startsWith('event:')) eventName = rawLine.slice(6).trim();
      else if (rawLine.startsWith('data:')) dataLines.push(rawLine.slice(5).trim());
    }
    if (!dataLines.length) return;
    const payload = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
    if (eventName === 'chunk' && typeof payload.text === 'string') {
      params.onChunk(payload.text);
    } else if (eventName === 'meta') {
      params.onMeta?.({
        sources: Array.isArray(payload.sources) ? (payload.sources as Source[]) : [],
        searchQueries: Array.isArray(payload.searchQueries) ? (payload.searchQueries as string[]) : [],
      });
    } else if (eventName === 'error') {
      throw new ApiError(
        502,
        'stream_error',
        typeof payload.message === 'string' ? payload.message : 'AI stream interrupted.',
      );
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      if (part.trim()) dispatchEvent(part);
    }
  }
  if (buffer.trim()) dispatchEvent(buffer);
}

// ── Memory, Notes & Secret Commands API ─────────────────────────────────────
export interface StoredItem {
  id: number;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface SecretCommandItem {
  id: number;
  trigger: string;
  response: string;
  created_at: string;
}

export const memoryApi = {
  verifyPasscode: (passcode: string) =>
    request<{ ok: boolean }>('/api/memory/verify', { method: 'POST', body: { passcode } }),

  listMemories: (ownerKey?: string | null) =>
    request<{ items: StoredItem[] }>('/api/memory', { ownerKey }),
  addMemory: (content: string, ownerKey?: string | null) =>
    request<{ item: StoredItem }>('/api/memory', { method: 'POST', body: { content }, ownerKey }),
  updateMemory: (id: number, content: string, ownerKey?: string | null) =>
    request<{ item: StoredItem }>(`/api/memory/${id}`, { method: 'PUT', body: { content }, ownerKey }),
  deleteMemory: (id: number, ownerKey?: string | null) =>
    request<{ ok: boolean }>(`/api/memory/${id}`, { method: 'DELETE', ownerKey }),

  listNotes: (ownerKey?: string | null) =>
    request<{ items: StoredItem[] }>('/api/memory/notes', { ownerKey }),
  addNote: (content: string, ownerKey?: string | null) =>
    request<{ item: StoredItem }>('/api/memory/notes', { method: 'POST', body: { content }, ownerKey }),
  updateNote: (id: number, content: string, ownerKey?: string | null) =>
    request<{ item: StoredItem }>(`/api/memory/notes/${id}`, { method: 'PUT', body: { content }, ownerKey }),
  deleteNote: (id: number, ownerKey?: string | null) =>
    request<{ ok: boolean }>(`/api/memory/notes/${id}`, { method: 'DELETE', ownerKey }),

  listSecretCommands: () => request<{ items: SecretCommandItem[] }>('/api/memory/secret-commands'),
  addSecretCommand: (trigger: string, response: string, ownerKey?: string | null) =>
    request<{ item: SecretCommandItem }>('/api/memory/secret-commands', {
      method: 'POST',
      body: { trigger, response },
      ownerKey,
    }),
  deleteSecretCommand: (id: number, ownerKey?: string | null) =>
    request<{ ok: boolean }>(`/api/memory/secret-commands/${id}`, { method: 'DELETE', ownerKey }),
};

// ── Friends Challenge Quiz API ──────────────────────────────────────────────
export interface QuizQuestionPublic {
  question: string;
  options: [string, string, string, string];
}

export interface LeaderboardEntry {
  id: number;
  name: string;
  score: number;
  correct: number;
  total: number;
  category: string;
  difficulty: string;
  created_at: string;
}

export const quizApi = {
  generate: (category: string, difficulty: 'easy' | 'medium' | 'hard', count = 5) =>
    request<{ sessionId: string; questions: QuizQuestionPublic[] }>('/api/quiz/generate', {
      method: 'POST',
      body: { category, difficulty, count },
      timeoutMs: 40000,
    }),
  checkAnswer: (sessionId: string, questionIndex: number, selectedIndex: number) =>
    request<{ correct: boolean; correctIndex: number; explanation: string }>('/api/quiz/answer', {
      method: 'POST',
      body: { sessionId, questionIndex, selectedIndex },
    }),
  leaderboard: () => request<{ items: LeaderboardEntry[] }>('/api/quiz/leaderboard'),
  submitScore: (entry: {
    name: string;
    score: number;
    correct: number;
    total: number;
    category: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }) => request<{ item: LeaderboardEntry }>('/api/quiz/leaderboard', { method: 'POST', body: entry }),
};
