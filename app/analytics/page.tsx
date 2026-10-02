"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Boxes, ClipboardList, PackageX, RefreshCw, ShoppingBag, TrendingDown, Truck } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, Brush, CartesianGrid, Cell, Legend, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import TableScroll from '../components/table-scroll';

type Product = {
  id?: string;
  sku: string;
  name: string;
  current_stock?: number;
  stock?: number;
  reorder_level?: number;
  reorder?: number;
  shortage?: number;
};

type Order = {
  id: string;
  order_number: string;
  customer_name?: string;
  ordered_at: string;
  status: string;
  order_source?: string;
  payment_method?: string;
  delivery_method?: string;
  delivery_city?: string;
  is_open?: boolean;
  currency?: string;
  total_price?: number;
  payment_done?: number;
  quantity_ordered: number;
  line_count?: number;
  products?: { sku?: string; name?: string; quantity: number; unit_price?: number; currency?: string }[];
};

type Job = {
  id?: string;
  job?: string;
  job_number?: string;
  product?: string;
  product_sku?: string;
  manufacturer: string;
  quantity_sent?: number;
  quantity_received?: number;
  quantity_rejected?: number;
  quantity_outstanding?: number;
  expected_return_date?: string;
  allocation_date?: string;
  received_at?: string;
  status?: string;
  total_payment?: number;
  amount_paid?: number;
};

type AnalyticsData = { products: Product[]; orders: Order[]; jobs: Job[]; jobsSource: string };
type Period = 7 | 30 | 90;
type RowLimit = 12 | 50 | 'all';
type OrderBreakdown = { label: string; orders: number };

const EMPTY_DATA: AnalyticsData = { products: [], orders: [], jobs: [], jobsSource: 'unknown' };
const CHART_COLORS = ['#087f78', '#d9684e', '#c89122', '#5479a6', '#8a68a5', '#55a68a', '#7c8c91', '#db9b80'];

function stockOnHand(product: Product) { return product.current_stock ?? product.stock ?? 0; }
function reorderLevel(product: Product) { return product.reorder_level ?? product.reorder ?? 0; }
function orderIsOpen(order: Order) { return order.is_open ?? !/complete|fulfilled|delivered|cancel|closed|finished|done|\brto\b/i.test(order.status); }

