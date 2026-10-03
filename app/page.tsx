"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Boxes, ClipboardCheck, Download, PackageX, RefreshCw, ShoppingBag, Truck } from 'lucide-react';
import TableScroll from './components/table-scroll';

type Product = { id?: string; sku: string; name: string; current_stock?: number; stock?: number; reorder_level?: number; reorder?: number; shortage?: number };
type Job = { id?: string; job?: string; job_number?: string; product?: string; product_sku?: string; manufacturer: string; qty?: number; quantity_sent?: number; quantity_received?: number; quantity_outstanding?: number; days?: number; days_remaining?: number; expected_return_date?: string; status?: string };
type Order = { id: string; order_number: string; customer_name?: string; ordered_at: string; deadline?: string | null; status: string; is_open?: boolean; product_sku?: string; product_name?: string; quantity_ordered: number; total_quantity?: number; outstanding_quantity?: number; line_count?: number };
type DashboardData = { products: Product[]; jobs: Job[]; orders: Order[] };

async function loadDashboard(): Promise<DashboardData> {
  const [productsResponse, jobsResponse, ordersResponse] = await Promise.all([
    fetch('/api/products', { cache: 'no-store' }),
    fetch('/api/jobs', { cache: 'no-store' }),
    fetch('/api/orders', { cache: 'no-store' }),
  ]);
  if (!productsResponse.ok || !jobsResponse.ok || !ordersResponse.ok) throw new Error('The operations data could not be reached.');
  const [products, jobs, orders] = await Promise.all([productsResponse.json(), jobsResponse.json(), ordersResponse.json()]);
  return { products, jobs, orders };
}

function stockOnHand(product: Product) { return product.current_stock ?? product.stock ?? 0; }
function reorderLevel(product: Product) { return product.reorder_level ?? product.reorder ?? 0; }
function jobDays(job: Job) { return job.days_remaining ?? job.days ?? 0; }

function shortDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function statusLabel(status: string) { return status.replaceAll('_', ' '); }

function statusTone(status: string) {
  if (status === 'fulfilled' || status === 'received') return 'green';
  if (status === 'cancelled' || status === 'overdue') return 'red';
  if (status === 'partially_fulfilled' || status === 'partially_received' || status === 'in_production') return 'amber';
  return 'blue';
}

