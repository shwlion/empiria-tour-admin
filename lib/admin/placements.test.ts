import { placementsCutBy, shownOnLandingPage, todayInSellerCalendar, type PlacementRecord } from './placements';

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

// ── which cards the landing page shows, and what a change would cut ─────────
// The deck in the storefront's order; the landing page shows the first four
// published. A placement is held or paid on card B, the second.
const card = (id: string, status = 'published') => ({ id, title: id, status });
const deck = [card('A'), card('B'), card('C'), card('D'), card('E')];
const held = (cardId: string): PlacementRecord => ({
  id: `p-${cardId}`, cardId, cardTitle: cardId, partnerId: 'x', partnerName: 'Acme', partnerEmail: '',
  startsOn: '2026-10-01', endsOn: '2026-10-07', title: 't', kicker: '', description: 'd', imageUrl: '/x.jpg',
  imageAlt: '', linkUrl: '/tours', priceCents: 1000, currency: 'CAD', status: 'paid', holdUntil: null,
  paidAt: '2026-09-20T12:00:00Z', note: null, decidedAt: null, createdAt: '2026-09-20T12:00:00Z',
});
const ids = (s: Set<string>) => [...s].sort();
const cutIds = (after: typeof deck, h: PlacementRecord[]) => placementsCutBy(deck, after, h).map((p) => p.cardId);

eq('the first four published are shown', ids(shownOnLandingPage(deck)), ['A', 'B', 'C', 'D']);
eq('a draft is skipped, and the fifth moves up', ids(shownOnLandingPage([card('A'), card('B', 'draft'), card('C'), card('D'), card('E')])), ['A', 'C', 'D', 'E']);
eq('fewer than four published: all of them', ids(shownOnLandingPage([card('A'), card('B', 'draft')])), ['A']);

eq('unpublishing the sold card cuts it', cutIds(deck.map((c) => (c.id === 'B' ? { ...c, status: 'draft' } : c)), [held('B')]), ['B']);
eq('unpublishing another card does not', cutIds(deck.map((c) => (c.id === 'C' ? { ...c, status: 'draft' } : c)), [held('B')]), []);
eq('a new card moved to the front pushes the sold fourth to fifth', cutIds([card('N'), card('A'), card('B'), card('C'), card('D'), card('E')], [held('D')]), ['D']);
eq('publishing a draft that sits earlier pushes the sold fourth out', placementsCutBy(
  [card('A'), card('X', 'draft'), card('B'), card('C'), card('D')],
  [card('A'), card('X'), card('B'), card('C'), card('D')],
  [held('D')]
).map((p) => p.cardId), ['D']);
eq('the fifth moving up past the sold fourth cuts it', cutIds([card('A'), card('B'), card('C'), card('E'), card('D')], [held('D')]), ['D']);
eq('swapping two shown cards cuts nothing', cutIds([card('B'), card('A'), card('C'), card('D'), card('E')], [held('A'), held('B')]), []);
eq('a card already off the page is not this change\'s doing', cutIds([card('A'), card('B'), card('C'), card('D'), card('E', 'draft')], [held('E')]), []);
eq('bringing a sold card back onto the page is allowed', placementsCutBy(
  [card('A'), card('B'), card('C'), card('D'), card('E')],
  [card('A'), card('B'), card('C'), card('E'), card('D', 'draft')],
  [held('E')]
).map((p) => p.cardId), []);

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
