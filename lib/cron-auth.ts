import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export function requireCronAuthorization(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Scheduled endpoint is not configured: set CRON_SECRET.' }, { status: 503 });
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(request.headers.get('authorization') ?? '');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  return null;
}
