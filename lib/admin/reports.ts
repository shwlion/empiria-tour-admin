import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * B5 — reporting and finance.
 *
 * Everything here is in the platform's default currency: each booking froze
 * `fx_rate_to_base` at purchase (0003), and a payment converts at its
 * booking's rate, so a mixed-currency period adds up without re-running FX.
 *
 * Two clocks. Bookings belong to the period they were *made* in; money
 * belongs to the period it *moved* in — a refund is counted in the period it
 * was issued, as B5 requires, not the period of the sale it undoes. Balances
 * outstanding are a snapshot of now, because a balance has no period.
 *
 * The revenue-share statement is §4.6(b) read literally over the payments of
 * the period: gross paid, less refunds, less processor fees, less taxes, less
 * supplier cost — the last two pro-rated to each payment by its share of the
 * booking's total, and signed, so a refund gives back its share of tax and
 * cost. Supplier cost comes from the booking (B3's form); a booking without
 * one contributes nothing to that line and is counted, because the statement
 * is only as complete as Empiria's costs. When group 3a's ledger lands the
 * same figures come from it, per charge.
 *
 * Period boundaries are midnight in Toronto, where the seller is — a report
 * for "this month" that flipped at 8 p.m. would be wrong for everyone who
 * reads it. The pure functions below are tested; only `loadReport` touches
 * the database.
 */

/** §4.6(a): Elevsoft's share of Net Platform Profit. */
export const REVENUE_SHARE_RATE = 0.2;

export const REPORT_TIMEZONE = 'America/Toronto';

export const PERIODS = [
  { key: '7d', label: 'Past 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Past month' },
  { key: 'ytd', label: 'Year to date' },
  { key: 'year', label: 'Past year' },
  { key: 'custom', label: 'Custom range' },
] as const;
export type PeriodKey = (typeof PERIODS)[number]['key'];

export type Period = {
  key: PeriodKey;
  /** Calendar dates in the report timezone, inclusive. */
  fromDate: string;
  toDate: string;
  /** The same bounds as instants: [from, to). */
  from: Date;
  to: Date;
  label: string;
};

// ── time ─────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** The calendar date of an instant in a zone, as YYYY-MM-DD. */
export function dateIn(instant: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Midnight at the start of a calendar date in a zone, as an instant. */
export function startOfDay(date: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  // Guess UTC midnight, read back what calendar time that is in the zone, and
  // correct by the difference. One correction is exact except across a DST
  // change at midnight itself, which no zone in use here has.
  const guess = Date.UTC(y, m - 1, d);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const seen = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return new Date(guess - (seen - guess));
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** The period a query string asks for; anything unusable becomes "this month". */
export function resolvePeriod(
  params: { period?: string; from?: string; to?: string },
  now: Date = new Date(),
  tz: string = REPORT_TIMEZONE
): Period {
  const today = dateIn(now, tz);
  const [y, m] = today.split('-').map(Number);
  let key: PeriodKey = (PERIODS.some((p) => p.key === params.period) ? params.period : 'month') as PeriodKey;
  let fromDate: string;
  let toDate: string = today;

  switch (key) {
    case '7d':
      fromDate = shiftDate(today, -6);
      break;
    case 'last_month': {
      const first = new Date(Date.UTC(y, m - 2, 1));
      fromDate = `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-01`;
      toDate = shiftDate(`${y}-${pad(m)}-01`, -1);
      break;
    }
    case 'ytd':
      fromDate = `${y}-01-01`;
      break;
    case 'year':
      fromDate = shiftDate(today, -364);
      break;
    case 'custom':
      if (isDate(params.from) && isDate(params.to) && params.from <= params.to) {
        fromDate = params.from;
        toDate = params.to;
        break;
      }
      key = 'month';
      fromDate = `${y}-${pad(m)}-01`;
      break;
    case 'month':
    default:
      fromDate = `${y}-${pad(m)}-01`;
  }

  const label =
    key === 'custom'
      ? `${fromDate} to ${toDate}`
      : (PERIODS.find((p) => p.key === key)?.label ?? 'This month');
  return { key, fromDate, toDate, from: startOfDay(fromDate, tz), to: startOfDay(shiftDate(toDate, 1), tz), label };
}

// ── the rows the figures are made from ───────────────────────────────────────

export type ReportBooking = {
  id: string;
  reference: string;
  createdAt: string;
  status: string;
  packageId: string;
  packageTitle: string;
  destination: string | null;
  totalCents: number;
  taxCents: number;
  supplierCostCents: number | null;
  amountPaidCents: number;
  balanceCents: number;
  /** To the default currency, frozen at purchase. 1 when already in it. */
  fx: number;
};

export type ReportPayment = {
  bookingId: string;
  createdAt: string;
  kind: string;
  /** Signed: refunds are negative. In the booking's currency. */
  amountCents: number;
  processorFeeCents: number | null;
  fx: number;
  /** The booking's totals, for pro-rating tax and supplier cost. */
  booking: { totalCents: number; taxCents: number; supplierCostCents: number | null };
};

const toBase = (cents: number, fx: number) => Math.round(cents * fx);

/** A booking nobody ever paid for is not a sale; everything else is, refunds and cancellations included. */
export const isSale = (b: { status: string; amountPaidCents: number }) => b.status !== 'pending_payment' || b.amountPaidCents > 0;

/** Statuses with money still to come. */
const OPEN = new Set(['confirmed', 'balance_due']);

export type Metrics = {
  bookingsCount: number;
  grossBookingsBaseCents: number;
  averageBookingBaseCents: number;
  supplierCostBaseCents: number;
  uncostedBookings: number;
  grossMarginBaseCents: number;
  paymentsReceivedBaseCents: number;
  refundsIssuedBaseCents: number;
  balancesOutstandingBaseCents: number;
  byPackage: { id: string; title: string; count: number; grossBaseCents: number }[];
  byDestination: { name: string; count: number; grossBaseCents: number }[];
  /** One entry per calendar day of the period, in the report timezone. */
  byDay: { date: string; receivedBaseCents: number; refundedBaseCents: number; bookings: number }[];
};

export function computeMetrics(
  bookings: ReportBooking[],
  payments: ReportPayment[],
  openBookings: { balanceCents: number; fx: number; status: string }[],
  period: Pick<Period, 'fromDate' | 'toDate'>,
  tz: string = REPORT_TIMEZONE
): Metrics {
  const sales = bookings.filter(isSale);
  const gross = sales.reduce((s, b) => s + toBase(b.totalCents, b.fx), 0);
  const costed = sales.filter((b) => b.supplierCostCents != null);
  const supplier = costed.reduce((s, b) => s + toBase(b.supplierCostCents ?? 0, b.fx), 0);

  const received = payments.filter((p) => p.amountCents > 0).reduce((s, p) => s + toBase(p.amountCents, p.fx), 0);
  const refunded = payments.filter((p) => p.amountCents < 0).reduce((s, p) => s + toBase(-p.amountCents, p.fx), 0);

  const byPackage = new Map<string, { id: string; title: string; count: number; grossBaseCents: number }>();
  const byDestination = new Map<string, { name: string; count: number; grossBaseCents: number }>();
  for (const b of sales) {
    const pk = byPackage.get(b.packageId) ?? { id: b.packageId, title: b.packageTitle, count: 0, grossBaseCents: 0 };
    pk.count++;
    pk.grossBaseCents += toBase(b.totalCents, b.fx);
    byPackage.set(b.packageId, pk);
    const name = b.destination ?? 'No destination';
    const ds = byDestination.get(name) ?? { name, count: 0, grossBaseCents: 0 };
    ds.count++;
    ds.grossBaseCents += toBase(b.totalCents, b.fx);
    byDestination.set(name, ds);
  }

  const days = new Map<string, { date: string; receivedBaseCents: number; refundedBaseCents: number; bookings: number }>();
  for (let d = period.fromDate; d <= period.toDate; d = shiftDate(d, 1)) {
    days.set(d, { date: d, receivedBaseCents: 0, refundedBaseCents: 0, bookings: 0 });
  }
  for (const p of payments) {
    const day = days.get(dateIn(new Date(p.createdAt), tz));
    if (!day) continue;
    if (p.amountCents > 0) day.receivedBaseCents += toBase(p.amountCents, p.fx);
    else day.refundedBaseCents += toBase(-p.amountCents, p.fx);
  }
  for (const b of sales) {
    const day = days.get(dateIn(new Date(b.createdAt), tz));
    if (day) day.bookings++;
  }

  const byGross = <T extends { grossBaseCents: number }>(a: T, b: T) => b.grossBaseCents - a.grossBaseCents;
  return {
    bookingsCount: sales.length,
    grossBookingsBaseCents: gross,
    averageBookingBaseCents: sales.length ? Math.round(gross / sales.length) : 0,
    supplierCostBaseCents: supplier,
    uncostedBookings: sales.length - costed.length,
    grossMarginBaseCents: gross - supplier,
    paymentsReceivedBaseCents: received,
    refundsIssuedBaseCents: refunded,
    balancesOutstandingBaseCents: openBookings
      .filter((b) => OPEN.has(b.status))
      .reduce((s, b) => s + toBase(Math.max(0, b.balanceCents), b.fx), 0),
    byPackage: [...byPackage.values()].sort(byGross),
    byDestination: [...byDestination.values()].sort(byGross),
    byDay: [...days.values()],
  };
}

export type Statement = {
  grossPaidBaseCents: number;
  refundsBaseCents: number;
  processorFeesBaseCents: number;
  /** Payments with no fee recorded — manual ones, or a charge the webhook saw before its balance transaction. */
  feesUnknown: number;
  taxesRemittedBaseCents: number;
  supplierCostBaseCents: number;
  /** Payments on bookings with no supplier cost, whose share is therefore missing from the line. */
  uncostedPayments: number;
  netPlatformProfitBaseCents: number;
  revenueShareBaseCents: number;
  rate: number;
};

export function computeStatement(payments: ReportPayment[], rate = REVENUE_SHARE_RATE): Statement {
  let grossPaid = 0;
  let refunds = 0;
  let fees = 0;
  let feesUnknown = 0;
  let taxes = 0;
  let supplier = 0;
  let uncosted = 0;

  for (const p of payments) {
    const base = toBase(p.amountCents, p.fx);
    if (p.amountCents > 0) {
      grossPaid += base;
      if (p.processorFeeCents == null) feesUnknown++;
      else fees += toBase(p.processorFeeCents, p.fx);
    } else {
      refunds += -base;
    }
    const total = p.booking.totalCents;
    if (total > 0) {
      // Signed shares: a refund gives back its portion of tax and of cost.
      taxes += Math.round((base * p.booking.taxCents) / total);
      if (p.booking.supplierCostCents == null) {
        if (p.amountCents > 0) uncosted++;
      } else {
        supplier += Math.round((base * p.booking.supplierCostCents) / total);
      }
    }
  }

  const npp = grossPaid - refunds - fees - taxes - supplier;
  return {
    grossPaidBaseCents: grossPaid,
    refundsBaseCents: refunds,
    processorFeesBaseCents: fees,
    feesUnknown,
    taxesRemittedBaseCents: taxes,
    supplierCostBaseCents: supplier,
    uncostedPayments: uncosted,
    netPlatformProfitBaseCents: npp,
    revenueShareBaseCents: Math.round(npp * rate),
    rate,
  };
}

// ── CSV ──────────────────────────────────────────────────────────────────────

const money = (cents: number) => (cents / 100).toFixed(2);
const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

export function reportToCsv(period: Period, currency: string, m: Metrics, s: Statement): string {
  const rows: unknown[][] = [
    ['Empiria Tours report', period.label, `${period.fromDate} to ${period.toDate}`, currency],
    [],
    ['Metric', `Amount (${currency})`, 'Count'],
    ['Gross bookings', money(m.grossBookingsBaseCents), m.bookingsCount],
    ['Average booking value', money(m.averageBookingBaseCents), ''],
    ['Supplier cost', money(m.supplierCostBaseCents), `${m.uncostedBookings} bookings without a cost`],
    ['Gross margin', money(m.grossMarginBaseCents), ''],
    ['Payments received', money(m.paymentsReceivedBaseCents), ''],
    ['Refunds issued', money(m.refundsIssuedBaseCents), ''],
    ['Balances outstanding (today)', money(m.balancesOutstandingBaseCents), ''],
    [],
    ['Bookings by tour', `Gross (${currency})`, 'Bookings'],
    ...m.byPackage.map((p) => [p.title, money(p.grossBaseCents), p.count]),
    [],
    ['Bookings by destination', `Gross (${currency})`, 'Bookings'],
    ...m.byDestination.map((d) => [d.name, money(d.grossBaseCents), d.count]),
    [],
    ['By day', `Received (${currency})`, `Refunded (${currency})`, 'Bookings'],
    ...m.byDay.map((d) => [d.date, money(d.receivedBaseCents), money(d.refundedBaseCents), d.bookings]),
    [],
    ['Revenue share statement (Agreement §4.6)', `Amount (${currency})`],
    ['Gross booking value paid', money(s.grossPaidBaseCents)],
    ['Less refunds and chargebacks', money(-s.refundsBaseCents)],
    ['Less processor fees', money(-s.processorFeesBaseCents), s.feesUnknown ? `${s.feesUnknown} payments with no fee recorded` : ''],
    ['Less taxes remitted', money(-s.taxesRemittedBaseCents)],
    ['Less supplier cost of services', money(-s.supplierCostBaseCents), s.uncostedPayments ? `${s.uncostedPayments} payments on uncosted bookings` : ''],
    ['Net Platform Profit', money(s.netPlatformProfitBaseCents)],
    [`Revenue share at ${Math.round(s.rate * 100)}%`, money(s.revenueShareBaseCents)],
  ];
  return csv(rows);
}

// ── the database ─────────────────────────────────────────────────────────────

export type Report = { period: Period; metrics: Metrics; statement: Statement };

export async function loadReport(period: Period, tz: string = REPORT_TIMEZONE): Promise<Report | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const from = period.from.toISOString();
  const to = period.to.toISOString();

  const [bookingsRes, paymentsRes, openRes] = await Promise.all([
    db
      .from('bookings')
      .select('id, reference, created_at, status, package_id, total_cents, tax_cents, supplier_cost_cents, amount_paid_cents, balance_cents, fx_rate_to_base, packages!inner ( title, destinations ( name ) )')
      .gte('created_at', from)
      .lt('created_at', to)
      .limit(10000),
    db
      .from('payments')
      .select('booking_id, created_at, kind, amount_cents, processor_fee_cents, bookings!inner ( total_cents, tax_cents, supplier_cost_cents, fx_rate_to_base )')
      .eq('status', 'succeeded')
      .gte('created_at', from)
      .lt('created_at', to)
      .limit(10000),
    db.from('bookings').select('status, balance_cents, fx_rate_to_base').in('status', [...OPEN]).limit(10000),
  ]);

  type BookingJoined = {
    id: string; reference: string; created_at: string; status: string; package_id: string; total_cents: number;
    tax_cents: number; supplier_cost_cents: number | null; amount_paid_cents: number; balance_cents: number | null;
    fx_rate_to_base: number | null; packages: { title: string; destinations: { name: string } | null };
  };
  type PaymentJoined = {
    booking_id: string; created_at: string; kind: string; amount_cents: number; processor_fee_cents: number | null;
    bookings: { total_cents: number; tax_cents: number; supplier_cost_cents: number | null; fx_rate_to_base: number | null };
  };

  const bookings: ReportBooking[] = ((bookingsRes.data ?? []) as unknown as BookingJoined[]).map((b) => ({
    id: b.id,
    reference: b.reference,
    createdAt: b.created_at,
    status: b.status,
    packageId: b.package_id,
    packageTitle: b.packages.title,
    destination: b.packages.destinations?.name ?? null,
    totalCents: b.total_cents,
    taxCents: b.tax_cents,
    supplierCostCents: b.supplier_cost_cents,
    amountPaidCents: b.amount_paid_cents,
    balanceCents: b.balance_cents ?? b.total_cents - b.amount_paid_cents,
    fx: Number(b.fx_rate_to_base ?? 1) || 1,
  }));
  const payments: ReportPayment[] = ((paymentsRes.data ?? []) as unknown as PaymentJoined[]).map((p) => ({
    bookingId: p.booking_id,
    createdAt: p.created_at,
    kind: p.kind,
    amountCents: p.amount_cents,
    processorFeeCents: p.processor_fee_cents,
    fx: Number(p.bookings.fx_rate_to_base ?? 1) || 1,
    booking: { totalCents: p.bookings.total_cents, taxCents: p.bookings.tax_cents, supplierCostCents: p.bookings.supplier_cost_cents },
  }));
  const open = ((openRes.data ?? []) as { status: string; balance_cents: number | null; fx_rate_to_base: number | null }[]).map((b) => ({
    status: b.status,
    balanceCents: b.balance_cents ?? 0,
    fx: Number(b.fx_rate_to_base ?? 1) || 1,
  }));

  return { period, metrics: computeMetrics(bookings, payments, open, period, tz), statement: computeStatement(payments) };
}
