import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import type * as PageTree from 'fumadocs-core/page-tree';
import { FileText, Folder } from 'lucide-react';
import { getDb, dbTransaction, plainObject, plainObjects } from './db';
import {
  cloneRepository,
  getDefaultBranch,
  getFileLastModifiedAt,
  getHeadCommit,
  getHeadTrackedPaths,
  getWorktreeStatus,
  pullRepository,
  withRepoLock,
} from './git';
import { parseGitHubUrl } from './github-url';
import { extractMarkdownMetadata } from './markdown';
import {
  displayNameFromPath,
  getRepoBasePath,
  getRepoWorktreePath,
  hrefForDoc,
  isMarkdownPath,
  markdownFileStemFromPath,
  normalizeRepoPath,
  resolveInWorktree,
} from './paths';
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
  origin: 'git' | 'local';
}

export interface LocalFolderRecord {
  repo_id: string;
  path: string;
  created_at: string;
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

export function listLocalFolders(repoId: string) {
  return plainObjects(
    getDb()
      .prepare('SELECT * FROM local_folders WHERE repo_id = ? ORDER BY path COLLATE NOCASE')
      .all(repoId) as unknown as LocalFolderRecord[],
  );
}

function setRepoStatus(repoId: string, status: string, lastError?: string | null) {
  getDb()
    .prepare('UPDATE repositories SET status = ?, last_error = ?, updated_at = ? WHERE id = ?')
    .run(status, lastError ?? null, nowIso(), repoId);
}

export function markRepositoryLocalChanges(repoId: string) {
  setRepoStatus(repoId, 'local_changes', null);
}

export function markRepositoryReady(repoId: string) {
  getDb()
    .prepare('UPDATE repositories SET status = ?, last_error = ?, updated_at = ? WHERE id = ?')
    .run('ready', null, nowIso(), repoId);
}

export async function refreshRepositoryStatus(repoId: string) {
  const worktreeStatus = await getWorktreeStatus(repoId);
  if (worktreeStatus.length > 0) {
    markRepositoryLocalChanges(repoId);
  } else {
    markRepositoryReady(repoId);
  }
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
      const worktreeStatus = await getWorktreeStatus(repoId);
      if (worktreeStatus.length > 0) {
        markRepositoryLocalChanges(repoId);
        const error = new Error('Local changes are present. Resolve them before syncing this repository.');
        error.name = 'LocalChangesError';
        throw error;
      }

      setRepoStatus(repoId, 'syncing', null);
      await pullRepository(repoId);
      await scanRepository(repoId);
      getDb()
        .prepare('UPDATE repositories SET status = ?, last_sync_at = ?, last_error = ?, updated_at = ? WHERE id = ?')
        .run('ready', nowIso(), null, nowIso(), repoId);
      return getRepository(repoId)!;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync repository.';
      if (!(error instanceof Error && error.name === 'LocalChangesError')) {
        setRepoStatus(repoId, 'error', message);
      }
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

function isKnownFolder(repoId: string, repoPath: string) {
  if (!repoPath) return true;

  if (listLocalFolders(repoId).some((folder) => folder.path === repoPath)) return true;

  const prefix = `${repoPath}/`;
  return listDocuments(repoId).some((document) => document.path.startsWith(prefix));
}

function validateFolderName(input: string) {
  const name = input.trim();
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new Error('Folder name must be a single path segment.');
  }

  if (name === '.git' || name === 'node_modules' || name === '.next') {
    throw new Error('That folder name is reserved.');
  }

  return name;
}

function conflictError(message: string) {
  const error = new Error(message);
  error.name = 'ConflictError';
  return error;
}

async function assertInsideWorktree(worktree: string, fullPath: string) {
  const root = await fs.realpath(worktree);
  const resolved = await fs.realpath(fullPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Path escapes repository root.');
  }
}

export async function createLocalFolder(repoId: string, parentPath: string, rawName: string) {
  const repository = getRepository(repoId);
  if (!repository) throw new Error('Repository not found.');

  const parent = normalizeRepoPath(parentPath);
  const name = validateFolderName(rawName);
  const folderPath = normalizeRepoPath(path.posix.join(parent, name));

  if (!isKnownFolder(repoId, parent)) throw new Error('The parent folder does not exist.');
  if (getDocument(repoId, folderPath) || listLocalFolders(repoId).some((folder) => folder.path === folderPath)) {
    throw conflictError('A file or folder with that name already exists.');
  }

  return withRepoLock(repoId, async () => {
    const worktree = getRepoWorktreePath(repoId);
    const fullPath = resolveInWorktree(worktree, folderPath);
    const existing = await fs.lstat(fullPath).catch(() => undefined);
    if (existing) throw conflictError('A file or folder with that name already exists.');

    let insideWorktree = false;
    try {
      await fs.mkdir(fullPath, { recursive: true });
      await assertInsideWorktree(worktree, fullPath);
      insideWorktree = true;

      const timestamp = nowIso();
      dbTransaction(() => {
        getDb()
          .prepare('INSERT INTO local_folders (repo_id, path, created_at, updated_at) VALUES (?, ?, ?, ?)')
          .run(repoId, folderPath, timestamp, timestamp);
      });
    } catch (error) {
      if (insideWorktree) await fs.rm(fullPath, { recursive: true, force: true });
      throw error;
    }

    return listLocalFolders(repoId).find((folder) => folder.path === folderPath)!;
  });
}

export async function uploadMarkdownFiles(
  repoId: string,
  folderPath: string,
  files: Array<{ name: string; content: string }>,
) {
  const repository = getRepository(repoId);
  if (!repository) throw new Error('Repository not found.');
  if (files.length === 0) throw new Error('At least one Markdown file is required.');
  if (files.length > 20) throw new Error('You can upload at most 20 files at a time.');

  const folder = normalizeRepoPath(folderPath);
  if (!isKnownFolder(repoId, folder)) throw new Error('The target folder does not exist.');

  return withRepoLock(repoId, async () => {
    const worktree = getRepoWorktreePath(repoId);
    const folderFullPath = resolveInWorktree(worktree, folder);
    await fs.mkdir(folderFullPath, { recursive: true });
    await assertInsideWorktree(worktree, folderFullPath);

    const entries = files.map(({ name, content }) => {
      const normalizedName = name.trim().replaceAll('\\', '/');
      if (!normalizedName || normalizedName !== path.posix.basename(normalizedName)) {
        throw new Error('Uploaded files must have a simple file name.');
      }

      const repoPath = normalizeRepoPath(path.posix.join(folder, normalizedName));
      if (!isMarkdownPath(repoPath)) throw new Error(`Only Markdown files can be uploaded: ${normalizedName}`);

      return { repoPath, content };
    });

    const uniquePaths = new Set(entries.map((entry) => entry.repoPath));
    if (uniquePaths.size !== entries.length) throw new Error('The upload contains duplicate file names.');

    for (const entry of entries) {
      const fullPath = resolveInWorktree(worktree, entry.repoPath);
      const existing = await fs.lstat(fullPath).catch(() => undefined);
      if (existing) throw conflictError(`A file already exists at ${entry.repoPath}.`);
    }

    const temporaryPaths: string[] = [];
    const committedPaths: string[] = [];

    try {
      for (const entry of entries) {
        const targetPath = resolveInWorktree(worktree, entry.repoPath);
        const temporaryPath = `${targetPath}.reader-upload-${crypto.randomUUID()}.tmp`;
        await fs.writeFile(temporaryPath, entry.content, { encoding: 'utf8', flag: 'wx' });
        temporaryPaths.push(temporaryPath);
      }

      for (let index = 0; index < entries.length; index += 1) {
        const targetPath = resolveInWorktree(worktree, entries[index].repoPath);
        await fs.rename(temporaryPaths[index], targetPath);
        committedPaths.push(targetPath);
      }
    } catch (error) {
      await Promise.all(temporaryPaths.map((temporaryPath) => fs.rm(temporaryPath, { force: true })));
      await Promise.all(committedPaths.map((committedPath) => fs.rm(committedPath, { force: true })));
      throw error;
    }

    try {
      await scanRepository(repoId);
    } catch (error) {
      markRepositoryLocalChanges(repoId);
      throw error;
    }

    markRepositoryLocalChanges(repoId);
    return entries.map((entry) => entry.repoPath);
  });
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
  const trackedPaths = await getHeadTrackedPaths(worktree);
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
          `INSERT INTO documents (id, repo_id, path, title, description, body_text, file_hash, commit_sha, updated_at, origin)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(repo_id, path) DO UPDATE SET
             title = excluded.title,
             description = excluded.description,
             body_text = excluded.body_text,
             file_hash = excluded.file_hash,
             commit_sha = excluded.commit_sha,
             updated_at = excluded.updated_at,
             origin = excluded.origin`,
        )
        .run(
          id,
          repoId,
          repoPath,
          metadata.title,
          metadata.description,
          metadata.bodyText,
          metadata.fileHash,
          commit,
          timestamp,
          trackedPaths.has(repoPath) ? 'git' : 'local',
        );

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

type MutableFolder = PageTree.Folder & { repoId: string; folderPath: string; canManage: boolean };

function getOrCreateFolder(children: PageTree.Node[], repoId: string, folderPath: string, name: string, canManage: boolean): MutableFolder {
  const existing = children.find((node): node is MutableFolder => node.type === 'folder' && (node as MutableFolder).folderPath === folderPath);
  if (existing) {
    existing.canManage ||= canManage;
    return existing;
  }

  const folder: MutableFolder = {
    type: 'folder',
    name,
    icon: createElement(Folder, { className: 'reader-sidebar-folder-glyph' }),
    repoId,
    folderPath,
    canManage,
    defaultOpen: false,
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

function addFolderPath(repoFolder: MutableFolder, repoId: string, folderPath: string, canManage: boolean) {
  const segments = folderPath.split('/').filter(Boolean);
  let current = repoFolder;

  for (let index = 0; index < segments.length; index += 1) {
    const currentPath = segments.slice(0, index + 1).join('/');
    current = getOrCreateFolder(current.children, repoId, currentPath, segments[index], canManage);
  }
}

export function buildPageTree(canManage = false): PageTree.Root {
  const repos = listRepositories();
  const children: PageTree.Node[] = [];

  for (const repo of repos) {
    const documents = listDocuments(repo.id);
    const repoFolder: MutableFolder = {
      type: 'folder',
      name: `${repo.owner}/${repo.name}`,
      icon: createElement(Folder, { className: 'reader-sidebar-folder-glyph' }),
      repoId: repo.id,
      canManage,
      folderPath: '',
      defaultOpen: false,
      collapsible: true,
      children: [],
    };

    for (const folder of listLocalFolders(repo.id)) {
      addFolderPath(repoFolder, repo.id, folder.path, canManage);
    }

    for (const document of documents) {
      const segments = document.path.split('/');
      let current = repoFolder;

      for (let index = 0; index < segments.length - 1; index += 1) {
        const folderPath = segments.slice(0, index + 1).join('/');
        current = getOrCreateFolder(current.children, repo.id, folderPath, segments[index], canManage);
      }

      const item: PageTree.Item = {
        type: 'page',
        name:
          document.origin === 'local'
            ? createElement(
                'span',
                { className: 'inline-flex min-w-0 items-center gap-1.5' },
                createElement('span', { className: 'truncate' }, markdownFileStemFromPath(document.path)),
                createElement(
                  'span',
                  {
                    className: 'shrink-0 text-[0.625rem] font-semibold uppercase tracking-wide text-fd-primary',
                    title: 'Local file',
                  },
                  'new',
                ),
              )
            : markdownFileStemFromPath(document.path),
        icon: createElement(FileText, { className: 'reader-sidebar-file-glyph' }),
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
  const worktree = getRepoWorktreePath(repoId);
  const fullPath = resolveInWorktree(worktree, normalized);
  const [raw, stats, commit, gitLastModifiedAt] = await Promise.all([
    fs.readFile(fullPath, 'utf8'),
    fs.stat(fullPath),
    getHeadCommit(worktree),
    getFileLastModifiedAt(worktree, normalized).catch(() => undefined),
  ]);
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const lastModifiedAt = gitLastModifiedAt ?? stats.mtime.toISOString();

  return { repo, path: normalized, raw, hash, commit, lastModifiedAt };
}
