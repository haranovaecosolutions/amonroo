import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSiteSessionToken, SESSION_COOKIE } from '@/lib/site-auth';

export async function POST(request: Request) {
  const expectedPassword = process.env.INVENTORY_PASSWORD;
  if (!expectedPassword || !process.env.INVENTORY_SESSION_SECRET) {
    return NextResponse.json({ error: 'Site password authentication is not configured on this server.' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Enter the site password.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || !('password' in body) || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'Enter the site password.' }, { status: 400 });
  }

  const submittedHash = createHash('sha256').update(body.password).digest();
  const expectedHash = createHash('sha256').update(expectedPassword).digest();
  if (!timingSafeEqual(submittedHash, expectedHash)) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(SESSION_COOKIE, await createSiteSessionToken(), {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: new URL(request.url).protocol === 'https:',
  });
  return response;
}
