import { resolvePeriod, startOfDay, dateIn, computeMetrics, computeStatement, reportToCsv, isSale, csvCell, type ReportBooking, type ReportPayment } from './reports';

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

// ── the calendar refuses dates that do not exist ────────────────────────────
eq('31 February is not a date: the range falls back to this month', resolvePeriod({ period: 'custom', from: '2026-02-31', to: '2026-02-31' }, NOW, TZ).key, 'month');
eq('  …nor is 29 February in a common year', resolvePeriod({ period: 'custom', from: '2026-02-29', to: '2026-03-01' }, NOW, TZ).key, 'month');
eq('  …but it is in a leap year', (({ key, fromDate }) => [key, fromDate])(resolvePeriod({ period: 'custom', from: '2024-02-29', to: '2024-03-01' }, NOW, TZ)), ['custom', '2024-02-29']);

// ── what counts as a sale ────────────────────────────────────────────────────
eq('a checkout whose hold lapsed (cancelled, nothing paid) is not a sale', isSale({ status: 'cancelled', amountPaidCents: 0 }), false);
eq('  …a refunded booking still is', isSale({ status: 'refunded', amountPaidCents: 0 }), true);
eq('  …and so is a cancelled booking still holding money', isSale({ status: 'cancelled', amountPaidCents: 5000 }), true);
{
  const lapsed = [booking({ id: 'x1' }), ...Array.from({ length: 40 }, (_, i) => booking({ id: `lapsed${i}`, status: 'cancelled', amountPaidCents: 0, balanceCents: 100000 }))];
  const mm = computeMetrics(lapsed, [], [], period, TZ);
  eq('forty abandoned checkouts add nothing to gross bookings', [mm.bookingsCount, mm.grossBookingsBaseCents, mm.uncostedBookings], [1, 100000, 0]);
}

// ── rounding never makes or loses a cent ─────────────────────────────────────
// A $20 booking carrying 15 cents of tax: half of it is 7.5 cents.
const half = { totalCents: 2000, taxCents: 15, supplierCostCents: null };
{
  const s1 = computeStatement([
    pay({ bookingId: 'r', amountCents: 1000, processorFeeCents: 0, booking: half }),
    pay({ bookingId: 'r', createdAt: '2026-09-06T15:05:00Z', kind: 'refund', amountCents: -1000, processorFeeCents: null, booking: half }),
  ]);
  eq('a payment refunded in full nets to exactly nothing', [s1.grossPaidBaseCents, s1.refundsBaseCents, s1.taxesRemittedBaseCents, s1.netPlatformProfitBaseCents], [1000, 1000, 0, 0]);
  eq('  …and its revenue share is 0, not -0 (which printed "-$0")', Object.is(s1.revenueShareBaseCents, 0), true);
}
{
  const fx = 1.3335; // 1000 × 1.3335 is exactly 1333.5
  const both = [
    pay({ bookingId: 'u', amountCents: 1000, processorFeeCents: 0, fx, booking: half }),
    pay({ bookingId: 'u', createdAt: '2026-09-06T15:05:00Z', kind: 'refund', amountCents: -1000, processorFeeCents: null, fx, booking: half }),
  ];
  const s2 = computeStatement(both);
  const m2 = computeMetrics([], both, [], period, TZ);
  eq('a converted refund mirrors its payment to the cent', [s2.grossPaidBaseCents, s2.refundsBaseCents, s2.netPlatformProfitBaseCents], [1334, 1334, 0]);
  eq('  …and the tiles agree with the statement', [m2.paymentsReceivedBaseCents, m2.refundsIssuedBaseCents], [s2.grossPaidBaseCents, s2.refundsBaseCents]);
}
{
  const s3 = computeStatement([
    pay({ bookingId: 'h', amountCents: 1000, processorFeeCents: 0, booking: half }),
    pay({ bookingId: 'h', createdAt: '2026-09-07T15:05:00Z', kind: 'balance', amountCents: 1000, processorFeeCents: 0, booking: half }),
  ]);
  eq('two halves of a booking carry exactly its tax (15, not 8 + 8)', s3.taxesRemittedBaseCents, 15);
  const sept = computeStatement([pay({ bookingId: 'h', amountCents: 1000, processorFeeCents: 0, booking: half })]);
  const oct = computeStatement([pay({ bookingId: 'h', createdAt: '2026-10-07T15:05:00Z', kind: 'balance', amountCents: 1000, processorFeeCents: 0, booking: { ...half, paidBeforeCents: 1000 } })]);
  eq('  …across two periods as well, because the second starts from the first', [sept.taxesRemittedBaseCents, oct.taxesRemittedBaseCents], [8, 7]);
  const later = computeStatement([pay({ bookingId: 'h', createdAt: '2026-10-07T15:05:00Z', kind: 'refund', amountCents: -1000, processorFeeCents: null, fx: 1.3335, booking: { ...half, paidBeforeCents: 1000 } })]);
  eq('  …and a refund in a later period gives back what its payment took', [later.refundsBaseCents, later.taxesRemittedBaseCents], [1334, -10]);
  const split = computeStatement([
    pay({ bookingId: 'v', amountCents: 1000, processorFeeCents: 0, fx: 1.3335, booking: half }),
    pay({ bookingId: 'v', createdAt: '2026-09-07T15:05:00Z', kind: 'balance', amountCents: 1000, processorFeeCents: 0, fx: 1.3335, booking: half }),
  ]);
  eq('  …and a converted booking paid in two parts converts as a whole (2667, not 1334 + 1334)', split.grossPaidBaseCents, 2667);
}
{
  const loss = computeStatement([pay({ bookingId: 'l', amountCents: 1000, processorFeeCents: 1002, booking: { totalCents: 1000, taxCents: 0, supplierCostCents: 0 } })]);
  eq('a two-cent loss shares out as 0, not -0', [loss.netPlatformProfitBaseCents, Object.is(loss.revenueShareBaseCents, 0)], [-2, true]);
}

