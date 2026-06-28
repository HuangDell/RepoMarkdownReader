'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, MessageSquare, Pencil, Trash2, X } from 'lucide-react';

interface Comment {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface CommentSectionProps {
  repoId: string;
  branch: string;
  path: string;
}

export function CommentSection({ repoId, branch, path }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const loadComments = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/comments?repoId=${encodeURIComponent(repoId)}&branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}`);
      if (response.status === 401) {
        setComments([]);
        setIsUnauthorized(true);
        return;
      }

      const data = (await response.json()) as { comments?: Comment[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to load comments.');

      setComments(data.comments ?? []);
      setIsUnauthorized(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load comments.');
    } finally {
      setIsLoading(false);
    }
  }, [branch, path, repoId]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadComments();
    }, 0);

    return () => window.clearTimeout(id);
  }, [loadComments]);

  async function addComment() {
    setError('');
    setIsPending(true);

    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoId, branch, path, body }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to create comment.');

      setBody('');
      await loadComments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create comment.');
    } finally {
      setIsPending(false);
    }
  }

  async function saveEdit(id: string) {
    setError('');
    setIsPending(true);

    try {
      const response = await fetch('/api/comments', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, body: editingBody }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to update comment.');

      setEditingId(null);
      setEditingBody('');
      await loadComments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to update comment.');
    } finally {
      setIsPending(false);
    }
  }

  async function removeComment(id: string) {
    setError('');
    setIsPending(true);

    try {
      const response = await fetch(`/api/comments?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to delete comment.');

      await loadComments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete comment.');
    } finally {
      setIsPending(false);
    }
  }

  function startEdit(comment: Comment) {
    setEditingId(comment.id);
    setEditingBody(comment.body);
  }

  return (
    <section className="not-prose mt-12 border-t pt-8" aria-labelledby="comments-title">
      <div className="mb-4 flex items-center gap-2">
        <MessageSquare className="size-4" />
        <h2 id="comments-title" className="text-base font-semibold">
          Comments
        </h2>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600 dark:text-red-300">{error}</p> : null}

      {isUnauthorized ? (
        <div className="rounded-md border p-4 text-sm text-fd-muted-foreground">
          Comments require an admin session. <a href="/login" className="underline">Log in</a> to view and manage comments.
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-2">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-24 resize-y rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-fd-primary"
              placeholder="Add a comment"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={addComment}
                disabled={isPending || !body.trim()}
                className="rounded-md bg-fd-primary px-3 py-2 text-sm font-medium text-fd-primary-foreground disabled:opacity-60"
              >
                Post comment
              </button>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-fd-muted-foreground">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-fd-muted-foreground">No comments yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {comments.map((comment) => {
                const isEditing = editingId === comment.id;

                return (
                  <article key={comment.id} className="rounded-md border bg-fd-muted/20 p-4 text-sm">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="text-xs text-fd-muted-foreground">
                        <p>{new Date(comment.created_at).toLocaleString()}</p>
                        {comment.updated_at !== comment.created_at ? <p>Edited {new Date(comment.updated_at).toLocaleString()}</p> : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {isEditing ? (
                          <>
                            <button
                              className="rounded p-1 hover:bg-fd-accent disabled:opacity-60"
                              type="button"
                              onClick={() => saveEdit(comment.id)}
                              disabled={isPending || !editingBody.trim()}
                              title="Save comment"
                            >
                              <Check className="size-3.5" />
                            </button>
                            <button
                              className="rounded p-1 hover:bg-fd-accent"
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setEditingBody('');
                              }}
                              title="Cancel edit"
                            >
                              <X className="size-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="rounded p-1 hover:bg-fd-accent" type="button" onClick={() => startEdit(comment)} title="Edit comment">
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              className="rounded p-1 hover:bg-fd-accent disabled:opacity-60"
                              type="button"
                              onClick={() => removeComment(comment.id)}
                              disabled={isPending}
                              title="Delete comment"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <textarea
                        value={editingBody}
                        onChange={(event) => setEditingBody(event.target.value)}
                        className="min-h-24 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-fd-primary"
                      />
                    ) : (
                      <p className="whitespace-pre-wrap">{comment.body}</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
