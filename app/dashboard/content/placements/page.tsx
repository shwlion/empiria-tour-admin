import type { Metadata } from 'next';
import { PageHeader, Banner, Card, EmptyState } from '@/components/ui';
import { requireCapability } from '@/lib/auth';
import { formatPrice } from '@/lib/money';
import { listPlacements, listSellableCards, quoteCents, placementDays, todayInSellerCalendar } from '@/lib/admin/placements';
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
 *   - No sellable cards. Every card is `sellable = false` until somebody says
 *     otherwise, which is deliberate — but it also means partners cannot ask
 *     for anything, and an empty queue would otherwise look like no demand.
 *   - A card marked sellable that partners are not offered, and why: it is not
 *     on the landing page (a draft, or past the fourth published card), or
 *     its rate comes to zero, so nothing can be quoted. "For sale" here means
 *     what the partner dashboard offers, not what the checkbox says.
 *
 * A queue that could not be read says so, for the same reason: it once
 * showed "No requests yet" to every administrator while partners' requests
 * sat in the table behind a broken select.
 */
export default async function PlacementsPage() {
  await requireCapability('manageSettings');
  const [read, { cards, defaultRateCents, currency }] = await Promise.all([
    listPlacements(),
    listSellableCards(),
  ]);
  const placements = read ?? [];
  const today = todayInSellerCalendar();

  const marked = cards.filter((c) => c.sellable);
  const offered = cards.filter((c) => c.offered);
  const withheld = marked.filter((c) => !c.offered);
  const shown = cards.filter((c) => c.onLandingPage).length;
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

      {marked.length === 0 && (
        <Banner tone="info">
          None of the four postcards is for sale yet, so partners cannot request one. Mark a card
          sellable under Content → Showcase.
        </Banner>
      )}

      {withheld.length > 0 && (
        <Banner tone="info">
          Marked for sale, but not offered to partners:{' '}
          {withheld.map((c, i) => (
            <span key={c.id}>
              {i > 0 && '; '}“{c.title}”{' '}
              {c.onLandingPage
                ? 'has no weekly rate, so nothing can be quoted — give it one under Content → Showcase, or set the platform rate under Settings'
                : 'is not on the landing page — it is a draft, or past the fourth published postcard'}
            </span>
          ))}
          .
        </Banner>
      )}

      {read === null && (
        <Banner tone="error">
          The requests could not be read, so partners may be waiting on decisions this page cannot
          show. The reason is in the server log.
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
            {offered.length}{' '}
            <span className="text-[13px] font-normal text-muted-foreground">of {shown} on the landing page</span>
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

      {read === null ? null : placements.length === 0 ? (
        <Card title="Requests">
          <EmptyState
            title="No requests yet"
            description={
              offered.length === 0
                ? 'Put a postcard on sale — sellable, on the landing page, with a rate — and partners will be able to ask for it.'
                : 'Partners can request a postcard from their dashboard. Anything they ask for lands here.'
            }
          />
        </Card>
      ) : (
        <PlacementQueue rows={rows} currency={currency} today={today} />
      )}
    </>
  );
}
