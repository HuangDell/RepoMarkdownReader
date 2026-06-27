import { requireAdmin } from '@/lib/server/auth';
import { addRepository, listRepositories } from '@/lib/server/repositories';
import { jsonError, jsonOk } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk({ repositories: listRepositories() });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to list repositories.', 401);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as { url?: string };
    if (!body.url) return jsonError('Repository URL is required.');

    const repository = await addRepository(body.url);
    return jsonOk({ repository }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Failed to add repository.');
  }
}
