import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server-db';

type ExportData = { exported_at: string; [table: string]: string | unknown[] };

export async function GET() {
	const db = serverDb();
	if (!db) return new NextResponse('Configure Supabase first', { status: 400 });

	const tables = ['inventory_products', 'dead_designs', 'customer_orders', 'customer_order_lines', 'manufacturers', 'manufacturer_jobs', 'manufacturer_unit_skus', 'inventory_transactions', 'alert_log'];
	const output: ExportData = { exported_at: new Date().toISOString() };
	for (const table of tables) {
		const rows: unknown[] = [];
		for (let offset = 0; ; offset += 1000) {
			const { data, error } = await db.from(table).select('*').range(offset, offset + 999);
			if (error) return NextResponse.json({ error: `Could not export ${table}: ${error.message}` }, { status: 500 });
			rows.push(...data);
			if (data.length < 1000) break;
		}
		output[table] = rows;
	}

	return new NextResponse(JSON.stringify(output, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': 'attachment; filename="amonroo-export.json"',
			'Cache-Control': 'no-store',
		},
	});
}
