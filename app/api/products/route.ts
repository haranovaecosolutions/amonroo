import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server-db';
import { getBaseLinkerProducts } from '@/lib/baselinker';

function validDate(value: unknown) {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function hasNumber(value: unknown) {
	return (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
}

export async function GET() {
	if (process.env.BASELINKER_API_TOKEN) {
		try {
			const products = await getBaseLinkerProducts();
			return NextResponse.json(products, {
				headers: {
					'Cache-Control': 'no-store',
					'X-Data-Source': 'BaseLinker',
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Could not retrieve BaseLinker inventory.';
			return NextResponse.json({ error: message }, { status: 502 });
		}
	}
	const db = serverDb();
	if (!db) return NextResponse.json({ error: 'Set BASELINKER_API_TOKEN or configure Supabase to load inventory.' }, { status: 503 });
	const { data, error } = await db.from('inventory_stock_summary').select('*').order('sku');
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json(data);
}

export async function POST(request: Request) {
	if (process.env.BASELINKER_API_TOKEN) {
		return NextResponse.json({ error: 'The BaseLinker inventory is read-only.' }, { status: 405, headers: { Allow: 'GET' } });
	}
	const body = await request.json();
	const designNumber = typeof body.design_number === 'string' ? body.design_number.trim() : '';
	const designerName = typeof body.designer_name === 'string' ? body.designer_name.trim() : '';
	const remarks = typeof body.remarks === 'string' ? body.remarks.trim() : '';
	if (!designNumber || !designerName || !validDate(body.allocation_date) || !['pending', 'partial', 'paid'].includes(body.payment_status) || ![body.total_payment, body.payment_amount].every(hasNumber)) {
		return NextResponse.json({ error: 'Complete all required design fields, including Designer Name and both payment values.' }, { status: 400 });
	}

	const totalPayment = Number(body.total_payment);
	const paymentAmount = Number(body.payment_amount);
	if (!Number.isFinite(totalPayment) || totalPayment < 0 || !Number.isFinite(paymentAmount) || paymentAmount < 0) {
		return NextResponse.json({ error: 'Total payment and amount paid must be non-negative numbers.' }, { status: 400 });
	}

	const values = { sku: designNumber, name: designerName, allocation_date: body.allocation_date, payment_status: body.payment_status, total_payment: totalPayment, payment_amount: paymentAmount, remarks };
	const db = serverDb();
	if (!db) return NextResponse.json({ error: 'Configure Supabase before creating designs.' }, { status: 503 });
	const { data, error } = await db.from('inventory_products').insert(values).select().single();
	if (error?.code === '23505') return NextResponse.json({ error: `Design ID "${designNumber}" already exists. Enter a different ID.` }, { status: 409 });
	if (error) return NextResponse.json({ error: error.message }, { status: 400 });
	return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
	if (process.env.BASELINKER_API_TOKEN) {
		return NextResponse.json({ error: 'The BaseLinker inventory is read-only.' }, { status: 405, headers: { Allow: 'GET' } });
	}
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
	if (!db) return NextResponse.json({ error: 'Configure Supabase before editing designs.' }, { status: 503 });
	const { data, error } = await db.from('inventory_products').update(values).eq('sku', designNumber).select('sku,delivery_date,payment_date,payment_status,total_payment,payment_amount').single();
	if (error) return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 400 });
	return NextResponse.json(data);
}
