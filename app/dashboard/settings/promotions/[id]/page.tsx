import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge, Card, PageHeader } from '@/components/ui';
import { formatDepartureDate } from '@/lib/money';
import { requireCapability } from '@/lib/auth';
import {
  describeDiscount,
  getPromotion,
  listCurrencyCodes,
  listPackageChoices,
  usageLabel,
  validityLabel,
} from '@/lib/admin/promotions';
import { DeleteForm, PromotionForm, StatusForm } from '../PromotionForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const promotion = await getPromotion(id);
  return { title: `${promotion?.code ?? 'Promotion'} · Empiria Tour Admin` };
}

export default async function PromotionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('manageSettings');
  const { id } = await params;
  const [promotion, packages, currencies] = await Promise.all([
    getPromotion(id),
    listPackageChoices(),
    listCurrencyCodes(),
  ]);
  if (!promotion) notFound();

  const deleteBlocked =
    promotion.status === 'active'
      ? 'Switch it off before deleting it.'
      : promotion.referencedBy > 0
        ? `${promotion.referencedBy} ${promotion.referencedBy === 1 ? 'booking names' : 'bookings name'} this code, so it stays switched off rather than deleted — deleting it would erase the discount from their history.`
        : null;

  return (
    <>
      <Link
        href="/dashboard/settings/promotions"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Promotion codes
      </Link>

      <PageHeader
        title={promotion.code}
        description={`${describeDiscount(promotion)} · ${validityLabel(promotion)} · ${usageLabel(promotion)}`}
        actions={<Badge value={promotion.status} />}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Details">
            <PromotionForm promotion={promotion} packages={packages} currencies={currencies} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Use">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-muted-foreground">Counted uses</dt>
              <dd className="text-right text-foreground">{promotion.usageCount}</dd>
              <dt className="text-muted-foreground">Bookings naming it</dt>
              <dd className="text-right text-foreground">{promotion.referencedBy}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="text-right text-foreground">{formatDepartureDate(promotion.createdAt)}</dd>
            </dl>
            {promotion.referencedBy > promotion.usageCount && (
              <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                The difference is cancelled bookings: they keep the code on their record but no
                longer count against its limit.
              </p>
            )}
          </Card>

          <Card title={promotion.status === 'active' ? 'Switch off' : 'Switch on'}>
            <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
              {promotion.status === 'active'
                ? 'Nobody can use it from then on. Bookings that already did are unchanged, and it can be switched back on.'
                : 'It can be used again, within its dates and limits.'}
            </p>
            <StatusForm id={promotion.id} status={promotion.status} code={promotion.code} />
          </Card>

          <Card title="Delete">
            <DeleteForm id={promotion.id} blocked={deleteBlocked} />
          </Card>
        </div>
      </div>
    </>
  );
}
