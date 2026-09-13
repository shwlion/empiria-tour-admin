import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, Plus } from 'lucide-react';
import { Badge, Button, EmptyState, Table } from '@/components/ui';
import { listDestinations, destinationStorefrontPath } from '@/lib/admin/destinations';
import { STOREFRONT_URL } from '@/lib/storefront';

export const metadata: Metadata = { title: 'Destinations · Empiria Tour Admin' };

/** B6 — the destination tree, as the storefront's menu will show it. */
export default async function DestinationsPage() {
  const destinations = await listDestinations();
  const live = destinations.filter((d) => d.status === 'published').length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {destinations.length === 0
            ? 'No destinations yet. The storefront menu is built from the published ones.'
            : `${destinations.length} places · ${live} published. The menu, the filters and every tour's "where" come from this list.`}
        </p>
        <Link href="/dashboard/content/destinations/new">
          <Button>
            <Plus size={14} aria-hidden="true" />
            New destination
          </Button>
        </Link>
      </div>

      {destinations.length === 0 ? (
        <EmptyState title="No destinations" description="Create a country first, then the regions and places inside it." />
      ) : (
        <Table head={['Destination', 'Web address', 'Status', 'Tours', 'Order', '']}>
          {destinations.map((d) => (
            <tr key={d.id} className="transition-colors hover:bg-secondary/50">
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/content/destinations/${d.id}`}
                  className="font-medium text-foreground transition-colors hover:text-primary"
                  style={{ paddingLeft: `${d.depth * 18}px` }}
                >
                  {d.depth > 0 && <span className="mr-1.5 text-muted-foreground">└</span>}
                  {d.name}
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">{d.path}</td>
              <td className="px-4 py-3"><Badge value={d.status} /></td>
              <td className="px-4 py-3 tabular-nums text-muted-foreground">{d.packageCount || '—'}</td>
              <td className="px-4 py-3 tabular-nums text-muted-foreground">{d.sortOrder}</td>
              <td className="px-4 py-3 text-right">
                {d.status === 'published' && (
                  <a
                    href={`${STOREFRONT_URL}${destinationStorefrontPath(d.path)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    View <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
