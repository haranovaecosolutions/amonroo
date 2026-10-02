import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server-db';

type JobRecord = {
	id: string; job: string; job_number: string; product: string; product_sku: string;
	manufacturer: string; qty: number; quantity_sent: number; quantity_received: number;
	quantity_outstanding: number; days: number; days_remaining: number; expected_return_date: string;
	allocation_date: string; status: string; payment_status: string; total_payment: number;
	amount_paid: number; reorder_number: number; remarks: string; sku_ids: string[];
};

let demo: JobRecord[] = [
	{ id: 'demo-job-1001', job: 'JOB-1001', job_number: 'JOB-1001', product: 'AM-001', product_sku: 'AM-001', manufacturer: 'Demo Manufacturer', qty: 100, quantity_sent: 100, quantity_received: 0, quantity_outstanding: 100, days: 8, days_remaining: 8, expected_return_date: '2026-10-09', allocation_date: '2026-09-20', status: 'sent', payment_status: 'pending', total_payment: 0, amount_paid: 0, reorder_number: 50, remarks: 'Initial batch', sku_ids: [] },
	{ id: 'demo-job-1002', job: 'JOB-1002', job_number: 'JOB-1002', product: 'AM-002', product_sku: 'AM-002', manufacturer: 'Demo Manufacturer', qty: 60, quantity_sent: 60, quantity_received: 0, quantity_outstanding: 60, days: 2, days_remaining: 2, expected_return_date: '2026-10-03', allocation_date: '2026-09-22', status: 'in_production', payment_status: 'partial', total_payment: 1200, amount_paid: 400, reorder_number: 25, remarks: 'Awaiting final stitching', sku_ids: [] },
	{ id: 'demo-job-1003', job: 'JOB-1003', job_number: 'JOB-1003', product: 'AM-003', product_sku: 'AM-003', manufacturer: 'Demo Manufacturer', qty: 40, quantity_sent: 40, quantity_received: 0, quantity_outstanding: 40, days: -1, days_remaining: -1, expected_return_date: '2026-09-30', allocation_date: '2026-09-18', status: 'overdue', payment_status: 'pending', total_payment: 800, amount_paid: 0, reorder_number: 10, remarks: 'Delivery is overdue', sku_ids: [] },
	{ id: 'demo-job-1004', job: 'JOB-1004', job_number: 'JOB-1004', product: 'AM-004', product_sku: 'AM-004', manufacturer: 'Thread & Needle Works', qty: 75, quantity_sent: 75, quantity_received: 1, quantity_outstanding: 74, days: 12, days_remaining: 12, expected_return_date: '2026-10-13', allocation_date: '2026-09-26', status: 'partially_received', payment_status: 'partial', total_payment: 1350, amount_paid: 450, reorder_number: 10, remarks: 'Velvet sample, awaiting final trim', sku_ids: ['SKU-AM004-0001'] },
	{ id: 'demo-job-1005', job: 'JOB-1005', job_number: 'JOB-1005', product: 'AM-005', product_sku: 'AM-005', manufacturer: 'Northstar Apparel', qty: 40, quantity_sent: 40, quantity_received: 2, quantity_outstanding: 38, days: 0, days_remaining: 0, expected_return_date: '2026-10-01', allocation_date: '2026-09-17', status: 'partially_received', payment_status: 'paid', total_payment: 2800, amount_paid: 2800, reorder_number: 12, remarks: 'First two units delivered', sku_ids: ['SKU-AM005-0001', 'SKU-AM005-0002'] },
	{ id: 'demo-job-1006', job: 'JOB-1006', job_number: 'JOB-1006', product: 'AM-006', product_sku: 'AM-006', manufacturer: 'Stitchcraft Studio', qty: 25, quantity_sent: 25, quantity_received: 0, quantity_outstanding: 25, days: -4, days_remaining: -4, expected_return_date: '2026-09-27', allocation_date: '2026-09-30', status: 'overdue', payment_status: 'pending', total_payment: 900, amount_paid: 0, reorder_number: 8, remarks: 'Awaiting production slot', sku_ids: [] },
];

