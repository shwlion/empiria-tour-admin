import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * B5 — reporting and finance.
 *
 * Everything here is in the reporting currency — the default one in
 * `currencies`, which is what `fx_rate_to_base` converts into (0003). A
 * booking already in it converts at 1; any other converts at the rate
 * `record_payment` froze from Stripe's settlement when it first took money
 * (0023), and a payment converts at its booking's rate, so a mixed-currency
 * period adds up without re-running FX. A booking in another currency with no
 * rate on record cannot be valued: it is left out of every converted figure
 * and counted beside the figures it is missing from, never added in as if its
 * euros were dollars.
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
 * cost. Supplier cost comes from the booking (B3's form), in the booking's
 * currency, and converts at its rate here like everything else; a booking
 * without one contributes nothing to that line and is counted, because the
 * statement is only as complete as Empiria's costs. When group 3a's ledger
 * lands the same figures come from it, per charge.
 *
 * Rounding never makes or loses a cent. A half rounds away from zero on
 * either side of it, so a refund mirrors its payment exactly; and a payment's
 * share of anything is what its booking's running total rounds to after it,
 * less what it rounded to before — so a booking paid in parts, in one period
 * or across several, comes to exactly what it would have paid at once, and a
 * booking refunded in full comes back to exactly nothing.
 *
 * Period boundaries are midnight in Toronto, where the seller is — a report
 * for "this month" that flipped at 8 p.m. would be wrong for everyone who
 * reads it. The pure functions below are tested; only `loadReport` and
 * `getReportingCurrency` touch the database.
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

/**
 * A date that exists, as YYYY-MM-DD. Checked by building it and reading it
 * back: `Date.parse('2026-02-31')` quietly means 3 March, which gave a report
 * headed "2026-02-31" whose figures were 3 March's.
 */
const isDate = (s: string | undefined): s is string => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

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
  /**
   * To the reporting currency: 1 when the booking is already in it, the rate
   * frozen at its first payment otherwise, and null when it is in another
   * currency and no rate was ever recorded — such a booking cannot be valued.
   */
  fx: number | null;
};

export type ReportPayment = {
  bookingId: string;
  createdAt: string;
  kind: string;
  /** Signed: refunds are negative. In the booking's currency. */
  amountCents: number;
  /** In the booking's currency, like the amount. */
  processorFeeCents: number | null;
  /** The booking's rate, as on `ReportBooking`. */
  fx: number | null;
  /** The booking's totals, for pro-rating tax and supplier cost. */
  booking: {
    totalCents: number;
    taxCents: number;
    supplierCostCents: number | null;
    /**
     * What the booking had received before the period began — where this
     * period's running total starts, so a balance paid this month rounds on
     * from the deposit paid last month. Absent means nothing.
     */
    paidBeforeCents?: number;
  };
};

/**
 * Cents from a product that can land between two. Half a cent rounds away
 * from zero on both sides — `Math.round` sends 7.5 to 8 but -7.5 to -7, so a
 * refund used to give back a cent less than its payment took — and `+ 0`
 * turns the -0 that rounding a small negative leaves into 0, which would
 * otherwise print as "-$0".
 */
const roundCents = (x: number) => (x < 0 ? -Math.round(-x) : Math.round(x)) + 0;

const toBase = (cents: number, fx: number) => roundCents(cents * fx);

/**
 * A booking nobody paid for is not a sale: one still pending payment, or one
 * the database cancelled because its hold lapsed or its traveller abandoned
 * it (0005, 0006) — before this rule every abandoned checkout counted, at its
 * full price. Everything else is a sale, refunds included — the booking was
 * made, and its money is counted and given back in the periods the money
 * moved — and so is a cancelled booking that is still holding money.
 */
export const isSale = (b: { status: string; amountPaidCents: number }) =>
  b.amountPaidCents > 0 || (b.status !== 'pending_payment' && b.status !== 'cancelled');

