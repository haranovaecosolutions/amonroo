"use client";

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ban, BarChart3, Boxes, ClipboardList, FileSpreadsheet, LayoutDashboard, PackageSearch, ChevronRight, LockKeyhole } from 'lucide-react';

const navigation = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/products', label: 'Designs', icon: Boxes },
  { href: '/jobs', label: 'Manufacturing', icon: ClipboardList },
  { href: '/orders', label: 'Orders', icon: PackageSearch },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/reports', label: 'Export reports', icon: FileSpreadsheet },
  { href: '/dead-designs', label: 'Dead designs', icon: Ban },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/login') {
    return <html lang="en"><body>{children}</body></html>;
  }

  return <html lang="en"><body><div className="layout">
    <aside className="side">
      <div className="brand"><span className="brand-mark">A</span><span>Amonroo<small>Inventory command centre</small></span></div>
      <nav aria-label="Main navigation">{navigation.map(({ href, label, icon: Icon }) => <Link className={pathname === href ? 'active' : ''} href={href} key={href}><Icon size={17} strokeWidth={1.8} /><span className="nav-label">{label}</span><ChevronRight className="nav-arrow" size={14} /></Link>)}<Link href="/api/auth/logout"><LockKeyhole size={17} strokeWidth={1.8} /><span className="nav-label">Lock site</span><ChevronRight className="nav-arrow" size={14} /></Link></nav>
      <div className="side-footer"><span className="status-dot" /> Systems operational</div>
    </aside>
    <main className="main">{children}</main>
  </div></body></html>;
}