import fs from 'node:fs/promises';
import { getRepoWorktreePath, normalizeRepoPath, resolveInWorktree } from '@/lib/server/paths';
import { getRepository } from '@/lib/server/repositories';
import { jsonError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const contentTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

export async function GET(request: Request, context: { params: Promise<{ repoId: string }> }) {
  try {
    const { repoId } = await context.params;
    const repository = getRepository(repoId);
    if (!repository) return jsonError('Repository not found.', 404);

    const { searchParams } = new URL(request.url);
    const repoPath = normalizeRepoPath(searchParams.get('path') ?? '');
    if (!repoPath) return jsonError('path is required.');

    const fullPath = resolveInWorktree(getRepoWorktreePath(repoId), repoPath);
    const buffer = await fs.readFile(fullPath);
    const extension = repoPath.slice(repoPath.lastIndexOf('.')).toLowerCase();

    return new Response(buffer, {
      headers: {
        'content-type': contentTypes[extension] ?? 'application/octet-stream',
        'cache-control': 'private, max-age=300',
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to read asset.', 404);
  }
}
