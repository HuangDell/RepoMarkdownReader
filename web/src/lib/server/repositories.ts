import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type * as PageTree from 'fumadocs-core/page-tree';
import { getDb, dbTransaction, plainObject, plainObjects } from './db';
import { cloneRepository, getDefaultBranch, getHeadCommit, pullRepository, withRepoLock } from './git';
import { parseGitHubUrl } from './github-url';
import { extractMarkdownMetadata } from './markdown';
import { displayNameFromPath, getRepoBasePath, getRepoWorktreePath, hrefForDoc, isMarkdownPath, normalizeRepoPath, resolveInWorktree } from './paths';
import { nowIso } from './time';
import { appName } from '../shared';

export interface RepositoryRecord {
  id: string;
  url: string;
  owner: string;
  name: string;
  default_branch: string;
  local_path: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRecord {
  id: string;
  repo_id: string;
  path: string;
  title: string;
  description: string | null;
  body_text: string;
  file_hash: string;
  commit_sha: string;
  updated_at: string;
}

export function listRepositories() {
  return plainObjects(
    getDb()
      .prepare('SELECT * FROM repositories ORDER BY owner COLLATE NOCASE, name COLLATE NOCASE')
      .all() as unknown as RepositoryRecord[],
  );
}

export function getRepository(repoId: string) {
  const row = getDb().prepare('SELECT * FROM repositories WHERE id = ?').get(repoId) as RepositoryRecord | undefined;
  return row ? plainObject(row) : undefined;
}

export function getDocument(repoId: string, repoPath: string) {
  const row = getDb().prepare('SELECT * FROM documents WHERE repo_id = ? AND path = ?').get(repoId, normalizeRepoPath(repoPath)) as
    | DocumentRecord
    | undefined;
  return row ? plainObject(row) : undefined;
}

export function getFirstDocument(repoId: string) {
  const row = getDb().prepare('SELECT * FROM documents WHERE repo_id = ? ORDER BY path LIMIT 1').get(repoId) as DocumentRecord | undefined;
  return row ? plainObject(row) : undefined;
}

export function listDocuments(repoId?: string) {
  if (repoId) {
    return plainObjects(
      getDb()
        .prepare('SELECT * FROM documents WHERE repo_id = ? ORDER BY path COLLATE NOCASE')
        .all(repoId) as unknown as DocumentRecord[],
    );
  }

  return plainObjects(
    getDb().prepare('SELECT * FROM documents ORDER BY repo_id, path COLLATE NOCASE').all() as unknown as DocumentRecord[],
  );
}

function setRepoStatus(repoId: string, status: string, lastError?: string | null) {
  getDb()
    .prepare('UPDATE repositories SET status = ?, last_error = ?, updated_at = ? WHERE id = ?')
    .run(status, lastError ?? null, nowIso(), repoId);
}

export async function addRepository(url: string) {
  const parsed = parseGitHubUrl(url);
  const existing = getRepository(parsed.repoId);
  if (existing) return existing;

  const worktree = getRepoWorktreePath(parsed.repoId);
  let repositoryInserted = false;

  try {
    await withRepoLock(parsed.repoId, async () => {
      const lockedExisting = getRepository(parsed.repoId);
      if (lockedExisting) return;

      await cloneRepository(parsed.repoId, parsed.cloneUrl);
      const defaultBranch = await getDefaultBranch(worktree);

      const timestamp = nowIso();
      dbTransaction(() => {
        getDb()
          .prepare(
            `INSERT INTO repositories (id, url, owner, name, default_branch, local_path, status, last_sync_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(parsed.repoId, parsed.cloneUrl, parsed.owner, parsed.name, defaultBranch, worktree, 'ready', timestamp, timestamp, timestamp);
      });
      repositoryInserted = true;

      await scanRepository(parsed.repoId);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clone repository.';
    if (repositoryInserted) {
      setRepoStatus(parsed.repoId, 'error', message);
    } else {
      await fs.rm(getRepoBasePath(parsed.repoId), { recursive: true, force: true });
    }
    throw error;
  }

  return getRepository(parsed.repoId)!;
}

export async function syncRepository(repoId: string) {
  const repo = getRepository(repoId);
  if (!repo) throw new Error('Repository not found.');

  return withRepoLock(repoId, async () => {
    try {
      setRepoStatus(repoId, 'syncing', null);
      await pullRepository(repoId);
      await scanRepository(repoId);
      getDb()
        .prepare('UPDATE repositories SET status = ?, last_sync_at = ?, last_error = ?, updated_at = ? WHERE id = ?')
        .run('ready', nowIso(), null, nowIso(), repoId);
      return getRepository(repoId)!;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync repository.';
      setRepoStatus(repoId, 'error', message);
      throw error;
    }
  });
}

export async function deleteRepository(repoId: string, removeFiles: boolean) {
  const repo = getRepository(repoId);
  if (!repo) return;

  dbTransaction(() => {
    getDb().prepare('DELETE FROM document_fts WHERE repo_id = ?').run(repoId);
    getDb().prepare('DELETE FROM repositories WHERE id = ?').run(repoId);
  });

  if (removeFiles) {
    await fs.rm(getRepoBasePath(repoId), { recursive: true, force: true });
  }
}

async function walkMarkdownFiles(root: string, dir = ''): Promise<string[]> {
  const absolute = path.join(root, dir);
  const entries = await fs.readdir(absolute, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.next') continue;

    const repoPath = dir ? path.posix.join(dir.replaceAll(path.sep, '/'), entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(root, repoPath)));
    } else if (entry.isFile() && isMarkdownPath(repoPath)) {
      files.push(repoPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

export async function scanRepository(repoId: string) {
  const repo = getRepository(repoId);
  if (!repo) throw new Error('Repository not found.');

  const worktree = getRepoWorktreePath(repoId);
  const commit = await getHeadCommit(worktree);
  const files = await walkMarkdownFiles(worktree);
  const timestamp = nowIso();
  const seen = new Set<string>();

  dbTransaction(() => {
    getDb().prepare('DELETE FROM document_fts WHERE repo_id = ?').run(repoId);
    getDb().prepare('DELETE FROM document_headings WHERE repo_id = ?').run(repoId);
  });

  for (const repoPath of files) {
    const fullPath = resolveInWorktree(worktree, repoPath);
    const raw = await fs.readFile(fullPath, 'utf8');
    const metadata = extractMarkdownMetadata(repoPath, raw);
    const id = `${repoId}:${repoPath}`;
    seen.add(repoPath);

    dbTransaction(() => {
      getDb()
        .prepare(
          `INSERT INTO documents (id, repo_id, path, title, description, body_text, file_hash, commit_sha, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(repo_id, path) DO UPDATE SET
             title = excluded.title,
             description = excluded.description,
             body_text = excluded.body_text,
             file_hash = excluded.file_hash,
             commit_sha = excluded.commit_sha,
             updated_at = excluded.updated_at`,
        )
        .run(id, repoId, repoPath, metadata.title, metadata.description, metadata.bodyText, metadata.fileHash, commit, timestamp);

      for (const heading of metadata.headings) {
        getDb()
          .prepare(
            `INSERT INTO document_headings (id, repo_id, document_path, title, anchor, depth, position)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(`${id}:${heading.position}`, repoId, repoPath, heading.title, heading.anchor, heading.depth, heading.position);
      }

      getDb()
        .prepare('INSERT INTO document_fts (repo_id, path, title, body) VALUES (?, ?, ?, ?)')
        .run(repoId, repoPath, metadata.title, metadata.bodyText);
    });
  }

  const stale = listDocuments(repoId).filter((document) => !seen.has(document.path));
  if (stale.length > 0) {
    dbTransaction(() => {
      for (const document of stale) {
        getDb().prepare('DELETE FROM documents WHERE repo_id = ? AND path = ?').run(repoId, document.path);
      }
    });
  }
}

type MutableFolder = PageTree.Folder & { folderPath: string };

function getOrCreateFolder(children: PageTree.Node[], folderPath: string, name: string): MutableFolder {
  const existing = children.find((node): node is MutableFolder => node.type === 'folder' && (node as MutableFolder).folderPath === folderPath);
  if (existing) return existing;

  const folder: MutableFolder = {
    type: 'folder',
    name,
    folderPath,
    defaultOpen: true,
    collapsible: true,
    children: [],
  };
  children.push(folder);
  return folder;
}

function sortPageNodes(nodes: PageTree.Node[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });

  for (const node of nodes) {
    if (node.type === 'folder') sortPageNodes(node.children);
  }
}

export function buildPageTree(): PageTree.Root {
  const repos = listRepositories();
  const children: PageTree.Node[] = [];

  for (const repo of repos) {
    const documents = listDocuments(repo.id);
    const repoFolder: MutableFolder = {
      type: 'folder',
      name: `${repo.owner}/${repo.name}`,
      folderPath: repo.id,
      defaultOpen: true,
      collapsible: true,
      children: [],
    };

    for (const document of documents) {
      const segments = document.path.split('/');
      let current = repoFolder;

      for (let index = 0; index < segments.length - 1; index += 1) {
        const folderPath = `${repo.id}/${segments.slice(0, index + 1).join('/')}`;
        current = getOrCreateFolder(current.children, folderPath, segments[index]);
      }

      const item: PageTree.Item = {
        type: 'page',
        name: document.title || displayNameFromPath(document.path),
        url: hrefForDoc(repo.id, document.path),
      };

      const fileName = segments.at(-1)?.toLowerCase();
      if (fileName === 'readme.md' || fileName === 'index.md') {
        current.index = item;
      } else {
        current.children.push(item);
      }
    }

    sortPageNodes(repoFolder.children);
    children.push(repoFolder);
  }

  return {
    type: 'root',
    name: appName,
    children,
  };
}

function normalizeFtsQuery(query: string) {
  const tokens = query.match(/[\p{L}\p{N}_-]+/gu)?.slice(0, 8) ?? [];
  return tokens.map((token) => `${token.replace(/"/g, '""')}*`).join(' AND ');
}

export function searchDocuments(query: string, repoId?: string) {
  const match = normalizeFtsQuery(query);
  if (!match) return [];

  if (repoId) {
    return plainObjects(
      getDb()
        .prepare(
          `SELECT repo_id, path, title, snippet(document_fts, 3, '<mark>', '</mark>', '...', 18) AS snippet
           FROM document_fts
           WHERE document_fts MATCH ? AND repo_id = ?
           LIMIT 30`,
        )
        .all(match, repoId) as Array<{ repo_id: string; path: string; title: string; snippet: string }>,
    );
  }

  return plainObjects(
    getDb()
      .prepare(
        `SELECT repo_id, path, title, snippet(document_fts, 3, '<mark>', '</mark>', '...', 18) AS snippet
         FROM document_fts
         WHERE document_fts MATCH ?
         LIMIT 30`,
      )
      .all(match) as Array<{ repo_id: string; path: string; title: string; snippet: string }>,
  );
}

export async function readDocumentFile(repoId: string, repoPath: string) {
  const repo = getRepository(repoId);
  if (!repo) throw new Error('Repository not found.');

  const normalized = normalizeRepoPath(repoPath);
  const fullPath = resolveInWorktree(getRepoWorktreePath(repoId), normalized);
  const raw = await fs.readFile(fullPath, 'utf8');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const commit = await getHeadCommit(getRepoWorktreePath(repoId));

  return { repo, path: normalized, raw, hash, commit };
}
