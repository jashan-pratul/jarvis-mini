import { GoogleGenAI, Type, type Content } from '@google/genai';
import { config } from '../config.js';
import { memories, notes, type MemoryRow, type NoteRow } from './dbService.js';

export interface HistoryTurn {
  role: 'user' | 'jarvis';
  text: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onMeta?: (meta: { sources: GroundingSource[]; searchQueries: string[] }) => void;
}

export function geminiStatus(): { configured: boolean; model: string } {
  return {
    configured: config.geminiApiKey.length > 0,
    model: config.geminiModel,
  };
}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  if (!config.geminiApiKey) return null;
  if (!client) client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  return client;
}

function buildSystemInstruction(ownerName: string, memList: MemoryRow[], noteList: NoteRow[]): string {
  const now = new Date();
  const safeOwner = ownerName.trim() || 'Aadarsh';
  const memBlock =
    memList.length > 0
      ? `\nSaved personal memories about ${safeOwner} (only reference when relevant):\n${memList
          .slice(0, 20)
          .map((m) => `- ${m.content}`)
          .join('\n')}`
      : '';
  const noteBlock =
    noteList.length > 0
      ? `\nRecent notes saved by ${safeOwner}:\n${noteList
          .slice(0, 10)
          .map((n) => `- ${n.content}`)
          .join('\n')}`
      : '';

  return `You are JARVIS ("I am JARVIS, ${safeOwner}'s personal AI assistant"), inside the application "Aadarsh's JARVIS".
Owner: ${safeOwner}.

Personality & style:
- Intelligent, calm, articulate, witty, helpful, lightly humorous and poised — inspired by Iron Man's JARVIS without being over-the-top or theatrical.
- Address the owner naturally as ${safeOwner} (and occasionally "sir" when appropriate).
- Be concise and conversational by default because replies may be spoken aloud. When a topic demands depth (coding, physics, step-by-step maths), structure cleanly with markdown and code blocks.
- Honesty rule (CRITICAL): Never fabricate live research, URLs, sensor readings, or real-time facts you do not know. Distinguish verified facts from uncertainty. If Google Search grounding did not run or found nothing, say so honestly.
- Never claim to have controlled device hardware or run local shell commands; you operate inside the user's browser and secure backend.
- Current server UTC time: ${now.toISOString()}.${memBlock}${noteBlock}`;
}

function extractGrounding(response: unknown): { sources: GroundingSource[]; searchQueries: string[] } {
  const r = response as {
    candidates?: Array<{
      groundingMetadata?: {
        webSearchQueries?: string[];
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      };
    }>;
  };
  const meta = r?.candidates?.[0]?.groundingMetadata;
  if (!meta) return { sources: [], searchQueries: [] };

  const seen = new Set<string>();
  const sources: GroundingSource[] = [];
  for (const chunk of meta.groundingChunks ?? []) {
    const uri = chunk.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({
      uri,
      title: (chunk.web?.title ?? '').trim() || new URL(uri).hostname,
    });
  }
  const searchQueries = Array.isArray(meta.webSearchQueries)
    ? meta.webSearchQueries.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    : [];

  return { sources, searchQueries };
}

export async function streamChat(
  params: {
    message: string;
    history: HistoryTurn[];
    ownerName: string;
    webResearch: boolean;
    includeMemory: boolean;
  },
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<{ fullText: string; sources: GroundingSource[]; searchQueries: string[] }> {
  const ai = getClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  let memRows: MemoryRow[] = [];
  let noteRows: NoteRow[] = [];
  if (params.includeMemory) {
    try {
      memRows = memories.list();
      noteRows = notes.list();
    } catch {
      /* proceed without DB context if locked */
    }
  }

  const contents: Content[] = params.history.slice(-14).map((turn) => ({
    role: turn.role === 'jarvis' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }));
  contents.push({ role: 'user', parts: [{ text: params.message }] });

  const hasUrl = /https?:\/\/\S+/i.test(params.message);
  const tools: Array<Record<string, unknown>> = [];
  if (params.webResearch) tools.push({ googleSearch: {} });
  if (params.webResearch && hasUrl) tools.push({ urlContext: {} });

  const candidateModels = [
    config.geminiModel,
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let stream: any = null;
  let lastError: unknown = null;

  for (const model of candidateModels) {
    try {
      stream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: buildSystemInstruction(params.ownerName, memRows, noteRows),
          thinkingConfig: { thinkingBudget: config.thinkingBudget },
          ...(tools.length ? { tools } : {}),
        },
      });
      break;
    } catch (err: any) {
      lastError = err;
      // If tools (Google Search) hit rate-limits/429, retry immediately without tools
      if (tools.length > 0 && (err?.status === 429 || /quota|rate/i.test(err?.message ?? ''))) {
        try {
          stream = await ai.models.generateContentStream({
            model,
            contents,
            config: {
              systemInstruction: buildSystemInstruction(params.ownerName, memRows, noteRows),
              thinkingConfig: { thinkingBudget: config.thinkingBudget },
            },
          });
          break;
        } catch (innerErr) {
          lastError = innerErr;
        }
      }
    }
  }

  if (!stream) {
    throw lastError || new Error('Could not establish stream with Gemini models.');
  }

  let fullText = '';
  const mergedSources = new Map<string, GroundingSource>();
  const mergedQueries = new Set<string>();

  for await (const chunk of stream) {
    if (signal?.aborted) break;
    const text = chunk.text ?? '';
    if (text) {
      fullText += text;
      callbacks.onChunk(text);
    }
    const g = extractGrounding(chunk);
    for (const s of g.sources) mergedSources.set(s.uri, s);
    for (const q of g.searchQueries) mergedQueries.add(q);
  }

  const sources = [...mergedSources.values()];
  const searchQueries = [...mergedQueries];
  callbacks.onMeta?.({ sources, searchQueries });
  return { fullText, sources, searchQueries };
}

export interface GeneratedQuizQuestion {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
}

export async function generateQuizBatch(params: {
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  count: number;
}): Promise<GeneratedQuizQuestion[]> {
  const ai = getClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const prompt = `Create ${params.count} unique, accurate multiple-choice quiz questions for high-school friends playing together.
Category: ${params.category}
Difficulty: ${params.difficulty}
Rules:
- Exactly 4 distinct options per question.
- Only one unambiguously correct option.
- Keep questions crisp and engaging (great to read aloud on a phone).
- Explanations should be 1-2 clear, educational sentences.
- For "Fun Mode", mix surprising pop-science trivia, clever lateral-thinking questions, and humorous facts.`;

  const candidateModels = [
    config.geminiModel,
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let res: any = null;
  let lastError: unknown = null;

  for (const model of candidateModels) {
    try {
      res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING },
              },
              required: ['question', 'options', 'correctIndex', 'explanation'],
            },
          },
        },
      });
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!res) {
    throw lastError || new Error('Could not generate quiz questions with Gemini models.');
  }

  const raw = res.text ?? '[]';
  const parsed = JSON.parse(raw) as Array<{
    question?: string;
    options?: string[];
    correctIndex?: number;
    explanation?: string;
  }>;

  return parsed
    .filter(
      (q) =>
        typeof q.question === 'string' &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.correctIndex === 'number' &&
        q.correctIndex >= 0 &&
        q.correctIndex <= 3 &&
        typeof q.explanation === 'string',
    )
    .slice(0, params.count)
    .map((q) => ({
      question: q.question!.trim(),
      options: [q.options![0], q.options![1], q.options![2], q.options![3]],
      correctIndex: q.correctIndex!,
      explanation: q.explanation!.trim(),
    }));
}
