import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge, Card, PageHeader, Table } from '@/components/ui';
import { requireCapability } from '@/lib/auth';
import {
  describeDiscount,
  listCurrencyCodes,
  listPackageChoices,
  listPromotions,
  usageLabel,
  validityLabel,
} from '@/lib/admin/promotions';
import { PromotionForm } from './PromotionForms';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Promotion codes · Empiria Tour Admin' };

/**
 * B6: promotion codes.
 *
 * The list shows what the storefront would decide today — validity, uses —
 * but decides nothing. `check_promotion` does, at booking time, under a lock.
 */
export default async function PromotionsPage() {
  await requireCapability('manageSettings');
  const [promotions, packages, currencies] = await Promise.all([
    listPromotions(),
    listPackageChoices(),
    listCurrencyCodes(),
  ]);

  return (
    <>
      <Link
        href="/dashboard/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Platform settings
      </Link>

      <PageHeader
        title="Promotion codes"
        description="A code takes its discount off the subtotal before taxes and fees, so tax is charged on what the traveller actually pays. Every change here is recorded against the person who made it."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Codes">
            {promotions.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                None yet. Create one on the right — it can be used the moment it is saved.
              </p>
            ) : (
              <Table head={['Code', 'Discount', 'Valid', 'Uses', 'Tours', 'Status']}>
                {promotions.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/settings/promotions/${p.id}`} className="font-mono font-semibold text-foreground hover:text-primary">
                        {p.code}
                      </Link>
                      {p.description && (
                        <div className="max-w-[240px] truncate text-[12px] text-muted-foreground">{p.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-foreground">{describeDiscount(p)}</td>
                    <td className="px-4 py-3 align-top text-muted-foreground">{validityLabel(p)}</td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      {usageLabel(p)}
                      {p.perUserLimit != null && (
                        <div className="text-[12px]">{p.perUserLimit} per person</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      {p.scope.length === 0 ? 'All' : `${p.scope.length}`}
                    </td>
                    <td className="px-4 py-3 align-top"><Badge value={p.status} /></td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="New code">
            <PromotionForm promotion={null} packages={packages} currencies={currencies} />
          </Card>

          <Card title="How a code is checked">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              When a traveller books, the database checks the code under a lock: it is switched on,
              inside its dates, valid for that tour and currency, under its total and per-person
              limits, and the discount is recomputed from the subtotal rather than trusted. Two
              people racing the last use of a code cannot both get it.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Uses are counted from bookings, not tallied by hand: a cancelled booking gives its
              use back, a refunded one does not.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
