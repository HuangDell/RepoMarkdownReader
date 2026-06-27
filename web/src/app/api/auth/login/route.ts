import { setSessionCookie, verifyPassword } from '@/lib/server/auth';
import { getString, localRedirectPath, redirectSeeOther } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = getString(formData.get('password'));
  const redirectTo = localRedirectPath(getString(formData.get('redirectTo')), '/admin/repos');

  if (!verifyPassword(password)) {
    return redirectSeeOther('/login?error=1');
  }

  const response = redirectSeeOther(redirectTo);
  setSessionCookie(response, request);
  return response;
}
