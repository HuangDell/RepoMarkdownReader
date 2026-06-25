'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { MessageSquarePlus, Trash2 } from 'lucide-react';

interface Note {
  id: string;
  body: string;
  heading_anchor: string | null;
  selected_text: string | null;
  created_at: string;
}

interface NotePanelProps {
  repoId: string;
  branch: string;
  path: string;
}

export function NotePanel({ repoId, branch, path }: NotePanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState('');
  const [headingAnchor, setHeadingAnchor] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const loadNotes = useCallback(async () => {
    const response = await fetch(`/api/notes?repoId=${encodeURIComponent(repoId)}&branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}`);
    if (response.status === 401) return;

    const data = (await response.json()) as { notes?: Note[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? 'Failed to load notes.');
    setNotes(data.notes ?? []);
  }, [branch, path, repoId]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      loadNotes().catch((cause) => setError(cause instanceof Error ? cause.message : 'Failed to load notes.'));
    }, 0);

    return () => window.clearTimeout(id);
  }, [loadNotes]);

  function addNote() {
    setError('');
    startTransition(async () => {
      try {
        const response = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ repoId, branch, path, body, headingAnchor, selectedText }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(data.error ?? 'Failed to create note.');
        setBody('');
        setHeadingAnchor('');
        setSelectedText('');
        await loadNotes();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to create note.');
      }
    });
  }

  function removeNote(id: string) {
    setError('');
    startTransition(async () => {
      try {
        const response = await fetch(`/api/notes?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(data.error ?? 'Failed to delete note.');
        await loadNotes();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to delete note.');
      }
    });
  }

  return (
    <aside className="mt-8 rounded-md border p-4 lg:sticky lg:top-20 lg:mt-0 lg:max-h-[calc(100vh-7rem)] lg:overflow-auto">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <MessageSquarePlus className="size-4" />
        Notes
      </div>
      {error ? <p className="mb-3 text-xs text-red-600 dark:text-red-300">{error}</p> : null}
      <div className="flex flex-col gap-2">
        <input
          value={headingAnchor}
          onChange={(event) => setHeadingAnchor(event.target.value)}
          className="rounded-md border bg-transparent px-3 py-2 text-xs outline-none focus:border-fd-primary"
          placeholder="Heading anchor"
        />
        <input
          value={selectedText}
          onChange={(event) => setSelectedText(event.target.value)}
          className="rounded-md border bg-transparent px-3 py-2 text-xs outline-none focus:border-fd-primary"
          placeholder="Selected text"
        />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-24 resize-y rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-fd-primary"
          placeholder="Draft note"
        />
        <button
          type="button"
          onClick={addNote}
          disabled={isPending || !body.trim()}
          className="rounded-md bg-fd-primary px-3 py-2 text-sm font-medium text-fd-primary-foreground disabled:opacity-60"
        >
          Save note
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {notes.map((note) => (
          <div key={note.id} className="rounded-md border bg-fd-muted/20 p-3 text-sm">
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="text-xs text-fd-muted-foreground">{new Date(note.created_at).toLocaleString()}</p>
              <button className="rounded p-1 hover:bg-fd-accent" type="button" onClick={() => removeNote(note.id)} title="Delete note">
                <Trash2 className="size-3.5" />
              </button>
            </div>
            {note.heading_anchor ? <p className="mb-1 text-xs text-fd-muted-foreground">#{note.heading_anchor}</p> : null}
            {note.selected_text ? <p className="mb-2 border-l pl-2 text-xs text-fd-muted-foreground">{note.selected_text}</p> : null}
            <p className="whitespace-pre-wrap">{note.body}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
