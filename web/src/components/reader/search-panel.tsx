'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Search } from 'lucide-react';

interface SearchResult {
  repo_id: string;
  path: string;
  title: string;
  snippet: string;
  url: string;
}

export function SearchPanel({ repoId }: { repoId?: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function search() {
    setError('');
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ q: query });
        if (repoId) params.set('repoId', repoId);
        const response = await fetch(`/api/search?${params.toString()}`);
        const data = (await response.json()) as { results?: SearchResult[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? 'Search failed.');
        setResults(data.results ?? []);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Search failed.');
      }
    });
  }

  return (
    <div className="rounded-md border p-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') search();
          }}
          className="min-h-10 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none focus:border-fd-primary"
          placeholder="Search Markdown"
        />
        <button
          type="button"
          onClick={search}
          disabled={isPending || !query.trim()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-fd-primary px-4 text-sm font-medium text-fd-primary-foreground disabled:opacity-60"
        >
          <Search className="size-4" />
          Search
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p> : null}
      {results.length > 0 ? (
        <div className="mt-4 divide-y rounded-md border">
          {results.map((result) => (
            <Link key={`${result.repo_id}:${result.path}`} href={result.url} className="block p-3 hover:bg-fd-accent">
              <p className="font-medium">{result.title}</p>
              <p className="text-xs text-fd-muted-foreground">{result.path}</p>
              <p className="mt-1 line-clamp-2 text-sm text-fd-muted-foreground">{result.snippet.replaceAll(/<\/?mark>/g, '')}</p>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
