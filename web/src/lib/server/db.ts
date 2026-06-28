import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { appConfig } from './config';

let db: DatabaseSync | undefined;
const latestSchemaVersion = 1;

export type SqlValue = string | number | bigint | null | Uint8Array;

export function plainObject<T extends object>(row: T): T {
  return { ...row };
}

export function plainObjects<T extends object>(rows: T[]): T[] {
  return rows.map(plainObject);
}

export function getDb() {
  if (db) return db;

  fs.mkdirSync(appConfig.dataDir, { recursive: true, mode: 0o700 });
  db = new DatabaseSync(path.join(appConfig.dataDir, 'app.db'));
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  migrate(db);

  return db;
}

function migrate(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      default_branch TEXT NOT NULL DEFAULT 'main',
      local_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      last_sync_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      body_text TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(repo_id, path)
    );

    CREATE TABLE IF NOT EXISTS document_headings (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      document_path TEXT NOT NULL,
      title TEXT NOT NULL,
      anchor TEXT NOT NULL,
      depth INTEGER NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(
      repo_id UNINDEXED,
      path UNINDEXED,
      title,
      body
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      branch TEXT NOT NULL,
      document_path TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      repo_id TEXT REFERENCES repositories(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_events (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_repo_path ON documents(repo_id, path);
    CREATE INDEX IF NOT EXISTS idx_headings_repo_doc ON document_headings(repo_id, document_path);
    CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(repo_id, branch, document_path);
  `);

  const row = database.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  const version = row?.user_version ?? 0;

  if (version < 1) {
    database.exec(`
      DROP INDEX IF EXISTS idx_notes_target;
      DROP TABLE IF EXISTS notes;
      PRAGMA user_version = ${latestSchemaVersion};
    `);
  }
}

export function dbTransaction<T>(fn: () => T) {
  const database = getDb();
  database.exec('BEGIN IMMEDIATE');

  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
