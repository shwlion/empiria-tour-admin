'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { name: 'Basics', segment: '' },
  { name: 'Itinerary', segment: '/itinerary' },
  { name: 'Pricing', segment: '/pricing' },
  { name: 'Rooms & extras', segment: '/options' },
  { name: 'Departures', segment: '/departures' },
];

export default function EditorTabs({ packageId }: { packageId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/tours/${packageId}`;

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="Tour sections">
      {TABS.map((tab) => {
        const href = `${base}${tab.segment}`;
        const active = tab.segment === '' ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={tab.name}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 border-b-2 px-3.5 py-2 text-[13px] font-medium transition-colors ${
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.name}
          </Link>
        );
      })}
    </nav>
  );
}
