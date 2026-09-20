import type { Metadata } from 'next';
import { PageHeader, Banner, Card, EmptyState } from '@/components/ui';
import { requireCapability } from '@/lib/auth';
import { formatPrice } from '@/lib/money';
import { listPlacements, listSellableCards, quoteCents, placementDays } from '@/lib/admin/placements';
import PlacementQueue from './PlacementQueue';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Promotions · Empiria Tour Admin' };

/**
 * Partners asking to buy one of the four landing-page postcards (0021).
 *
 * The queue is the page: requests needing a decision first, everything settled
 * beneath. Each row carries the price the rate card would quote, so approving
 * at the published rate is one click and charging something else is a
 * deliberate edit rather than an arithmetic exercise.
 *
 * Two conditions are surfaced rather than left to be discovered:
 *
 *   - No rate set. With the platform rate at zero nothing can be quoted, so
 *     the page says so instead of offering to approve at $0.00.
 *   - No sellable cards. Every card is `sellable = false` until somebody says
 *     otherwise, which is deliberate — but it also means partners cannot ask
 *     for anything, and an empty queue would otherwise look like no demand.
 */
export default async function PlacementsPage() {
  await requireCapability('manageSettings');
  const [placements, { cards, defaultRateCents, currency }] = await Promise.all([
    listPlacements(),
    listSellableCards(),
  ]);

  const sellable = cards.filter((c) => c.sellable);
  const pending = placements.filter((p) => p.status === 'requested');
  const money = (c: number) => formatPrice(c, currency);

  // The rate card, and what each card would quote for a week, so the page can
  // say the price out loud rather than making somebody work it out.
  const rows = placements.map((p) => {
    const card = cards.find((c) => c.id === p.cardId);
    const rate = card?.effectiveRateCentsPerWeek ?? defaultRateCents;
    return {
      placement: p,
      days: placementDays(p.startsOn, p.endsOn),
      suggestedCents: quoteCents(p.startsOn, p.endsOn, rate),
      rateCentsPerWeek: rate,
    };
  });

  return (
    <>
      <PageHeader
        title="Promotions"
        description="Partners buying a landing-page postcard. Approve one and it holds those days; the partner pays, and their card runs for the window they bought."
      />

      {sellable.length === 0 && (
        <Banner tone="info">
          None of the four postcards is for sale yet, so partners cannot request one. Mark a card
          sellable under Content → Showcase.
        </Banner>
      )}

      {sellable.length > 0 && defaultRateCents === 0 && cards.every((c) => c.rateCentsPerWeek == null) && (
        <Banner tone="info">
          No weekly rate is set, so nothing can be quoted. Set one under Settings, or give a card its
          own rate under Content → Showcase.
        </Banner>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[12px] font-medium text-muted-foreground">Awaiting a decision</p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">{pending.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[12px] font-medium text-muted-foreground">Cards for sale</p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {sellable.length} <span className="text-[13px] font-normal text-muted-foreground">of {cards.length}</span>
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[12px] font-medium text-muted-foreground">Published rate</p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {defaultRateCents > 0 ? money(defaultRateCents) : '—'}
            <span className="ml-1 text-[13px] font-normal text-muted-foreground">per week</span>
          </p>
        </div>
      </div>

      {placements.length === 0 ? (
        <Card title="Requests">
          <EmptyState
            title="No requests yet"
            description={
              sellable.length === 0
                ? 'Mark a postcard sellable and partners will be able to ask for it.'
                : 'Partners can request a postcard from their dashboard. Anything they ask for lands here.'
            }
          />
        </Card>
      ) : (
        <PlacementQueue rows={rows} currency={currency} />
      )}
    </>
  );
}
