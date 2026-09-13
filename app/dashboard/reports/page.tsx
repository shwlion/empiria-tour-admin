import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { Banner, Button, Card, PageHeader, Table } from '@/components/ui';
import { formatPrice } from '@/lib/money';
import { requireCapability } from '@/lib/auth';
import { getSettings } from '@/lib/admin/settings';
import { PERIODS, loadReport, resolvePeriod, type Metrics } from '@/lib/admin/reports';
import { BarChart, ColumnChart } from './Charts';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reports · Empiria Tour Admin' };

type Search = { period?: string; from?: string; to?: string };

const query = (p: Search) => {
  const s = new URLSearchParams();
  if (p.period) s.set('period', p.period);
  if (p.from) s.set('from', p.from);
  if (p.to) s.set('to', p.to);
  const q = s.toString();
  return q ? `?${q}` : '';
};

/** Days when the period is short; weeks (Monday-start) when it is not, so a year is 52 columns rather than 365. */
function bucket(byDay: Metrics['byDay']) {
  if (byDay.length <= 62) {
    return byDay.map((d) => ({ label: d.date.slice(5), valueCents: d.receivedBaseCents, detail: d.date }));
  }
  const weeks = new Map<string, { label: string; valueCents: number; detail: string }>();
  for (const d of byDay) {
    const t = new Date(`${d.date}T00:00:00Z`);
    const monday = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    const w = weeks.get(monday) ?? { label: monday.slice(5), valueCents: 0, detail: `week of ${monday}` };
    w.valueCents += d.receivedBaseCents;
    weeks.set(monday, w);
  }
  return [...weeks.values()];
}

