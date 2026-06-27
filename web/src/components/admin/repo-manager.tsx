'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { GitBranch, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { RepositoryRecord } from '@/lib/server/repositories';

interface RepoManagerProps {
  initialRepositories: RepositoryRecord[];
  hasGithubToken: boolean;
}

export function RepoManager({ initialRepositories, hasGithubToken }: RepoManagerProps) {
  const [repositories, setRepositories] = useState(initialRepositories);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [pendingRepoId, setPendingRepoId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sortedRepositories = useMemo(
    () => [...repositories].sort((a, b) => `${a.owner}/${a.name}`.localeCompare(`${b.owner}/${b.name}`)),
    [repositories],
  );

  async function refresh() {
    const response = await fetch('/api/repos');
    const data = (await response.json()) as { repositories?: RepositoryRecord[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? 'Failed to refresh repositories.');
    setRepositories(data.repositories ?? []);
  }

  function run(action: () => Promise<void>) {
    setError('');
    startTransition(async () => {
      try {
        await action();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Operation failed.');
      } finally {
        setPendingRepoId(null);
      }
    });
  }

  function addRepository() {
    run(async () => {
      const response = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to add repository.');
      setUrl('');
      await refresh();
    });
  }

  function syncRepository(repoId: string) {
    setPendingRepoId(repoId);
    run(async () => {
      const response = await fetch(`/api/repos/${encodeURIComponent(repoId)}/sync`, { method: 'POST' });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to sync repository.');
      await refresh();
    });
  }

  function deleteRepository(repoId: string, removeFiles: boolean) {
    setPendingRepoId(repoId);
    run(async () => {
      const response = await fetch(`/api/repos/${encodeURIComponent(repoId)}?removeFiles=${removeFiles ? 'true' : 'false'}`, {
        method: 'DELETE',
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to delete repository.');
      await refresh();
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Repositories</h1>
          <p className="text-sm text-fd-muted-foreground">Clone, sync, browse, edit, and remove GitHub Markdown sources.</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-fd-accent" type="submit">
            Log out
          </button>
        </form>
      </div>

      {!hasGithubToken ? (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm">
          Set <code>READER_GITHUB_TOKEN</code> before adding private repositories or pushing edits.
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-md border p-4 md:flex-row">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://github.com/owner/repo.git"
          className="min-h-10 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none focus:border-fd-primary"
        />
        <button
          type="button"
          onClick={addRepository}
          disabled={!url.trim() || isPending}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-fd-primary px-4 text-sm font-medium text-fd-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="size-4" />
          Add
        </button>
      </div>

      {error ? <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</div> : null}

      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b bg-fd-muted/40 px-4 py-3 text-sm font-medium md:grid-cols-[1fr_130px_160px_auto]">
          <span>Repository</span>
          <span className="hidden md:block">Status</span>
          <span className="hidden md:block">Last sync</span>
          <span>Actions</span>
        </div>
        {sortedRepositories.length === 0 ? (
          <div className="px-4 py-8 text-sm text-fd-muted-foreground">No repositories yet.</div>
        ) : (
          sortedRepositories.map((repo) => (
            <div key={repo.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0 md:grid-cols-[1fr_130px_160px_auto]">
              <div className="min-w-0">
                <Link className="font-medium hover:underline" href={`/docs/${encodeURIComponent(repo.id)}`}>
                  {repo.owner}/{repo.name}
                </Link>
                <p className="truncate text-xs text-fd-muted-foreground">{repo.url}</p>
                {repo.last_error ? <p className="mt-1 text-xs text-red-600 dark:text-red-300">{repo.last_error}</p> : null}
              </div>
              <span className="hidden text-xs md:block">{repo.status}</span>
              <span className="hidden text-xs text-fd-muted-foreground md:block">
                {repo.last_sync_at ? new Date(repo.last_sync_at).toLocaleString() : 'Never'}
              </span>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  title="Sync"
                  onClick={() => syncRepository(repo.id)}
                  disabled={isPending && pendingRepoId === repo.id}
                  className="inline-flex size-9 items-center justify-center rounded-md border hover:bg-fd-accent disabled:opacity-60"
                >
                  <RefreshCw className="size-4" />
                </button>
                <Link
                  title="Edit default branch files"
                  href={`/admin/repos/${encodeURIComponent(repo.id)}/edit`}
                  className="inline-flex size-9 items-center justify-center rounded-md border hover:bg-fd-accent"
                >
                  <GitBranch className="size-4" />
                </Link>
                <button
                  type="button"
                  title="Remove registry entry"
                  onClick={() => deleteRepository(repo.id, false)}
                  disabled={isPending && pendingRepoId === repo.id}
                  className="inline-flex size-9 items-center justify-center rounded-md border hover:bg-fd-accent disabled:opacity-60"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
