import { jsonError, jsonOk } from '@/lib/server/http';
import { createLocalFolder, renameFolder } from '@/lib/server/repositories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ repoId: string }> }) {
  try {
    const { repoId } = await context.params;
    const body = (await request.json()) as { parentPath?: string; name?: string };

    if (typeof body.name !== 'string' || typeof body.parentPath !== 'string') {
      return jsonError('parentPath and name are required.');
    }

    const folder = await createLocalFolder(repoId, body.parentPath, body.name);
    return jsonOk({ folder }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.name === 'ConflictError' ? 409 : 400;
    return jsonError(error instanceof Error ? error.message : 'Failed to create folder.', status);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ repoId: string }> }) {
  try {
    const { repoId } = await context.params;
    const body = (await request.json()) as { path?: string; name?: string };

    if (typeof body.name !== 'string' || typeof body.path !== 'string') {
      return jsonError('path and name are required.');
    }

    const folder = await renameFolder(repoId, body.path, body.name);
    return jsonOk({ folder });
  } catch (error) {
    const status = error instanceof Error && error.name === 'ConflictError' ? 409 : 400;
    return jsonError(error instanceof Error ? error.message : 'Failed to rename folder.', status);
  }
}