function dateKey(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function shortDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function number(value: number) { return value.toLocaleString(); }

function orderBreakdown(orders: Order[], getValue: (order: Order) => string | undefined): OrderBreakdown[] {
  const grouped = new Map<string, OrderBreakdown>();
  for (const order of orders) {
    const rawLabel = getValue(order)?.trim() || '';
    const label = ['-', '—', 'n/a', 'not available'].includes(rawLabel.toLocaleLowerCase()) ? 'Not provided' : rawLabel || 'Not provided';
    const key = label.toLocaleLowerCase();
    const entry = grouped.get(key);
    if (entry) entry.orders += 1;
    else grouped.set(key, { label, orders: 1 });
  }

  const ranked = [...grouped.values()].sort((left, right) => right.orders - left.orders || left.label.localeCompare(right.label));
  if (ranked.length <= 8) return ranked;
  const visible = ranked.slice(0, 7);
  visible.push({ label: 'Other', orders: ranked.slice(7).reduce((sum, item) => sum + item.orders, 0) });
  return visible;
}

function currencyAmount(value: number, currencyCode?: string) {
  if (!currencyCode) return number(value);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currencyCode} ${number(value)}`;
  }
}

function compactCurrency(value: number, currencyCode?: string) {
  if (!currencyCode) return number(value);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currencyCode,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `${currencyCode} ${number(value)}`;
  }
}

function activeManufacturingJob(job: Job) {
  if (['received', 'cancelled'].includes((job.status ?? '').toLowerCase())) return false;
  return (job.quantity_outstanding ?? Math.max((job.quantity_sent ?? 0) - (job.quantity_received ?? 0) - (job.quantity_rejected ?? 0), 0)) > 0;
}

function dueTone(value?: string) {
  if (!value) return 'blue';
  const days = Math.ceil((new Date(`${value.slice(0, 10)}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
  return days < 0 ? 'red' : days <= 3 ? 'amber' : 'blue';
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData>(EMPTY_DATA);
  const [period, setPeriod] = useState<Period>(30);
  const [currency, setCurrency] = useState('all');
  const [jobStatusFilter, setJobStatusFilter] = useState('');
  const [designFilter, setDesignFilter] = useState('');
  const [search, setSearch] = useState('');
  const [rowLimit, setRowLimit] = useState<RowLimit>(12);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestInProgress = useRef(false);

  const refresh = useCallback(async (showLoading: boolean) => {
    if (requestInProgress.current) return;
    requestInProgress.current = true;
    if (showLoading) setLoading(true);
    setRefreshing(true);
    try {
      const responses = await Promise.all([
        fetch('/api/orders', { cache: 'no-store' }),
        fetch('/api/products', { cache: 'no-store' }),
        fetch('/api/jobs', { cache: 'no-store' }),
      ]);
      const [ordersResult, productsResult, jobsResult] = await Promise.all(responses.map((response) => response.json()));
      const failed = responses.findIndex((response) => !response.ok);
      if (failed !== -1) {
        const result = [ordersResult, productsResult, jobsResult][failed];
        throw new Error(result.error || 'Could not load analytics data.');
      }
      setData({
        orders: ordersResult,
        products: productsResult,
        jobs: jobsResult,
        jobsSource: responses[2].headers.get('X-Data-Source') || 'app',
      });
      setCurrency((current) => current === 'all' && ordersResult.length ? 'all' : current);
      setError('');
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load analytics data.');
    } finally {
      requestInProgress.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const load = async (showLoading: boolean) => {
      if (!active) return;
      await refresh(showLoading);
    };
    void load(true);
    const interval = window.setInterval(() => void load(false), 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [refresh, refreshKey]);

  const currencies = useMemo(() => [...new Set(data.orders.map((order) => order.currency).filter((value): value is string => Boolean(value)))].sort(), [data.orders]);
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (period - 1));
  const startKey = cutoff.toISOString().slice(0, 10);
  const periodOrders = useMemo(() => data.orders.filter((order) => dateKey(order.ordered_at) >= startKey), [data.orders, startKey]);
  const openOrders = data.orders.filter(orderIsOpen);
  const currentJobs = data.jobs.filter(activeManufacturingJob);
  const overdueJobs = currentJobs.filter((job) => job.expected_return_date && job.expected_return_date.slice(0, 10) < new Date().toISOString().slice(0, 10));
  const lowStock = data.products.filter((product) => stockOnHand(product) > 0 && stockOnHand(product) <= reorderLevel(product));
  const outOfStock = data.products.filter((product) => stockOnHand(product) <= 0);
  const totalStock = data.products.reduce((sum, product) => sum + stockOnHand(product), 0);
  const outstandingManufacturingUnits = currentJobs.reduce((sum, job) => sum + (job.quantity_outstanding ?? Math.max((job.quantity_sent ?? 0) - (job.quantity_received ?? 0) - (job.quantity_rejected ?? 0), 0)), 0);
  const selectedCurrency = currency === 'all' ? currencies[0] : currency;
  const currencyOrders = periodOrders.filter((order) => order.currency === selectedCurrency);
  const orderValue = currencyOrders.reduce((sum, order) => sum + (order.total_price || 0), 0);
  const collectedValue = currencyOrders.reduce((sum, order) => sum + (order.payment_done || 0), 0);
  const remainingValue = Math.max(orderValue - collectedValue, 0);

  const orderTrend = useMemo(() => {
    const grouped = new Map<string, { date: string; orders: number; units: number; orderValue: number }>();
    for (let offset = 0; offset < period; offset += 1) {
      const keyDate = new Date(`${startKey}T00:00:00.000Z`);
      keyDate.setUTCDate(keyDate.getUTCDate() + offset);
      const key = keyDate.toISOString().slice(0, 10);
      grouped.set(key, { date: key, orders: 0, units: 0, orderValue: 0 });
    }
    for (const order of periodOrders) {
      const key = dateKey(order.ordered_at);
      const entry = grouped.get(key);
      if (!entry) continue;
      entry.orders += 1;
      entry.units += order.quantity_ordered || 0;
      if (order.currency === selectedCurrency) entry.orderValue += order.total_price || 0;
    }
    return [...grouped.values()];
  }, [period, periodOrders, selectedCurrency, startKey]);

  const selectedCurrencyOrders = useMemo(
    () => periodOrders.filter((order) => !selectedCurrency || order.currency === selectedCurrency),
    [periodOrders, selectedCurrency],
  );
  const cityBreakdown = useMemo(() => orderBreakdown(selectedCurrencyOrders, (order) => order.delivery_city), [selectedCurrencyOrders]);
  const sourceBreakdown = useMemo(() => orderBreakdown(selectedCurrencyOrders, (order) => order.order_source), [selectedCurrencyOrders]);
  const paymentBreakdown = useMemo(() => orderBreakdown(selectedCurrencyOrders, (order) => order.payment_method), [selectedCurrencyOrders]);
  const deliveryBreakdown = useMemo(() => orderBreakdown(selectedCurrencyOrders, (order) => order.delivery_method), [selectedCurrencyOrders]);

  const inventoryRisk = useMemo(() => [...data.products]
    .sort((left, right) => {
      const leftStock = stockOnHand(left);
      const rightStock = stockOnHand(right);
      if ((leftStock <= 0) !== (rightStock <= 0)) return leftStock <= 0 ? -1 : 1;
      return (right.shortage ?? Math.max(reorderLevel(right) - rightStock, 0)) - (left.shortage ?? Math.max(reorderLevel(left) - leftStock, 0));
    })
    .slice(0, 12)
    .map((product) => ({
      sku: product.sku,
      label: product.name && product.name !== product.sku ? `${product.sku} · ${product.name}` : product.sku,
      available: stockOnHand(product),
      threshold: reorderLevel(product),
    })), [data.products]);

  const manufacturingStatus = (() => {
    const grouped = new Map<string, number>();
    for (const job of currentJobs) {
      const status = job.status || 'unknown';
      grouped.set(status, (grouped.get(status) ?? 0) + 1);
    }
    return [...grouped].map(([status, jobs]) => ({ status, jobs }));
  })();

  const filteredJobs = currentJobs.filter((job) => {
    if (jobStatusFilter && (job.status || 'unknown') !== jobStatusFilter) return false;
    const term = search.trim().toLowerCase();
    return !term || [job.job_number, job.job, job.product_sku, job.product, job.manufacturer, job.status]
      .some((value) => String(value ?? '').toLowerCase().includes(term));
  });
  const filteredInventory = data.products.filter((product) => {
    if (designFilter && product.sku !== designFilter) return false;
    const term = search.trim().toLowerCase();
    return !term || [product.sku, product.name].some((value) => String(value ?? '').toLowerCase().includes(term));
  }).sort((left, right) => stockOnHand(left) - stockOnHand(right));
  const filteredOrders = periodOrders.filter((order) => {
    const term = search.trim().toLowerCase();
    return !term || [order.order_number, order.customer_name, order.status, order.id, ...(order.products ?? []).flatMap((product) => [product.sku, product.name])]
      .some((value) => String(value ?? '').toLowerCase().includes(term));
  });
  const visibleInventory = rowLimit === 'all' ? filteredInventory : filteredInventory.slice(0, rowLimit);
  const visibleOrders = rowLimit === 'all' ? filteredOrders : filteredOrders.slice(0, rowLimit);
  const visibleJobs = rowLimit === 'all' ? filteredJobs : filteredJobs.slice(0, rowLimit);

  return <>
    <header className="top dashboard-header">
      <div><div className="eyebrow">Live performance centre</div><h1>Analytics</h1><div className="muted">Orders, design availability, and manufacturing workload in one live view.</div></div>
      <div className="top-actions"><span className="muted update-note">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Loading live data'}</span><button className="button secondary" onClick={() => setRefreshKey((key) => key + 1)} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /> Refresh</button></div>
    </header>
    {error && <div className="form-error dashboard-error"><AlertTriangle size={15} /> {error}<button className="button secondary compact" onClick={() => setRefreshKey((key) => key + 1)}>Try again</button></div>}
    {data.jobsSource === 'sample' && <div className="analytics-source-note"><AlertTriangle size={15} /> Manufacturing charts use sample jobs until Supabase is configured. Orders and designs are live from BaseLinker.</div>}

    <section className="analytics-controls" aria-label="Analytics filters">
      <div className="analytics-period" aria-label="Order date range">
        {([7, 30, 90] as const).map((days) => <button className={period === days ? 'active' : ''} key={days} onClick={() => setPeriod(days)}>{days} days</button>)}
      </div>
      <label>Sales currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="all">{currencies[0] ? `Default · ${currencies[0]}` : 'Default currency'}</option>{currencies.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="analytics-search">Filter detail tables<input type="search" placeholder="Order, design, manufacturer..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label>Rows per table<select value={rowLimit} onChange={(event) => setRowLimit(event.target.value === 'all' ? 'all' : event.target.value === '50' ? 50 : 12)}><option value={12}>12 rows</option><option value={50}>50 rows</option><option value="all">All matching rows</option></select></label>
    </section>

    <section className="analytics-metrics">
      <article className="card stat-card"><div className="label"><ShoppingBag size={14} /> Orders · {period} days</div><div className="metric">{number(periodOrders.length)}</div><div className="metric-note">{number(openOrders.length)} current in loaded 90-day history</div></article>
      <article className="card stat-card"><div className="label"><TrendingDown size={14} /> Order units · {period} days</div><div className="metric">{number(periodOrders.reduce((sum, order) => sum + (order.quantity_ordered || 0), 0))}</div><div className="metric-note">Across all order statuses</div></article>
      <article className="card stat-card"><div className="label"><Boxes size={14} /> Design catalogue</div><div className="metric">{number(data.products.length)}</div><div className="metric-note">{number(totalStock)} units available across catalogue</div></article>
      <article className="card stat-card warning"><div className="label"><AlertTriangle size={14} /> Low stock</div><div className="metric">{number(lowStock.length)}</div><div className="metric-note">Available stock above zero, at/below threshold</div></article>
      <article className="card stat-card alert"><div className="label"><PackageX size={14} /> Out of stock</div><div className="metric">{number(outOfStock.length)}</div><div className="metric-note">No available units</div></article>
      <article className="card stat-card"><div className="label"><Truck size={14} /> Manufacturing outstanding</div><div className="metric">{number(outstandingManufacturingUnits)}</div><div className="metric-note">{number(currentJobs.length)} active jobs · {number(overdueJobs.length)} overdue</div></article>
    </section>

    <section className="analytics-sales-summary" aria-label="Order value summary">
      <div className="analytics-sales-heading"><div><div className="eyebrow">Sales snapshot · {period} days</div><h2>{selectedCurrency || 'Order value'}</h2></div><span className="muted">Amounts shown in one currency only</span></div>
      <div className="analytics-sales-metrics">
        <article><span>Order value</span><strong>{currencyAmount(orderValue, selectedCurrency)}</strong><small>{currencyOrders.length} orders in selected currency</small></article>
        <article><span>Paid</span><strong>{currencyAmount(collectedValue, selectedCurrency)}</strong><small>Payments received</small></article>
        <article><span>Balance</span><strong>{currencyAmount(remainingValue, selectedCurrency)}</strong><small>Order value less payments received</small></article>
      </div>
    </section>

    <section className="analytics-chart-grid">
      <article className="card analytics-chart-card">
        <div className="section-heading"><div><div className="eyebrow">Customer demand</div><h2>Orders and value over time</h2><p className="analytics-chart-description">Daily orders, units sold, and order value{selectedCurrency ? ` in ${selectedCurrency}` : ''}.</p></div><span className="badge blue">{periodOrders.length} orders</span></div>
        <div className="analytics-chart">
          {loading ? <div className="empty-state">Loading order activity...</div> : <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={orderTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs><linearGradient id="orderFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#087f78" stopOpacity={0.28} /><stop offset="95%" stopColor="#087f78" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid stroke="#e6eeea" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(value: string) => shortDate(value)} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis yAxisId="left" allowDecimals={false} axisLine={false} tickLine={false} width={38} />
              {selectedCurrency && <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} width={74} tickFormatter={(value: number) => compactCurrency(value, selectedCurrency)} />}
              <Tooltip
                cursor={{ stroke: '#8aa39a', strokeDasharray: '4 4' }}
                labelFormatter={(value) => shortDate(String(value))}
                formatter={(value, name) => name === `Value · ${selectedCurrency}`
                  ? [currencyAmount(Number(value), selectedCurrency), `Order value · ${selectedCurrency}`]
                  : [number(Number(value)), name === 'Orders' ? 'Orders' : 'Units']}
                contentStyle={{ border: '1px solid #dfe7e2', borderRadius: 12, boxShadow: '0 12px 32px rgba(28, 52, 55, 0.14)', padding: '12px 14px' }}
                labelStyle={{ color: '#18252a', fontWeight: 750, marginBottom: 7 }}
              />
              <Legend />
              <Area yAxisId="left" type="monotone" dataKey="orders" name="Orders" stroke="#087f78" strokeWidth={2.5} fill="url(#orderFill)" activeDot={{ r: 5, strokeWidth: 0 }} />
              <Area yAxisId="left" type="monotone" dataKey="units" name="Units" stroke="#c89122" strokeWidth={2} fill="transparent" activeDot={{ r: 4, strokeWidth: 0 }} />
              {selectedCurrency && <Area yAxisId="right" type="monotone" dataKey="orderValue" name={`Value · ${selectedCurrency}`} stroke="#d9684e" strokeWidth={2.5} fill="transparent" activeDot={{ r: 5, strokeWidth: 0 }} />}
              {period === 90 && <Brush dataKey="date" height={22} stroke="#087f78" tickFormatter={(value: string) => value.slice(5)} />}
            </AreaChart>
          </ResponsiveContainer>}
        </div>
      </article>
      <article className="card analytics-chart-card">
        <div className="section-heading"><div><div className="eyebrow">Stock position</div><h2>Lowest stock vs threshold</h2></div><button className="text-button" onClick={() => setDesignFilter('')}>Clear design filter</button></div>
        <div className="analytics-chart">
          {loading ? <div className="empty-state">Loading inventory...</div> : <ResponsiveContainer width="100%" height="100%">
            <BarChart data={inventoryRisk} margin={{ top: 8, right: 8, left: 0, bottom: 36 }}>
              <CartesianGrid stroke="#e6eeea" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="sku" angle={-28} textAnchor="end" interval={0} height={54} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={38} />
              <Tooltip labelFormatter={(value) => inventoryRisk.find((item) => item.sku === value)?.label || String(value)} formatter={(value, name) => [number(Number(value)), name === 'available' ? 'Available units' : 'Low-stock threshold']} />
              <Legend />
              <Bar dataKey="available" name="Available units" fill="#087f78" radius={[5, 5, 0, 0]} cursor="pointer">{inventoryRisk.map((item) => <Cell key={item.sku} fill={item.available <= 0 ? '#d9684e' : item.available <= item.threshold ? '#c89122' : '#087f78'} onClick={() => setDesignFilter((current) => current === item.sku ? '' : item.sku)} />)}</Bar>
              <Bar dataKey="threshold" name="Threshold" fill="#a8b8b2" radius={[5, 5, 0, 0]} cursor="pointer">{inventoryRisk.map((item) => <Cell key={item.sku} onClick={() => setDesignFilter((current) => current === item.sku ? '' : item.sku)} />)}</Bar>
              <ReferenceLine y={0} stroke="#d9684e" />
            </BarChart>
          </ResponsiveContainer>}
        </div>
        <p className="chart-hint">Select a bar to filter the stock detail table. Low stock uses each product threshold or the 5-unit fallback.</p>
      </article>
      <article className="card analytics-chart-card">
        <div className="section-heading"><div><div className="eyebrow">Production pipeline</div><h2>Active manufacturing by status</h2></div><span className="muted">{currentJobs.length} active jobs</span></div>
        <div className="analytics-chart analytics-donut">
          {loading ? <div className="empty-state">Loading manufacturing...</div> : manufacturingStatus.length === 0 ? <div className="empty-state">No active manufacturing jobs.</div> : <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={manufacturingStatus} dataKey="jobs" nameKey="status" innerRadius="54%" outerRadius="78%" paddingAngle={3} onClick={(_, index) => {
                const status = manufacturingStatus[index]?.status;
                if (status) setJobStatusFilter((current) => current === status ? '' : status);
              }} cursor="pointer">
                {manufacturingStatus.map((item, index) => <Cell key={item.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value) => [`${value} jobs`, 'Active jobs']} />
              <Legend onClick={(entry) => setJobStatusFilter((current) => current === entry.value ? '' : String(entry.value))} />
            </PieChart>
          </ResponsiveContainer>}
        </div>
        <p className="chart-hint">Select a segment or status label to filter manufacturing details.</p>
      </article>
    </section>

    <section className="section card analytics-detail-card">
      <div className="section-heading"><div><div className="eyebrow">Live operations</div><h2>Order details · {period} days</h2></div><span className="muted">Showing {visibleOrders.length} of {filteredOrders.length} matching orders</span></div>
      <TableScroll><table className="table analytics-table"><thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Items</th><th>Units</th><th>Value</th><th>Paid</th><th>Status</th></tr></thead>
        <tbody>{visibleOrders.map((order) => <tr key={order.id}><td><strong>#{order.order_number}</strong><small className="order-subline">BL ID {order.id}</small></td><td>{shortDate(order.ordered_at)}</td><td>{order.customer_name || '—'}</td><td>{order.line_count ?? order.products?.length ?? 0}</td><td>{number(order.quantity_ordered || 0)}</td><td>{currencyAmount(order.total_price || 0, order.currency)}</td><td>{currencyAmount(order.payment_done || 0, order.currency)}</td><td><span className={`badge ${orderIsOpen(order) ? 'amber' : 'green'}`}>{order.status}</span></td></tr>)}</tbody>
      </table>{!loading && filteredOrders.length === 0 && <div className="empty-state">No orders found for this period or search.</div>}</TableScroll>
    </section>

    <section className="analytics-order-insights" aria-label="Order customer and fulfillment insights">
      <div className="analytics-insights-heading">
        <div><div className="eyebrow">Customer &amp; fulfillment insights</div><h2>Where orders come from</h2><p>Breakdowns from {selectedCurrencyOrders.length} orders in the selected period and currency.</p></div>
        <span className="badge blue">Live BaseLinker data</span>
      </div>
      <div className="analytics-insights-grid">
        {([
          { title: 'Delivery city', description: 'Customer delivery locations', data: cityBreakdown },
          { title: 'Order source', description: 'Sales channels recorded on orders', data: sourceBreakdown },
          { title: 'Payment method', description: 'Payment options used by customers', data: paymentBreakdown },
          { title: 'Delivery method', description: 'Shipping options selected', data: deliveryBreakdown },
        ]).map(({ title, description, data: breakdown }) => (
          <article className="card analytics-chart-card" key={title}>
            <div className="section-heading"><div><div className="eyebrow">{description}</div><h2>{title}</h2></div></div>
            <div className="analytics-insight-chart">
              {loading ? <div className="empty-state">Loading order breakdown...</div> : breakdown.length === 0 ? <div className="empty-state">No order data for this period.</div> : <ResponsiveContainer width="100%" height="100%">
                <BarChart data={breakdown} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid stroke="#e6eeea" strokeDasharray="4 4" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={126} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [`${number(Number(value))} orders`, 'Orders']} />
                  <Bar dataKey="orders" name="Orders" fill="#087f78" radius={[0, 5, 5, 0]} maxBarSize={24}>
                    {breakdown.map((item, index) => <Cell key={item.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>}
            </div>
            <p className="chart-hint">Hover for order counts. Unavailable API values appear as “Not provided”.</p>
          </article>
        ))}
      </div>
      <p className="analytics-demographics-note"><AlertTriangle size={15} /> Age and gender are not included in the BaseLinker order data connected to this page, so demographic charts cannot be shown reliably.</p>
    </section>

    <section className="analytics-detail-grid">
      <article className="section card analytics-detail-card">
        <div className="section-heading"><div><div className="eyebrow">Design availability</div><h2>Inventory at risk</h2></div><span className="badge amber">{lowStock.length + outOfStock.length} at risk</span></div>
        <TableScroll><table className="table analytics-table"><thead><tr><th>Design / product</th><th>Available</th><th>Threshold</th><th>Shortage</th><th>State</th></tr></thead>
          <tbody>{visibleInventory.map((product) => {
            const stock = stockOnHand(product);
            const threshold = reorderLevel(product);
            const shortage = product.shortage ?? Math.max(threshold - stock, 0);
            return <tr key={product.id ?? product.sku}><td><strong>{product.sku}</strong><small className="order-subline">{product.name}</small></td><td>{number(stock)}</td><td>{number(threshold)}</td><td>{number(shortage)}</td><td><span className={`badge ${stock <= 0 ? 'red' : stock <= threshold ? 'amber' : 'green'}`}>{stock <= 0 ? 'Out of stock' : stock <= threshold ? 'Low stock' : 'Available'}</span></td></tr>;
          })}</tbody>
        </table>{!loading && filteredInventory.length === 0 && <div className="empty-state">No designs match the current filter.</div>}</TableScroll>
      </article>

      <article className="section card analytics-detail-card">
        <div className="section-heading"><div><div className="eyebrow">Manufacturing operations</div><h2>Active jobs</h2></div><span className="badge blue"><ClipboardList size={13} /> {visibleJobs.length} of {currentJobs.length} jobs · {number(outstandingManufacturingUnits)} units due</span></div>
        <div className="analytics-table-meta">{data.jobsSource === 'sample' ? 'Sample records · configure Supabase for saved manufacturing data' : 'Saved manufacturing records'}{jobStatusFilter && <button className="text-button" onClick={() => setJobStatusFilter('')}>Clear status: {jobStatusFilter}</button>}</div>
        <TableScroll><table className="table analytics-table"><thead><tr><th>Job</th><th>Design</th><th>Manufacturer</th><th>Sent</th><th>Received</th><th>Outstanding</th><th>Expected delivery</th><th>Total payment</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>{visibleJobs.map((job) => {
            const sent = job.quantity_sent ?? 0;
            const received = job.quantity_received ?? 0;
            const outstanding = job.quantity_outstanding ?? Math.max(sent - received - (job.quantity_rejected ?? 0), 0);
            const totalPayment = job.total_payment ?? 0;
            const amountPaid = job.amount_paid ?? 0;
            return <tr key={job.id ?? job.job_number ?? job.job}><td><strong>{job.job_number ?? job.job ?? '—'}</strong></td><td>{job.product_sku ?? job.product ?? '—'}</td><td>{job.manufacturer}</td><td>{number(sent)}</td><td>{number(received)}</td><td>{number(outstanding)}</td><td>{shortDate(job.expected_return_date)}</td><td>{number(totalPayment)}</td><td>{number(amountPaid)}</td><td>{number(Math.max(totalPayment - amountPaid, 0))}</td><td><span className={`badge ${dueTone(job.expected_return_date)}`}>{(job.status || 'In progress').replaceAll('_', ' ')}</span></td></tr>;
          })}</tbody>
        </table>{!loading && filteredJobs.length === 0 && <div className="empty-state">No active manufacturing jobs match the selected filters.</div>}</TableScroll>
      </article>
    </section>
  </>;
}
