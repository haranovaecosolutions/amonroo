import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySiteSessionToken } from '@/lib/site-auth';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (process.env.INVENTORY_AUTH_ENABLED !== 'true') {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Site access is disabled until INVENTORY_AUTH_ENABLED=true is configured.' },
        { status: 503 },
      );
    }
    if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }
  if (pathname === '/login' || pathname === '/api/auth/login' || pathname === '/api/auth/logout') {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySiteSessionToken(token)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