/**
 * B5 — reporting and finance, for the Admin role only.
 *
 * Every figure is in the default currency and belongs to the selected period:
 * bookings by when they were made, money by when it moved. The revenue-share
 * statement at the foot is §4.6(b) read over the period's payments; its two
 * caveats — payments with no processor fee recorded, and bookings with no
 * supplier cost — are printed next to the lines they affect rather than
 * hidden in a footnote, because a statement is only as good as its inputs.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireCapability('viewFinance');
  const params = await searchParams;
  const period = resolvePeriod(params);
  const [report, settings] = await Promise.all([loadReport(period), getSettings()]);
  const cur = settings.defaultCurrency;
  const money = (cents: number) => formatPrice(cents, cur);

  if (!report) {
    return (
      <>
        <PageHeader title="Reports" />
        <Banner tone="error">The database is not configured, so there is nothing to report on.</Banner>
      </>
    );
  }
  const { metrics: m, statement: s } = report;

  const tiles: { label: string; value: string; note?: string }[] = [
    { label: 'Gross bookings', value: money(m.grossBookingsBaseCents), note: `${m.bookingsCount} ${m.bookingsCount === 1 ? 'booking' : 'bookings'}` },
    { label: 'Average booking value', value: money(m.averageBookingBaseCents) },
    { label: 'Supplier cost', value: money(m.supplierCostBaseCents), note: m.uncostedBookings ? `${m.uncostedBookings} without a cost entered` : undefined },
    { label: 'Gross margin', value: money(m.grossMarginBaseCents) },
    { label: 'Payments received', value: money(m.paymentsReceivedBaseCents) },
    { label: 'Refunds issued', value: money(m.refundsIssuedBaseCents) },
    { label: 'Balances outstanding', value: money(m.balancesOutstandingBaseCents), note: 'as of today, all open bookings' },
  ];

  const statementLines: { label: string; cents: number; sign: '+' | '−' | '='; note?: string; strong?: boolean }[] = [
    { label: 'Gross booking value paid', cents: s.grossPaidBaseCents, sign: '+' },
    { label: 'Refunds and chargebacks', cents: s.refundsBaseCents, sign: '−' },
    { label: 'Processor fees', cents: s.processorFeesBaseCents, sign: '−', note: s.feesUnknown ? `${s.feesUnknown} ${s.feesUnknown === 1 ? 'payment has' : 'payments have'} no fee recorded` : undefined },
    { label: 'Taxes remitted', cents: s.taxesRemittedBaseCents, sign: '−' },
    { label: 'Supplier cost of services', cents: s.supplierCostBaseCents, sign: '−', note: s.uncostedPayments ? `${s.uncostedPayments} ${s.uncostedPayments === 1 ? 'payment is' : 'payments are'} on bookings with no supplier cost` : undefined },
    { label: 'Net Platform Profit', cents: s.netPlatformProfitBaseCents, sign: '=', strong: true },
    { label: `Revenue share at ${Math.round(s.rate * 100)}%`, cents: s.revenueShareBaseCents, sign: '=', strong: true },
  ];

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${period.label} · ${period.fromDate} to ${period.toDate} · all figures in ${cur}, days in Toronto time.`}
        actions={
          <a href={`/dashboard/reports/csv${query(params)}`}>
            <Button variant="secondary">
              <Download size={14} aria-hidden="true" />
              Export CSV
            </Button>
          </a>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-2">
        {PERIODS.filter((p) => p.key !== 'custom').map((p) => (
          <Link
            key={p.key}
            href={`/dashboard/reports${query({ period: p.key })}`}
            aria-current={period.key === p.key ? 'page' : undefined}
            className={`rounded-md border px-3 py-2 text-[13px] font-medium transition-colors ${
              period.key === p.key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            {p.label}
          </Link>
        ))}
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="period" value="custom" />
          <label className="text-[12px] text-muted-foreground">
            From
            <input type="date" name="from" defaultValue={period.key === 'custom' ? period.fromDate : ''} required className="ml-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-[13px] text-foreground" />
          </label>
          <label className="text-[12px] text-muted-foreground">
            To
            <input type="date" name="to" defaultValue={period.key === 'custom' ? period.toDate : ''} required className="ml-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-[13px] text-foreground" />
          </label>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-[12px] font-medium text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">{t.value}</p>
            {t.note && <p className="mt-1 text-[12px] text-muted-foreground">{t.note}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Payments received" description={`Money that arrived, by ${m.byDay.length > 62 ? 'week' : 'day'}. Refunds are in the tile above and the CSV.`}>
          <ColumnChart points={bucket(m.byDay)} currency={cur} format={money} />
        </Card>
        <Card title="Bookings by tour" description="Gross value of bookings made in the period, largest first.">
          <BarChart rows={m.byPackage.slice(0, 8).map((p) => ({ label: p.title, valueCents: p.grossBaseCents, count: p.count }))} format={money} />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="By tour">
          {m.byPackage.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No bookings in this period.</p>
          ) : (
            <Table head={['Tour', 'Bookings', 'Gross']}>
              {m.byPackage.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 text-foreground">{p.title}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{p.count}</td>
                  <td className="px-4 py-2.5 tabular-nums text-foreground">{money(p.grossBaseCents)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="By destination">
          {m.byDestination.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No bookings in this period.</p>
          ) : (
            <Table head={['Destination', 'Bookings', 'Gross']}>
              {m.byDestination.map((d) => (
                <tr key={d.name}>
                  <td className="px-4 py-2.5 text-foreground">{d.name}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{d.count}</td>
                  <td className="px-4 py-2.5 tabular-nums text-foreground">{money(d.grossBaseCents)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Card
        className="mt-5"
        title="Revenue share statement"
        description="Agreement §4.6: gross booking value paid in the period, less refunds and chargebacks, processor fees, taxes remitted and the supplier cost of services, gives Net Platform Profit; the share is 20% of that. Tax and supplier cost are pro-rated to each payment by its share of the booking's total, and a refund gives back its share of both."
      >
        <dl className="divide-y divide-border">
          {statementLines.map((l) => (
            <div key={l.label} className={`flex items-baseline justify-between gap-4 py-2.5 ${l.strong ? 'font-semibold text-foreground' : 'text-[14px] text-foreground'}`}>
              <dt>
                {l.label}
                {l.note && <span className="ml-2 text-[12px] font-normal text-destructive">{l.note}</span>}
              </dt>
              <dd className="tabular-nums">
                {l.sign === '−' ? '− ' : ''}
                {money(l.cents)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          Supplier cost is entered per booking under Bookings; processor fees arrive with each Stripe
          charge. Both caveats above clear as those are filled in.
        </p>
      </Card>
    </>
  );
}
