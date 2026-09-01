import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge, Banner, Card, PageHeader } from '@/components/ui';
import { formatDepartureDate } from '@/lib/money';
import { requireCapability } from '@/lib/auth';
import { approvalPlan, getApplication } from '@/lib/admin/partners';
import { ApproveForm, DeclineForm } from './ReviewForms';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Application · Empiria Tour Admin' };

/**
 * One application, and the decision.
 *
 * The reviewer is told something the applicant deliberately was not: whether
 * this email already has an account here. On the public form that would be an
 * account-enumeration oracle; here it is the fact that decides which kind of
 * approval happens.
 */
export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCapability('manageSettings');
  const { id } = await params;
  const app = await getApplication(id);
  if (!app) notFound();

  const plan = approvalPlan(app);
  const decided = app.status !== 'pending';

  return (
    <>
      <Link
        href="/dashboard/partners"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        All applications
      </Link>

      <PageHeader
        title={app.companyName}
        description={`Applied ${formatDepartureDate(app.createdAt)}${app.country ? ` · ${app.country}` : ''}`}
        actions={<Badge value={app.status} />}
      />

      {decided && (
        <Banner tone={app.status === 'approved' ? 'success' : 'info'}>
          <p className="font-medium">
            {app.status === 'approved' ? 'Approved' : 'Declined'}
            {app.reviewedAt ? ` on ${formatDepartureDate(app.reviewedAt)}` : ''}
            {app.reviewedByEmail ? ` by ${app.reviewedByEmail}` : ''}.
          </p>
          {app.reviewNote && <p className="mt-1">{app.reviewNote}</p>}
        </Banner>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="The business">
            <dl className="divide-y divide-border text-[13px]">
              <Row label="Company" value={app.companyName} />
              <Row label="Based in" value={app.country} />
              <Row label="Website" value={app.website} link={app.website} />
              <Row label="Operates in" value={app.operatingRegions} />
              <Row label="Runs" value={app.tourTypes} />
              <Row
                label="Departures a year"
                value={app.departuresPerYear != null ? String(app.departuresPerYear) : null}
              />
            </dl>
          </Card>

          <Card title="Contact">
            <dl className="divide-y divide-border text-[13px]">
              <Row label="Name" value={app.contactName} />
              <Row label="Email" value={app.email} link={`mailto:${app.email}`} />
              <Row label="Phone" value={app.phone} link={app.phone ? `tel:${app.phone}` : null} />
            </dl>
          </Card>

          {app.message && (
            <Card title="What they told us">
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
                {app.message}
              </p>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="This email here">
            {app.existingAccount ? (
              <>
                <p className="text-[13px] leading-relaxed text-foreground">
                  Already has an account, created{' '}
                  {formatDepartureDate(app.existingAccount.createdAt)}.
                </p>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Role: <Badge value={app.existingAccount.role} />
                </p>
              </>
            ) : (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                No account uses this address yet.
              </p>
            )}
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              The applicant was not told this either way — on a public form it would let anyone
              test which addresses are registered.
            </p>
          </Card>

          {!decided && (
            <>
              <Card title="Approve">
                {plan.can ? (
                  <ApproveForm applicationId={app.id} kind={plan.kind} detail={plan.detail} />
                ) : (
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{plan.detail}</p>
                )}
              </Card>

              <Card title="Decline">
                <DeclineForm applicationId={app.id} />
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Row({
  label, value, link,
}: {
  label: string; value: string | null; link?: string | null;
}) {
  return (
    <div className="flex gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">
        {value ? (
          link ? (
            <a href={link} className="hover:text-primary" target={link.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </dd>
    </div>
  );
}
