'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import type { Capabilities, Role } from '@/lib/auth';

/**
 * Admin navigation — the glassy pill strip inherited from Empiria's existing
 * admin, so staff moving between the two consoles recognise it.
 *
 * Two rules here:
 *
 *  - Sections that do not exist yet are not linked. A nav item that leads to a
 *    404 is worse than an absent one, and Part B lands in stages.
 *  - Sections the person's role cannot use are not shown — but the hiding is
 *    cosmetic. Every route re-checks the capability server-side, because a
 *    missing link has never stopped anybody typing a URL.
 *
 * A section that holds a queue carries its depth in the nav. Somebody halfway
 * through a booking has no reason to visit Partners, and no way to learn that
 * three operators are waiting on a decision — unless the tab says so from
 * wherever they happen to be standing.
 *
 * Redesigned 14 Sep 2026, at the client's request, after Settings was found
 * cut off: nine text pills, an icon each, the name block, the avatar and sign
 * out did not fit at 1280px, and the row's hidden scrollbar hid the fact. The
 * icons are gone (the Events admin's pills never had them, and each cost ~25px
 * that nine times over was the overflow); the row WRAPS rather than scrolls,
 * so a section that does not fit drops to a second line instead of vanishing;
 * the name block waits for lg; and below md the sections live behind a menu
 * button, as the Events admin keeps them in a drawer. The active pill is the
 * brand orange — `bg-primary`, the same as every button on the platform — at
 * the client's request, after a white one (invisible once the ground went
 * white), a dark one (read as black) and an amber one (not the brand).
 */

type NavItem = {
  name: string;
  href: string;
  /** Key into `counts`, for a section that holds a queue. */
  badge?: keyof NavCounts;
  /** Built and routable. The rest are listed so the order is decided once. */
  built: boolean;
  requires?: keyof Capabilities;
};

/** Queue depths the nav can surface. One key per section that has a queue. */
export type NavCounts = { partners?: number };

const ITEMS: NavItem[] = [
  { name: 'Overview', href: '/dashboard', built: true },
  { name: 'Tours', href: '/dashboard/tours', built: true, requires: 'managePackages' },
  { name: 'Departures', href: '/dashboard/departures', built: true, requires: 'managePackages' },
  { name: 'Bookings', href: '/dashboard/bookings', built: true, requires: 'manageBookings' },
  { name: 'Customers', href: '/dashboard/customers', built: true, requires: 'manageCustomers' },
  { name: 'Reports', href: '/dashboard/reports', built: true, requires: 'viewFinance' },
  { name: 'Partners', href: '/dashboard/partners', built: true, requires: 'manageSettings', badge: 'partners' },
  { name: 'Content', href: '/dashboard/content', built: true, requires: 'manageSettings' },
  { name: 'Settings', href: '/dashboard/settings', built: true, requires: 'manageSettings' },
];

function isActive(item: NavItem, pathname: string): boolean {
  return item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
}

function Badge({ count }: { count: number }) {
  return (
    <span
      className="ml-1 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-primary px-1.5 py-px text-[10px] font-bold tabular-nums text-white"
      aria-label={`${count} waiting`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function TopNav({
  name,
  email,
  role,
  can,
  counts = {},
}: {
  name: string | null;
  email: string | null;
  role: Role;
  can: Capabilities;
  counts?: NavCounts;
}) {
  const pathname = usePathname();
  // The small-screen menu remembers the route it was opened on and counts as
  // closed once the route differs — so navigating closes it without an effect
  // that sets state, which the lint (rightly) refuses.
  const [menu, setMenu] = useState<{ open: boolean; at: string }>({ open: false, at: pathname });
  const open = menu.open && menu.at === pathname;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) =>
    setMenu({ open: typeof next === 'function' ? next(open) : next, at: pathname });
  const visible = ITEMS.filter((i) => i.built && (!i.requires || can[i.requires]));
  const label = name ?? email ?? 'Signed in';
  const initials = (name ?? email ?? 'E')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  // Escape closes it. A subscription to the keyboard is what effects are for.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu((m) => ({ ...m, open: false }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const pill = (active: boolean) =>
    `inline-flex items-center rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
      active
        ? 'bg-primary font-semibold text-white'
        : 'font-medium text-muted-foreground hover:bg-white/70 hover:text-foreground'
    }`;

  return (
    <header
      className="sticky top-0 z-40 border-b border-[rgba(255,150,60,0.14)]"
      style={{
        background: 'rgba(255,255,255,0.78)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="topnav-sections"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/70 md:hidden"
        >
          {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>

        <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
          <Image src="/logo.png" alt="Empiria Tours" width={1507} height={522} className="h-7 w-auto" priority />
          <span className="rounded-md bg-primary/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
            {role === 'agent' ? 'Agent' : 'Admin'}
          </span>
        </Link>

        {/* Wraps. A section that does not fit drops to a second line — it is
            never scrolled out of sight, which is how Settings went missing. */}
        <nav className="hidden min-w-0 flex-1 flex-wrap items-center gap-1 md:flex" aria-label="Sections">
          {visible.map((item) => {
            const active = isActive(item, pathname);
            const count = item.badge ? (counts[item.badge] ?? 0) : 0;
            return (
              <Link key={item.name} href={item.href} aria-current={active ? 'page' : undefined} className={pill(active)}>
                {item.name}
                {count > 0 && <Badge count={count} />}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          <div className="hidden text-right lg:block">
            <div className="max-w-[160px] truncate text-xs font-semibold leading-tight text-foreground">
              {label}
            </div>
            <div className="text-[11px] capitalize leading-tight text-muted-foreground">{role}</div>
          </div>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white"
            title={label}
          >
            {initials || 'E'}
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              aria-label="Sign out"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/70 hover:text-foreground"
            >
              <LogOut size={15} aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>

      {/* Below md: the same sections as a list, under the bar. */}
      <nav
        id="topnav-sections"
        aria-label="Sections"
        hidden={!open}
        className="border-t border-[rgba(255,150,60,0.14)] px-4 py-2 md:hidden"
      >
        <ul className="flex flex-col gap-0.5">
          {visible.map((item) => {
            const active = isActive(item, pathname);
            const count = item.badge ? (counts[item.badge] ?? 0) : 0;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-[14px] transition-colors ${
                    active
                      ? 'bg-primary font-semibold text-white'
                      : 'font-medium text-foreground hover:bg-white/70'
                  }`}
                >
                  {item.name}
                  {count > 0 && <Badge count={count} />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
