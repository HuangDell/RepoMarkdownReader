import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appConfig, assertGitCredentialsConfigured } from './config';
import { getRepoBasePath, getRepoWorktreePath, normalizeRepoPath, resolveInWorktree } from './paths';

const execFileAsync = promisify(execFile);
const locks = new Map<string, Promise<unknown>>();

async function getAskPassPath() {
  assertGitCredentialsConfigured();

  const authDir = path.join(appConfig.dataDir, 'auth');
  const askPassPath = path.join(authDir, 'git-askpass.sh');
  await fs.mkdir(authDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(
    askPassPath,
    [
      '#!/bin/sh',
      'case "$1" in',
      '*Username*) printf "%s\\n" "x-access-token" ;;',
      '*Password*) printf "%s\\n" "$READER_GITHUB_TOKEN" ;;',
      '*) printf "\\n" ;;',
      'esac',
      '',
    ].join('\n'),
    { mode: 0o700 },
  );
  await fs.chmod(askPassPath, 0o700);

  return askPassPath;
}

export async function withRepoLock<T>(repoId: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(repoId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  locks.set(repoId, queued);

  await previous.catch(() => undefined);

  try {
    return await fn();
  } finally {
    release();
    if (locks.get(repoId) === queued) {
      locks.delete(repoId);
    }
  }
}

export async function runGit(args: string[], cwd?: string) {
  const askPassPath = await getAskPassPath();
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_ASKPASS: askPassPath,
      GIT_TERMINAL_PROMPT: '0',
      READER_GITHUB_TOKEN: appConfig.githubToken,
    },
    maxBuffer: 1024 * 1024 * 20,
  });

  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

export async function cloneRepository(repoId: string, cloneUrl: string) {
  const basePath = getRepoBasePath(repoId);
  const worktree = getRepoWorktreePath(repoId);
  await fs.mkdir(basePath, { recursive: true, mode: 0o700 });
  await fs.rm(worktree, { recursive: true, force: true });
  await runGit(['clone', cloneUrl, worktree]);

  return worktree;
}

export async function pullRepository(repoId: string) {
  const worktree = getRepoWorktreePath(repoId);
  await runGit(['fetch', 'origin'], worktree);
  await runGit(['pull', '--ff-only'], worktree);
}

export async function getCurrentBranch(worktree: string) {
  const branch = await runGit(['branch', '--show-current'], worktree);
  return branch.stdout || 'main';
}

export async function getHeadCommit(worktree: string) {
  const result = await runGit(['rev-parse', 'HEAD'], worktree);
  return result.stdout;
}

export async function getDefaultBranch(worktree: string) {
  const originHead = await runGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], worktree).catch(() => ({ stdout: '' }));
  const branch = originHead.stdout.replace(/^origin\//, '').trim();
  return branch || (await getCurrentBranch(worktree));
}

export async function commitAndPushFile(options: {
  repoId: string;
  repoPath: string;
  content: string;
  message: string;
  baseCommit: string;
  baseHash: string;
  currentHash: string;
  defaultBranch: string;
}) {
  return withRepoLock(options.repoId, async () => {
    const worktree = getRepoWorktreePath(options.repoId);
    const currentCommit = await getHeadCommit(worktree);

    if (currentCommit !== options.baseCommit || options.currentHash !== options.baseHash) {
      const error = new Error('The file changed after it was opened. Pull the latest copy and retry.');
      error.name = 'ConflictError';
      throw error;
    }

    const repoPath = normalizeRepoPath(options.repoPath);
    const filePath = resolveInWorktree(worktree, repoPath);
    await fs.writeFile(filePath, options.content, 'utf8');
    await runGit(['add', '--', repoPath], worktree);

    const status = await runGit(['status', '--porcelain', '--', repoPath], worktree);
    if (!status.stdout) {
      return { committed: false, commit: currentCommit };
    }

    await runGit(['commit', '-m', options.message], worktree);
    const commit = await getHeadCommit(worktree);
    await runGit(['push', 'origin', `HEAD:${options.defaultBranch}`], worktree);

    return { committed: true, commit };
  });
}
