import { NextResponse } from 'next/server';
import { setSessionCookie, verifyPassword } from '@/lib/server/auth';
import { getString } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = getString(formData.get('password'));
  const redirectTo = getString(formData.get('redirectTo')) || '/admin/repos';

  if (!verifyPassword(password)) {
    return NextResponse.redirect(new URL('/login?error=1', request.url), 303);
  }

  const response = NextResponse.redirect(new URL(redirectTo, request.url), 303);
  setSessionCookie(response);
  return response;
}
