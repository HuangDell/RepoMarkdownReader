import { requireAdmin } from '@/lib/server/auth';
import { deleteRepository, getRepository } from '@/lib/server/repositories';
import { jsonError, jsonOk } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ repoId: string }> }) {
  try {
    await requireAdmin();
    const { repoId } = await context.params;
    const repository = getRepository(repoId);
    if (!repository) return jsonError('Repository not found.', 404);

    return jsonOk({ repository });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to read repository.', 401);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ repoId: string }> }) {
  try {
    await requireAdmin();
    const { repoId } = await context.params;
    const { searchParams } = new URL(request.url);
    await deleteRepository(repoId, searchParams.get('removeFiles') === 'true');
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to delete repository.');
  }
}
