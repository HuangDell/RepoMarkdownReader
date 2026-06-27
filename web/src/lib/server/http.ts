import 'server-only';
import { NextResponse } from 'next/server';

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function getString(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : '';
}

export function redirectSeeOther(location: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: location },
  });
}

export function localRedirectPath(value: string, fallback = '/') {
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;

  try {
    const url = new URL(value, 'http://reader.local');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