// ── a booking with no exchange rate is left out and counted, never taken at par
{
  const eur = booking({ id: 'e1', packageId: 'p3', packageTitle: 'Provence', destination: 'France', totalCents: 300000, taxCents: 0, supplierCostCents: null, amountPaidCents: 300000, fx: null });
  const eurPay = pay({ bookingId: 'e1', amountCents: 300000, processorFeeCents: null, fx: null, booking: { totalCents: 300000, taxCents: 0, supplierCostCents: null } });
  const eurRefund = pay({ bookingId: 'e1', createdAt: '2026-09-10T12:00:00Z', kind: 'refund', amountCents: -1000, processorFeeCents: null, fx: null, booking: { totalCents: 300000, taxCents: 0, supplierCostCents: null } });
  const mx = computeMetrics([...bookings, eur], [...payments, eurPay, eurRefund], [{ status: 'balance_due', balanceCents: 30000, fx: 1 }, { status: 'confirmed', balanceCents: 50000, fx: null }], period, TZ);
  eq('an unconverted booking adds nothing to the booking figures', [mx.bookingsCount, mx.grossBookingsBaseCents, mx.averageBookingBaseCents, mx.byPackage.length], [m.bookingsCount, m.grossBookingsBaseCents, m.averageBookingBaseCents, m.byPackage.length]);
  eq('  …and is counted instead', mx.unconvertedBookings, 1);
  eq('  …its money is left out of received and refunded, and counted', [mx.paymentsReceivedBaseCents, mx.refundsIssuedBaseCents, mx.unconvertedPayments, mx.unconvertedRefunds], [m.paymentsReceivedBaseCents, m.refundsIssuedBaseCents, 1, 1]);
  eq('  …an open balance with no rate is left out of balances outstanding, and counted', [mx.balancesOutstandingBaseCents, mx.unconvertedOpenBookings], [30000, 1]);
  const sx = computeStatement([...payments, eurPay, eurRefund]);
  eq('  …and out of every line of the statement, which says how many', [sx.grossPaidBaseCents, sx.netPlatformProfitBaseCents, sx.unconvertedPayments, sx.unconvertedRefunds], [s.grossPaidBaseCents, s.netPlatformProfitBaseCents, 1, 1]);
  const cx = reportToCsv(resolvePeriod({}, NOW, TZ), 'CAD', mx, sx);
  eq('  …and so does the CSV', [cx.includes('Gross bookings,2100.00,3,1 booking with no exchange rate left out'), cx.includes('Gross booking value paid,1800.00,1 payment with no exchange rate left out')], [true, true]);
}

// ── the CSV is safe to open in a spreadsheet ────────────────────────────────
{
  const planted = computeMetrics(
    [booking({ id: 'z1', packageId: 'pz', packageTitle: '=HYPERLINK("https://phish.example","Click")' }), booking({ id: 'z2', packageId: 'py', packageTitle: '@SUM(1)', destination: '+Island' })],
    [pay({ kind: 'refund', amountCents: -20000, processorFeeCents: null })],
    [],
    period,
    TZ
  );
  const out = reportToCsv(resolvePeriod({}, NOW, TZ), 'CAD', planted, computeStatement([pay({ kind: 'refund', amountCents: -20000, processorFeeCents: null })]));
  eq('a partner-typed formula in a tour title is neutralised', out.includes(`"'=HYPERLINK(""https://phish.example"",""Click"")",1000.00,1`), true);
  eq('  …and so are @ and + lead-ins', [out.includes("'@SUM(1),1000.00,1"), out.includes("'+Island,1000.00,1")], [true, true]);
  eq('  …while a negative amount stays a number', out.includes('Less refunds and chargebacks,-200.00'), true);
}
eq('a tab-led cell is neutralised', csvCell('\t=cmd'), "'\t=cmd");
eq('  …and a carriage-return-led one is quoted as well', csvCell('\r=1+1'), `"'\r=1+1"`);
eq('  …a phone number with a + keeps its digits behind the quote', csvCell('+1 416 555 0100'), "'+1 416 555 0100");
eq('  …and plain numbers are left alone', [csvCell('-2700.00'), csvCell(-5), csvCell('42')], ['-2700.00', '-5', '42']);

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
