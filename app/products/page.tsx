"use client";

import { FormEvent, useEffect, useRef, useState } from 'react';
import { CircleAlert, PackageOpen, Plus, Save, Search } from 'lucide-react';

type Design = { id?: string; sku: string; name: string; allocation_date?: string; delivery_date?: string | null; payment_date?: string | null; payment_status?: string; total_payment?: number; payment_amount?: number; remarks?: string; current_stock?: number; stock?: number; reorder_level?: number; reorder?: number; shortage?: number; warehouse_id?: string; source?: string };
type DesignForm = { design_number: string; designer_name: string; allocation_date: string; payment_status: string; total_payment: string; payment_amount: string; remarks: string };

function localDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function emptyDesign(): DesignForm {
  return { design_number: '', designer_name: '', allocation_date: localDate(), payment_status: 'pending', total_payment: '', payment_amount: '', remarks: '' };
}

export default function Products() {
  const [data, setData] = useState<Design[]>([]);
  const [form, setForm] = useState<DesignForm>(emptyDesign);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const remarksRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch('/api/products', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load designs.');
        if (active) { setData(result); setLoadError(''); }
      } catch (loadError) {
        if (active) setLoadError(loadError instanceof Error ? loadError.message : 'Could not load designs.');
      }
    }
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  useEffect(() => {
    const remarks = remarksRef.current;
    if (!remarks) return;
    remarks.style.height = 'auto';
    remarks.style.height = `${remarks.scrollHeight}px`;
  }, [form.remarks]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const designNumber = form.design_number.trim();
    if (data.some((design) => design.sku === designNumber)) {
      setError(`Design ID "${designNumber}" already exists. Enter a different ID.`);
      return;
    }
    const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || 'Could not save design.'); return; }
    setData([...data, result]);
    setForm(emptyDesign());
  }

  async function saveDetails(design: Design) {
    setError('');
    const response = await fetch('/api/products', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ design_number: design.sku, delivery_date: design.delivery_date || '', payment_date: design.payment_date || '', payment_status: design.payment_status || 'pending', total_payment: design.total_payment ?? 0, payment_amount: design.payment_amount ?? 0 }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || 'Could not update design.'); return; }
    setData(data.map((item) => item.sku === design.sku ? { ...item, ...result } : item));
  }

  function updateDesign(sku: string, changes: Partial<Design>) {
    setData(data.map((design) => design.sku === sku ? { ...design, ...changes } : design));
  }

  const searchTerm = search.trim().toLowerCase();
  const liveInventory = data.some((design) => design.source === 'baselinker');
  const filteredDesigns = data.filter((design) => [
    design.sku, design.name, design.allocation_date, design.delivery_date, design.payment_date,
    design.payment_status, design.total_payment, design.payment_amount,
    design.remarks, design.current_stock ?? design.stock, design.reorder_level ?? design.reorder, design.shortage,
  ].some((value) => String(value ?? '').toLowerCase().includes(searchTerm)));

  return <>
    <header className="top"><div><div className="eyebrow">{liveInventory ? 'BaseLinker · live inventory' : 'Design catalogue'}</div><h1>Designs</h1><div className="muted">{liveInventory ? 'Product catalogue and warehouse stock from BaseLinker. This view is read-only.' : 'Track allocation, delivery, payment, and available stock by Design ID.'}</div></div><div className="top-actions"><span className="badge green"><PackageOpen size={13} /> {data.length} designs</span></div></header>
    {loadError && <div className="form-error dashboard-error"><CircleAlert size={15} /> {loadError}</div>}
    {!liveInventory && <section className="card"><div className="section-heading"><div><div className="eyebrow">New design</div><h2>Add design</h2></div></div><form className="formgrid required-form" onSubmit={save}>
      <div className="field"><label htmlFor="design-id">Design ID</label><input id="design-id" required value={form.design_number} onChange={(event) => setForm({ ...form, design_number: event.target.value })} /></div>
      <div className="field"><label htmlFor="designer-name">Designer Name</label><input id="designer-name" required value={form.designer_name} onChange={(event) => setForm({ ...form, designer_name: event.target.value })} /></div>
      <div className="field"><label htmlFor="allocation-date">Allocation date</label><input id="allocation-date" required type="date" value={form.allocation_date} onChange={(event) => setForm({ ...form, allocation_date: event.target.value })} /></div>
      <div className="field"><label htmlFor="payment-status">Payment status</label><select id="payment-status" required value={form.payment_status} onChange={(event) => setForm({ ...form, payment_status: event.target.value })}><option value="pending">Pending</option><option value="partial">Partially paid</option><option value="paid">Paid</option></select></div>
      <div className="field"><label htmlFor="total-payment">Total payment</label><input id="total-payment" required min="0" step="0.01" type="number" value={form.total_payment} onChange={(event) => setForm({ ...form, total_payment: event.target.value })} /></div>
      <div className="field"><label htmlFor="amount-paid">Amount paid</label><input id="amount-paid" required min="0" step="0.01" type="number" value={form.payment_amount} onChange={(event) => setForm({ ...form, payment_amount: event.target.value })} /></div>
      <div className="field"><label className="optional-field-label" htmlFor="design-remarks">Remarks</label><textarea id="design-remarks" ref={remarksRef} rows={1} value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} /></div>
      {error && <div className="form-error"><CircleAlert size={15} /> {error}</div>}
      <button className="button"><Plus size={15} /> Save design</button>
    </form></section>}
    <section className="section">
      <div className="table-tools"><label className="search-field"><Search size={16} /><input type="search" aria-label="Search designs" placeholder="Search designs..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><span className="muted search-count">{filteredDesigns.length} of {data.length} designs</span></div>
      <div className="tablebox"><table className="table"><thead><tr><th>Design ID</th><th>{liveInventory ? 'Product' : 'Designer Name'}</th>{liveInventory ? <><th>Available stock</th><th>Warehouse</th><th>Low-stock threshold</th><th>Shortage</th></> : <><th>Allocation</th><th>Delivery</th><th>Payment date</th><th>Payment status</th><th>Total payment</th><th>Amount paid</th><th>Remarks</th><th>Stock</th><th>Reorder</th><th>Shortage</th><th>Action</th></>}</tr></thead>
        <tbody>{filteredDesigns.map((design) => <tr key={design.id ?? design.sku}>{liveInventory ? <><td><strong>{design.sku}</strong></td><td>{design.name}</td><td>{design.current_stock ?? design.stock ?? 0}</td><td>{design.warehouse_id || '—'}</td><td>{design.reorder_level ?? design.reorder ?? 0}</td><td>{design.shortage ?? 0}</td></> : <><td><strong>{design.sku}</strong></td><td>{design.name}</td><td>{design.allocation_date || '—'}</td><td><input aria-label={`Delivery date for ${design.sku}`} type="date" value={design.delivery_date || ''} onChange={(event) => updateDesign(design.sku, { delivery_date: event.target.value })} /></td><td><input aria-label={`Payment date for ${design.sku}`} type="date" value={design.payment_date || ''} onChange={(event) => updateDesign(design.sku, { payment_date: event.target.value })} /></td><td><select aria-label={`Payment status for ${design.sku}`} value={design.payment_status || 'pending'} onChange={(event) => updateDesign(design.sku, { payment_status: event.target.value })}><option value="pending">Pending</option><option value="partial">Partially paid</option><option value="paid">Paid</option></select></td><td><input aria-label={`Total payment for ${design.sku}`} min="0" step="0.01" type="number" value={design.total_payment ?? 0} onChange={(event) => updateDesign(design.sku, { total_payment: Number(event.target.value) })} /></td><td><input aria-label={`Amount paid for ${design.sku}`} min="0" step="0.01" type="number" value={design.payment_amount ?? 0} onChange={(event) => updateDesign(design.sku, { payment_amount: Number(event.target.value) })} /></td><td className="design-remarks" title={design.remarks}>{design.remarks || '—'}</td><td>{design.current_stock ?? design.stock ?? 0}</td><td>{design.reorder_level ?? design.reorder ?? 0}</td><td>{design.shortage ?? 0}</td><td><button className="button secondary compact" onClick={() => saveDetails(design)}><Save size={13} /> Save</button></td></>}</tr>)}</tbody>
      </table>{filteredDesigns.length === 0 && <div className="empty-state">{searchTerm ? 'No designs match your search.' : 'No designs have been added yet.'}</div>}</div>
    </section>
  </>;
}