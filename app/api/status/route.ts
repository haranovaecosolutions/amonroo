import { NextResponse } from 'next/server';
import { checkBaseLinkerConnection } from '@/lib/baselinker';
import { serverDb } from '@/lib/server-db';

type Check = { status: 'connected' | 'missing' | 'error' | 'configured'; message: string };

async function checkSupabase(): Promise<Check> {
  try {
    const db = serverDb();
    if (!db) return { status: 'missing', message: 'Supabase URL or service-role key is missing.' };

    const { error } = await db.from('inventory_products').select('id').limit(1);
    return error
      ? { status: 'error', message: 'Supabase could not be queried. Check the project URL, service-role key, and schema.' }
      : { status: 'connected', message: 'Supabase is responding.' };
  } catch {
    return { status: 'error', message: 'Supabase could not be queried. Check the project URL, service-role key, and schema.' };
  }
}

async function checkBaseLinker(): Promise<Check> {
  if (!process.env.BASELINKER_API_TOKEN) {
    return { status: 'missing', message: 'BaseLinker API token is missing.' };
  }

  try {
    await checkBaseLinkerConnection();
    return { status: 'connected', message: 'BaseLinker accepted the connection check.' };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not verify the BaseLinker connection.',
    };
  }
}

export async function GET() {
  const [supabase, baseLinker] = await Promise.all([checkSupabase(), checkBaseLinker()]);
  const alerts: Check = process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL
    ? { status: 'configured', message: 'Email alert credentials are present.' }
    : { status: 'missing', message: 'Resend API key or sender address is missing.' };

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    supabase,
    baseLinker,
    alerts,
    cron: process.env.CRON_SECRET
      ? { status: 'configured', message: 'Cron endpoint secret is set.' }
      : { status: 'missing', message: 'Cron endpoint secret is missing.' },
  });
}
