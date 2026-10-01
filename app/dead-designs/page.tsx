"use client";

import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, Ban, RotateCcw } from 'lucide-react';

type Design = { sku: string; name?: string };
type DeadDesign = { design_id: string; created_at?: string };

export default function DeadDesigns() {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [deadDesigns, setDeadDesigns] = useState<DeadDesign[]>([]);
  const [designId, setDesignId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([fetch('/api/products'), fetch('/api/dead-designs')]).then(async ([designResponse, deadResponse]) => {
      const nextDesigns = designResponse.ok ? await designResponse.json() : [];
      const nextDeadDesigns = deadResponse.ok ? await deadResponse.json() : [];
      if (active) { setDesigns(nextDesigns); setDeadDesigns(nextDeadDesigns); }
    });
    return () => { active = false; };
  }, []);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const response = await fetch('/api/dead-designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ design_id: designId }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || 'Could not mark design as dead.'); return; }
    setDeadDesigns([...deadDesigns, result]);
    setDesignId('');
  }

  async function restore(deadDesign: DeadDesign) {
    const response = await fetch('/api/dead-designs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ design_id: deadDesign.design_id }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || 'Could not restore design.'); return; }
    setDeadDesigns(deadDesigns.filter((item) => item.design_id !== deadDesign.design_id));
    setError('');
  }

  const availableDesigns = designs.filter((design) => !deadDesigns.some((dead) => dead.design_id === design.sku));

  return <>
    <header className="top"><div><div className="eyebrow">Catalogue controls</div><h1>Dead designs</h1><div className="muted">Keep unusable designs out of new manufacturing orders.</div></div><div className="top-actions"><span className="badge red"><Ban size={13} /> {deadDesigns.length} blocked designs</span></div></header>
    <section className="card"><div className="section-heading"><div><div className="eyebrow">Block a design</div><h2>Add Design ID</h2></div></div><form className="formgrid required-form" onSubmit={add}>
      <div className="field"><label htmlFor="dead-design-id">Design ID</label><select id="dead-design-id" required value={designId} onChange={(event) => setDesignId(event.target.value)}><option value="" disabled>Select a Design ID</option>{availableDesigns.map((design) => <option key={design.sku} value={design.sku}>{design.sku}{design.name && design.name !== design.sku ? ` - ${design.name}` : ''}</option>)}</select></div>
      {error && <div className="form-error"><AlertTriangle size={15} /> {error}</div>}
      <button className="button" disabled={availableDesigns.length === 0}><Ban size={15} /> Add to dead designs</button>
    </form></section>
    <section className="section tablebox"><table className="table"><thead><tr><th>Design ID</th><th>Design</th><th>Blocked on</th><th>Action</th></tr></thead>
      <tbody>{deadDesigns.map((deadDesign) => { const design = designs.find((item) => item.sku === deadDesign.design_id); return <tr key={deadDesign.design_id}><td><strong>{deadDesign.design_id}</strong></td><td>{design?.name || deadDesign.design_id}</td><td>{deadDesign.created_at ? new Date(deadDesign.created_at).toLocaleDateString() : '—'}</td><td><button className="button secondary compact" onClick={() => void restore(deadDesign)}><RotateCcw size={13} /> Restore</button></td></tr>; })}</tbody>
    </table>{deadDesigns.length === 0 && <div className="empty-state">No designs are blocked.</div>}</section>
  </>;
}