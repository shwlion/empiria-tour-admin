import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge, Button, EmptyState, PageHeader, Table } from '@/components/ui';
import { formatPrice, formatDepartureDate } from '@/lib/money';
import { requireStaff } from '@/lib/auth';
import { listPackages } from '@/lib/admin/packages';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tours · Empiria Tour Admin' };

export default async function ToursPage() {
  const user = await requireStaff();
  const packages = await listPackages(user.can.scopedToOwnPackages ? user.id : null);

  const drafts = packages.filter((p) => p.status === 'draft').length;
  const live = packages.filter((p) => p.status === 'published').length;

  return (
    <>
      <PageHeader
        title="Tours"
        description={
          packages.length === 0
            ? 'Nothing here yet. A tour starts as a draft and only goes live once it has a price, an itinerary and dates.'
            : `${live} live, ${drafts} in draft.`
        }
        actions={
          <Link href="/dashboard/tours/new">
            <Button>
              <Plus size={14} aria-hidden="true" />
              New tour
            </Button>
          </Link>
        }
      />

      {packages.length === 0 ? (
        <EmptyState
          title="No tours yet"
          description="Everything on the public site today is placeholder content. Create the first real tour and it replaces one of them."
          action={
            <Link href="/dashboard/tours/new">
              <Button>
                <Plus size={14} aria-hidden="true" />
                Create the first tour
              </Button>
            </Link>
          }
        />
      ) : (
        <Table head={['Tour', 'Status', 'From', 'Departures', 'Sold', 'Updated']}>
          {packages.map((p) => (
            <tr key={p.id} className="transition-colors hover:bg-secondary/50">
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/tours/${p.id}`}
                  className="font-medium text-foreground transition-colors hover:text-primary"
                >
                  {p.title}
                </Link>
                <div className="mt-0.5 text-[12px] text-muted-foreground">
                  {[p.destination, p.category, p.durationLabel].filter(Boolean).join(' · ') || '—'}
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge value={p.status} />
                {p.isFeatured && (
                  <span className="ml-1.5 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    Featured
                  </span>
                )}
              </td>
              <td className="px-4 py-3 tabular-nums text-foreground">
                {p.basePriceCents > 0 ? formatPrice(p.basePriceCents, p.currency) : '—'}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {p.departureCount === 0 ? (
                  <span className="text-destructive">None</span>
                ) : (
                  <>
                    {p.departureCount}
                    {p.nextDepartureOn && (
                      <span className="ml-1.5 text-[12px]">
                        next {formatDepartureDate(p.nextDepartureOn)}
                      </span>
                    )}
                  </>
                )}
              </td>
              <td className="px-4 py-3 tabular-nums text-muted-foreground">{p.seatsSold}</td>
              <td className="px-4 py-3 text-[12px] text-muted-foreground">
                {formatDepartureDate(p.updatedAt.slice(0, 10))}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
