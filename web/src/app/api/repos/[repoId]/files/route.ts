import { requireAdmin } from '@/lib/server/auth';
import { commitAndPushFile } from '@/lib/server/git';
import { extractMarkdownMetadata, renderMarkdown } from '@/lib/server/markdown';
import { normalizeRepoPath } from '@/lib/server/paths';
import { getRepository, readDocumentFile, scanRepository } from '@/lib/server/repositories';
import { jsonError, jsonOk } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ repoId: string }> }) {
  try {
    await requireAdmin();
    const { repoId } = await context.params;
    const { searchParams } = new URL(request.url);
    const repoPath = searchParams.get('path');
    if (!repoPath) return jsonError('path is required.');

    const file = await readDocumentFile(repoId, repoPath);
    return jsonOk({
      repository: file.repo,
      path: file.path,
      content: file.raw,
      hash: file.hash,
      commit: file.commit,
      metadata: extractMarkdownMetadata(file.path, file.raw),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to read file.', 404);
  }
}

export async function POST(request: Request, context: { params: Promise<{ repoId: string }> }) {
  try {
    await requireAdmin();
    const { repoId } = await context.params;
    const body = (await request.json()) as { path?: string; content?: string };
    if (!body.path || typeof body.content !== 'string') return jsonError('path and content are required.');

    const rendered = await renderMarkdown(repoId, normalizeRepoPath(body.path), body.content);
    return jsonOk({ rendered });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to preview file.');
  }
}

export async function PUT(request: Request, context: { params: Promise<{ repoId: string }> }) {
  try {
    await requireAdmin();
    const { repoId } = await context.params;
    const repository = getRepository(repoId);
    if (!repository) return jsonError('Repository not found.', 404);

    const body = (await request.json()) as {
      path?: string;
      content?: string;
      message?: string;
      baseCommit?: string;
      baseHash?: string;
      currentHash?: string;
    };

    if (!body.path || typeof body.content !== 'string' || !body.baseCommit || !body.baseHash || !body.currentHash) {
      return jsonError('path, content, baseCommit, baseHash, and currentHash are required.');
    }

    const result = await commitAndPushFile({
      repoId,
      repoPath: body.path,
      content: body.content,
      message: body.message?.trim() || `Update ${body.path}`,
      baseCommit: body.baseCommit,
      baseHash: body.baseHash,
      currentHash: body.currentHash,
      defaultBranch: repository.default_branch,
    });
    await scanRepository(repoId);

    return jsonOk({ result });
  } catch (error) {
    const isConflict = error instanceof Error && error.name === 'ConflictError';
    return jsonError(error instanceof Error ? error.message : 'Failed to save file.', isConflict ? 409 : 400);
  }
}
