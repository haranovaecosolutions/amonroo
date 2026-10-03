"use client";

import { useState } from 'react';
import { CircleAlert, Download, FileSpreadsheet } from 'lucide-react';

type Period = 'day' | 'week' | 'month' | 'year';
type Dataset = 'designs' | 'manufacturing' | 'both';

function today() {
	const date = new Date();
	date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
	return date.toISOString().slice(0, 10);
}

export default function Reports() {
	const [period, setPeriod] = useState<Period>('month');
	const [dataset, setDataset] = useState<Dataset>('both');
	const [date, setDate] = useState(today);
	const [error, setError] = useState('');
	const [downloading, setDownloading] = useState(false);

	async function download() {
		setError('');
		setDownloading(true);
		try {
			const query = new URLSearchParams({ period, date, dataset });
			const response = await fetch(`/api/reports/export?${query}`);
			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Could not export report.');
			}
			const blob = await response.blob();
			const objectUrl = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = objectUrl;
			const contentDisposition = response.headers.get('Content-Disposition') ?? '';
			const filename = contentDisposition.match(/filename="([^"]+)"/)?.[1];
			link.download = filename || `amonroo-${dataset}-report-${period}-${date}.xlsx`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
		} catch (downloadError) {
			setError(downloadError instanceof Error ? downloadError.message : 'Could not export report.');
		} finally {
			setDownloading(false);
		}
	}

	return <>
		<header className="top"><div><div className="eyebrow">Reports & exports</div><h1>Download data</h1><div className="muted">Export design and manufacturing records to Excel.</div></div></header>
		<section className="card report-export-card">
			<div className="section-heading"><div><div className="eyebrow">Excel workbook</div><h2>Choose a reporting period</h2></div><FileSpreadsheet size={24} color="var(--teal)" /></div>
			<p className="muted">Choose which data to include. Records are included when their allocation date falls within the selected period.</p>
			<div className="report-export-controls">
				<label className="field"><span>Data to download</span><select value={dataset} onChange={(event) => setDataset(event.target.value as Dataset)}><option value="both">Design and manufacturing</option><option value="designs">Design data only</option><option value="manufacturing">Manufacturing data only</option></select></label>
				<label className="field"><span>Period</span><select value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="day">Day</option><option value="week">Week (Monday–Sunday)</option><option value="month">Month</option><option value="year">Year</option></select></label>
				<label className="field"><span>{period === 'year' ? 'Choose a date in the year' : period === 'month' ? 'Choose a date in the month' : period === 'week' ? 'Choose a date in the week' : 'Choose day'}</span><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
				<button className="button" type="button" onClick={download} disabled={!date || downloading}><Download size={15} /> {downloading ? 'Preparing Excel...' : 'Download Excel'}</button>
			</div>
			{error && <div className="form-error"><CircleAlert size={15} /> {error}</div>}
		</section>
	</>;
}
