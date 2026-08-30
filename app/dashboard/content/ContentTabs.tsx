'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { name: 'Pages', href: '/dashboard/content/pages' },
  { name: 'Disclosures', href: '/dashboard/content/disclosures' },
  { name: 'Emails', href: '/dashboard/content/emails' },
];

export default function ContentTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="Content sections">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.name}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 border-b-2 px-3.5 py-2 text-[13px] font-medium transition-colors ${
              active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.name}
          </Link>
        );
      })}
    </nav>
  );
}
