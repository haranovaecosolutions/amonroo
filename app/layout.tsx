"use client";

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Boxes, ClipboardList, LayoutDashboard, PackageSearch, Settings, ChevronRight } from 'lucide-react';

const navigation = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/products', label: 'Stock & products', icon: Boxes },
  { href: '/jobs', label: 'Manufacturer jobs', icon: ClipboardList },
  { href: '/orders', label: 'Orders', icon: PackageSearch },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return <html lang="en"><body><div className="layout">
    <aside className="side">
      <div className="brand"><span className="brand-mark">A</span><span>Amonroo<small>Inventory command centre</small></span></div>
      <nav aria-label="Main navigation">{navigation.map(({ href, label, icon: Icon }) => <Link className={pathname === href ? 'active' : ''} href={href} key={href}><Icon size={17} strokeWidth={1.8} /><span className="nav-label">{label}</span><ChevronRight className="nav-arrow" size={14} /></Link>)}</nav>
      <div className="side-footer"><span className="status-dot" /> Systems operational</div>
    </aside>
    <main className="main">{children}</main>
  </div></body></html>;
}