import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server-db';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return !secret || request.headers.get('authorization') === `Bearer ${secret}`;
}

async function sendEmail(subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL;
  const to = process.env.ALERT_TO_EMAIL || 'shipingnvs00@gmail.com';
  if (!key || !from) return { sent: false, error: 'Set RESEND_API_KEY and ALERT_FROM_EMAIL.' };
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, html }) });
  if (!response.ok) return { sent: false, error: await response.text() };
  return { sent: true, error: '' };
}

type AlertCandidate = { key: string; type: string; subject: string; html: string; product_id?: string; job_id?: string };

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const db = serverDb();
  if (!db) return NextResponse.json({ error: 'Configure Supabase before running alerts.' }, { status: 400 });

  const deadlineDays = Number(process.env.ALERT_DEADLINE_DAYS || 3);
  const [{ data: productRows, error: productsError }, { data: jobRows, error: jobsError }] = await Promise.all([
    db.from('inventory_stock_summary').select('*'),
    db.from('manufacturer_job_summary').select('*').not('status', 'in', '(received,cancelled)'),
  ]);
  if (productsError || jobsError) return NextResponse.json({ error: productsError?.message || jobsError?.message }, { status: 500 });
  const products = (productRows ?? []).filter((product) => product.current_stock <= product.reorder_level);
  const jobs = (jobRows ?? []).filter((job) => job.days_remaining <= deadlineDays);

  const today = new Date().toISOString().slice(0, 10);
  const alerts: AlertCandidate[] = [...(products ?? []).map((product) => ({ key: `low-stock:${product.id}:${today}`, type: 'low_stock', subject: `Amonroo stock alert: ${product.sku}`, html: `<p><strong>${product.name}</strong> (${product.sku}) is at ${product.current_stock} units, at or below its reorder level of ${product.reorder_level}.</p>`, product_id: product.id })), ...(jobs ?? []).map((job) => ({ key: `deadline:${job.id}:${today}`, type: job.days_remaining < 0 ? 'deadline_overdue' : 'deadline_near', subject: `Amonroo deadline alert: ${job.job_number}`, html: `<p>Job <strong>${job.job_number}</strong> has ${job.quantity_outstanding} units outstanding and is ${job.days_remaining < 0 ? 'overdue' : `due in ${job.days_remaining} day(s)`}.</p>`, job_id: job.id }))];
  const { data: existing } = await db.from('alert_log').select('alert_key').in('alert_key', alerts.map((alert) => alert.key));
  const sentKeys = new Set((existing ?? []).map((alert) => alert.alert_key));
  let sent = 0;
  const errors: string[] = [];

  for (const alert of alerts.filter((item) => !sentKeys.has(item.key))) {
    const result = await sendEmail(alert.subject, alert.html);
    if (!result.sent) { errors.push(result.error); continue; }
    await db.from('alert_log').insert({ alert_key: alert.key, alert_type: alert.type, product_id: alert.product_id, job_id: alert.job_id, recipient_email: process.env.ALERT_TO_EMAIL || 'shipingnvs00@gmail.com' });
    sent += 1;
  }

  return NextResponse.json({ checked: alerts.length, sent, skipped: alerts.length - sent, errors });
}