import { todayInSellerCalendar } from './placements';

/**
 * The paid postcards' calendar arithmetic.
 *
 *   bun run lib/admin/placements.test.ts
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

// ── which day it is ─────────────────────────────────────────────────────────
// 10:30 p.m. in Toronto on 23 Sep 2026 is already 24 Sep in UTC, which is
// where the console and the storefront used to disagree.
eq('the seller\'s day, not UTC\'s, at 10:30 p.m. in September', todayInSellerCalendar(new Date('2026-09-24T02:30:00Z')), '2026-09-23');
eq('…and UTC\'s day would have been the next one', new Date('2026-09-24T02:30:00Z').toISOString().slice(0, 10), '2026-09-24');
eq('the day turns at midnight in Toronto (04:00Z in summer)', todayInSellerCalendar(new Date('2026-09-24T04:00:00Z')), '2026-09-24');
eq('…and at 05:00Z in winter', [todayInSellerCalendar(new Date('2026-01-15T04:59:59Z')), todayInSellerCalendar(new Date('2026-01-15T05:00:00Z'))], ['2026-01-14', '2026-01-15']);

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
