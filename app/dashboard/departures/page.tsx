import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, EmptyState, PageHeader, Table } from '@/components/ui';
import { formatDepartureDate, formatPrice } from '@/lib/money';
import { requireStaff } from '@/lib/auth';
import { listUpcomingDepartures } from '@/lib/admin/departures';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Departures · Empiria Tour Admin' };

/**
 * Every upcoming date across the catalogue.
 *
 * The per-tour tab is where dates are edited; this is where somebody looks to
 * answer "what is going out this month and how full is it", which is a
 * different question and a different shape.
 */
export default async function AllDeparturesPage() {
  const user = await requireStaff();
  const departures = await listUpcomingDepartures(user.can.scopedToOwnPackages ? user.id : null);

  const filling = departures.filter((d) => d.seatsAvailable > 0 && d.seatsAvailable <= 3).length;
  const full = departures.filter((d) => d.seatsAvailable === 0).length;

  return (
    <>
      <PageHeader
        title="Upcoming departures"
        description={
          departures.length === 0
            ? 'Nothing scheduled. Departures are generated from each tour.'
            : `${departures.length} ahead · ${filling} nearly full · ${full} sold out.`
        }
      />

      {departures.length === 0 ? (
        <EmptyState
          title="No departures scheduled"
          description="Open a tour and generate a season on its Departures tab."
        />
      ) : (
        <Table head={['Date', 'Tour', 'Capacity', 'Booked', 'Left', 'Price', 'Status']}>
          {departures.map((d) => (
            <tr key={d.id} className="transition-colors hover:bg-secondary/50">
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/departures/${d.id}`}
                  className="font-medium text-foreground transition-colors hover:text-primary"
                  title="Open the manifest"
                >
                  {formatDepartureDate(d.startsOn)}
                </Link>
                {d.endsOn && (
                  <div className="text-[12px] text-muted-foreground">to {formatDepartureDate(d.endsOn)}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/tours/${d.packageId}/departures`}
                  className="text-foreground transition-colors hover:text-primary"
                >
                  {d.packageTitle}
                </Link>
              </td>
              <td className="px-4 py-3 tabular-nums text-muted-foreground">{d.capacity}</td>
              <td className="px-4 py-3 tabular-nums text-muted-foreground">
                {d.seatsBooked}
                {d.seatsHeld > 0 && (
                  <span className="ml-1.5 text-[12px]">+{d.seatsHeld} held</span>
                )}
              </td>
              <td className="px-4 py-3 tabular-nums">
                <span
                  className={
                    d.seatsAvailable === 0
                      ? 'text-destructive'
                      : d.seatsAvailable <= 3
                        ? 'text-amber-600'
                        : 'text-foreground'
                  }
                >
                  {d.seatsAvailable}
                </span>
              </td>
              <td className="px-4 py-3 tabular-nums text-muted-foreground">
                {d.priceOverrideCents != null ? formatPrice(d.priceOverrideCents, d.currency) : '—'}
              </td>
              <td className="px-4 py-3">
                <Badge value={d.status} />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
