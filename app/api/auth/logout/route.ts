import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/site-auth';

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
