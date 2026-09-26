"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Download, PackageCheck, RefreshCw, TriangleAlert, Truck } from 'lucide-react';

type Product = { id?: string; sku: string; name: string; current_stock?: number; stock?: number; reorder_level?: number; reorder?: number };
type Job = { id?: string; job?: string; job_number?: string; product?: string; product_sku?: string; manufacturer: string; qty?: number; quantity_sent?: number; days?: number; days_remaining?: number; expected_return_date?: string };

function Badge({ days }: { days: number }) {
  return <span className={`badge ${days < 0 ? 'red' : days <= 3 ? 'amber' : 'blue'}`}>{days < 0 ? 'Overdue' : days <= 3 ? 'Due soon' : 'On track'}</span>;
}

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      const [productsResponse, jobsResponse] = await Promise.all([fetch('/api/products'), fetch('/api/jobs')]);
      if (!productsResponse.ok || !jobsResponse.ok) throw new Error('The inventory service could not be reached.');
      const [nextProducts, nextJobs] = await Promise.all([productsResponse.json(), jobsResponse.json()]);
      setProducts(nextProducts);
      setJobs(nextJobs);
      setLastUpdated(new Date());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Could not refresh inventory.');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([fetch('/api/products'), fetch('/api/jobs')])
      .then(async ([productsResponse, jobsResponse]) => {
        if (!productsResponse.ok || !jobsResponse.ok) throw new Error('The inventory service could not be reached.');
        return Promise.all([productsResponse.json(), jobsResponse.json()]);
      })
      .then(([nextProducts, nextJobs]) => {
        if (!active) return;
        setProducts(nextProducts);
        setJobs(nextJobs);
        setLastUpdated(new Date());
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load inventory.');
      });
    return () => { active = false; };
  }, []);

  const lowStock = products.filter((product) => (product.current_stock ?? product.stock ?? 0) <= (product.reorder_level ?? product.reorder ?? 0));
  const urgentJobs = jobs.filter((job) => (job.days_remaining ?? job.days ?? 0) <= 3);
  const trackedUnits = products.reduce((total, product) => total + (product.current_stock ?? product.stock ?? 0), 0);

  return <>
    <header className="top">
      <div><div className="eyebrow">Thursday, 25 September 2026</div><h1>Good morning, Amonroo</h1><div className="muted">Here is the current pulse of your inventory operation.</div></div>
      <div className="top-actions"><span className="muted update-note">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Loading live data'}</span><button className="button secondary" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /> Refresh</button><a className="button secondary" href="/api/export"><Download size={15} /> Export</a><Link className="button" href="/products"><PackageCheck size={15} /> Add product</Link></div>
    </header>
    {error && <div className="form-error dashboard-error"><TriangleAlert size={15} /> {error}<button className="button secondary compact" onClick={() => void refresh()}>Try again</button></div>}
    <div className="grid">
      <div className="card stat-card"><div className="label">Products tracked</div><div className="metric">{products.length}</div><div className="metric-note">Across your catalogue</div></div>
      <div className="card stat-card warning"><div className="label">Low stock alerts</div><div className="metric">{lowStock.length}</div><div className="metric-note">Needs a replenishment look</div></div>
      <div className="card stat-card"><div className="label">Units on hand</div><div className="metric">{trackedUnits.toLocaleString()}</div><div className="metric-note">Current available inventory</div></div>
      <div className="card stat-card alert"><div className="label">Jobs needing attention</div><div className="metric">{urgentJobs.length}</div><div className="metric-note">Due soon or overdue</div></div>
    </div>
    <section className="section"><div className="section-heading"><div><div className="eyebrow">Inventory health</div><h2>Stock overview</h2></div><Link className="button secondary" href="/products">View all <ArrowUpRight size={14} /></Link></div>
      <div className="tablebox"><div className="table-caption">A live view of products closest to their reorder threshold.</div><table className="table"><thead><tr><th>SKU</th><th>Product</th><th>Stock</th><th>Reorder</th><th>Status</th></tr></thead>
        <tbody>{products.map((product) => { const stock = product.current_stock ?? product.stock ?? 0; const reorder = product.reorder_level ?? product.reorder ?? 0; return <tr key={product.id ?? product.sku}><td><strong>{product.sku}</strong></td><td>{product.name}</td><td>{stock}</td><td>{reorder}</td><td><span className={`badge ${stock <= reorder ? 'red' : 'green'}`}>{stock <= reorder ? 'Low stock' : 'Healthy'}</span></td></tr>; })}</tbody>
      </table>{products.length === 0 && <div className="empty-state">No products have been added yet.</div>}</div>
    </section>
    <section className="section"><div className="section-heading"><div><div className="eyebrow">Production pipeline</div><h2>Manufacturer process</h2></div><Link className="button secondary" href="/jobs"><Truck size={14} /> Manage jobs</Link></div>
      <div className="tablebox"><table className="table"><thead><tr><th>Job</th><th>Product</th><th>Manufacturer</th><th>Qty</th><th>Deadline</th><th>Urgency</th></tr></thead>
        <tbody>{jobs.map((job) => { const days = job.days_remaining ?? job.days ?? 0; return <tr key={job.id ?? job.job}><td><strong>{job.job_number ?? job.job}</strong></td><td>{job.product_sku ?? job.product}</td><td>{job.manufacturer}</td><td>{job.quantity_sent ?? job.qty}</td><td>{job.expected_return_date ?? `${days} days`}</td><td><Badge days={days} /></td></tr>; })}</tbody>
      </table>{jobs.length === 0 && <div className="empty-state"><TriangleAlert size={20} /><div>No manufacturer jobs are in the pipeline.</div></div>}</div>
    </section>
  </>;
}