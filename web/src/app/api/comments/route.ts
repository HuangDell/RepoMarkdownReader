import { requireAdmin } from '@/lib/server/auth';
import { createComment, deleteComment, listComments, updateComment } from '@/lib/server/comments';
import { jsonError, jsonOk } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorStatus(error: unknown) {
  return error instanceof Error && error.message === 'Unauthorized.' ? 401 : 400;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const repoId = searchParams.get('repoId');
    const documentPath = searchParams.get('path');
    const branch = searchParams.get('branch') ?? 'main';
    if (!repoId || !documentPath) return jsonError('repoId and path are required.');

    return jsonOk({ comments: listComments(repoId, documentPath, branch) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to list comments.', errorStatus(error));
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      repoId?: string;
      branch?: string;
      path?: string;
      body?: string;
    };
    if (!body.repoId || !body.path || !body.body?.trim()) return jsonError('repoId, path, and comment body are required.');

    const comment = createComment({
      repoId: body.repoId,
      branch: body.branch || 'main',
      documentPath: body.path,
      body: body.body,
    });

    return jsonOk({ comment }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to create comment.', errorStatus(error));
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as { id?: string; body?: string };
    if (!body.id || !body.body?.trim()) return jsonError('id and body are required.');

    const comment = updateComment(body.id, body.body);
    if (!comment) return jsonError('Comment not found.', 404);

    return jsonOk({ comment });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to update comment.', errorStatus(error));
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return jsonError('id is required.');

    deleteComment(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to delete comment.', errorStatus(error));
  }
}
