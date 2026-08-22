import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { requireStaff } from '@/lib/auth';
import { getPackage, publishBlockers } from '@/lib/admin/packages';
import EditorTabs from './EditorTabs';
import StatusControl from './StatusControl';

export const dynamic = 'force-dynamic';

/**
 * The editor shell: identity, status and tabs, loaded once for every section.
 *
 * The tour is fetched here and again in each tab. That is a duplicate query per
 * navigation, and worth it — the alternative is threading a large object
 * through context and having every tab re-render on any change to it.
 */
export default async function TourEditorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireStaff();
  const detail = await getPackage(id, user.can.scopedToOwnPackages ? user.id : null);
  if (!detail) notFound();

  const { pkg } = detail;
  const blockers = publishBlockers(detail);

  return (
    <>
      <Link
        href="/dashboard/tours"
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        All tours
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{pkg.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
            <span>/tours/{pkg.slug}</span>
            {pkg.status === 'published' && (
              <a
                href={`https://empiriatours.com/tours/${pkg.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                View live
                <ExternalLink size={11} aria-hidden="true" />
              </a>
            )}
            <span>·</span>
            <span>
              {detail.departureCount} {detail.departureCount === 1 ? 'departure' : 'departures'}
            </span>
          </p>
        </div>
        <StatusControl packageId={pkg.id} status={pkg.status} blockers={blockers} />
      </div>

      <EditorTabs packageId={pkg.id} />
      {children}
    </>
  );
}
