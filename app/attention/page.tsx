"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ArrowRight, Boxes, Truck } from 'lucide-react';
import TableScroll from '../components/table-scroll';

type Product = { id?: string; sku: string; name: string; current_stock?: number; stock?: number; reorder_level?: number; reorder?: number; shortage?: number };
type Job = { id?: string; job?: string; job_number?: string; product?: string; product_sku?: string; manufacturer: string; qty?: number; quantity_sent?: number; quantity_received?: number; quantity_outstanding?: number; days?: number; days_remaining?: number; expected_return_date?: string; status?: string };

function stockOnHand(product: Product) { return product.current_stock ?? product.stock ?? 0; }
function reorderLevel(product: Product) { return product.reorder_level ?? product.reorder ?? 0; }
function jobDays(job: Job) { return job.days_remaining ?? job.days ?? 0; }

function shortDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Attention() {
  const [products, setProducts] = useState<Product[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([fetch('/api/products', { cache: 'no-store' }), fetch('/api/jobs', { cache: 'no-store' })])
      .then(async ([productsResponse, jobsResponse]) => {
        if (!productsResponse.ok || !jobsResponse.ok) throw new Error('The attention queue could not be loaded.');
        return Promise.all([productsResponse.json(), jobsResponse.json()]);
      })
      .then(([nextProducts, nextJobs]) => {
        if (!active) return;
        setProducts(nextProducts);
        setJobs(nextJobs);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load the attention queue.');
      });
    return () => { active = false; };
  }, []);

  const designRisks = products.filter((product) => stockOnHand(product) <= reorderLevel(product)).sort((left, right) => stockOnHand(left) - stockOnHand(right));
  const manufacturingRisks = jobs.filter((job) => !['received', 'cancelled'].includes(job.status ?? '') && jobDays(job) <= 3).sort((left, right) => jobDays(left) - jobDays(right));

  return <>
    <header className="top"><div><div className="eyebrow">Action queue</div><h1>Attention needed</h1><div className="muted">Stock risks and manufacturing deliveries that need follow-up.</div></div><Link className="button secondary" href="/"><ArrowLeft size={15} /> Dashboard</Link></header>
    {error && <div className="form-error dashboard-error"><AlertTriangle size={15} /> {error}</div>}

    <div className="attention-summary"><span><Boxes size={16} /> {designRisks.length} designs at or below reorder level</span><span><Truck size={16} /> {manufacturingRisks.length} urgent manufacturing jobs</span></div>

    <section className="section dashboard-section"><div className="section-heading"><div><div className="eyebrow">Inventory action</div><h2>Designs to replenish</h2></div><Link className="text-link" href="/products">Open designs <ArrowRight size={14} /></Link></div>
      <TableScroll><table className="table"><thead><tr><th>Design ID</th><th>Design</th><th>Available</th><th>Reorder level</th><th>Shortage</th><th>Priority</th><th>Action</th></tr></thead>
        <tbody>{designRisks.map((product) => { const stock = stockOnHand(product); const reorder = reorderLevel(product); const shortage = product.shortage ?? Math.max(reorder - stock, 0); return <tr key={product.id ?? product.sku}><td><strong>{product.sku}</strong></td><td>{product.name}</td><td>{stock}</td><td>{reorder}</td><td>{shortage}</td><td><span className={`badge ${stock <= 0 ? 'red' : 'amber'}`}>{stock <= 0 ? 'Out of stock' : 'Low stock'}</span></td><td><Link className="text-link" href="/products">Review <ArrowRight size={13} /></Link></td></tr>; })}</tbody>
      </table>{designRisks.length === 0 && <div className="empty-state">No designs need replenishment.</div>}</TableScroll>
    </section>

    <section className="section dashboard-section"><div className="section-heading"><div><div className="eyebrow">Delivery action</div><h2>Manufacturing follow-up</h2></div><Link className="text-link" href="/jobs">Open manufacturing <ArrowRight size={14} /></Link></div>
      <TableScroll><table className="table"><thead><tr><th>Job</th><th>Design ID</th><th>Manufacturer</th><th>Outstanding</th><th>Expected delivery</th><th>Priority</th><th>Action</th></tr></thead>
        <tbody>{manufacturingRisks.map((job) => { const days = jobDays(job); const outstanding = job.quantity_outstanding ?? Math.max((job.quantity_sent ?? job.qty ?? 0) - (job.quantity_received ?? 0), 0); return <tr key={job.id ?? job.job}><td><strong>{job.job_number ?? job.job}</strong></td><td>{job.product_sku ?? job.product}</td><td>{job.manufacturer}</td><td>{outstanding}</td><td>{shortDate(job.expected_return_date)}</td><td><span className={`badge ${days < 0 ? 'red' : 'amber'}`}>{days < 0 ? 'Overdue' : 'Due soon'}</span></td><td><Link className="text-link" href="/jobs">Review <ArrowRight size={13} /></Link></td></tr>; })}</tbody>
      </table>{manufacturingRisks.length === 0 && <div className="empty-state">No urgent manufacturing deliveries.</div>}</TableScroll>
    </section>
  </>;
}