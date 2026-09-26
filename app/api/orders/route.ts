import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server-db';

const demoOrders = [
  { id: 'demo-1', order_number: 'AM-1001', customer_name: 'Demo customer', ordered_at: '2026-09-24T09:15:00.000Z', status: 'open', product_sku: 'AM-001', product_name: 'Demo Product A', quantity_ordered: 24 },
];

export async function GET() {
  const db = serverDb();
  if (!db) return NextResponse.json(demoOrders);

  const { data, error } = await db
    .from('customer_orders')
    .select('id,order_number,base_order_id,customer_name,ordered_at,deadline,status,notes,customer_order_lines(quantity_ordered,inventory_products(sku,name))')
    .order('ordered_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json((data ?? []).map((order) => {
    const line = order.customer_order_lines?.[0];
    const product = Array.isArray(line?.inventory_products) ? line.inventory_products[0] : line?.inventory_products;
    return { ...order, product_sku: product?.sku, product_name: product?.name, quantity_ordered: line?.quantity_ordered ?? 0 };
  }));
}

export async function POST(request: Request) {
  const body = await request.json();
  const db = serverDb();
  const orderNumber = body.order_number?.trim() || `AM-${Date.now().toString().slice(-6)}`;
  const quantity = Number(body.quantity);

  if (!body.product_sku || !Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: 'Product SKU and a positive quantity are required.' }, { status: 400 });
  }

  if (!db) {
    return NextResponse.json({ id: crypto.randomUUID(), order_number: orderNumber, customer_name: body.customer_name || 'Walk-in customer', ordered_at: new Date().toISOString(), deadline: body.deadline || null, status: 'open', product_sku: body.product_sku, product_name: body.product_sku, quantity_ordered: quantity });
  }

  const { data: product, error: productError } = await db.from('inventory_products').select('id,sku,name').eq('sku', body.product_sku.trim()).single();
  if (productError || !product) return NextResponse.json({ error: `No product found for SKU ${body.product_sku}.` }, { status: 400 });

  const { data: order, error: orderError } = await db.from('customer_orders').insert({ order_number: orderNumber, base_order_id: body.base_order_id || null, customer_name: body.customer_name || null, deadline: body.deadline || null, notes: body.notes || null }).select('id,order_number,customer_name,ordered_at,deadline,status,notes').single();
  if (orderError || !order) return NextResponse.json({ error: orderError?.message || 'Could not create order.' }, { status: 400 });

  const { error: lineError } = await db.from('customer_order_lines').insert({ order_id: order.id, product_id: product.id, quantity_ordered: quantity });
  if (lineError) return NextResponse.json({ error: lineError.message }, { status: 400 });

  return NextResponse.json({ ...order, product_sku: product.sku, product_name: product.name, quantity_ordered: quantity }, { status: 201 });
}