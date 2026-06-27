import { requireAdmin } from '@/lib/server/auth';
import { addRepository, listRepositories } from '@/lib/server/repositories';
import { getString, jsonError, jsonOk, redirectSeeOther } from '@/lib/server/http';

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
  const contentType = request.headers.get('content-type') ?? '';
  const isFormPost = contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data');

  try {
    await requireAdmin();
    const url = isFormPost ? getString((await request.formData()).get('url')) : ((await request.json()) as { url?: string }).url;
    if (!url?.trim()) {
      if (isFormPost) return redirectSeeOther(`/admin/repos?error=${encodeURIComponent('Repository URL is required.')}`);
      return jsonError('Repository URL is required.');
    }

    const repository = await addRepository(url);
    if (isFormPost) return redirectSeeOther('/admin/repos');
    return jsonOk({ repository }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add repository.';
    if (isFormPost) {
      if (message === 'Unauthorized.') return redirectSeeOther('/login?redirectTo=/admin/repos');
      return redirectSeeOther(`/admin/repos?error=${encodeURIComponent(message)}`);
    }
    return jsonError(message);
  }
}
