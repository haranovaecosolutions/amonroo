import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server-db';

const demoOrders = [
  { id: 'demo-1', order_number: 'AM-1001', customer_name: 'Demo customer', ordered_at: '2026-09-30T09:15:00.000Z', deadline: '2026-10-04', status: 'open', product_sku: 'AM-001', product_name: 'Demo Product A', quantity_ordered: 24, total_quantity: 24, outstanding_quantity: 24, line_count: 1 },
  { id: 'demo-2', order_number: 'AM-1002', customer_name: 'Studio Reverb', ordered_at: '2026-09-29T14:20:00.000Z', deadline: '2026-10-03', status: 'partially_fulfilled', product_sku: 'AM-004', product_name: 'Velvet lapel flower', quantity_ordered: 36, total_quantity: 52, outstanding_quantity: 28, line_count: 3 },
  { id: 'demo-3', order_number: 'AM-1003', customer_name: 'North Quarter Events', ordered_at: '2026-09-28T11:05:00.000Z', deadline: '2026-10-08', status: 'open', product_sku: 'AM-006', product_name: 'Ceremony sash', quantity_ordered: 18, total_quantity: 18, outstanding_quantity: 18, line_count: 1 },
  { id: 'demo-4', order_number: 'AM-1004', customer_name: 'Archive Bridal', ordered_at: '2026-09-26T08:40:00.000Z', deadline: '2026-09-30', status: 'fulfilled', product_sku: 'AM-005', product_name: 'Silk pocket square', quantity_ordered: 12, total_quantity: 12, outstanding_quantity: 0, line_count: 2 },
];

export async function GET() {
  const db = serverDb();
  if (!db) return NextResponse.json(demoOrders);

  const { data, error } = await db
    .from('customer_orders')
    .select('id,order_number,base_order_id,customer_name,ordered_at,deadline,status,notes,customer_order_lines(quantity_ordered,quantity_allocated,inventory_products(sku,name))')
    .order('ordered_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json((data ?? []).map((order) => {
    const lines = order.customer_order_lines ?? [];
    const line = lines[0];
    const product = Array.isArray(line?.inventory_products) ? line.inventory_products[0] : line?.inventory_products;
    const totalQuantity = lines.reduce((total, item) => total + item.quantity_ordered, 0);
    const outstandingQuantity = lines.reduce((total, item) => total + Math.max(item.quantity_ordered - item.quantity_allocated, 0), 0);
    return { ...order, product_sku: product?.sku, product_name: product?.name, quantity_ordered: line?.quantity_ordered ?? 0, total_quantity: totalQuantity, outstanding_quantity: outstandingQuantity, line_count: lines.length };
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
    return NextResponse.json({ id: crypto.randomUUID(), order_number: orderNumber, customer_name: body.customer_name || 'Walk-in customer', ordered_at: new Date().toISOString(), deadline: body.deadline || null, status: 'open', product_sku: body.product_sku, product_name: body.product_sku, quantity_ordered: quantity, total_quantity: quantity, outstanding_quantity: quantity, line_count: 1 });
  }

  const { data: product, error: productError } = await db.from('inventory_products').select('id,sku,name').eq('sku', body.product_sku.trim()).single();
  if (productError || !product) return NextResponse.json({ error: `No product found for SKU ${body.product_sku}.` }, { status: 400 });

  const { data: order, error: orderError } = await db.from('customer_orders').insert({ order_number: orderNumber, base_order_id: body.base_order_id || null, customer_name: body.customer_name || null, deadline: body.deadline || null, notes: body.notes || null }).select('id,order_number,customer_name,ordered_at,deadline,status,notes').single();
  if (orderError || !order) return NextResponse.json({ error: orderError?.message || 'Could not create order.' }, { status: 400 });

  const { error: lineError } = await db.from('customer_order_lines').insert({ order_id: order.id, product_id: product.id, quantity_ordered: quantity });
  if (lineError) return NextResponse.json({ error: lineError.message }, { status: 400 });

  return NextResponse.json({ ...order, product_sku: product.sku, product_name: product.name, quantity_ordered: quantity, total_quantity: quantity, outstanding_quantity: quantity, line_count: 1 }, { status: 201 });
}