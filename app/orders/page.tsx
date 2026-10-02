"use client";

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, PackageSearch, RefreshCw, Search } from 'lucide-react';

type OrderLine = { sku?: string; name?: string; quantity: number; unit_price: number; currency: string };
type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  email: string;
  phone: string;
  ordered_at: string;
  confirmed_at: string;
  status: string;
  is_open: boolean;
  order_source: string;
  currency: string;
  total_price: number;
  payment_done: number;
  payment_method: string;
  delivery_method: string;
  tracking_number: string;
  delivery_city: string;
  quantity_ordered: number;
  line_count: number;
  products: OrderLine[];
};

function formatDate(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`.trim();
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    let inFlight = false;

    async function load(showLoading: boolean) {
      if (inFlight) return;
      inFlight = true;
      if (showLoading && active) setLoading(true);
      if (active) setRefreshing(true);
      try {
        const response = await fetch('/api/orders', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load BaseLinker orders.');
        if (active) {
          setOrders(result);
          setError('');
          setLastUpdated(new Date());
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load BaseLinker orders.');
      } finally {
        inFlight = false;
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void load(true);
    const interval = window.setInterval(() => void load(false), 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [refreshKey]);

  const statuses = useMemo(() => [...new Set(orders.map((order) => order.status))].sort(), [orders]);
  const openOrders = orders.filter((order) => order.is_open);
  const filteredOrders = orders.filter((order) => {
    if (statusFilter === 'open' && !order.is_open) return false;
    if (statusFilter !== 'all' && statusFilter !== 'open' && order.status !== statusFilter) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [
      order.order_number, order.id, order.customer_name, order.email, order.phone,
      order.status, order.order_source, order.delivery_method, order.delivery_city,
      ...order.products.flatMap((product) => [product.sku, product.name]),
    ].some((value) => String(value ?? '').toLowerCase().includes(term));
  });

  return <>
    <header className="top">
      <div><div className="eyebrow">BaseLinker · read-only live data</div><h1>Orders</h1><div className="muted">Recent orders and line-item details, refreshed automatically every minute.</div></div>
      <div className="top-actions">
        <span className="badge blue"><PackageSearch size={13} /> {openOrders.length} current · {orders.length} in 90 days</span>
        <button className="button secondary" onClick={() => setRefreshKey((key) => key + 1)} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /> Refresh now</button>
      </div>
    </header>
    <div className="orders-meta"><span><Clock3 size={14} /> {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Connecting to BaseLinker...'}</span><span>BaseLinker data is read-only here. Create or edit orders in BaseLinker.</span></div>
    {error && <div className="form-error dashboard-error"><AlertTriangle size={15} /> {error}<button className="button secondary compact" onClick={() => setRefreshKey((key) => key + 1)}>Try again</button></div>}
    <section className="section">
      <div className="table-tools">
        <label className="search-field"><Search size={16} /><input type="search" aria-label="Search live orders" placeholder="Search orders, customers, products..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <select aria-label="Filter orders by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All orders</option><option value="open">Current orders</option>
          {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <span className="muted search-count">{filteredOrders.length} of {orders.length} orders</span>
      </div>
      <div className="tablebox">
        <table className="table orders-table">
          <thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Channel</th><th>Items</th><th>Order total</th><th>Paid</th><th>Status</th><th>Details</th></tr></thead>
          <tbody>{filteredOrders.map((order) => <tr key={order.id}>
            <td><strong>#{order.order_number}</strong><small className="order-subline">BL ID {order.id}</small></td>
            <td>{formatDate(order.ordered_at)}</td>
            <td>{order.customer_name || '—'}{order.email && <small className="order-subline">{order.email}</small>}{order.phone && <small className="order-subline">{order.phone}</small>}</td>
            <td>{order.order_source || '—'}</td>
            <td>{order.line_count} lines · {order.quantity_ordered} units</td>
            <td>{formatMoney(order.total_price, order.currency)}</td>
            <td>{formatMoney(order.payment_done, order.currency)}</td>
            <td><span className={`badge ${order.is_open ? 'amber' : 'green'}`}>{order.status}</span></td>
            <td><details className="order-details">
              <summary>View</summary>
              <div className="order-detail-panel">
                <div><strong>Payment</strong><span>{order.payment_method || '—'}</span></div>
                <div><strong>Delivery</strong><span>{[order.delivery_method, order.delivery_city].filter(Boolean).join(' · ') || '—'}</span></div>
                {order.tracking_number && <div><strong>Tracking</strong><span>{order.tracking_number}</span></div>}
                {order.confirmed_at && <div><strong>Confirmed</strong><span>{formatDate(order.confirmed_at)}</span></div>}
                <strong className="order-lines-title">Items</strong>
                {order.products.map((product, index) => <div className="order-line" key={`${product.sku}-${index}`}>
                  <span>{product.sku || '—'} · {product.name || 'Product'}</span><span>{product.quantity} × {formatMoney(product.unit_price, product.currency)}</span>
                </div>)}
              </div>
            </details></td>
          </tr>)}</tbody>
        </table>
        {!loading && filteredOrders.length === 0 && <div className="empty-state">{error ? 'Order data is unavailable until the BaseLinker connection is restored.' : 'No orders match this search or status filter.'}</div>}
        {loading && <div className="empty-state">Loading live BaseLinker orders...</div>}
      </div>
    </section>
  </>;
}
