import { listDocuments } from '@/lib/server/repositories';
import { jsonError, jsonOk } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ repoId: string }> }) {
  try {
    const { repoId } = await context.params;
    return jsonOk({ documents: listDocuments(repoId) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to list documents.');
  }
}
