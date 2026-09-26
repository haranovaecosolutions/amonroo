import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server-db';

type BaseOrder = Record<string, unknown>;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return !secret || request.headers.get('authorization') === `Bearer ${secret}`;
}

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const apiUrl = process.env.BASE_API_ORDERS_URL;
  const token = process.env.BASE_API_TOKEN;
  const db = serverDb();
  if (!apiUrl || !token) return NextResponse.json({ error: 'Set BASE_API_ORDERS_URL and BASE_API_TOKEN first.' }, { status: 400 });
  if (!db) return NextResponse.json({ error: 'Configure Supabase before syncing Base.com orders.' }, { status: 400 });

  const response = await fetch(apiUrl, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) return NextResponse.json({ error: `Base.com returned ${response.status}.` }, { status: 502 });
  const payload = await response.json() as { orders?: BaseOrder[] } | BaseOrder[];
  const orders = Array.isArray(payload) ? payload : payload.orders ?? [];
  let imported = 0;

  for (const source of orders) {
    const baseOrderId = text(source.id || source.order_id || source.number);
    if (!baseOrderId) continue;
    const orderNumber = text(source.order_number || source.number || baseOrderId);
    const customer = source.customer as BaseOrder | undefined;
    const { data: order, error } = await db.from('customer_orders').upsert({ base_order_id: baseOrderId, order_number: orderNumber, customer_name: text(source.customer_name || customer?.name) || null, ordered_at: text(source.created_at || source.date) || new Date().toISOString(), notes: 'Imported from Base.com' }, { onConflict: 'base_order_id' }).select('id').single();
    if (error || !order) continue;
    const lines = (source.items || source.lines || source.products) as BaseOrder[] | undefined;
    for (const line of lines ?? []) {
      const lineProduct = line.product as BaseOrder | undefined;
      const sku = text(line.sku || line.product_sku || line.product_code || lineProduct?.sku);
      const quantity = Number(line.quantity || line.qty || line.quantity_ordered);
      if (!sku || !Number.isInteger(quantity) || quantity < 1) continue;
      const { data: product } = await db.from('inventory_products').select('id').eq('sku', sku).single();
      if (!product) continue;
      const { data: existingLine } = await db.from('customer_order_lines').select('id').eq('order_id', order.id).eq('product_id', product.id).maybeSingle();
      if (existingLine) await db.from('customer_order_lines').update({ quantity_ordered: quantity }).eq('id', existingLine.id);
      else await db.from('customer_order_lines').insert({ order_id: order.id, product_id: product.id, quantity_ordered: quantity });
      const reference = `base:${baseOrderId}:${sku}`;
      const { data: existingTransaction } = await db.from('inventory_transactions').select('id').eq('reference', reference).maybeSingle();
      if (!existingTransaction) await db.from('inventory_transactions').insert({ product_id: product.id, transaction_type: 'sale', quantity: -quantity, reference, notes: 'Imported from Base.com' });
    }
    imported += 1;
  }

  return NextResponse.json({ imported, received: orders.length, message: 'Base.com orders and recognized product lines imported.' });
}