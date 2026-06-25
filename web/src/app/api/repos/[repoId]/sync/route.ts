import { requireAdmin } from '@/lib/server/auth';
import { syncRepository } from '@/lib/server/repositories';
import { jsonError, jsonOk } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ repoId: string }> }) {
  try {
    await requireAdmin();
    const { repoId } = await context.params;
    const repository = await syncRepository(repoId);
    return jsonOk({ repository });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to sync repository.');
  }
}
