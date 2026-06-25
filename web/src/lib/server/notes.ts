import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './db';
import { normalizeRepoPath } from './paths';
import { nowIso } from './time';

export interface NoteRecord {
  id: string;
  repo_id: string;
  branch: string;
  document_path: string;
  heading_anchor: string | null;
  selected_text: string | null;
  selected_hash: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export function listNotes(repoId: string, documentPath: string, branch: string) {
  return getDb()
    .prepare(
      `SELECT * FROM notes
       WHERE repo_id = ? AND document_path = ? AND branch = ?
       ORDER BY created_at DESC`,
    )
    .all(repoId, normalizeRepoPath(documentPath), branch) as unknown as NoteRecord[];
}

export function createNote(input: {
  repoId: string;
  branch: string;
  documentPath: string;
  headingAnchor?: string;
  selectedText?: string;
  body: string;
}) {
  const timestamp = nowIso();
  const selectedText = input.selectedText?.trim() || null;
  const note: NoteRecord = {
    id: crypto.randomUUID(),
    repo_id: input.repoId,
    branch: input.branch,
    document_path: normalizeRepoPath(input.documentPath),
    heading_anchor: input.headingAnchor?.trim() || null,
    selected_text: selectedText,
    selected_hash: selectedText ? crypto.createHash('sha256').update(selectedText).digest('hex') : null,
    body: input.body.trim(),
    created_at: timestamp,
    updated_at: timestamp,
  };

  getDb()
    .prepare(
      `INSERT INTO notes (id, repo_id, branch, document_path, heading_anchor, selected_text, selected_hash, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      note.id,
      note.repo_id,
      note.branch,
      note.document_path,
      note.heading_anchor,
      note.selected_text,
      note.selected_hash,
      note.body,
      note.created_at,
      note.updated_at,
    );

  return note;
}

export function updateNote(id: string, body: string) {
  const timestamp = nowIso();
  getDb().prepare('UPDATE notes SET body = ?, updated_at = ? WHERE id = ?').run(body.trim(), timestamp, id);
  return getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRecord | undefined;
}

export function deleteNote(id: string) {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id);
}
