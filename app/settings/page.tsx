import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';

export default function Settings() {
  return <>
    <header className="top"><div><div className="eyebrow">Workspace administration</div><h1>Settings</h1><div className="muted">A short checklist to get the command centre fully connected.</div></div><span className="badge green"><ShieldCheck size={13} /> Secure by default</span></header>
    <section className="card"><div className="section-heading"><div><div className="eyebrow">Environment</div><h2>Required setup</h2></div><KeyRound size={21} color="#087f78" /></div><ol><li><CheckCircle2 size={15} /> Run supabase/schema.sql in Supabase SQL Editor.</li><li><CheckCircle2 size={15} /> Copy .env.example to .env.local.</li><li><CheckCircle2 size={15} /> Set Supabase URL and keys.</li><li><CheckCircle2 size={15} /> Keep service-role, Base.com, and email secrets server-side.</li><li><CheckCircle2 size={15} /> Deploy to Vercel and add variables there.</li></ol><p>Alert recipient: <code>shipingnvs00@gmail.com</code></p><p>Alert sender: <code>amonroo.update.ai@gmail.com</code></p></section>
  </>;
}