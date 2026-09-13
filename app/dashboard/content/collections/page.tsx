import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Table } from '@/components/ui';
import { listCollections, listPackageChoices } from '@/lib/admin/collections';
import { FeaturedForm } from './CollectionForms';

export const metadata: Metadata = { title: 'Collections · Empiria Tour Admin' };

/** B6 — collections and the home page's featured row. */
export default async function CollectionsPage() {
  const [collections, packages] = await Promise.all([listCollections(), listPackageChoices()]);
  const featured = packages.filter((p) => p.isFeatured && p.status === 'published').length;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">
            {collections.length === 0 ? 'No collections yet.' : `${collections.length} ${collections.length === 1 ? 'collection' : 'collections'} · a themed shelf of tours each.`}
          </p>
          <Link href="/dashboard/content/collections/new">
            <Button>
              <Plus size={14} aria-hidden="true" />
              New collection
            </Button>
          </Link>
        </div>
        {collections.length === 0 ? (
          <EmptyState title="No collections" description="“Island hopping”, “Food and wine”, “Family” — a shelf the home page and the catalogue can show." />
        ) : (
          <Table head={['Collection', 'Status', 'Tours', 'Order']}>
            {collections.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-secondary/50">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/content/collections/${c.id}`} className="font-medium text-foreground transition-colors hover:text-primary">
                    {c.name}
                  </Link>
                  <div className="mt-0.5 font-mono text-[12px] text-muted-foreground">{c.slug}</div>
                </td>
                <td className="px-4 py-3"><Badge value={c.status} /></td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{c.packageCount}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{c.sortOrder}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      <Card title="Featured on the home page" description={`The first row of tours a visitor sees. ${featured} featured now; published tours fill the rest of the row.`}>
        <FeaturedForm packages={packages} />
      </Card>
    </div>
  );
}
