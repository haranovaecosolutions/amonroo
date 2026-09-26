"use client";

import { FormEvent, useEffect, useState } from 'react';
import { Plus, PackageOpen } from 'lucide-react';

type Product = { id?: string; sku: string; name: string; current_stock?: number; stock?: number; reorder_level?: number; reorder?: number; shortage?: number };
type ProductForm = { sku: string; name: string; reorder_level: number; target_stock: number };
const emptyProduct: ProductForm = { sku: '', name: '', reorder_level: 0, target_stock: 0 };

export default function Products() {
  const [data, setData] = useState<Product[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyProduct);

  useEffect(() => { fetch('/api/products').then((response) => response.json()).then(setData); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (response.ok) { setData([...data, await response.json()]); setForm(emptyProduct); }
  }

  return <>
    <header className="top"><div><div className="eyebrow">Catalogue management</div><h1>Stock &amp; products</h1><div className="muted">Keep your catalogue, thresholds, and availability in one place.</div></div><div className="top-actions"><span className="badge green"><PackageOpen size={13} /> {data.length} products</span></div></header>
    <section className="card"><div className="section-heading"><div><div className="eyebrow">New catalogue item</div><h2>Add product</h2></div></div><form className="formgrid" onSubmit={save}>
      <div className="field"><label>SKU</label><input required value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></div>
      <div className="field"><label>Name</label><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
      <div className="field"><label>Reorder level</label><input type="number" value={form.reorder_level} onChange={(event) => setForm({ ...form, reorder_level: Number(event.target.value) })} /></div>
      <div className="field"><label>Target stock</label><input type="number" value={form.target_stock} onChange={(event) => setForm({ ...form, target_stock: Number(event.target.value) })} /></div>
      <button className="button"><Plus size={15} /> Save product</button>
    </form></section>
    <section className="section tablebox"><table className="table"><thead><tr><th>SKU</th><th>Name</th><th>Stock</th><th>Reorder</th><th>Shortage</th></tr></thead>
      <tbody>{data.map((product) => <tr key={product.id ?? product.sku}><td>{product.sku}</td><td>{product.name}</td><td>{product.current_stock ?? product.stock ?? 0}</td><td>{product.reorder_level ?? product.reorder ?? 0}</td><td>{product.shortage ?? 0}</td></tr>)}</tbody>
    </table></section>
  </>;
}