/** Statuses with money still to come. */
const OPEN = new Set(['confirmed', 'balance_due']);

type Allocation = {
  payment: ReportPayment;
  fx: number;
  /** The payment in the reporting currency, signed. */
  base: number;
  /** Its signed share of the booking's tax. */
  tax: number;
  /** Its signed share of the supplier cost; null when the booking has none entered. */
  supplier: number | null;
};

/**
 * Each payment's amount, tax share and supplier-cost share in the reporting
 * currency, as the difference between what its booking's running total
 * rounds to after it and before it. Rounded one payment at a time, a
 * booking's two halves of a 15-cent tax came to 16 cents; this way the parts
 * add up to the whole, across periods as well, because the running total
 * starts from what the booking had received before the period began. The
 * payments of a booking that cannot be valued are skipped; callers count them.
 */
function allocate(payments: ReportPayment[]): Allocation[] {
  const paidSoFar = new Map<string, number>();
  const inOrder = payments
    .map((p, i) => ({ p, i, at: Date.parse(p.createdAt) }))
    .sort((a, b) => a.at - b.at || a.i - b.i);
  const out: Allocation[] = [];
  for (const { p } of inOrder) {
    if (p.fx == null) continue;
    const fx = p.fx;
    const before = paidSoFar.get(p.bookingId) ?? p.booking.paidBeforeCents ?? 0;
    const after = before + p.amountCents;
    paidSoFar.set(p.bookingId, after);
    const { totalCents: total, taxCents, supplierCostCents } = p.booking;
    // A share of what has been paid so far, converted, in the booking's own proportions.
    const share = (paid: number, part: number) => roundCents((toBase(paid, fx) * part) / total);
    out.push({
      payment: p,
      fx,
      base: toBase(after, fx) - toBase(before, fx),
      tax: total > 0 ? share(after, taxCents) - share(before, taxCents) : 0,
      supplier:
        total <= 0 ? 0 : supplierCostCents == null ? null : share(after, supplierCostCents) - share(before, supplierCostCents),
    });
  }
  return out;
}

const countUnvalued = (payments: ReportPayment[], sign: 1 | -1) =>
  payments.filter((p) => p.fx == null && Math.sign(p.amountCents) === sign).length;

export type Metrics = {
  /** Sales that could be valued; the ones that could not are `unconvertedBookings`. */
  bookingsCount: number;
  grossBookingsBaseCents: number;
  averageBookingBaseCents: number;
  supplierCostBaseCents: number;
  uncostedBookings: number;
  grossMarginBaseCents: number;
  paymentsReceivedBaseCents: number;
  refundsIssuedBaseCents: number;
  balancesOutstandingBaseCents: number;
  /** Sales in another currency with no rate on record, left out of every booking figure. */
  unconvertedBookings: number;
  /** Payments (in) and refunds (out) on such bookings, left out of the money figures. */
  unconvertedPayments: number;
  unconvertedRefunds: number;
  /** Open bookings with a balance that cannot be valued, left out of balances outstanding. */
  unconvertedOpenBookings: number;
  byPackage: { id: string; title: string; count: number; grossBaseCents: number }[];
  byDestination: { name: string; count: number; grossBaseCents: number }[];
  /** One entry per calendar day of the period, in the report timezone. */
  byDay: { date: string; receivedBaseCents: number; refundedBaseCents: number; bookings: number }[];
};

