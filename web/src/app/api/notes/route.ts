import { requireAdmin } from '@/lib/server/auth';
import { createNote, deleteNote, listNotes, updateNote } from '@/lib/server/notes';
import { jsonError, jsonOk } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const repoId = searchParams.get('repoId');
    const documentPath = searchParams.get('path');
    const branch = searchParams.get('branch') ?? 'main';
    if (!repoId || !documentPath) return jsonError('repoId and path are required.');

    return jsonOk({ notes: listNotes(repoId, documentPath, branch) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to list notes.', 401);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      repoId?: string;
      branch?: string;
      path?: string;
      headingAnchor?: string;
      selectedText?: string;
      body?: string;
    };
    if (!body.repoId || !body.path || !body.body?.trim()) return jsonError('repoId, path, and note body are required.');

    const note = createNote({
      repoId: body.repoId,
      branch: body.branch || 'main',
      documentPath: body.path,
      headingAnchor: body.headingAnchor,
      selectedText: body.selectedText,
      body: body.body,
    });

    return jsonOk({ note }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to create note.');
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as { id?: string; body?: string };
    if (!body.id || !body.body?.trim()) return jsonError('id and body are required.');

    const note = updateNote(body.id, body.body);
    if (!note) return jsonError('Note not found.', 404);

    return jsonOk({ note });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to update note.');
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return jsonError('id is required.');

    deleteNote(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to delete note.');
  }
}
