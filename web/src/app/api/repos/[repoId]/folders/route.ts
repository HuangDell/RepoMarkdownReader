import { requireAdmin } from '@/lib/server/auth';
import { jsonError, jsonOk } from '@/lib/server/http';
import { createLocalFolder } from '@/lib/server/repositories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ repoId: string }> }) {
  try {
    await requireAdmin();
    const { repoId } = await context.params;
    const body = (await request.json()) as { parentPath?: string; name?: string };

    if (typeof body.name !== 'string' || typeof body.parentPath !== 'string') {
      return jsonError('parentPath and name are required.');
    }

    const folder = await createLocalFolder(repoId, body.parentPath, body.name);
    return jsonOk({ folder }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized.' ? 401 : error instanceof Error && error.name === 'ConflictError' ? 409 : 400;
    return jsonError(error instanceof Error ? error.message : 'Failed to create folder.', status);
  }
}
