"use client";

import { FormEvent, useEffect, useState } from 'react';
import { BriefcaseBusiness, Plus } from 'lucide-react';

type Job = { id?: string; job?: string; job_number?: string; product?: string; product_sku?: string; manufacturer: string; qty?: number; quantity_sent?: number; quantity_received?: number; quantity_outstanding?: number; days?: number; days_remaining?: number; expected_return_date?: string };
type JobForm = { job_number: string; product_sku: string; manufacturer: string; quantity_sent: string; expected_return_date: string };
const emptyJob: JobForm = { job_number: '', product_sku: '', manufacturer: '', quantity_sent: '', expected_return_date: '' };

export default function Jobs() {
  const [data, setData] = useState<Job[]>([]);
  const [form, setForm] = useState<JobForm>(emptyJob);

  useEffect(() => { fetch('/api/jobs').then((response) => response.json()).then(setData); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (response.ok) { setData([...data, await response.json()]); setForm(emptyJob); }
  }

  async function receive(job: Job) {
    if (!job.id) return;
    const quantity = window.prompt(`How many units arrived for ${job.job_number ?? job.job}?`, String(job.quantity_outstanding ?? job.qty ?? 0));
    if (!quantity) return;
    const response = await fetch('/api/jobs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: job.id, quantity_received: Number(quantity) }) });
    if (response.ok) { const updated = await response.json(); setData(data.map((item) => item.id === job.id ? { ...item, ...updated } : item)); }
  }

  return <>
    <header className="top"><div><div className="eyebrow">Production pipeline</div><h1>Manufacturer jobs</h1><div className="muted">Track every handoff from dispatch to return.</div></div><div className="top-actions"><span className="badge blue"><BriefcaseBusiness size={13} /> {data.length} active jobs</span></div></header>
    <section className="card"><div className="section-heading"><div><div className="eyebrow">New production run</div><h2>Create job</h2></div></div><form className="formgrid" onSubmit={save}>
      <div className="field"><label>Job number</label><input required value={form.job_number} onChange={(event) => setForm({ ...form, job_number: event.target.value })} /></div>
      <div className="field"><label>Product SKU</label><input required value={form.product_sku} onChange={(event) => setForm({ ...form, product_sku: event.target.value })} /></div>
      <div className="field"><label>Manufacturer</label><input required value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} /></div>
      <div className="field"><label>Quantity sent</label><input required type="number" value={form.quantity_sent} onChange={(event) => setForm({ ...form, quantity_sent: event.target.value })} /></div>
      <div className="field"><label>Expected return date</label><input required type="date" value={form.expected_return_date} onChange={(event) => setForm({ ...form, expected_return_date: event.target.value })} /></div>
      <button className="button"><Plus size={15} /> Create job</button>
    </form></section>
    <section className="section tablebox"><table className="table"><thead><tr><th>Job</th><th>Product</th><th>Manufacturer</th><th>Sent</th><th>Received</th><th>Outstanding</th><th>Deadline</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>{data.map((job) => { const days = job.days_remaining ?? job.days ?? 0; const outstanding = job.quantity_outstanding ?? job.qty ?? 0; return <tr key={job.id ?? job.job}><td>{job.job_number ?? job.job}</td><td>{job.product_sku ?? job.product}</td><td>{job.manufacturer}</td><td>{job.quantity_sent ?? job.qty}</td><td>{job.quantity_received ?? 0}</td><td>{outstanding}</td><td>{job.expected_return_date ?? `${days} days`}</td><td><span className={`badge ${days < 0 ? 'red' : days <= 3 ? 'amber' : 'blue'}`}>{days < 0 ? 'Overdue' : days <= 3 ? 'Due soon' : 'On track'}</span></td><td>{job.id && outstanding > 0 && <button className="button secondary compact" onClick={() => receive(job)}>Receive stock</button>}</td></tr>; })}</tbody>
    </table></section>
  </>;
}