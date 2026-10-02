import { NextResponse } from 'next/server';
import { getBaseLinkerOrders } from '@/lib/baselinker';

export async function GET() {
  try {
    const orders = await getBaseLinkerOrders();
    return NextResponse.json(orders, {
      headers: {
        'Cache-Control': 'no-store',
        'X-Data-Source': 'BaseLinker',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not retrieve BaseLinker orders.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: 'Orders are read-only and must be created in BaseLinker.' },
    { status: 405, headers: { Allow: 'GET' } },
  );
}