export function computeMetrics(
  bookings: ReportBooking[],
  payments: ReportPayment[],
  openBookings: { balanceCents: number; fx: number | null; status: string }[],
  period: Pick<Period, 'fromDate' | 'toDate'>,
  tz: string = REPORT_TIMEZONE
): Metrics {
  const sales = bookings.filter(isSale);
  const valued = sales.filter((b): b is ReportBooking & { fx: number } => b.fx != null);
  const gross = valued.reduce((s, b) => s + toBase(b.totalCents, b.fx), 0);
  const costed = valued.filter((b) => b.supplierCostCents != null);
  const supplier = costed.reduce((s, b) => s + toBase(b.supplierCostCents ?? 0, b.fx), 0);

  // The same allocation the statement uses, so "Payments received" and
  // "Refunds issued" agree with its first two lines to the cent.
  const moved = allocate(payments);
  const received = moved.filter((a) => a.payment.amountCents > 0).reduce((s, a) => s + a.base, 0);
  const refunded = moved.filter((a) => a.payment.amountCents < 0).reduce((s, a) => s - a.base, 0);

  const byPackage = new Map<string, { id: string; title: string; count: number; grossBaseCents: number }>();
  const byDestination = new Map<string, { name: string; count: number; grossBaseCents: number }>();
  for (const b of valued) {
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
  for (const a of moved) {
    const day = days.get(dateIn(new Date(a.payment.createdAt), tz));
    if (!day) continue;
    if (a.payment.amountCents > 0) day.receivedBaseCents += a.base;
    else day.refundedBaseCents -= a.base;
  }
  for (const b of valued) {
    const day = days.get(dateIn(new Date(b.createdAt), tz));
    if (day) day.bookings++;
  }

  const open = openBookings.filter((b) => OPEN.has(b.status));
  const byGross = <T extends { grossBaseCents: number }>(a: T, b: T) => b.grossBaseCents - a.grossBaseCents;
  return {
    bookingsCount: valued.length,
    grossBookingsBaseCents: gross,
    averageBookingBaseCents: valued.length ? roundCents(gross / valued.length) : 0,
    supplierCostBaseCents: supplier,
    uncostedBookings: valued.length - costed.length,
    grossMarginBaseCents: gross - supplier,
    paymentsReceivedBaseCents: received,
    refundsIssuedBaseCents: refunded,
    balancesOutstandingBaseCents: open.reduce((s, b) => (b.fx == null ? s : s + toBase(Math.max(0, b.balanceCents), b.fx)), 0),
    unconvertedBookings: sales.length - valued.length,
    unconvertedPayments: countUnvalued(payments, 1),
    unconvertedRefunds: countUnvalued(payments, -1),
    unconvertedOpenBookings: open.filter((b) => b.fx == null && b.balanceCents > 0).length,
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
  /** Payments and refunds on bookings in another currency with no rate on record: left out of every line. */
  unconvertedPayments: number;
  unconvertedRefunds: number;
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

  for (const a of allocate(payments)) {
    const p = a.payment;
    if (p.amountCents > 0) {
      grossPaid += a.base;
      if (p.processorFeeCents == null) feesUnknown++;
      else fees += toBase(p.processorFeeCents, a.fx);
    } else {
      refunds -= a.base;
    }
    // Signed shares: a refund gives back its portion of tax and of cost.
    taxes += a.tax;
    if (a.supplier == null) {
      if (p.amountCents > 0) uncosted++;
    } else {
      supplier += a.supplier;
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
    unconvertedPayments: countUnvalued(payments, 1),
    unconvertedRefunds: countUnvalued(payments, -1),
    netPlatformProfitBaseCents: npp,
    revenueShareBaseCents: roundCents(npp * rate),
    rate,
  };
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * One CSV cell, safe to open in a spreadsheet. A cell beginning with =, +, -,
 * @, a tab or a carriage return is a formula to Excel and its kin (OWASP's
 * list), and the names in these files are typed by customers and partners:
 * such a cell gets a leading quote rather than being trusted. A plain number
 * is left alone, so a negative amount still adds up. The customer export
 * uses this too.
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const money = (cents: number) => (cents / 100).toFixed(2);
// Tour titles are typed by partners and destination names by staff, so every
// cell goes through the same formula neutraliser as the customer export.
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
const leftOut = (n: number, what: string) => (n ? `${n} ${what} with no exchange rate left out` : '');

export function reportToCsv(period: Period, currency: string, m: Metrics, s: Statement): string {
  const rows: unknown[][] = [
    ['Empiria Tours report', period.label, `${period.fromDate} to ${period.toDate}`, currency],
    [],
    ['Metric', `Amount (${currency})`, 'Count', 'Note'],
    ['Gross bookings', money(m.grossBookingsBaseCents), m.bookingsCount, leftOut(m.unconvertedBookings, m.unconvertedBookings === 1 ? 'booking' : 'bookings')],
    ['Average booking value', money(m.averageBookingBaseCents), ''],
    ['Supplier cost', money(m.supplierCostBaseCents), '', m.uncostedBookings ? `${m.uncostedBookings} bookings without a cost` : ''],
    ['Gross margin', money(m.grossMarginBaseCents), ''],
    ['Payments received', money(m.paymentsReceivedBaseCents), '', leftOut(m.unconvertedPayments, m.unconvertedPayments === 1 ? 'payment' : 'payments')],
    ['Refunds issued', money(m.refundsIssuedBaseCents), '', leftOut(m.unconvertedRefunds, m.unconvertedRefunds === 1 ? 'refund' : 'refunds')],
    ['Balances outstanding (today)', money(m.balancesOutstandingBaseCents), '', leftOut(m.unconvertedOpenBookings, m.unconvertedOpenBookings === 1 ? 'booking' : 'bookings')],
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
    ['Gross booking value paid', money(s.grossPaidBaseCents), leftOut(s.unconvertedPayments, s.unconvertedPayments === 1 ? 'payment' : 'payments')],
    ['Less refunds and chargebacks', money(-s.refundsBaseCents), leftOut(s.unconvertedRefunds, s.unconvertedRefunds === 1 ? 'refund' : 'refunds')],
    ['Less processor fees', money(-s.processorFeesBaseCents), s.feesUnknown ? `${s.feesUnknown} payments with no fee recorded` : ''],
    ['Less taxes remitted', money(-s.taxesRemittedBaseCents)],
    ['Less supplier cost of services', money(-s.supplierCostBaseCents), s.uncostedPayments ? `${s.uncostedPayments} payments on uncosted bookings` : ''],
    ['Net Platform Profit', money(s.netPlatformProfitBaseCents)],
    [`Revenue share at ${Math.round(s.rate * 100)}%`, money(s.revenueShareBaseCents)],
  ];
  return csv(rows);
}

// ── the database ─────────────────────────────────────────────────────────────

export type Report = { period: Period; currency: string; metrics: Metrics; statement: Statement };

/**
 * The currency every converted figure in the console is in: the default one
 * in `currencies`, which is what `fx_rate_to_base` converts into and what
 * `record_payment` freezes a rate of 1 for (0023). Reports and customer
 * lifetime value are labelled with it for that reason — a label taken from
 * anywhere else could name a currency the numbers are not in.
 */
export async function getReportingCurrency(): Promise<string> {
  const db = getSupabaseAdmin();
  if (!db) return 'CAD';
  const { data } = await db.from('currencies').select('code').eq('is_default', true).maybeSingle();
  return data?.code ?? 'CAD';
}

type Page = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Every row a query matches, a page at a time. PostgREST caps each response
 * at the project's max-rows setting (1,000 on Supabase unless raised)
 * whatever `.limit()` asks for, and it caps silently: a year with more
 * payments than that reported on the first thousand. So this reads until a
 * page comes back empty — not merely short, since the cap can be smaller than
 * the page asked for — and a failed read throws rather than becoming zeros.
 */
async function readAll<T>(page: (from: number, to: number) => Page): Promise<T[]> {
  const size = 1000;
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + size - 1);
    if (error) throw new Error(error.message);
    const got = (data ?? []) as T[];
    if (got.length === 0) return rows;
    rows.push(...got);
  }
}

export async function loadReport(period: Period, tz: string = REPORT_TIMEZONE): Promise<Report | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const from = period.from.toISOString();
  const to = period.to.toISOString();

  type BookingJoined = {
    id: string; reference: string; created_at: string; status: string; package_id: string; currency: string;
    total_cents: number; tax_cents: number; supplier_cost_cents: number | null; amount_paid_cents: number;
    balance_cents: number | null; fx_rate_to_base: number | string | null;
    packages: { title: string; destinations: { name: string } | null };
  };
  type PaymentJoined = {
    booking_id: string; created_at: string; kind: string; amount_cents: number; processor_fee_cents: number | null;
    bookings: {
      currency: string; total_cents: number; tax_cents: number; supplier_cost_cents: number | null;
      fx_rate_to_base: number | string | null;
      payments: { amount_cents: number; status: string; created_at: string }[] | null;
    };
  };
  type OpenJoined = { status: string; currency: string; balance_cents: number | null; fx_rate_to_base: number | string | null };

  // Ordered by a unique key as well as the time, so the pages neither overlap nor skip.
  const [currency, bookingRows, paymentRows, openRows] = await Promise.all([
    getReportingCurrency(),
    readAll<BookingJoined>((a, b) =>
      db
        .from('bookings')
        .select('id, reference, created_at, status, package_id, currency, total_cents, tax_cents, supplier_cost_cents, amount_paid_cents, balance_cents, fx_rate_to_base, packages!inner ( title, destinations ( name ) )')
        .gte('created_at', from)
        .lt('created_at', to)
        .order('created_at')
        .order('id')
        .range(a, b)
    ),
    // Each payment brings its booking's whole ledger, for what it had received
    // before the period began — where this period's running total starts.
    readAll<PaymentJoined>((a, b) =>
      db
        .from('payments')
        .select('booking_id, created_at, kind, amount_cents, processor_fee_cents, bookings!inner ( currency, total_cents, tax_cents, supplier_cost_cents, fx_rate_to_base, payments ( amount_cents, status, created_at ) )')
        .eq('status', 'succeeded')
        .gte('created_at', from)
        .lt('created_at', to)
        .order('created_at')
        .order('id')
        .range(a, b)
    ),
    readAll<OpenJoined>((a, b) =>
      db.from('bookings').select('status, currency, balance_cents, fx_rate_to_base').in('status', [...OPEN]).order('id').range(a, b)
    ),
  ]);

  // In the reporting currency a booking is at par by definition; in any other
  // it needs the rate its first payment froze, and without one it has none.
  const rate = (fx: number | string | null, bookingCurrency: string): number | null => {
    if (bookingCurrency === currency) return 1;
    const n = Number(fx);
    return fx != null && n > 0 ? n : null;
  };
  const start = period.from.getTime();
  const paidBefore = (ledger: PaymentJoined['bookings']['payments']) =>
    (ledger ?? []).reduce((s, x) => (x.status === 'succeeded' && Date.parse(x.created_at) < start ? s + x.amount_cents : s), 0);

  const bookings: ReportBooking[] = bookingRows.map((b) => ({
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
    fx: rate(b.fx_rate_to_base, b.currency),
  }));
  const payments: ReportPayment[] = paymentRows.map((p) => ({
    bookingId: p.booking_id,
    createdAt: p.created_at,
    kind: p.kind,
    amountCents: p.amount_cents,
    processorFeeCents: p.processor_fee_cents,
    fx: rate(p.bookings.fx_rate_to_base, p.bookings.currency),
    booking: {
      totalCents: p.bookings.total_cents,
      taxCents: p.bookings.tax_cents,
      supplierCostCents: p.bookings.supplier_cost_cents,
      paidBeforeCents: paidBefore(p.bookings.payments),
    },
  }));
  const open = openRows.map((b) => ({
    status: b.status,
    balanceCents: b.balance_cents ?? 0,
    fx: rate(b.fx_rate_to_base, b.currency),
  }));

  return { period, currency, metrics: computeMetrics(bookings, payments, open, period, tz), statement: computeStatement(payments) };
}
