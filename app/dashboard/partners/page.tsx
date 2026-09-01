import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, EmptyState, PageHeader, Table } from '@/components/ui';
import { formatDepartureDate } from '@/lib/money';
import { requireCapability } from '@/lib/auth';
import { APPLICATION_STATUSES, listApplications } from '@/lib/admin/partners';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Partner applications · Empiria Tour Admin' };

/**
 * Who has asked to sell through Empiria.
 *
 * Pending first by default, because this is a queue rather than an archive —
 * somebody waiting on a decision is the only reason to open the page.
 */
export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireCapability('manageSettings');
  const params = await searchParams;
  const status = params.status ?? 'pending';
  const applications = await listApplications(status === 'all' ? undefined : status);

  return (
    <>
      <PageHeader
        title="Partner applications"
        description="Approving one is the only way an account becomes a partner. Nobody self-selects it, because Empiria sells under its own registration."
      />

      <nav className="mb-5 flex flex-wrap gap-1" aria-label="Filter by status">
        {['pending', ...APPLICATION_STATUSES.filter((s) => s !== 'pending'), 'all'].map((s) => (
          <Link
            key={s}
            href={s === 'pending' ? '/dashboard/partners' : `/dashboard/partners?status=${s}`}
            aria-current={status === s ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-[13px] font-medium capitalize transition-colors ${
              status === s ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {s}
          </Link>
        ))}
      </nav>

      {applications.length === 0 ? (
        <EmptyState
          title={status === 'pending' ? 'Nothing waiting' : 'Nothing here'}
          description={
            status === 'pending'
              ? 'Applications arrive from the “Sell your tours with Empiria” page on the site.'
              : 'Try another status.'
          }
        />
      ) : (
        <Table head={['Company', 'Contact', 'Based', 'Applied', 'Status']}>
          {applications.map((a) => (
            <tr key={a.id} className="transition-colors hover:bg-secondary/50">
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/partners/${a.id}`}
                  className="font-medium text-foreground transition-colors hover:text-primary"
                >
                  {a.companyName}
                </Link>
                {a.website && (
                  <div className="max-w-[240px] truncate text-[12px] text-muted-foreground">{a.website}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="text-foreground">{a.contactName}</div>
                <div className="max-w-[200px] truncate text-[12px] text-muted-foreground">{a.email}</div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{a.country ?? '—'}</td>
              <td className="px-4 py-3 text-muted-foreground">{formatDepartureDate(a.createdAt)}</td>
              <td className="px-4 py-3"><Badge value={a.status} /></td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
