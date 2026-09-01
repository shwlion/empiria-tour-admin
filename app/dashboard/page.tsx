import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarRange, MapPinned, Settings, TriangleAlert } from 'lucide-react';
import { Banner, Button, Card, PageHeader } from '@/components/ui';
import { formatDepartureDate } from '@/lib/money';
import { requireStaff } from '@/lib/auth';
import { listPackages } from '@/lib/admin/packages';
import { listUpcomingDepartures } from '@/lib/admin/departures';
import { getSettings, settingsGaps } from '@/lib/admin/settings';
import { contentGaps } from '@/lib/admin/content';
import { countPending } from '@/lib/admin/partners';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Overview · Empiria Tour Admin' };

/**
 * The overview.
 *
 * Deliberately not a revenue dashboard yet. The scaffold shipped one built on
 * eighty-six lines of invented numbers, which looks like insight and is not —
 * and the real figures need B5, which does not exist. What is here instead is
 * the state of the catalogue and the list of things standing between it and
 * being sellable, which is the question actually worth answering today.
 */
export default async function OverviewPage() {
  const user = await requireStaff();
  const scope = user.can.scopedToOwnPackages ? user.id : null;

  const [packages, departures, settings, content, pendingPartners] = await Promise.all([
    listPackages(scope),
    listUpcomingDepartures(scope, 8),
    getSettings(),
    user.can.manageSettings ? contentGaps() : Promise.resolve([]),
    user.can.manageSettings ? countPending() : Promise.resolve(0),
  ]);

  const live = packages.filter((p) => p.status === 'published');
  const drafts = packages.filter((p) => p.status === 'draft');
  const withoutDepartures = packages.filter((p) => p.departureCount === 0 && p.status === 'published');
  const gaps = user.can.manageSettings ? settingsGaps(settings) : [];

  return (
    <>
      <PageHeader
        title={`Good to see you${user.name ? `, ${user.name.split(' ')[0]}` : ''}`}
        description="What is on sale, what is going out, and what is still in the way."
      />

      {pendingPartners > 0 && (
        <Banner tone="info">
          <p className="font-medium">
            {pendingPartners} partner {pendingPartners === 1 ? 'application is' : 'applications are'}{' '}
            waiting on a decision.
          </p>
          <p className="mt-1">
            Nobody becomes a partner without one of these being approved, so an unread queue is
            somebody waiting.{' '}
            <Link href="/dashboard/partners" className="underline underline-offset-2">
              Review them
            </Link>
            .
          </p>
        </Banner>
      )}

      {gaps.length > 0 && (
        <Banner tone="error">
          <p className="font-medium">
            The public site is missing {gaps.length} {gaps.length === 1 ? 'setting' : 'settings'} it
            needs before it can honestly take money.
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
          <Link href="/dashboard/settings" className="mt-2 inline-block font-medium underline">
            Fix them in settings
          </Link>
        </Banner>
      )}

      {content.length > 0 && (
        <Banner tone="info">
          <p className="font-medium text-foreground">
            {content.length} {content.length === 1 ? 'thing the public site says' : 'things the public site says'} that
            nobody has written yet.
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {content.map((gap) => (
              <li key={gap.area + gap.detail}>
                <Link href={gap.href} className="font-medium underline">
                  {gap.area}
                </Link>{' '}
                — {gap.detail}
              </li>
            ))}
          </ul>
        </Banner>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Live tours" value={live.length} href="/dashboard/tours" icon={MapPinned} />
        <Stat label="In draft" value={drafts.length} href="/dashboard/tours" icon={MapPinned} />
        <Stat
          label="Upcoming departures"
          value={departures.length}
          href="/dashboard/departures"
          icon={CalendarRange}
        />
      </div>

      {withoutDepartures.length > 0 && (
        <Card className="mb-5" title="Published with nothing to book">
          <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
            These are live on the site but have no departures, so a traveller can read about them and
            then hit a dead end.
          </p>
          <ul className="flex flex-col gap-1.5">
            {withoutDepartures.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-[13px]">
                <TriangleAlert size={14} className="shrink-0 text-destructive" aria-hidden="true" />
                <Link
                  href={`/dashboard/tours/${p.id}/departures`}
                  className="text-foreground transition-colors hover:text-primary"
                >
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Next out the door">
          {departures.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nothing scheduled yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {departures.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/tours/${d.packageId}/departures`}
                      className="block truncate text-[13px] font-medium text-foreground transition-colors hover:text-primary"
                    >
                      {d.packageTitle}
                    </Link>
                    <span className="text-[12px] text-muted-foreground">
                      {formatDepartureDate(d.startsOn)}
                    </span>
                  </div>
                  <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                    {d.seatsBooked}/{d.capacity} sold
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recently edited">
          {packages.length === 0 ? (
            <div className="text-[13px] text-muted-foreground">
              <p>No tours yet. Everything on the public site is placeholder content.</p>
              <Link href="/dashboard/tours/new" className="mt-3 inline-block">
                <Button>Create the first tour</Button>
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {packages.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 py-2.5">
                  <Link
                    href={`/dashboard/tours/${p.id}`}
                    className="min-w-0 truncate text-[13px] font-medium text-foreground transition-colors hover:text-primary"
                  >
                    {p.title}
                  </Link>
                  <span className="shrink-0 text-[12px] capitalize text-muted-foreground">{p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {user.can.manageSettings && gaps.length === 0 && (
        <p className="mt-6 flex items-center gap-2 text-[13px] text-muted-foreground">
          <Settings size={14} aria-hidden="true" />
          Platform settings are complete.
        </p>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  href,
  icon: Icon,
}: {
  label: string;
  value: number;
  href: string;
  icon: typeof MapPinned;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
    >
      <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon size={14} aria-hidden="true" />
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold tabular-nums text-foreground">{value}</div>
    </Link>
  );
}
