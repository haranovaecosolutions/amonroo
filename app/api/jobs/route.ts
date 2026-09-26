import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server-db';
const demo=[{job:'JOB-1001',product:'AM-001',manufacturer:'Demo Manufacturer',qty:100,days:8},{job:'JOB-1002',product:'AM-002',manufacturer:'Demo Manufacturer',qty:60,days:2},{job:'JOB-1003',product:'AM-003',manufacturer:'Demo Manufacturer',qty:40,days:-1}];

export async function GET() {
	const db = serverDb();
	if (!db) return NextResponse.json(demo);
	const { data, error } = await db.from('manufacturer_job_summary').select('*').order('expected_return_date');
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json(data);
}

export async function POST(request: Request) {
	const body = await request.json();
	const quantity = Number(body.quantity_sent);
	if (!body.job_number || !body.product_sku || !body.manufacturer || !body.expected_return_date || !Number.isInteger(quantity) || quantity < 1) {
		return NextResponse.json({ error: 'Job number, SKU, manufacturer, return date, and a positive quantity are required.' }, { status: 400 });
	}

	const db = serverDb();
	if (!db) return NextResponse.json({ ...body, id: crypto.randomUUID(), days_remaining: Math.ceil((new Date(body.expected_return_date).getTime() - Date.now()) / 86400000), quantity_received: 0, quantity_outstanding: quantity });

	const { data: product, error: productError } = await db.from('inventory_products').select('id,sku').eq('sku', body.product_sku.trim()).single();
	if (productError || !product) return NextResponse.json({ error: `No product found for SKU ${body.product_sku}.` }, { status: 400 });
	let { data: manufacturer } = await db.from('manufacturers').select('id').eq('name', body.manufacturer.trim()).maybeSingle();
	if (!manufacturer) {
		const result = await db.from('manufacturers').insert({ name: body.manufacturer.trim() }).select('id').single();
		manufacturer = result.data;
	}
	if (!manufacturer) return NextResponse.json({ error: 'Could not create manufacturer.' }, { status: 400 });

	const { data: job, error } = await db.from('manufacturer_jobs').insert({ job_number: body.job_number.trim(), product_id: product.id, manufacturer_id: manufacturer.id, quantity_sent: quantity, expected_return_date: body.expected_return_date, order_id: body.order_id || null, notes: body.notes || null }).select().single();
	if (error || !job) return NextResponse.json({ error: error?.message || 'Could not create job.' }, { status: 400 });

	const { error: transactionError } = await db.from('inventory_transactions').insert({ product_id: product.id, job_id: job.id, transaction_type: 'sent_to_manufacturer', quantity: -quantity, reference: job.job_number, notes: `Sent to ${body.manufacturer.trim()}` });
	if (transactionError) return NextResponse.json({ error: transactionError.message }, { status: 400 });
	return NextResponse.json(job, { status: 201 });
}

export async function PATCH(request: Request) {
	const body = await request.json();
	const received = Number(body.quantity_received);
	if (!body.id || !Number.isInteger(received) || received < 1) return NextResponse.json({ error: 'A job ID and positive received quantity are required.' }, { status: 400 });

	const db = serverDb();
	if (!db) return NextResponse.json({ id: body.id, quantity_received: received, quantity_outstanding: 0, status: 'received' });
	const { data: job, error: jobError } = await db.from('manufacturer_jobs').select('id,product_id,job_number,quantity_sent,quantity_received,quantity_rejected').eq('id', body.id).single();
	if (jobError || !job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
	const outstanding = Math.max(job.quantity_sent - job.quantity_received - job.quantity_rejected, 0);
	if (received > outstanding) return NextResponse.json({ error: `Only ${outstanding} units are outstanding for this job.` }, { status: 400 });
	const totalReceived = job.quantity_received + received;
	const status = totalReceived + job.quantity_rejected >= job.quantity_sent ? 'received' : 'partially_received';
	const { error: transactionError } = await db.from('inventory_transactions').insert({ product_id: job.product_id, job_id: job.id, transaction_type: 'received_from_manufacturer', quantity: received, reference: job.job_number, notes: 'Received from manufacturer' });
	if (transactionError) return NextResponse.json({ error: transactionError.message }, { status: 400 });
	const { data, error } = await db.from('manufacturer_jobs').update({ quantity_received: totalReceived, received_at: status === 'received' ? new Date().toISOString() : null, status, updated_at: new Date().toISOString() }).eq('id', job.id).select().single();
	if (error) return NextResponse.json({ error: error.message }, { status: 400 });
	return NextResponse.json(data);
}
