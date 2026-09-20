import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Paid promotion of the landing-page postcards (migration 0021).
 *
 * A partner asks for one card over a date range, Empiria approves it and sets
 * a price, the partner pays, and for those days the card carries their words.
 * This module is the console's half: the queue, the calendar of what is sold,
 * and the arithmetic behind a quote.
 *
 * Two things deliberately do NOT live here:
 *
 *   - The overlap rule. 0021's exclusion constraint refuses two held or paid
 *     placements on one card over overlapping days, so `approve` does not
 *     check first and write second — it writes, and reports the violation if
 *     the database raises one. A check here would have a window.
 *
 *   - "Live". A placement is on screen when it is paid and today is inside
 *     its range, derived by the storefront at read time. Nothing in the
 *     console flips a status when a campaign starts.
 */

/** Migration 0021's check constraints, so a form can refuse before the database has to. */
export const PLACEMENT_LIMITS = { title: 60, kicker: 40, description: 140 } as const;

/** The longest window one request may buy, in days. Empiria can always approve two. */
export const MAX_PLACEMENT_DAYS = 120;

export type PlacementStatus = 'requested' | 'approved' | 'paid' | 'rejected' | 'cancelled';

export type PlacementRecord = {
  id: string;
  cardId: string;
  /** The slot's own title, so the queue can say which postcard without a second lookup. */
  cardTitle: string;
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  startsOn: string;
  endsOn: string;
  title: string;
  kicker: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  linkUrl: string;
  priceCents: number | null;
  currency: string;
  status: PlacementStatus;
  holdUntil: string | null;
  paidAt: string | null;
  note: string | null;
  decidedAt: string | null;
  createdAt: string;
};

type PlacementJoined = {
  id: string; card_id: string; partner_id: string; starts_on: string; ends_on: string;
  title: string; kicker: string; description: string; image_url: string; image_alt: string;
  link_url: string; price_cents: number | null; currency: string; status: string;
  hold_until: string | null; paid_at: string | null; note: string | null;
  decided_at: string | null; created_at: string;
  showcase_cards: { title: string } | null;
  users: { name: string | null; email: string } | null;
};

const STATUSES: PlacementStatus[] = ['requested', 'approved', 'paid', 'rejected', 'cancelled'];

function toPlacement(r: PlacementJoined): PlacementRecord {
  return {
    id: r.id,
    cardId: r.card_id,
    cardTitle: r.showcase_cards?.title ?? 'A deleted card',
    partnerId: r.partner_id,
    partnerName: r.users?.name ?? r.users?.email ?? 'Unknown partner',
    partnerEmail: r.users?.email ?? '',
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    title: r.title,
    kicker: r.kicker,
    description: r.description,
    imageUrl: r.image_url,
    imageAlt: r.image_alt,
    linkUrl: r.link_url,
    priceCents: r.price_cents,
    currency: r.currency,
    // The database constrains it to these five; narrowing here keeps the
    // union honest rather than letting `string` leak into the UI.
    status: (STATUSES as string[]).includes(r.status) ? (r.status as PlacementStatus) : 'requested',
    holdUntil: r.hold_until,
    paidAt: r.paid_at,
    note: r.note,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
  };
}

const SELECT =
  'id, card_id, partner_id, starts_on, ends_on, title, kicker, description, image_url, image_alt, ' +
  'link_url, price_cents, currency, status, hold_until, paid_at, note, decided_at, created_at, ' +
  'showcase_cards ( title ), users!showcase_placements_partner_id_fkey ( name, email )';

/**
 * The queue: everything still needing a decision, oldest first — a partner who
 * asked on Monday should not be behind one who asked on Friday — then
 * everything settled, newest first.
 */
export async function listPlacements(status?: PlacementStatus): Promise<PlacementRecord[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  let q = db.from('showcase_placements').select(SELECT);
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(500);
  if (error || !data) return [];
  const rows = (data as unknown as PlacementJoined[]).map(toPlacement);
  const pending = rows.filter((p) => p.status === 'requested').reverse();
  return [...pending, ...rows.filter((p) => p.status !== 'requested')];
}

export async function getPlacement(id: string): Promise<PlacementRecord | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data } = await db.from('showcase_placements').select(SELECT).eq('id', id).maybeSingle();
  return data ? toPlacement(data as unknown as PlacementJoined) : null;
}

/** Cards that may be sold at all, with the rate each would quote. */
export type SellableCard = {
  id: string;
  title: string;
  sortOrder: number;
  sellable: boolean;
  /** The card's own rate, or null when it falls back to the platform's. */
  rateCentsPerWeek: number | null;
  effectiveRateCentsPerWeek: number;
};

export async function listSellableCards(): Promise<{ cards: SellableCard[]; defaultRateCents: number; currency: string }> {
  const db = getSupabaseAdmin();
  if (!db) return { cards: [], defaultRateCents: 0, currency: 'CAD' };
  const [cardsRes, settingsRes] = await Promise.all([
    db.from('showcase_cards').select('id, title, sort_order, sellable, rate_cents_per_week').order('sort_order'),
    db.from('platform_settings').select('showcase_rate_cents_per_week, default_currency').eq('id', true).maybeSingle(),
  ]);
  const defaultRateCents = settingsRes.data?.showcase_rate_cents_per_week ?? 0;
  const currency = settingsRes.data?.default_currency ?? 'CAD';
  const cards = (cardsRes.data ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    sortOrder: c.sort_order,
    sellable: c.sellable,
    rateCentsPerWeek: c.rate_cents_per_week,
    effectiveRateCentsPerWeek: c.rate_cents_per_week ?? defaultRateCents,
  }));
  return { cards, defaultRateCents, currency };
}

/**
 * What a window costs at a given weekly rate.
 *
 * Priced by the day, from the week — a partner who buys ten days pays ten
 * sevenths of a week, not two. Both ends are inclusive, because a placement
 * that runs "the 5th to the 11th" runs on the 11th; that is the same range
 * the exclusion constraint compares, so the price and the slot always agree
 * about which days were bought.
 *
 * Rounded once, at the end. A per-day rounding would drift a cent a day.
 */
export function quoteCents(startsOn: string, endsOn: string, rateCentsPerWeek: number): number {
  const days = placementDays(startsOn, endsOn);
  if (days <= 0 || rateCentsPerWeek <= 0) return 0;
  return Math.round((rateCentsPerWeek * days) / 7);
}

/** Inclusive day count. Zero when the range is backwards or unparseable. */
export function placementDays(startsOn: string, endsOn: string): number {
  const a = Date.parse(`${startsOn}T00:00:00Z`);
  const b = Date.parse(`${endsOn}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * The placements already holding days on a card, so the console can show a
 * conflict before an admin approves into one and the database refuses.
 *
 * This is a courtesy, not the rule: the rule is 0021's exclusion constraint.
 * Two admins approving at once still cannot both win, whatever this returns.
 */
export async function conflictsFor(
  cardId: string,
  startsOn: string,
  endsOn: string,
  ignoreId?: string
): Promise<PlacementRecord[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  let q = db
    .from('showcase_placements')
    .select(SELECT)
    .eq('card_id', cardId)
    .in('status', ['approved', 'paid'])
    .lte('starts_on', endsOn)
    .gte('ends_on', startsOn);
  if (ignoreId) q = q.neq('id', ignoreId);
  const { data } = await q;
  return ((data ?? []) as unknown as PlacementJoined[]).map(toPlacement);
}
