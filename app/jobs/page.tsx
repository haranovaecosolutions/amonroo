"use client";

import { FormEvent, useEffect, useState } from 'react';
import { BriefcaseBusiness, Check, CircleAlert, PackageCheck, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import TableScroll from '../components/table-scroll';

type Job = { id?: string; job?: string; job_number?: string; product?: string; product_sku?: string; sku_id?: string; manufacturer: string; qty?: number; quantity_sent?: number; quantity_received?: number; quantity_outstanding?: number; days?: number; days_remaining?: number; expected_return_date?: string; allocation_date?: string; payment_status?: string; total_payment?: number; amount_paid?: number; reorder_number?: number; remarks?: string; sku_ids?: string[]; status?: string };
type Design = { sku: string; sku_id?: string | null; name?: string };
type JobForm = { job_number: string; product_sku: string; sku_id: string; manufacturer: string; quantity_sent: string; allocation_date: string; expected_return_date: string; payment_status: string; total_payment: string; amount_paid: string; reorder_number: string; remarks: string };
type ReceiptForm = { quantity_received: string; received_at: string };
type EditForm = { id: string; manufacturer: string; allocation_date: string; expected_return_date: string; payment_status: string; total_payment: string; amount_paid: string; reorder_number: string; remarks: string };

function localDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function emptyJob(): JobForm {
  return { job_number: '', product_sku: '', sku_id: '', manufacturer: '', quantity_sent: '', allocation_date: localDate(), expected_return_date: '', payment_status: 'pending', total_payment: '', amount_paid: '', reorder_number: '', remarks: '' };
}

export default function Jobs() {
  const [data, setData] = useState<Job[]>([]);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [deadDesignIds, setDeadDesignIds] = useState<string[]>([]);
  const [form, setForm] = useState<JobForm>(emptyJob);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saveNotice, setSaveNotice] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState('');
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editError, setEditError] = useState('');
  const [receivingJob, setReceivingJob] = useState<Job | null>(null);
  const [receiptForm, setReceiptForm] = useState<ReceiptForm>({ quantity_received: '', received_at: localDate() });
  const [receiptError, setReceiptError] = useState('');

  useEffect(() => {
    if (!saveNotice) return;
    const timeout = window.setTimeout(() => setSaveNotice(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [saveNotice]);

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
    if (result.code === 'DEAD_DESIGN') { window.alert(result.error); return; }
    if (result.code === 'ACTIVE_DESIGN_EXISTS') {
      if (!window.confirm(`${result.error}\n\nDo you want to add this manufacturing record anyway?`)) {
        window.alert('Data not added.');
        return;
      }
      response = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, confirm_duplicate: true }) });
      result = await response.json();
    }
    if (result.code === 'DEAD_DESIGN') { window.alert(result.error); return; }
    if (!response.ok) { setError(result.error || 'Could not save manufacturing record.'); return; }
    setData([...data, result]);
    setDesigns(designs.map((design) => design.sku === result.product_sku ? { ...design, sku_id: result.sku_id } : design));
    setForm(emptyJob());
    setSaveNotice(true);
  }

  function openReceipt(job: Job) {
    setReceivingJob(job);
    setReceiptForm({ quantity_received: '', received_at: localDate() });
    setReceiptError('');
  }

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receivingJob?.id) return;
    setReceiptError('');
    const quantity = Number(receiptForm.quantity_received);

    const response = await fetch('/api/jobs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: receivingJob.id, quantity_received: quantity, received_at: receiptForm.received_at }) });
    const result = await response.json();
    if (!response.ok) { setReceiptError(result.error || 'Could not record delivery.'); return; }
    setData(data.map((job) => job.id === receivingJob.id ? { ...job, ...result } : job));
    setReceivingJob(null);
    setSaveNotice(true);
  }

  function openEdit(job: Job) {
    if (!job.id) return;
    setEditingJob(job);
    setEditError('');
    setEditForm({
      id: job.id,
      manufacturer: job.manufacturer,
      allocation_date: job.allocation_date ?? localDate(),
      expected_return_date: job.expected_return_date ?? localDate(),
      payment_status: job.payment_status ?? 'pending',
      total_payment: String(job.total_payment ?? 0),
      amount_paid: String(job.amount_paid ?? 0),
      reorder_number: String(job.reorder_number ?? 0),
      remarks: job.remarks ?? '',
    });
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editForm) return;
    setEditError('');
    const response = await fetch('/api/jobs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, action: 'edit' }),
    });
    const result = await response.json();
    if (!response.ok) { setEditError(result.error || 'Could not update manufacturing record.'); return; }
    setData(data.map((job) => job.id === editForm.id ? { ...job, ...result } : job));
    setEditingJob(null);
    setEditForm(null);
    setSaveNotice(true);
  }

  async function deleteJob(job: Job) {
    if (!job.id || (job.quantity_received ?? 0) > 0) return;
    const jobNumber = job.job_number ?? job.job ?? 'this record';
    if (!window.confirm(`Delete manufacturing record ${jobNumber}? The sent quantity will be restored to stock, and the record will be kept in the private Supabase deleted-data archive for manual review.`)) return;
    setError('');
    setDeletingJobId(job.id);
    try {
      const response = await fetch(`/api/jobs?id=${encodeURIComponent(job.id)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'Could not delete manufacturing record.'); return; }
      setData(data.filter((item) => item.id !== job.id));
      setSaveNotice(true);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete manufacturing record.');
    } finally {
      setDeletingJobId('');
    }
  }

  const searchTerm = search.trim().toLowerCase();
  const filteredJobs = data.filter((job) => {
    const days = job.days_remaining ?? job.days ?? 0;
    const urgency = days < 0 ? 'overdue' : days <= 3 ? 'due soon' : 'on track';
    return [job.job_number, job.job, job.product_sku, job.product, job.sku_id, job.manufacturer,
      job.quantity_sent ?? job.qty, job.quantity_received, job.quantity_outstanding ?? job.qty,
      job.allocation_date, job.payment_status, job.total_payment, job.amount_paid, job.reorder_number,
      job.remarks, job.expected_return_date, job.days_remaining ?? job.days, job.status, urgency,
    ].some((value) => String(value ?? '').toLowerCase().includes(searchTerm));
  });

  return <>
    {saveNotice && <div className="success-toast" role="status" aria-live="polite"><Check size={16} /> Data saved</div>}
    <header className="top"><div><div className="eyebrow">Production pipeline</div><h1>Manufacturing</h1><div className="muted">Track production allotments, payments, and unit deliveries.</div></div><div className="top-actions"><span className="badge blue"><BriefcaseBusiness size={13} /> {data.length} records</span></div></header>
    <section className="card"><div className="section-heading"><div><div className="eyebrow">New production allotment</div><h2>Add manufacturing record</h2></div></div><form className="formgrid required-form" onSubmit={save}>
      <div className="field"><label htmlFor="job-number">Job number</label><input id="job-number" required value={form.job_number} onChange={(event) => setForm({ ...form, job_number: event.target.value })} /></div>
      <div className="field"><label htmlFor="job-design">Design ID</label><select id="job-design" required value={form.product_sku} onChange={(event) => { const designId = event.target.value; if (deadDesignIds.some((deadId) => deadId.toLowerCase() === designId.toLowerCase())) { window.alert(`Design ID ${designId} is marked as dead and cannot be used for manufacturing.`); setForm({ ...form, product_sku: '', sku_id: '' }); return; } const design = designs.find((item) => item.sku === designId); setForm({ ...form, product_sku: designId, sku_id: design?.sku_id ?? '' }); }}><option value="" disabled>Select a design ID</option>{designs.map((design) => <option key={design.sku} value={design.sku}>{design.sku}{design.name && design.name !== design.sku ? ` - ${design.name}` : ''}{deadDesignIds.some((deadId) => deadId.toLowerCase() === design.sku.toLowerCase()) ? ' (Dead design)' : ''}</option>)}</select></div>
      <div className="field"><label htmlFor="job-sku-id">SKU ID (optional, one per design)</label><input id="job-sku-id" maxLength={100} disabled={!form.product_sku} value={form.sku_id} readOnly={Boolean(designs.find((design) => design.sku === form.product_sku)?.sku_id)} placeholder={form.product_sku ? 'Enter a SKU ID for this design' : 'Select a design first'} onChange={(event) => setForm({ ...form, sku_id: event.target.value })} /><small className="muted">If entered, this SKU ID is saved to the design and reused for every manufacturing job, regardless of quantity.</small></div>
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
      <TableScroll><table className="table"><thead><tr><th>Job</th><th>Design ID</th><th>SKU ID</th><th>Manufacturer</th><th>Qty sent</th><th>Qty received</th><th>Date of allotment</th><th>Payment status</th><th>Total payment</th><th>Amount paid</th><th>Reorder number</th><th>Remarks</th><th>Expected delivery</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{filteredJobs.map((job) => { const days = job.days_remaining ?? job.days ?? 0; const outstanding = job.quantity_outstanding ?? 0; const received = job.quantity_received ?? 0; const receivedStatus = job.status === 'received'; return <tr key={job.id ?? job.job}><td>{job.job_number ?? job.job}</td><td>{job.product_sku ?? job.product}</td><td>{job.sku_id || '—'}</td><td>{job.manufacturer}</td><td>{job.quantity_sent ?? job.qty}</td><td>{received}</td><td>{job.allocation_date || '—'}</td><td>{job.payment_status || '—'}</td><td>{job.total_payment ?? 0}</td><td>{job.amount_paid ?? 0}</td><td>{job.reorder_number ?? 0}</td><td className="design-remarks" title={job.remarks}>{job.remarks || '—'}</td><td>{job.expected_return_date ?? `${days} days`}</td><td><span className={`badge ${receivedStatus ? 'green' : days < 0 ? 'red' : days <= 3 ? 'amber' : 'blue'}`}>{receivedStatus ? 'Received' : days < 0 ? 'Overdue' : days <= 3 ? 'Due soon' : 'On track'}</span></td><td className="job-actions">{job.id && <><button className="button secondary compact" onClick={() => openEdit(job)}><Pencil size={13} /> Edit</button>{outstanding > 0 && <button className="button secondary compact" onClick={() => openReceipt(job)}><PackageCheck size={13} /> Record delivery</button>}<button className="button secondary compact danger-action" disabled={(job.quantity_received ?? 0) > 0 || deletingJobId === job.id} title={(job.quantity_received ?? 0) > 0 ? 'Cannot delete a job with received units.' : 'Delete manufacturing record'} onClick={() => deleteJob(job)}><Trash2 size={13} /> {deletingJobId === job.id ? 'Deleting...' : 'Delete'}</button></>}</td></tr>; })}</tbody>
      </table>{filteredJobs.length === 0 && <div className="empty-state">{searchTerm ? 'No manufacturing jobs match your search.' : 'No manufacturing jobs found.'}</div>}</TableScroll>
    </section>
    {editingJob && editForm && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditingJob(null); setEditForm(null); } }}><section className="card receive-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-job-title"><div className="section-heading"><div><div className="eyebrow">Manufacturing record</div><h2 id="edit-job-title">Edit {editingJob.job_number ?? editingJob.job}</h2></div><button type="button" className="button secondary compact" aria-label="Close edit form" onClick={() => { setEditingJob(null); setEditForm(null); }}><X size={15} /></button></div><p className="muted receive-summary">Design ID, quantities, and received SKU history are kept unchanged to protect stock and delivery records.</p><form className="formgrid required-form" onSubmit={saveEdit}>
      <div className="field"><label htmlFor="edit-manufacturer">Manufacturer</label><input id="edit-manufacturer" required value={editForm.manufacturer} onChange={(event) => setEditForm({ ...editForm, manufacturer: event.target.value })} /></div>
      <div className="field"><label htmlFor="edit-allocation-date">Date of allotment</label><input id="edit-allocation-date" required type="date" value={editForm.allocation_date} onChange={(event) => setEditForm({ ...editForm, allocation_date: event.target.value })} /></div>
      <div className="field"><label htmlFor="edit-expected-return">Expected delivery date</label><input id="edit-expected-return" required type="date" value={editForm.expected_return_date} onChange={(event) => setEditForm({ ...editForm, expected_return_date: event.target.value })} /></div>
      <div className="field"><label htmlFor="edit-payment-status">Payment status</label><select id="edit-payment-status" required value={editForm.payment_status} onChange={(event) => setEditForm({ ...editForm, payment_status: event.target.value })}><option value="pending">Pending</option><option value="partial">Partially paid</option><option value="paid">Paid</option></select></div>
      <div className="field"><label htmlFor="edit-total-payment">Total payment</label><input id="edit-total-payment" required min="0" step="0.01" type="number" value={editForm.total_payment} onChange={(event) => setEditForm({ ...editForm, total_payment: event.target.value })} /></div>
      <div className="field"><label htmlFor="edit-amount-paid">Amount paid</label><input id="edit-amount-paid" required min="0" step="0.01" type="number" value={editForm.amount_paid} onChange={(event) => setEditForm({ ...editForm, amount_paid: event.target.value })} /></div>
      <div className="field"><label htmlFor="edit-reorder-number">Reorder number</label><input id="edit-reorder-number" required min="0" step="1" type="number" value={editForm.reorder_number} onChange={(event) => setEditForm({ ...editForm, reorder_number: event.target.value })} /></div>
      <div className="field wide-field"><label className="optional-field-label" htmlFor="edit-job-remarks">Remarks</label><textarea id="edit-job-remarks" value={editForm.remarks} onChange={(event) => setEditForm({ ...editForm, remarks: event.target.value })} /></div>
      {editError && <div className="form-error"><CircleAlert size={15} /> {editError}</div>}
      <div className="receive-actions"><button type="button" className="button secondary" onClick={() => { setEditingJob(null); setEditForm(null); }}>Cancel</button><button className="button"><Save size={15} /> Save changes</button></div>
    </form></section></div>}
    {receivingJob && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setReceivingJob(null); }}><section className="card receive-dialog" role="dialog" aria-modal="true" aria-labelledby="receive-title"><div className="section-heading"><div><div className="eyebrow">Manufacturer delivery</div><h2 id="receive-title">Record units for {receivingJob.job_number ?? receivingJob.job}</h2></div><button type="button" className="button secondary compact" aria-label="Close delivery form" onClick={() => setReceivingJob(null)}><X size={15} /></button></div><div className="muted receive-summary">{receivingJob.product_sku ?? receivingJob.product} · {receivingJob.quantity_outstanding} units outstanding</div><form className="formgrid required-form" onSubmit={receive}>
      <div className="field"><label htmlFor="received-quantity">Quantity received</label><input id="received-quantity" required min="1" max={receivingJob.quantity_outstanding} step="1" type="number" value={receiptForm.quantity_received} onChange={(event) => setReceiptForm({ ...receiptForm, quantity_received: event.target.value })} /></div>
      <div className="field"><label htmlFor="received-date">Date received</label><input id="received-date" required type="date" value={receiptForm.received_at} onChange={(event) => setReceiptForm({ ...receiptForm, received_at: event.target.value })} /></div>
      {receiptError && <div className="form-error"><CircleAlert size={15} /> {receiptError}</div>}
      <div className="receive-actions"><button type="button" className="button secondary" onClick={() => setReceivingJob(null)}>Cancel</button><button className="button"><PackageCheck size={15} /> Save delivery</button></div>
    </form></section></div>}
  </>;
}