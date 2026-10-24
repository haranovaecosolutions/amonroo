"use client";

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';

type ConnectionCheck = { status: 'connected' | 'missing' | 'error' | 'configured'; message: string };
type SystemStatus = {
  checked_at: string;
  supabase: ConnectionCheck;
  baseLinker: ConnectionCheck;
  alerts: ConnectionCheck;
  cron: ConnectionCheck;
};

function isConnectionCheck(value: unknown): value is ConnectionCheck {
  return typeof value === 'object' && value !== null
    && 'status' in value && ['connected', 'missing', 'error', 'configured'].includes(String(value.status))
    && 'message' in value && typeof value.message === 'string';
}

function isSystemStatus(value: unknown): value is SystemStatus {
  return typeof value === 'object' && value !== null
    && 'checked_at' in value && typeof value.checked_at === 'string'
    && 'supabase' in value && isConnectionCheck(value.supabase)
    && 'baseLinker' in value && isConnectionCheck(value.baseLinker)
    && 'alerts' in value && isConnectionCheck(value.alerts)
    && 'cron' in value && isConnectionCheck(value.cron);
}

function StatusRow({ label, check }: { label: string; check: ConnectionCheck }) {
  const tone = check.status === 'connected' || check.status === 'configured'
    ? 'green'
    : check.status === 'missing' ? 'amber' : 'red';

  return <li>
    <span><strong>{label}</strong><span className="muted"> — {check.message}</span></span>
    <span className={`badge ${tone}`}>{check.status}</span>
  </li>;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error('Could not check deployment configuration.');
      if (!isSystemStatus(result)) throw new Error('The deployment returned an invalid status response.');
      setStatus(result);
      setError('');
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : 'Could not check deployment configuration.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => { window.clearTimeout(initialCheck); window.clearInterval(interval); };
  }, [refresh]);

  return <>
    <header className="top">
      <div><div className="eyebrow">Workspace administration</div><h1>Settings</h1><div className="muted">Check connections from the active deployment.</div></div>
      <div className="top-actions">
        <span className="muted update-note">{status ? `Checked ${new Date(status.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · every minute` : 'Checking connections'}</span>
        <button className="button secondary" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /> Check now</button>
        <span className="badge green"><ShieldCheck size={13} /> Secrets stay server-side</span>
      </div>
    </header>
    <section className="card">
      <div className="section-heading"><div><div className="eyebrow">Live deployment check</div><h2>Connection status</h2></div><KeyRound size={21} color="#087f78" /></div>
      {error && <div className="form-error"><TriangleAlert size={15} /> {error}</div>}
      {status
        ? <ul className="status-list">
          <StatusRow label="Supabase" check={status.supabase} />
          <StatusRow label="BaseLinker API" check={status.baseLinker} />
          <StatusRow label="Email alerts" check={status.alerts} />
          <StatusRow label="Vercel scheduled jobs" check={status.cron} />
        </ul>
        : !error && <p className="muted">Checking the configured services…</p>}
      <p>The check tests Supabase access and asks BaseLinker to validate the API token. It never returns or displays secret values. Email and cron checks confirm that their required variables are present.</p>
    </section>
    <section className="card section">
      <div className="section-heading"><div><div className="eyebrow">Vercel environment variables</div><h2>Required setup</h2></div></div>
      <p>Add these in Vercel → Project → Settings → Environment Variables for each environment you deploy:</p>
      <ul className="env-list">
        <li><code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code></li>
        <li><code>BASELINKER_API_TOKEN</code> for BaseLinker order data</li>
        <li><code>CRON_SECRET</code> to protect scheduled endpoints</li>
        <li><code>RESEND_API_KEY</code> and <code>ALERT_FROM_EMAIL</code> for email alerts</li>
      </ul>
      <ol>
        <li>Run the current <code>supabase/schema.sql</code> in the Supabase SQL Editor.</li>
        <li>Redeploy after changing Vercel environment variables.</li>
        <li>Return here and choose <strong>Check now</strong> to validate the active deployment.</li>
      </ol>
    </section>
  </>;
}
