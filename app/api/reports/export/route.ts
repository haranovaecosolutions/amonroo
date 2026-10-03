import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server-db';

export const runtime = 'nodejs';

type Period = 'day' | 'week' | 'month' | 'year';
type Dataset = 'designs' | 'manufacturing' | 'both';

function dateRange(period: Period, dateValue: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
	const [year, month, day] = dateValue.split('-').map(Number);
	const start = new Date(Date.UTC(year, month - 1, day));
	if (start.toISOString().slice(0, 10) !== dateValue) return null;

	if (period === 'day') return { start: dateValue, end: dateValue };
	if (period === 'week') {
		const daysSinceMonday = (start.getUTCDay() + 6) % 7;
		start.setUTCDate(start.getUTCDate() - daysSinceMonday);
		const end = new Date(start);
		end.setUTCDate(end.getUTCDate() + 6);
		return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
	}
	if (period === 'month') {
		return {
			start: new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10),
			end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
		};
	}
	return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function addSheet(workbook: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number }[], rows: Record<string, unknown>[]) {
	const sheet = workbook.addWorksheet(name);
	sheet.columns = columns;
	sheet.addRows(rows);
	sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
	sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF087F78' } };
	sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
	sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function GET(request: Request) {
	const params = new URL(request.url).searchParams;
	const periodValue = params.get('period');
	const dateValue = params.get('date') ?? '';
	const datasetValue = params.get('dataset');
	if (!['day', 'week', 'month', 'year'].includes(periodValue ?? '')) {
		return NextResponse.json({ error: 'Choose day, week, month, or year.' }, { status: 400 });
	}
	if (!['designs', 'manufacturing', 'both'].includes(datasetValue ?? '')) {
		return NextResponse.json({ error: 'Choose designs, manufacturing, or both.' }, { status: 400 });
	}
	const period = periodValue as Period;
	const dataset = datasetValue as Dataset;
	const range = dateRange(period, dateValue);
	if (!range) return NextResponse.json({ error: 'Choose a valid date for the export period.' }, { status: 400 });

	const db = serverDb();
	if (!db) return NextResponse.json({ error: 'Configure Supabase before exporting reports.' }, { status: 503 });

	const designRows = [];
	if (dataset !== 'manufacturing') {
		for (let offset = 0; ; offset += 1000) {
			const { data, error } = await db.from('inventory_stock_summary').select('*')
				.gte('allocation_date', range.start).lte('allocation_date', range.end).order('sku')
				.range(offset, offset + 999);
			if (error) return NextResponse.json({ error: error.message }, { status: 500 });
			designRows.push(...data);
			if (data.length < 1000) break;
		}
	}
	const jobRows = [];
	if (dataset !== 'designs') {
		for (let offset = 0; ; offset += 1000) {
			const { data, error } = await db.from('manufacturer_job_summary').select('*')
				.gte('allocation_date', range.start).lte('allocation_date', range.end).order('job_number')
				.range(offset, offset + 999);
			if (error) return NextResponse.json({ error: error.message }, { status: 500 });
			jobRows.push(...data);
			if (data.length < 1000) break;
		}
	}

	const productIds = [...new Set(jobRows.map((job) => job.product_id))];
	const manufacturerIds = [...new Set(jobRows.map((job) => job.manufacturer_id))];
	const products = [];
	for (let offset = 0; offset < productIds.length; offset += 200) {
		const { data, error } = await db.from('inventory_products').select('id,sku,sku_id')
			.in('id', productIds.slice(offset, offset + 200));
		if (error) return NextResponse.json({ error: error.message }, { status: 500 });
		products.push(...data);
	}
	const manufacturers = [];
	for (let offset = 0; offset < manufacturerIds.length; offset += 200) {
		const { data, error } = await db.from('manufacturers').select('id,name')
			.in('id', manufacturerIds.slice(offset, offset + 200));
		if (error) return NextResponse.json({ error: error.message }, { status: 500 });
		manufacturers.push(...data);
	}
	const productById = new Map(products.map((product) => [product.id, product]));
	const manufacturerById = new Map(manufacturers.map((manufacturer) => [manufacturer.id, manufacturer]));

	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'Amonroo Inventory';
	workbook.created = new Date();
	workbook.subject = `Design and manufacturing report ${range.start} to ${range.end}`;
	if (dataset !== 'manufacturing') addSheet(workbook, 'Designs', [
		{ header: 'Design ID', key: 'design_id', width: 20 },
		{ header: 'Designer / Product', key: 'name', width: 28 },
		{ header: 'SKU ID', key: 'sku_id', width: 24 },
		{ header: 'Allocation date', key: 'allocation_date', width: 16 },
		{ header: 'Delivery date', key: 'delivery_date', width: 16 },
		{ header: 'Payment date', key: 'payment_date', width: 16 },
		{ header: 'Payment status', key: 'payment_status', width: 16 },
		{ header: 'Total payment', key: 'total_payment', width: 16 },
		{ header: 'Amount paid', key: 'payment_amount', width: 16 },
		{ header: 'Current stock', key: 'current_stock', width: 15 },
		{ header: 'Reorder level', key: 'reorder_level', width: 15 },
		{ header: 'Shortage', key: 'shortage', width: 12 },
		{ header: 'Remarks', key: 'remarks', width: 36 },
	], designRows.map((design) => ({
		design_id: design.sku,
		name: design.name,
		sku_id: design.sku_id ?? '',
		allocation_date: design.allocation_date,
		delivery_date: design.delivery_date ?? '',
		payment_date: design.payment_date ?? '',
		payment_status: design.payment_status,
		total_payment: design.total_payment,
		payment_amount: design.payment_amount,
		current_stock: design.current_stock,
		reorder_level: design.reorder_level,
		shortage: design.shortage,
		remarks: design.remarks,
	})));

	if (dataset !== 'designs') addSheet(workbook, 'Manufacturing', [
		{ header: 'Job number', key: 'job_number', width: 20 },
		{ header: 'Design ID', key: 'design_id', width: 20 },
		{ header: 'SKU ID', key: 'sku_id', width: 24 },
		{ header: 'Manufacturer', key: 'manufacturer', width: 28 },
		{ header: 'Quantity sent', key: 'quantity_sent', width: 15 },
		{ header: 'Quantity received', key: 'quantity_received', width: 18 },
		{ header: 'Quantity outstanding', key: 'quantity_outstanding', width: 21 },
		{ header: 'Allocation date', key: 'allocation_date', width: 16 },
		{ header: 'Expected return date', key: 'expected_return_date', width: 20 },
		{ header: 'Status', key: 'status', width: 20 },
		{ header: 'Payment status', key: 'payment_status', width: 16 },
		{ header: 'Total payment', key: 'total_payment', width: 16 },
		{ header: 'Amount paid', key: 'amount_paid', width: 16 },
		{ header: 'Reorder number', key: 'reorder_number', width: 16 },
		{ header: 'Remarks', key: 'remarks', width: 36 },
	], jobRows.map((job) => ({
		job_number: job.job_number,
		design_id: productById.get(job.product_id)?.sku ?? '',
		sku_id: productById.get(job.product_id)?.sku_id ?? '',
		manufacturer: manufacturerById.get(job.manufacturer_id)?.name ?? '',
		quantity_sent: job.quantity_sent,
		quantity_received: job.quantity_received,
		quantity_outstanding: job.quantity_outstanding,
		allocation_date: job.allocation_date,
		expected_return_date: job.expected_return_date,
		status: job.status,
		payment_status: job.payment_status,
		total_payment: job.total_payment,
		amount_paid: job.amount_paid,
		reorder_number: job.reorder_number,
		remarks: job.remarks,
	})));

	const buffer = await workbook.xlsx.writeBuffer();
	const filename = `amonroo-${dataset}-report-${period}-${range.start}-to-${range.end}.xlsx`;
	return new NextResponse(new Uint8Array(buffer), {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'no-store',
		},
	});
}
