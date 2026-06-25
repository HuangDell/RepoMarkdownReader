import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  clearSessionCookie(response);
  return response;
}
