"use client";

import { FormEvent, useEffect, useState } from 'react';
import { BriefcaseBusiness, CircleAlert, PackageCheck, Plus, Search, X } from 'lucide-react';

type Job = { id?: string; job?: string; job_number?: string; product?: string; product_sku?: string; manufacturer: string; qty?: number; quantity_sent?: number; quantity_received?: number; quantity_outstanding?: number; days?: number; days_remaining?: number; expected_return_date?: string; allocation_date?: string; payment_status?: string; total_payment?: number; amount_paid?: number; reorder_number?: number; remarks?: string; sku_ids?: string[]; status?: string };
type Design = { sku: string; name?: string };
type JobForm = { job_number: string; product_sku: string; manufacturer: string; quantity_sent: string; allocation_date: string; expected_return_date: string; payment_status: string; total_payment: string; amount_paid: string; reorder_number: string; remarks: string };
type ReceiptForm = { quantity_received: string; received_at: string; sku_ids: string };

function localDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function emptyJob(): JobForm {
  return { job_number: '', product_sku: '', manufacturer: '', quantity_sent: '', allocation_date: localDate(), expected_return_date: '', payment_status: 'pending', total_payment: '', amount_paid: '', reorder_number: '', remarks: '' };
}

export default function Jobs() {
  const [data, setData] = useState<Job[]>([]);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [deadDesignIds, setDeadDesignIds] = useState<string[]>([]);
  const [form, setForm] = useState<JobForm>(emptyJob);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [receivingJob, setReceivingJob] = useState<Job | null>(null);
  const [receiptForm, setReceiptForm] = useState<ReceiptForm>({ quantity_received: '', received_at: localDate(), sku_ids: '' });
  const [receiptError, setReceiptError] = useState('');

  useEffect(() => { fetch('/api/jobs').then((response) => response.json()).then(setData); }, []);
  useEffect(() => { fetch('/api/products').then((response) => response.json()).then(setDesigns); }, []);
  useEffect(() => { fetch('/api/dead-designs').then((response) => response.json()).then((items) => setDeadDesignIds(Array.isArray(items) ? items.map((item: { design_id: string }) => item.design_id) : [])); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (deadDesignIds.some((designId) => designId.toLowerCase() === form.product_sku.toLowerCase())) {
      window.alert(`Design ID ${form.product_sku} is marked as dead and cannot be used for manufacturing.`);
      return;
    }
    let response = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    let result = await response.json();
    let duplicateConfirmed = false;
    if (result.code === 'DEAD_DESIGN') { window.alert(result.error); return; }
    if (result.code === 'ACTIVE_DESIGN_EXISTS') {
      if (!window.confirm(`${result.error}\n\nDo you want to add this manufacturing record anyway?`)) {
        window.alert('Data not added.');
        return;
      }
      duplicateConfirmed = true;
      response = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, confirm_duplicate: true }) });
      result = await response.json();
    }
    if (result.code === 'DEAD_DESIGN') { window.alert(result.error); return; }
    if (!response.ok) { setError(result.error || 'Could not save manufacturing record.'); return; }
    setData([...data, result]);
    setForm(emptyJob());
    if (duplicateConfirmed) window.alert('Data added.');
  }

  function openReceipt(job: Job) {
    setReceivingJob(job);
    setReceiptForm({ quantity_received: '', received_at: localDate(), sku_ids: '' });
    setReceiptError('');
  }

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receivingJob?.id) return;
    setReceiptError('');
    const quantity = Number(receiptForm.quantity_received);
    const skuIds = receiptForm.sku_ids.split(/[\n,]/).map((sku) => sku.trim()).filter(Boolean);
    if (skuIds.length !== quantity) { setReceiptError(`Enter exactly ${quantity} SKU IDs, one per received unit.`); return; }
    if (new Set(skuIds.map((sku) => sku.toLowerCase())).size !== skuIds.length) { setReceiptError('Each SKU ID must be unique.'); return; }

    const response = await fetch('/api/jobs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: receivingJob.id, quantity_received: quantity, received_at: receiptForm.received_at, sku_ids: skuIds }) });
    const result = await response.json();
    if (!response.ok) { setReceiptError(result.error || 'Could not record delivery.'); return; }
    setData(data.map((job) => job.id === receivingJob.id ? { ...job, ...result } : job));
    setReceivingJob(null);
  }

  const searchTerm = search.trim().toLowerCase();
  const filteredJobs = data.filter((job) => {
    const days = job.days_remaining ?? job.days ?? 0;
    const urgency = days < 0 ? 'overdue' : days <= 3 ? 'due soon' : 'on track';
    return [job.job_number, job.job, job.product_sku, job.product, job.manufacturer, ...(job.sku_ids ?? []),
      job.quantity_sent ?? job.qty, job.quantity_received, job.quantity_outstanding ?? job.qty,
      job.allocation_date, job.payment_status, job.total_payment, job.amount_paid, job.reorder_number,
      job.remarks, job.expected_return_date, job.days_remaining ?? job.days, job.status, urgency,
    ].some((value) => String(value ?? '').toLowerCase().includes(searchTerm));
  });

  return <>
    <header className="top"><div><div className="eyebrow">Production pipeline</div><h1>Manufacturing</h1><div className="muted">Track production allotments, payments, and unit deliveries.</div></div><div className="top-actions"><span className="badge blue"><BriefcaseBusiness size={13} /> {data.length} records</span></div></header>
    <section className="card"><div className="section-heading"><div><div className="eyebrow">New production allotment</div><h2>Add manufacturing record</h2></div></div><form className="formgrid required-form" onSubmit={save}>
      <div className="field"><label htmlFor="job-number">Job number</label><input id="job-number" required value={form.job_number} onChange={(event) => setForm({ ...form, job_number: event.target.value })} /></div>
      <div className="field"><label htmlFor="job-design">Design ID</label><select id="job-design" required value={form.product_sku} onChange={(event) => { const designId = event.target.value; if (deadDesignIds.some((deadId) => deadId.toLowerCase() === designId.toLowerCase())) { window.alert(`Design ID ${designId} is marked as dead and cannot be used for manufacturing.`); setForm({ ...form, product_sku: '' }); return; } setForm({ ...form, product_sku: designId }); }}><option value="" disabled>Select a design ID</option>{designs.map((design) => <option key={design.sku} value={design.sku}>{design.sku}{design.name && design.name !== design.sku ? ` - ${design.name}` : ''}{deadDesignIds.some((deadId) => deadId.toLowerCase() === design.sku.toLowerCase()) ? ' (Dead design)' : ''}</option>)}</select></div>
      <div className="field"><label htmlFor="job-manufacturer">Manufacturer</label><input id="job-manufacturer" required value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} /></div>
      <div className="field"><label htmlFor="quantity-sent">Quantity sent</label><input id="quantity-sent" required min="1" step="1" type="number" value={form.quantity_sent} onChange={(event) => setForm({ ...form, quantity_sent: event.target.value })} /></div>
      <div className="field"><label htmlFor="allocation-date">Date of allotment</label><input id="allocation-date" required type="date" value={form.allocation_date} onChange={(event) => setForm({ ...form, allocation_date: event.target.value })} /></div>
      <div className="field"><label htmlFor="expected-return">Expected delivery date</label><input id="expected-return" required type="date" value={form.expected_return_date} onChange={(event) => setForm({ ...form, expected_return_date: event.target.value })} /></div>
      <div className="field"><label htmlFor="job-payment-status">Payment status</label><select id="job-payment-status" required value={form.payment_status} onChange={(event) => setForm({ ...form, payment_status: event.target.value })}><option value="pending">Pending</option><option value="partial">Partially paid</option><option value="paid">Paid</option></select></div>
      <div className="field"><label htmlFor="job-total-payment">Total payment</label><input id="job-total-payment" required min="0" step="0.01" type="number" value={form.total_payment} onChange={(event) => setForm({ ...form, total_payment: event.target.value })} /></div>
      <div className="field"><label htmlFor="job-amount-paid">Amount paid</label><input id="job-amount-paid" required min="0" step="0.01" type="number" value={form.amount_paid} onChange={(event) => setForm({ ...form, amount_paid: event.target.value })} /></div>
      <div className="field"><label htmlFor="reorder-number">Reorder number</label><input id="reorder-number" required min="0" step="1" type="number" value={form.reorder_number} onChange={(event) => setForm({ ...form, reorder_number: event.target.value })} /></div>
      <div className="field wide-field"><label className="optional-field-label" htmlFor="job-remarks">Remarks</label><textarea id="job-remarks" value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} /></div>
      {error && <div className="form-error"><CircleAlert size={15} /> {error}</div>}
      <button className="button"><Plus size={15} /> Save manufacturing record</button>
    </form></section>
    <section className="section">
      <div className="table-tools"><label className="search-field"><Search size={16} /><input type="search" aria-label="Search manufacturing jobs" placeholder="Search manufacturing data..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><span className="muted search-count">{filteredJobs.length} of {data.length} jobs</span></div>
      <div className="tablebox"><table className="table"><thead><tr><th>Job</th><th>Design ID</th><th>Manufacturer</th><th>Qty sent</th><th>Qty received</th><th>SKU IDs</th><th>Date of allotment</th><th>Payment status</th><th>Total payment</th><th>Amount paid</th><th>Reorder number</th><th>Remarks</th><th>Expected delivery</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{filteredJobs.map((job) => { const days = job.days_remaining ?? job.days ?? 0; const outstanding = job.quantity_outstanding ?? 0; const received = job.quantity_received ?? 0; const receivedStatus = job.status === 'received'; return <tr key={job.id ?? job.job}><td>{job.job_number ?? job.job}</td><td>{job.product_sku ?? job.product}</td><td>{job.manufacturer}</td><td>{job.quantity_sent ?? job.qty}</td><td>{received}</td><td className="design-remarks" title={(job.sku_ids ?? []).join(', ')}>{(job.sku_ids ?? []).join(', ') || '—'}</td><td>{job.allocation_date || '—'}</td><td>{job.payment_status || '—'}</td><td>{job.total_payment ?? 0}</td><td>{job.amount_paid ?? 0}</td><td>{job.reorder_number ?? 0}</td><td className="design-remarks" title={job.remarks}>{job.remarks || '—'}</td><td>{job.expected_return_date ?? `${days} days`}</td><td><span className={`badge ${receivedStatus ? 'green' : days < 0 ? 'red' : days <= 3 ? 'amber' : 'blue'}`}>{receivedStatus ? 'Received' : days < 0 ? 'Overdue' : days <= 3 ? 'Due soon' : 'On track'}</span></td><td>{job.id && outstanding > 0 && <button className="button secondary compact" onClick={() => openReceipt(job)}><PackageCheck size={13} /> Record delivery</button>}</td></tr>; })}</tbody>
      </table>{filteredJobs.length === 0 && <div className="empty-state">{searchTerm ? 'No manufacturing jobs match your search.' : 'No manufacturing jobs found.'}</div>}</div>
    </section>
    {receivingJob && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setReceivingJob(null); }}><section className="card receive-dialog" role="dialog" aria-modal="true" aria-labelledby="receive-title"><div className="section-heading"><div><div className="eyebrow">Manufacturer delivery</div><h2 id="receive-title">Record units for {receivingJob.job_number ?? receivingJob.job}</h2></div><button type="button" className="button secondary compact" aria-label="Close delivery form" onClick={() => setReceivingJob(null)}><X size={15} /></button></div><div className="muted receive-summary">{receivingJob.product_sku ?? receivingJob.product} · {receivingJob.quantity_outstanding} units outstanding</div><form className="formgrid required-form" onSubmit={receive}>
      <div className="field"><label htmlFor="received-quantity">Quantity received</label><input id="received-quantity" required min="1" max={receivingJob.quantity_outstanding} step="1" type="number" value={receiptForm.quantity_received} onChange={(event) => setReceiptForm({ ...receiptForm, quantity_received: event.target.value })} /></div>
      <div className="field"><label htmlFor="received-date">Date received</label><input id="received-date" required type="date" value={receiptForm.received_at} onChange={(event) => setReceiptForm({ ...receiptForm, received_at: event.target.value })} /></div>
      <div className="field receive-sku-field"><label htmlFor="received-sku-ids">SKU IDs (one per unit)</label><textarea id="received-sku-ids" required placeholder="Enter one unique SKU ID per line" value={receiptForm.sku_ids} onChange={(event) => setReceiptForm({ ...receiptForm, sku_ids: event.target.value })} /></div>
      {receiptError && <div className="form-error"><CircleAlert size={15} /> {receiptError}</div>}
      <div className="receive-actions"><button type="button" className="button secondary" onClick={() => setReceivingJob(null)}>Cancel</button><button className="button"><PackageCheck size={15} /> Save delivery</button></div>
    </form></section></div>}
  </>;
}