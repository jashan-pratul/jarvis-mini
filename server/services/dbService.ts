import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

export interface MemoryRow {
  id: number;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface NoteRow {
  id: number;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface SecretCommandRow {
  id: number;
  trigger: string;
  response: string;
  created_at: string;
}

export interface ScoreRow {
  id: number;
  name: string;
  score: number;
  correct: number;
  total: number;
  category: string;
  difficulty: string;
  created_at: string;
}

let db: Database.Database | null = null;
let dbError: string | null = null;

function init(): Database.Database {
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const instance = new Database(config.databasePath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  instance.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS secret_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger TEXT NOT NULL UNIQUE COLLATE NOCASE,
      response TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      correct INTEGER NOT NULL,
      total INTEGER NOT NULL,
      category TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
  `);
  return instance;
}

export function getDb(): Database.Database {
  if (db) return db;
  try {
    db = init();
    dbError = null;
    return db;
  } catch (error) {
    dbError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

export function dbHealth(): { ok: boolean; error: string | null } {
  try {
    getDb().prepare('SELECT 1').get();
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: dbError ?? 'Database unavailable' };
  }
}

// ── Memories ────────────────────────────────────────────────
export const memories = {
  list(): MemoryRow[] {
    return getDb().prepare('SELECT * FROM memories ORDER BY updated_at DESC, id DESC').all() as MemoryRow[];
  },
  create(content: string): MemoryRow {
    const info = getDb().prepare('INSERT INTO memories (content) VALUES (?)').run(content);
    return getDb().prepare('SELECT * FROM memories WHERE id = ?').get(info.lastInsertRowid) as MemoryRow;
  },
  update(id: number, content: string): MemoryRow | undefined {
    const info = getDb()
      .prepare("UPDATE memories SET content = ?, updated_at = datetime('now') WHERE id = ?")
      .run(content, id);
    if (info.changes === 0) return undefined;
    return getDb().prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow;
  },
  remove(id: number): boolean {
    return getDb().prepare('DELETE FROM memories WHERE id = ?').run(id).changes > 0;
  },
  clear(): number {
    return getDb().prepare('DELETE FROM memories').run().changes;
  },
};

// ── Notes ───────────────────────────────────────────────────
export const notes = {
  list(): NoteRow[] {
    return getDb().prepare('SELECT * FROM notes ORDER BY created_at DESC, id DESC').all() as NoteRow[];
  },
  create(content: string): NoteRow {
    const info = getDb().prepare('INSERT INTO notes (content) VALUES (?)').run(content);
    return getDb().prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid) as NoteRow;
  },
  update(id: number, content: string): NoteRow | undefined {
    const info = getDb()
      .prepare("UPDATE notes SET content = ?, updated_at = datetime('now') WHERE id = ?")
      .run(content, id);
    if (info.changes === 0) return undefined;
    return getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow;
  },
  remove(id: number): boolean {
    return getDb().prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
  },
};

// ── Secret commands ─────────────────────────────────────────
export const secretCommands = {
  list(): SecretCommandRow[] {
    return getDb().prepare('SELECT * FROM secret_commands ORDER BY id ASC').all() as SecretCommandRow[];
  },
  create(trigger: string, response: string): SecretCommandRow {
    const info = getDb()
      .prepare('INSERT INTO secret_commands (trigger, response) VALUES (?, ?)')
      .run(trigger, response);
    return getDb()
      .prepare('SELECT * FROM secret_commands WHERE id = ?')
      .get(info.lastInsertRowid) as SecretCommandRow;
  },
  remove(id: number): boolean {
    return getDb().prepare('DELETE FROM secret_commands WHERE id = ?').run(id).changes > 0;
  },
};

// ── Leaderboard ─────────────────────────────────────────────
export const scores = {
  top(limit = 10): ScoreRow[] {
    return getDb()
      .prepare('SELECT * FROM scores ORDER BY score DESC, correct DESC, created_at ASC LIMIT ?')
      .all(limit) as ScoreRow[];
  },
  add(row: Omit<ScoreRow, 'id' | 'created_at'>): ScoreRow {
    const info = getDb()
      .prepare(
        'INSERT INTO scores (name, score, correct, total, category, difficulty) VALUES (@name, @score, @correct, @total, @category, @difficulty)',
      )
      .run(row);
    return getDb().prepare('SELECT * FROM scores WHERE id = ?').get(info.lastInsertRowid) as ScoreRow;
  },
};
