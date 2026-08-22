'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, MapPinned, CalendarRange, ShoppingBag,
  Users, BarChart3, FileText, Settings, LogOut,
} from 'lucide-react';
import type { Capabilities, Role } from '@/lib/auth';

/**
 * Admin navigation — the warm glassy pill strip inherited from Empiria's
 * existing admin, so staff moving between the two consoles recognise it.
 *
 * Two rules here:
 *
 *  - Sections that do not exist yet are not linked. A nav item that leads to a
 *    404 is worse than an absent one, and Part B lands in stages.
 *  - Sections the person's role cannot use are not shown — but the hiding is
 *    cosmetic. Every route re-checks the capability server-side, because a
 *    missing link has never stopped anybody typing a URL.
 */

type NavItem = {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  /** Built and routable. The rest are listed so the order is decided once. */
  built: boolean;
  requires?: keyof Capabilities;
};

const ITEMS: NavItem[] = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard, built: true },
  { name: 'Tours', href: '/dashboard/tours', icon: MapPinned, built: true, requires: 'managePackages' },
  { name: 'Departures', href: '/dashboard/departures', icon: CalendarRange, built: true, requires: 'managePackages' },
  { name: 'Bookings', href: '/dashboard/bookings', icon: ShoppingBag, built: false, requires: 'manageBookings' },
  { name: 'Customers', href: '/dashboard/customers', icon: Users, built: false, requires: 'manageCustomers' },
  { name: 'Revenue', href: '/dashboard/revenue', icon: BarChart3, built: false, requires: 'viewFinance' },
  { name: 'Content', href: '/dashboard/content', icon: FileText, built: true, requires: 'manageSettings' },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, built: true, requires: 'manageSettings' },
];

export default function TopNav({
  name,
  email,
  role,
  can,
}: {
  name: string | null;
  email: string | null;
  role: Role;
  can: Capabilities;
}) {
  const pathname = usePathname();
  const visible = ITEMS.filter((i) => i.built && (!i.requires || can[i.requires]));
  const label = name ?? email ?? 'Signed in';
  const initials = (name ?? email ?? 'E')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <header
      className="sticky top-0 z-40 border-b border-white/60"
      style={{
        background: 'rgba(255,255,255,0.68)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
          <Image src="/logo.png" alt="Empiria Tour" width={120} height={28} className="h-7 w-auto" priority />
          <span className="rounded-md bg-primary/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
            {role === 'agent' ? 'Agent' : 'Admin'}
          </span>
        </Link>

        <nav className="topnav-links px-1" aria-label="Sections">
          {visible.map((item) => {
            const active =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                  active
                    ? 'bg-white text-[#1a1209] shadow-[0_1px_4px_rgba(0,0,0,0.08)]'
                    : 'text-muted-foreground hover:bg-white/60 hover:text-foreground'
                }`}
              >
                <item.icon size={15} aria-hidden="true" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 pl-1">
          <div className="hidden text-right sm:block">
            <div className="max-w-[160px] truncate text-xs font-semibold leading-tight text-foreground">
              {label}
            </div>
            <div className="text-[11px] capitalize leading-tight text-muted-foreground">{role}</div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
            {initials || 'E'}
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              aria-label="Sign out"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground"
            >
              <LogOut size={15} aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
