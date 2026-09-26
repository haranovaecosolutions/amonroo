import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server-db';

type ExportData = { exported_at: string; [table: string]: string | unknown[] };

export async function GET() {
	const db = serverDb();
	if (!db) return new NextResponse('Configure Supabase first', { status: 400 });

	const tables = ['inventory_products', 'customer_orders', 'customer_order_lines', 'manufacturers', 'manufacturer_jobs', 'inventory_transactions', 'alert_log'];
	const output: ExportData = { exported_at: new Date().toISOString() };
	for (const table of tables) {
		const { data } = await db.from(table).select('*');
		output[table] = data ?? [];
	}

	return new NextResponse(JSON.stringify(output, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': 'attachment; filename="amonroo-export.json"',
		},
	});
}
