import 'server-only';
import path from 'node:path';
import { appConfig } from './config';

const markdownExtensions = new Set(['.md', '.markdown', '.mdx']);

export function getRepoWorktreePath(repoId: string) {
  return path.join(appConfig.dataDir, 'repos', repoId, 'worktree');
}

export function getRepoBasePath(repoId: string) {
  return path.join(appConfig.dataDir, 'repos', repoId);
}

export function normalizeRepoPath(input: string) {
  const decoded = decodeURIComponent(input).replaceAll('\\', '/').trim();

  if (!decoded || decoded === '.') {
    return '';
  }

  const normalized = path.posix.normalize(decoded);

  if (normalized.startsWith('../') || normalized === '..' || normalized.startsWith('/')) {
    throw new Error('Path escapes repository root.');
  }

  return normalized === '.' ? '' : normalized;
}

export function resolveInWorktree(worktree: string, repoPath: string) {
  const normalized = normalizeRepoPath(repoPath);
  const resolved = path.resolve(worktree, normalized);
  const root = path.resolve(worktree);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Path escapes repository root.');
  }

  return resolved;
}

export function isMarkdownPath(repoPath: string) {
  return markdownExtensions.has(path.posix.extname(repoPath).toLowerCase());
}

export function displayNameFromPath(repoPath: string) {
  const basename = path.posix.basename(repoPath);
  return basename.replace(/\.(md|markdown|mdx)$/i, '').replaceAll('-', ' ');
}

export function relativePathFromSlug(slug: string[] | undefined) {
  return normalizeRepoPath((slug ?? []).join('/'));
}

export function hrefForDoc(repoId: string, repoPath: string) {
  const segments = [repoId, ...normalizeRepoPath(repoPath).split('/').filter(Boolean)];
  return `/docs/${segments.map(encodeURIComponent).join('/')}`;
}

export function rawHref(repoId: string, repoPath: string) {
  return `/api/repos/${encodeURIComponent(repoId)}/raw?path=${encodeURIComponent(normalizeRepoPath(repoPath))}`;
}

export function resolveRelativeRepoPath(currentPath: string, href: string) {
  const [pathname, hash = ''] = href.split('#', 2);
  const [pathPart, search = ''] = pathname.split('?', 2);

  if (!pathPart) {
    return { path: normalizeRepoPath(currentPath), suffix: hash ? `#${hash}` : '' };
  }

  const baseDir = path.posix.dirname(normalizeRepoPath(currentPath));
  const resolved = normalizeRepoPath(path.posix.join(baseDir === '.' ? '' : baseDir, pathPart));
  const suffix = `${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`;

  return { path: resolved, suffix };
}
