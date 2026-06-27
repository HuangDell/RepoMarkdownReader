import { clearSessionCookie } from '@/lib/server/auth';
import { redirectSeeOther } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const response = redirectSeeOther('/login');
  clearSessionCookie(response);
  return response;
}
