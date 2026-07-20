import Link from 'next/link';
import {
  LayoutDashboard,
  MapPinned,
  ShoppingBag,
  Users,
  BarChart3,
  Tag,
  Settings,
  LogOut,
} from 'lucide-react';

/**
 * Admin top navigation — a warm glassy pill strip (ported from empiria-admin's
 * TopNav, simplified for the dashboard shell). All links point at /dashboard
 * until the remaining sections are built. Overview is marked active statically.
 */
const LINKS = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard, active: true },
  { name: 'Tours', href: '/dashboard', icon: MapPinned },
  { name: 'Orders', href: '/dashboard', icon: ShoppingBag },
  { name: 'Users', href: '/dashboard', icon: Users },
  { name: 'Revenue', href: '/dashboard', icon: BarChart3 },
  { name: 'Categories', href: '/dashboard', icon: Tag },
  { name: 'Settings', href: '/dashboard', icon: Settings },
];

export default function TopNav() {
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
        {/* Brand */}
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Empiria Tour" className="h-7 w-auto" />
          <span className="rounded-md bg-primary/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
            Admin
          </span>
        </Link>

        {/* Pill links */}
        <nav className="topnav-links px-1">
          {LINKS.map((l) => (
            <Link
              key={l.name}
              href={l.href}
              aria-current={l.active ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                l.active
                  ? 'bg-white text-[#1a1209] shadow-[0_1px_4px_rgba(0,0,0,0.08)]'
                  : 'text-muted-foreground hover:bg-white/60 hover:text-foreground'
              }`}
            >
              <l.icon size={15} />
              {l.name}
            </Link>
          ))}
        </nav>

        {/* User chip */}
        <div className="flex shrink-0 items-center gap-2 pl-1">
          <div className="hidden text-right sm:block">
            <div className="text-xs font-semibold leading-tight text-foreground">Empiria Admin</div>
            <div className="text-[11px] leading-tight text-muted-foreground">Platform</div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
            EA
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              aria-label="Sign out"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground"
            >
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
