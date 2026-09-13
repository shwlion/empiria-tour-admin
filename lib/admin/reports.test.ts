import { resolvePeriod, startOfDay, dateIn, computeMetrics, computeStatement, reportToCsv, type ReportBooking, type ReportPayment } from './reports';

/**
 * B5's arithmetic and its calendar.
 *
 *   bun run lib/admin/reports.test.ts
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const TZ = 'America/Toronto';
// 11:30 p.m. in Toronto on 13 Sep 2026 is already 14 Sep in UTC.
const NOW = new Date('2026-09-14T03:30:00Z');

// ── the calendar ────────────────────────────────────────────────────────────
eq('the report day is the seller\'s, not UTC\'s', dateIn(NOW, TZ), '2026-09-13');
eq('midnight in Toronto in September is 04:00Z', startOfDay('2026-09-13', TZ).toISOString(), '2026-09-13T04:00:00.000Z');
eq('…and 05:00Z in January', startOfDay('2026-01-13', TZ).toISOString(), '2026-01-13T05:00:00.000Z');

const month = resolvePeriod({}, NOW, TZ);
eq('default: this month to date', [month.key, month.fromDate, month.toDate], ['month', '2026-09-01', '2026-09-13']);
eq('  …bounded as [from, to) instants', [month.from.toISOString(), month.to.toISOString()], ['2026-09-01T04:00:00.000Z', '2026-09-14T04:00:00.000Z']);
eq('past 7 days includes today', resolvePeriod({ period: '7d' }, NOW, TZ).fromDate, '2026-09-07');
eq('past month is the whole previous calendar month', (({ fromDate, toDate }) => [fromDate, toDate])(resolvePeriod({ period: 'last_month' }, NOW, TZ)), ['2026-08-01', '2026-08-31']);
eq('past month in January crosses the year', (({ fromDate, toDate }) => [fromDate, toDate])(resolvePeriod({ period: 'last_month' }, new Date('2026-01-10T12:00:00Z'), TZ)), ['2025-12-01', '2025-12-31']);
eq('year to date', resolvePeriod({ period: 'ytd' }, NOW, TZ).fromDate, '2026-01-01');
eq('past year is 365 days', resolvePeriod({ period: 'year' }, NOW, TZ).fromDate, '2025-09-14');
eq('a custom range is honoured', (({ key, fromDate, toDate }) => [key, fromDate, toDate])(resolvePeriod({ period: 'custom', from: '2026-03-01', to: '2026-03-15' }, NOW, TZ)), ['custom', '2026-03-01', '2026-03-15']);
eq('a backwards custom range falls back to this month', resolvePeriod({ period: 'custom', from: '2026-03-15', to: '2026-03-01' }, NOW, TZ).key, 'month');
eq('garbage falls back to this month', resolvePeriod({ period: 'yesterday' }, NOW, TZ).key, 'month');

// ── the figures ─────────────────────────────────────────────────────────────
const booking = (o: Partial<ReportBooking>): ReportBooking => ({
  id: 'b', reference: 'ET-1', createdAt: '2026-09-05T15:00:00Z', status: 'confirmed', packageId: 'p1', packageTitle: 'Crete',
  destination: 'Greece', totalCents: 100000, taxCents: 10000, supplierCostCents: 60000, amountPaidCents: 100000, balanceCents: 0, fx: 1, ...o,
});
const bookings = [
  booking({ id: 'b1' }),
  booking({ id: 'b2', packageId: 'p2', packageTitle: 'Amalfi', destination: 'Italy', totalCents: 50000, taxCents: 5000, supplierCostCents: null, amountPaidCents: 20000, balanceCents: 30000, fx: 1 }),
  booking({ id: 'b3', status: 'pending_payment', amountPaidCents: 0, balanceCents: 100000 }), // never paid: not a sale
  booking({ id: 'b4', totalCents: 80000, taxCents: 8000, supplierCostCents: 40000, amountPaidCents: 80000, fx: 0.75 }), // priced in USD, 0.75 to CAD
];
const pay = (o: Partial<ReportPayment>): ReportPayment => ({
  bookingId: 'b1', createdAt: '2026-09-05T15:05:00Z', kind: 'full', amountCents: 100000, processorFeeCents: 3000, fx: 1,
  booking: { totalCents: 100000, taxCents: 10000, supplierCostCents: 60000 }, ...o,
});
const payments = [
  pay({}),
  pay({ bookingId: 'b1', createdAt: '2026-09-09T12:00:00Z', kind: 'refund', amountCents: -20000, processorFeeCents: null }),
  pay({ bookingId: 'b2', createdAt: '2026-09-06T02:00:00Z', kind: 'deposit', amountCents: 20000, processorFeeCents: null, booking: { totalCents: 50000, taxCents: 5000, supplierCostCents: null } }),
  pay({ bookingId: 'b4', createdAt: '2026-09-07T12:00:00Z', kind: 'full', amountCents: 80000, processorFeeCents: 2400, fx: 0.75, booking: { totalCents: 80000, taxCents: 8000, supplierCostCents: 40000 } }),
];
const period = { fromDate: '2026-09-01', toDate: '2026-09-13' };
const m = computeMetrics(bookings, payments, [{ status: 'balance_due', balanceCents: 30000, fx: 1 }, { status: 'cancelled', balanceCents: 999, fx: 1 }, { status: 'confirmed', balanceCents: 10000, fx: 0.75 }], period, TZ);

eq('a never-paid booking is not a sale', m.bookingsCount, 3);
eq('gross bookings in base currency (USD booking at 0.75)', m.grossBookingsBaseCents, 100000 + 50000 + 60000);
eq('average booking value', m.averageBookingBaseCents, 70000);
eq('supplier cost counts only costed bookings, and says how many are not', [m.supplierCostBaseCents, m.uncostedBookings], [60000 + 30000, 1]);
eq('gross margin', m.grossMarginBaseCents, 210000 - 90000);
eq('payments received', m.paymentsReceivedBaseCents, 100000 + 20000 + 60000);
eq('refunds issued', m.refundsIssuedBaseCents, 20000);
eq('balances outstanding: open bookings only, in base', m.balancesOutstandingBaseCents, 30000 + 7500);
eq('by package, largest first', m.byPackage.map((p) => [p.title, p.count, p.grossBaseCents]), [['Crete', 2, 160000], ['Amalfi', 1, 50000]]);
eq('by destination', m.byDestination.map((d) => [d.name, d.count]), [['Greece', 2], ['Italy', 1]]);
eq('one row per day of the period', m.byDay.length, 13);
eq('a payment lands on its Toronto day (02:00Z on the 6th is the 5th)', m.byDay.find((d) => d.date === '2026-09-05')?.receivedBaseCents, 120000);
eq('a refund lands on the day it was issued', m.byDay.find((d) => d.date === '2026-09-09')?.refundedBaseCents, 20000);

const s = computeStatement(payments);
eq('gross paid', s.grossPaidBaseCents, 180000);
eq('refunds', s.refundsBaseCents, 20000);
eq('processor fees, with the unknown ones counted', [s.processorFeesBaseCents, s.feesUnknown], [3000 + 1800, 1]);
// tax: b1 10% of 100000 = 10000, less 10% of the 20000 refund = 8000; b2 10% of 20000 = 2000; b4 10% of 60000 = 6000
eq('taxes remitted pro-rated per payment, refunds signed', s.taxesRemittedBaseCents, 8000 + 2000 + 6000);
// supplier: b1 60% of (100000 - 20000) = 48000; b2 uncosted; b4 50% of 60000 = 30000
eq('supplier cost pro-rated, uncosted counted', [s.supplierCostBaseCents, s.uncostedPayments], [48000 + 30000, 1]);
eq('Net Platform Profit', s.netPlatformProfitBaseCents, 180000 - 20000 - 4800 - 16000 - 78000);
eq('revenue share at 20%', s.revenueShareBaseCents, Math.round((180000 - 20000 - 4800 - 16000 - 78000) * 0.2));

const csv = reportToCsv(resolvePeriod({}, NOW, TZ), 'CAD', m, s);
eq('the CSV carries the statement', csv.includes('Revenue share at 20%,122.40'), true);
eq('  …and the by-day rows', csv.split('\r\n').filter((l) => /^2026-09-\d\d,/.test(l)).length, 13);

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
