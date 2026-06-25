'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { Eye, Save } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';

interface MarkdownEditorProps {
  repoId: string;
  repoLabel: string;
  path: string;
  initialContent: string;
  initialHash: string;
  initialCommit: string;
}

export function MarkdownEditor({ repoId, repoLabel, path, initialContent, initialHash, initialCommit }: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [message, setMessage] = useState(`Update ${path}`);
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      fetch(`/api/repos/${encodeURIComponent(repoId)}/files`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, content }),
      })
        .then(async (response) => {
          const data = (await response.json()) as { rendered?: { html: string }; error?: string };
          if (!response.ok) throw new Error(data.error ?? 'Preview failed.');
          setPreview(data.rendered?.html ?? '');
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : 'Preview failed.'));
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [content, path, repoId]);

  function save() {
    setError('');
    setStatus('');
    startTransition(async () => {
      try {
        const response = await fetch(`/api/repos/${encodeURIComponent(repoId)}/files`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            path,
            content,
            message,
            baseCommit: initialCommit,
            baseHash: initialHash,
            currentHash: initialHash,
          }),
        });
        const data = (await response.json()) as { result?: { committed: boolean; commit: string }; error?: string };
        if (!response.ok) throw new Error(data.error ?? 'Save failed.');
        setStatus(data.result?.committed ? `Committed ${data.result.commit.slice(0, 8)} and pushed.` : 'No changes to commit.');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Save failed.');
      }
    });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-fd-muted-foreground">{repoLabel}</p>
          <h1 className="truncate text-lg font-semibold">{path}</h1>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-md border px-3 py-2 text-sm hover:bg-fd-accent" href={`/docs/${encodeURIComponent(repoId)}/${path.split('/').map(encodeURIComponent).join('/')}`}>
            Reader
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={isPending || !message.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-fd-primary px-3 py-2 text-sm font-medium text-fd-primary-foreground disabled:opacity-60"
          >
            <Save className="size-4" />
            Commit & Push
          </button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-2">
        <section className="flex min-h-[50vh] flex-col border-b lg:border-b-0 lg:border-r">
          <div className="border-b p-3">
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-fd-primary"
              placeholder="Commit message"
            />
          </div>
          <CodeMirror
            value={content}
            onChange={setContent}
            extensions={[markdown()]}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
            }}
            height="70vh"
            className="flex-1 overflow-auto text-sm"
          />
        </section>
        <section className="min-h-[50vh] overflow-auto p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Eye className="size-4" />
            Preview
          </div>
          {error ? <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</div> : null}
          {status ? <div className="mb-3 rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-300">{status}</div> : null}
          <article className="prose max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: preview }} />
        </section>
      </div>
    </div>
  );
}
