"use client";

import { FormEvent, useEffect, useState } from 'react';
import { ArrowUpRight, CircleAlert, ClipboardPlus } from 'lucide-react';

type Order = { id: string; order_number: string; customer_name?: string; ordered_at: string; deadline?: string | null; status: string; product_sku?: string; product_name?: string; quantity_ordered: number };
type OrderForm = { order_number: string; customer_name: string; product_sku: string; quantity: string; deadline: string; notes: string };
const emptyForm: OrderForm = { order_number: '', customer_name: '', product_sku: '', quantity: '', deadline: '', notes: '' };

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [form, setForm] = useState<OrderForm>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch('/api/orders').then((response) => response.json()).then(setOrders); }, []);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const result = await response.json();
    if (!response.ok) setError(result.error || 'Could not create order.');
    else { setOrders([result, ...orders]); setForm(emptyForm); }
    setSaving(false);
  }

  return <>
    <header className="top"><div><div className="eyebrow">Order operations</div><h1>Orders</h1><div className="muted">Create an order once, then keep its stock and manufacturing trail visible.</div></div><span className="badge blue"><ClipboardPlus size={13} /> {orders.length} orders tracked</span></header>
    <section className="card"><div className="section-heading"><div><div className="eyebrow">New customer order</div><h2>Start an order</h2></div></div><form className="formgrid" onSubmit={createOrder}>
      <div className="field"><label>Order ID <span className="muted">(optional)</span></label><input value={form.order_number} placeholder="Auto-generated if empty" onChange={(event) => setForm({ ...form, order_number: event.target.value })} /></div>
      <div className="field"><label>Customer</label><input required value={form.customer_name} placeholder="Customer or business name" onChange={(event) => setForm({ ...form, customer_name: event.target.value })} /></div>
      <div className="field"><label>Product SKU</label><input required value={form.product_sku} placeholder="Example: AM-001" onChange={(event) => setForm({ ...form, product_sku: event.target.value })} /></div>
      <div className="field"><label>Quantity</label><input required type="number" min="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></div>
      <div className="field"><label>Customer deadline <span className="muted">(optional)</span></label><input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} /></div>
      <div className="field"><label>Notes <span className="muted">(optional)</span></label><input value={form.notes} placeholder="Anything the team should know" onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
      {error && <div className="form-error"><CircleAlert size={15} /> {error}</div>}
      <button className="button" disabled={saving}><ClipboardPlus size={15} /> {saving ? 'Creating...' : 'Create order'}</button>
    </form></section>
    <section className="section"><div className="section-heading"><div><div className="eyebrow">Order history</div><h2>Recent orders</h2></div><a className="button secondary" href="/api/export">Export data <ArrowUpRight size={14} /></a></div><div className="tablebox"><table className="table"><thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Quantity</th><th>Placed</th><th>Status</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.order_number}</strong></td><td>{order.customer_name || '—'}</td><td>{order.product_sku || '—'} {order.product_name && `· ${order.product_name}`}</td><td>{order.quantity_ordered}</td><td>{new Date(order.ordered_at).toLocaleDateString()}</td><td><span className="badge blue">{order.status}</span></td></tr>)}</tbody></table>{orders.length === 0 && <div className="empty-state">No orders yet. Create the first one above.</div>}</div></section>
  </>;
}