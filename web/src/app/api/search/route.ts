import { hrefForDoc } from '@/lib/server/paths';
import { searchDocuments } from '@/lib/server/repositories';
import { jsonError, jsonOk } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') ?? '';
    const repoId = searchParams.get('repoId') ?? undefined;
    const results = searchDocuments(query, repoId).map((result) => ({
      ...result,
      url: hrefForDoc(result.repo_id, result.path),
    }));

    return jsonOk({ results });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Search failed.');
  }
}
