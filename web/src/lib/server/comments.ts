import 'server-only';
import crypto from 'node:crypto';
import { getDb, plainObject, plainObjects } from './db';
import { normalizeRepoPath } from './paths';
import { nowIso } from './time';

export interface CommentRecord {
  id: string;
  repo_id: string;
  branch: string;
  document_path: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export function listComments(repoId: string, documentPath: string, branch: string) {
  return plainObjects(
    getDb()
      .prepare(
        `SELECT * FROM comments
         WHERE repo_id = ? AND document_path = ? AND branch = ?
         ORDER BY created_at ASC`,
      )
      .all(repoId, normalizeRepoPath(documentPath), branch) as unknown as CommentRecord[],
  );
}

export function createComment(input: {
  repoId: string;
  branch: string;
  documentPath: string;
  body: string;
}) {
  const timestamp = nowIso();
  const comment: CommentRecord = {
    id: crypto.randomUUID(),
    repo_id: input.repoId,
    branch: input.branch,
    document_path: normalizeRepoPath(input.documentPath),
    body: input.body.trim(),
    created_at: timestamp,
    updated_at: timestamp,
  };

  getDb()
    .prepare(
      `INSERT INTO comments (id, repo_id, branch, document_path, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      comment.id,
      comment.repo_id,
      comment.branch,
      comment.document_path,
      comment.body,
      comment.created_at,
      comment.updated_at,
    );

  return comment;
}

export function updateComment(id: string, body: string) {
  const timestamp = nowIso();
  getDb().prepare('UPDATE comments SET body = ?, updated_at = ? WHERE id = ?').run(body.trim(), timestamp, id);
  const row = getDb().prepare('SELECT * FROM comments WHERE id = ?').get(id) as CommentRecord | undefined;
  return row ? plainObject(row) : undefined;
}

export function deleteComment(id: string) {
  getDb().prepare('DELETE FROM comments WHERE id = ?').run(id);
}