function urgencyLabel(days: number) { return days < 0 ? 'Overdue' : days <= 3 ? 'Due soon' : days <= 7 ? 'This week' : 'On track'; }
function urgencyTone(days: number) { return days < 0 ? 'red' : days <= 3 ? 'amber' : 'blue'; }

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>({ products: [], jobs: [], orders: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    async function update() {
      try {
        const snapshot = await loadDashboard();
        if (!active) return;
        setData(snapshot);
        setLastUpdated(new Date());
        setError('');
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load operations data.');
      }
    }
    void update();
    const interval = window.setInterval(() => void update(), 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      setData(await loadDashboard());
      setLastUpdated(new Date());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Could not refresh operations data.');
    } finally {
      setRefreshing(false);
    }
  }

  const outOfStock = data.products.filter((product) => stockOnHand(product) <= 0);
  const lowStock = data.products.filter((product) => stockOnHand(product) > 0 && stockOnHand(product) <= reorderLevel(product));
  const stockAtRisk = data.products.filter((product) => stockOnHand(product) <= reorderLevel(product)).sort((left, right) => stockOnHand(left) - stockOnHand(right));
  const openOrders = data.orders.filter((order) => order.is_open ?? !['fulfilled', 'cancelled'].includes(order.status));
  const demandUnits = openOrders.reduce((total, order) => total + (order.outstanding_quantity ?? order.quantity_ordered ?? 0), 0);
  const attentionJobs = data.jobs.filter((job) => !['received', 'cancelled'].includes(job.status ?? '') && jobDays(job) <= 3);
  const watchJobs = data.jobs.filter((job) => !['received', 'cancelled'].includes(job.status ?? '')).sort((left, right) => jobDays(left) - jobDays(right)).slice(0, 5);
  const recentOrders = [...data.orders].sort((left, right) => new Date(right.ordered_at).getTime() - new Date(left.ordered_at).getTime()).slice(0, 5);
  const attentionTotal = outOfStock.length + lowStock.length + attentionJobs.length;
  const designAndManufacturingAttention = stockAtRisk.length + attentionJobs.length;

  return <>
    <header className="top dashboard-header"><div><div className="eyebrow">Operations overview · {new Date().toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}</div><h1>Inventory overview</h1><div className="muted">Stock, customer demand, orders, and production in one working view.</div></div><div className="top-actions"><span className="muted update-note">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Loading live data'}</span><button className="button secondary" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /> Refresh</button><a className="button secondary" href="/api/export"><Download size={15} /> Export</a></div></header>
    {error && <div className="form-error dashboard-error"><AlertTriangle size={15} /> {error}<button className="button secondary compact" onClick={() => void refresh()}>Try again</button></div>}

    <div className="dashboard-metrics">
      <Link className="card stat-card dashboard-stat" href="/products"><div className="label"><Boxes size={14} /> Designs</div><div className="metric">{data.products.length}</div><div className="metric-note">In the catalogue</div></Link>
      <Link className="card stat-card alert dashboard-stat" href="/attention"><div className="label"><PackageX size={14} /> Out of stock</div><div className="metric">{outOfStock.length}</div><div className="metric-note">Designs with no units available</div></Link>
      <Link className="card stat-card warning dashboard-stat" href="/attention"><div className="label"><AlertTriangle size={14} /> Low stock</div><div className="metric">{lowStock.length}</div><div className="metric-note">At or below reorder level</div></Link>
      <Link className="card stat-card dashboard-stat" href="/orders"><div className="label"><ShoppingBag size={14} /> Current orders</div><div className="metric">{openOrders.length}</div><div className="metric-note">Active in the last 90 days</div></Link>
      <Link className="card stat-card dashboard-stat" href="/orders"><div className="label"><ClipboardCheck size={14} /> Demand</div><div className="metric">{demandUnits.toLocaleString()}</div><div className="metric-note">Units still unallocated</div></Link>
      <Link className="card stat-card alert dashboard-stat" href="/attention"><div className="label"><Truck size={14} /> Jobs needing attention</div><div className="metric">{designAndManufacturingAttention}</div><div className="metric-note">Design and manufacturing only <ArrowRight size={12} /></div></Link>
    </div>

    <div className={`dashboard-attention ${attentionTotal ? 'has-attention' : ''}`}><div className="dashboard-attention-icon"><AlertTriangle size={17} /></div><div><strong>{attentionTotal ? `${attentionTotal} items need a look` : 'No urgent stock or delivery issues'}</strong><div className="muted">{outOfStock.length} out of stock · {lowStock.length} low stock · {attentionJobs.length} urgent manufacturing jobs</div></div><Link className="button secondary compact" href="/attention">Review attention queue <ArrowRight size={14} /></Link></div>

    <div className="dashboard-grid">
      <section className="section dashboard-section"><div className="section-heading"><div><div className="eyebrow">Customer demand</div><h2>Recent orders</h2></div><Link className="text-link" href="/orders">All orders <ArrowRight size={14} /></Link></div>
        <TableScroll><table className="table"><thead><tr><th>Order</th><th>Customer</th><th>Lines</th><th>Units due</th><th>Deadline</th><th>Status</th></tr></thead><tbody>{recentOrders.map((order) => <tr key={order.id}><td><strong>{order.order_number}</strong></td><td>{order.customer_name || '—'}</td><td>{order.line_count ?? 1}</td><td>{order.outstanding_quantity ?? order.quantity_ordered}</td><td>{shortDate(order.deadline)}</td><td><span className={`badge ${statusTone(order.status)}`}>{statusLabel(order.status)}</span></td></tr>)}</tbody></table>{recentOrders.length === 0 && <div className="empty-state">No orders to show.</div>}</TableScroll>
      </section>
      <section className="section dashboard-section"><div className="section-heading"><div><div className="eyebrow">Availability</div><h2>Stock at risk</h2></div><Link className="text-link" href="/products">All designs <ArrowRight size={14} /></Link></div>
        <div className="dashboard-list">{stockAtRisk.slice(0, 6).map((product) => { const stock = stockOnHand(product); const reorder = reorderLevel(product); return <Link className="dashboard-list-row" href="/products" key={product.id ?? product.sku}><span className={`stock-signal ${stock <= 0 ? 'empty' : ''}`}>{stock <= 0 ? '0' : stock}</span><span className="dashboard-list-main"><strong>{product.sku}</strong><span>{product.name}</span></span><span className="dashboard-list-detail">Reorder {reorder}</span><ArrowRight size={14} /></Link>; })}{stockAtRisk.length === 0 && <div className="empty-state">All designs are above their reorder levels.</div>}</div>
      </section>
    </div>

    <section className="section dashboard-section"><div className="section-heading"><div><div className="eyebrow">Production</div><h2>Manufacturing watch</h2></div><Link className="text-link" href="/jobs">Manufacturing <ArrowRight size={14} /></Link></div>
      <TableScroll><table className="table"><thead><tr><th>Job</th><th>Design ID</th><th>Manufacturer</th><th>Outstanding</th><th>Expected delivery</th><th>Attention</th></tr></thead><tbody>{watchJobs.map((job) => { const days = jobDays(job); return <tr key={job.id ?? job.job}><td><strong>{job.job_number ?? job.job}</strong></td><td>{job.product_sku ?? job.product}</td><td>{job.manufacturer}</td><td>{job.quantity_outstanding ?? Math.max((job.quantity_sent ?? job.qty ?? 0) - (job.quantity_received ?? 0), 0)}</td><td>{shortDate(job.expected_return_date)}</td><td><span className={`badge ${urgencyTone(days)}`}>{urgencyLabel(days)}</span></td></tr>; })}</tbody></table>{watchJobs.length === 0 && <div className="empty-state">No manufacturing work in progress.</div>}</TableScroll>
    </section>

    <section className="dashboard-shortcuts" aria-label="Quick actions"><Link href="/orders"><ShoppingBag size={15} /> New order</Link><Link href="/products"><Boxes size={15} /> Add design</Link><Link href="/jobs"><Truck size={15} /> Manufacturing</Link></section>
  </>;
}