function validDate(value: unknown): value is string {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validAmount(value: unknown) {
	return (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export async function GET() {
	const db = serverDb();
	if (!db) return NextResponse.json(demo);
	const { data, error } = await db.from('manufacturer_job_summary').select('*').order('expected_return_date');
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	const { data: receivedSkus, error: skuError } = await db.from('manufacturer_unit_skus').select('job_id,sku_id').order('sku_id');
	if (skuError) return NextResponse.json({ error: skuError.message }, { status: 500 });
	return NextResponse.json(data.map((job) => ({ ...job, sku_ids: receivedSkus.filter((sku) => sku.job_id === job.id).map((sku) => sku.sku_id) })));
}

export async function POST(request: Request) {
	const body = await request.json();
	const jobNumber = typeof body.job_number === 'string' ? body.job_number.trim() : '';
	const productSku = typeof body.product_sku === 'string' ? body.product_sku.trim() : '';
	const manufacturerName = typeof body.manufacturer === 'string' ? body.manufacturer.trim() : '';
	const remarks = typeof body.remarks === 'string' ? body.remarks.trim() : '';
	const quantity = Number(body.quantity_sent);
	const reorderNumber = Number(body.reorder_number);
	if (!jobNumber || !productSku || !manufacturerName || !Number.isInteger(quantity) || quantity < 1 ||
		!validDate(body.allocation_date) || !validDate(body.expected_return_date) ||
		!['pending', 'partial', 'paid'].includes(body.payment_status) || !validAmount(body.total_payment) ||
		!validAmount(body.amount_paid) || !Number.isInteger(reorderNumber) || reorderNumber < 0) {
		return NextResponse.json({ error: 'Complete all required manufacturing fields with valid values.' }, { status: 400 });
	}
	const fields = { job_number: jobNumber, product_sku: productSku, manufacturer: manufacturerName, quantity_sent: quantity, allocation_date: body.allocation_date, expected_return_date: body.expected_return_date, payment_status: body.payment_status, total_payment: Number(body.total_payment), amount_paid: Number(body.amount_paid), reorder_number: reorderNumber, remarks };

	const db = serverDb();
	if (!db) {
		if (demo.some((job) => job.job_number.toLowerCase() === jobNumber.toLowerCase())) return NextResponse.json({ error: `Job number "${jobNumber}" already exists.` }, { status: 409 });
		const deadResponse = await fetch(new URL('/api/dead-designs', request.url), { cache: 'no-store' });
		const deadDesigns = await deadResponse.json();
		if (Array.isArray(deadDesigns) && deadDesigns.some((design: { design_id: string }) => design.design_id.toLowerCase() === productSku.toLowerCase())) {
			return NextResponse.json({ code: 'DEAD_DESIGN', error: `Design ID ${productSku} is marked as dead and cannot be used for manufacturing.` }, { status: 409 });
		}
		const daysRemaining = Math.ceil((new Date(body.expected_return_date).getTime() - Date.now()) / 86400000);
		const created: JobRecord = { ...fields, id: crypto.randomUUID(), job: jobNumber, product: productSku, product_sku: productSku, qty: quantity, days: daysRemaining, days_remaining: daysRemaining, quantity_received: 0, quantity_outstanding: quantity, status: 'sent', sku_ids: [] };
		demo = [...demo, created];
		return NextResponse.json(created, { status: 201 });
	}

	const { data: product, error: productError } = await db.from('inventory_products').select('id,sku').eq('sku', productSku).single();
	if (productError || !product) return NextResponse.json({ error: `No design found for Design ID ${productSku}.` }, { status: 400 });
	const { data: deadDesign, error: deadDesignError } = await db.from('dead_designs').select('design_id').eq('design_id', productSku).maybeSingle();
	if (deadDesignError) return NextResponse.json({ error: deadDesignError.message }, { status: 500 });
	if (deadDesign) return NextResponse.json({ code: 'DEAD_DESIGN', error: `Design ID ${productSku} is marked as dead and cannot be used for manufacturing.` }, { status: 409 });
	let { data: manufacturer } = await db.from('manufacturers').select('id').eq('name', manufacturerName).maybeSingle();
	if (!manufacturer) {
		const result = await db.from('manufacturers').insert({ name: manufacturerName }).select('id').single();
		manufacturer = result.data;
	}
	if (!manufacturer) return NextResponse.json({ error: 'Could not create manufacturer.' }, { status: 400 });

	const { data: job, error } = await db.from('manufacturer_jobs').insert({ job_number: jobNumber, product_id: product.id, manufacturer_id: manufacturer.id, quantity_sent: quantity, allocation_date: body.allocation_date, expected_return_date: body.expected_return_date, payment_status: body.payment_status, total_payment: fields.total_payment, amount_paid: fields.amount_paid, reorder_number: reorderNumber, remarks, notes: remarks, order_id: body.order_id || null }).select().single();
	if (error?.code === 'P0001') return NextResponse.json({ code: 'DEAD_DESIGN', error: error.message }, { status: 409 });
	if (error || !job) return NextResponse.json({ error: error?.message || 'Could not create job.' }, { status: 400 });

	const { error: transactionError } = await db.from('inventory_transactions').insert({ product_id: product.id, job_id: job.id, transaction_type: 'sent_to_manufacturer', quantity: -quantity, reference: job.job_number, notes: `Sent to ${manufacturerName}` });
	if (transactionError) return NextResponse.json({ error: transactionError.message }, { status: 400 });
	return NextResponse.json({ ...job, product_sku: productSku, manufacturer: manufacturerName, sku_ids: [] }, { status: 201 });
}

export async function PATCH(request: Request) {
	const body = await request.json();
	const received = Number(body.quantity_received);
	const skuIds = Array.isArray(body.sku_ids) ? body.sku_ids.map((sku: unknown) => typeof sku === 'string' ? sku.trim() : '') : [];
	if (!body.id || !Number.isInteger(received) || received < 1 || !validDate(body.received_at) || skuIds.length !== received || skuIds.some((sku: string) => !sku) || new Set(skuIds.map((sku: string) => sku.toLowerCase())).size !== skuIds.length) {
		return NextResponse.json({ error: 'Enter one unique SKU ID for each unit received, along with a valid receipt date.' }, { status: 400 });
	}

	const db = serverDb();
	if (!db) {
		const job = demo.find((item) => item.id === body.id);
		if (!job) return NextResponse.json({ error: 'Manufacturing record not found.' }, { status: 404 });
		if (received > job.quantity_outstanding) return NextResponse.json({ error: `Only ${job.quantity_outstanding} units are outstanding for this record.` }, { status: 400 });
		const knownSkus = new Set(demo.flatMap((item) => item.sku_ids.map((sku) => sku.toLowerCase())));
		if (skuIds.some((sku: string) => knownSkus.has(sku.toLowerCase()))) return NextResponse.json({ error: 'One or more SKU IDs have already been used.' }, { status: 409 });
		job.quantity_received += received;
		job.quantity_outstanding -= received;
		job.sku_ids.push(...skuIds);
		job.status = job.quantity_outstanding === 0 ? 'received' : 'partially_received';
		return NextResponse.json(job);
	}

	const { data, error } = await db.rpc('receive_manufacturer_delivery', { p_job_id: body.id, p_quantity: received, p_sku_ids: skuIds, p_received_at: body.received_at });
	if (error?.code === '23505') return NextResponse.json({ error: 'One or more SKU IDs have already been used.' }, { status: 409 });
	if (error?.code === 'P0002') return NextResponse.json({ error: error.message }, { status: 404 });
	if (error) return NextResponse.json({ error: error.message }, { status: 400 });
	const { data: receivedSkus, error: skuError } = await db.from('manufacturer_unit_skus').select('sku_id').eq('job_id', body.id).order('sku_id');
	if (skuError) return NextResponse.json({ error: skuError.message }, { status: 500 });
	return NextResponse.json({ ...data[0], sku_ids: receivedSkus.map((sku) => sku.sku_id) });
}
