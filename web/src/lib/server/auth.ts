import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { appConfig, assertAdminAuthConfigured } from './config';

const cookieName = 'reader_session';
const maxAgeSeconds = 60 * 60 * 24 * 7;

function sign(value: string) {
  return crypto.createHmac('sha256', appConfig.sessionSecret).update(value).digest('base64url');
}

function createSessionValue() {
  assertAdminAuthConfigured();
  const expires = Date.now() + maxAgeSeconds * 1000;
  const payload = `admin.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export async function isAdminSession() {
  if (!appConfig.adminPassword || appConfig.sessionSecret.length < 32) return false;

  const session = (await cookies()).get(cookieName)?.value;
  if (!session) return false;

  const parts = session.split('.');
  if (parts.length !== 3) return false;

  const payload = `${parts[0]}.${parts[1]}`;
  const expected = sign(payload);
  const actual = parts[2];

  if (expected.length !== actual.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return false;
  return parts[0] === 'admin' && Number(parts[1]) > Date.now();
}

export async function requireAdmin() {
  if (!(await isAdminSession())) {
    throw new Error('Unauthorized.');
  }
}

export function setSessionCookie(response: NextResponse) {
  response.cookies.set(cookieName, createSessionValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(cookieName, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export function verifyPassword(password: string) {
  assertAdminAuthConfigured();
  if (password.length !== appConfig.adminPassword.length) return false;
  return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(appConfig.adminPassword));
}
