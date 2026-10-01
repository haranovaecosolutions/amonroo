import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server-db';

let demo = [
	{ sku: 'AM-001', name: 'AM-001', allocation_date: '2026-09-20', payment_status: 'pending', total_payment: 0, payment_amount: 0, stock: 128, reorder: 50 },
	{ sku: 'AM-002', name: 'AM-002', allocation_date: '2026-09-22', payment_status: 'partial', total_payment: 0, payment_amount: 0, stock: 24, reorder: 40 },
	{ sku: 'AM-003', name: 'AM-003', allocation_date: '2026-09-25', payment_status: 'paid', total_payment: 0, payment_amount: 0, stock: 76, reorder: 25 },
	{ sku: 'AM-004', name: 'Velvet lapel flower', allocation_date: '2026-09-26', payment_status: 'partial', total_payment: 1350, payment_amount: 450, remarks: 'Velvet sample, awaiting final trim', stock: 16, reorder: 10 },
	{ sku: 'AM-005', name: 'Silk pocket square', allocation_date: '2026-09-17', delivery_date: '2026-09-29', payment_date: '2026-09-29', payment_status: 'paid', total_payment: 2800, payment_amount: 2800, remarks: 'Delivered in full', stock: 8, reorder: 12 },
	{ sku: 'AM-006', name: 'Ceremony sash', allocation_date: '2026-09-30', payment_status: 'pending', total_payment: 900, payment_amount: 0, remarks: 'Awaiting production slot', stock: 3, reorder: 8 },
];

function validDate(value: unknown) {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function hasNumber(value: unknown) {
	return (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
}

export async function GET() {
	const db = serverDb();
	if (!db) return NextResponse.json(demo);
	const { data, error } = await db.from('inventory_stock_summary').select('*').order('sku');
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json(data);
}

export async function POST(request: Request) {
	const body = await request.json();
	const designNumber = typeof body.design_number === 'string' ? body.design_number.trim() : '';
	const remarks = typeof body.remarks === 'string' ? body.remarks.trim() : '';
	if (!designNumber || !validDate(body.allocation_date) || !['pending', 'partial', 'paid'].includes(body.payment_status) || !remarks || ![body.total_payment, body.payment_amount, body.reorder_level, body.target_stock].every(hasNumber)) {
		return NextResponse.json({ error: 'Complete all required design fields, including both payment values and remarks.' }, { status: 400 });
	}

	const reorderLevel = Number(body.reorder_level);
	const targetStock = Number(body.target_stock);
	const totalPayment = Number(body.total_payment);
	const paymentAmount = Number(body.payment_amount);
	if (!Number.isInteger(reorderLevel) || reorderLevel < 0 || !Number.isInteger(targetStock) || targetStock < 0) {
		return NextResponse.json({ error: 'Reorder level and target stock must be non-negative whole numbers.' }, { status: 400 });
	}
	if (!Number.isFinite(totalPayment) || totalPayment < 0 || !Number.isFinite(paymentAmount) || paymentAmount < 0) {
		return NextResponse.json({ error: 'Total payment and amount paid must be non-negative numbers.' }, { status: 400 });
	}

	const values = { sku: designNumber, name: designNumber, allocation_date: body.allocation_date, payment_status: body.payment_status, total_payment: totalPayment, payment_amount: paymentAmount, reorder_level: reorderLevel, target_stock: targetStock, remarks };
	const db = serverDb();
	if (!db) {
		if (demo.some((design) => design.sku === designNumber)) return NextResponse.json({ error: `Design ID "${designNumber}" already exists. Enter a different ID.` }, { status: 409 });
		const created = { ...values, id: crypto.randomUUID(), stock: 0, reorder: reorderLevel };
		demo = [...demo, created];
		return NextResponse.json(created, { status: 201 });
	}
	const { data, error } = await db.from('inventory_products').insert(values).select().single();
	if (error?.code === '23505') return NextResponse.json({ error: `Design ID "${designNumber}" already exists. Enter a different ID.` }, { status: 409 });
	if (error) return NextResponse.json({ error: error.message }, { status: 400 });
	return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
	const body = await request.json();
	const designNumber = typeof body.design_number === 'string' ? body.design_number.trim() : '';
	const deliveryDate = body.delivery_date || null;
	const paymentDate = body.payment_date || null;
	const paymentStatus = body.payment_status;
	const totalPayment = Number(body.total_payment);
	const paymentAmount = Number(body.payment_amount);
	if (!designNumber || (deliveryDate && !validDate(deliveryDate)) || (paymentDate && !validDate(paymentDate)) || !['pending', 'partial', 'paid'].includes(paymentStatus)) {
		return NextResponse.json({ error: 'A design number and valid delivery, payment, and status values are required.' }, { status: 400 });
	}
	if (!Number.isFinite(totalPayment) || totalPayment < 0 || !Number.isFinite(paymentAmount) || paymentAmount < 0) {
		return NextResponse.json({ error: 'Total payment and amount paid must be non-negative numbers.' }, { status: 400 });
	}

	const values = { delivery_date: deliveryDate, payment_date: paymentDate, payment_status: paymentStatus, total_payment: totalPayment, payment_amount: paymentAmount };
	const db = serverDb();
	if (!db) {
		const index = demo.findIndex((design) => design.sku === designNumber);
		if (index < 0) return NextResponse.json({ error: 'Design not found.' }, { status: 404 });
		demo = demo.map((design) => design.sku === designNumber ? { ...design, ...values } : design);
		return NextResponse.json({ sku: designNumber, ...values });
	}
	const { data, error } = await db.from('inventory_products').update(values).eq('sku', designNumber).select('sku,delivery_date,payment_date,payment_status,total_payment,payment_amount').single();
	if (error) return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 400 });
	return NextResponse.json(data);
}
