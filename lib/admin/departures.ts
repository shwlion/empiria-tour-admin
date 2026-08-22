import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Departures — Exhibit A B2.
 *
 * A departure is the thing that is actually sold: a package is a description,
 * a departure is a date with a number of seats on it. Which is why the numbers
 * here are read-only from the console's point of view — `seats_booked` and
 * `seats_held` are moved by `claim_seats` and `confirm_hold_seats` inside the
 * database, never by a form.
 */

export type DepartureRow = {
  id: string;
  startsOn: string;
  endsOn: string | null;
  startTime: string | null;
  capacity: number;
  seatsBooked: number;
  seatsHeld: number;
  seatsAvailable: number;
  status: string;
  priceOverrideCents: number | null;
  childPriceOverrideCents: number | null;
  salesOpenAt: string | null;
  salesCloseAt: string | null;
};

export type DepartureWithPackage = DepartureRow & {
  packageId: string;
  packageTitle: string;
  packageSlug: string;
  currency: string;
};

function toRow(d: {
  id: string; starts_on: string; ends_on: string | null; start_time: string | null;
  capacity: number; seats_booked: number; seats_held: number; status: string;
  price_override_cents: number | null; child_price_override_cents: number | null;
  sales_open_at: string | null; sales_close_at: string | null;
}): DepartureRow {
  return {
    id: d.id,
    startsOn: d.starts_on,
    endsOn: d.ends_on,
    startTime: d.start_time,
    capacity: d.capacity,
    seatsBooked: d.seats_booked,
    seatsHeld: d.seats_held,
    seatsAvailable: Math.max(d.capacity - d.seats_booked - d.seats_held, 0),
    status: d.status,
    priceOverrideCents: d.price_override_cents,
    childPriceOverrideCents: d.child_price_override_cents,
    salesOpenAt: d.sales_open_at,
    salesCloseAt: d.sales_close_at,
  };
}

export async function listDeparturesForPackage(packageId: string): Promise<DepartureRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  // Lapsed holds still count against seats_held until something clears them, so
  // the console would otherwise show seats as unavailable that nobody holds.
  await db.rpc('expire_stale_holds', {});
  const { data } = await db
    .from('departures')
    .select('*')
    .eq('package_id', packageId)
    .order('starts_on');
  return (data ?? []).map(toRow);
}

/** Every upcoming departure across the catalogue — the cross-tour view. */
export async function listUpcomingDepartures(
  partnerId?: string | null,
  limit = 200
): Promise<DepartureWithPackage[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const today = new Date().toISOString().slice(0, 10);
  let q = db
    .from('departures')
    .select('*, packages!inner ( id, title, slug, currency, partner_id )')
    .gte('starts_on', today)
    .order('starts_on')
    .limit(limit);
  if (partnerId) q = q.eq('packages.partner_id', partnerId);

  const { data } = await q;
  type Joined = Parameters<typeof toRow>[0] & {
    packages: { id: string; title: string; slug: string; currency: string };
  };
  return ((data ?? []) as unknown as Joined[]).map((d) => ({
    ...toRow(d),
    packageId: d.packages.id,
    packageTitle: d.packages.title,
    packageSlug: d.packages.slug,
    currency: d.packages.currency,
  }));
}

/**
 * The dates a recurrence rule would produce.
 *
 * Pure and exported so the generator can show exactly what it is about to
 * create before it creates it. Bulk-generating a season and finding out
 * afterwards is how a catalogue ends up with sixty wrong departures.
 */
export function expandRecurrence(opts: {
  from: string;
  to: string;
  /** 0 = Sunday … 6 = Saturday. Empty means every day in the interval. */
  weekdays: number[];
  /** Every N days, applied when no weekdays are chosen. */
  everyDays: number;
  max?: number;
}): string[] {
  const { from, to, weekdays, everyDays, max = 200 } = opts;
  if (!from || !to || to < from) return [];

  const parse = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };

  const out: string[] = [];
  const end = parse(to);
  const step = weekdays.length > 0 ? 1 : Math.max(1, everyDays);

  for (let cursor = parse(from); cursor <= end && out.length < max; ) {
    if (weekdays.length === 0 || weekdays.includes(cursor.getUTCDay())) {
      out.push(cursor.toISOString().slice(0, 10));
    }
    cursor = new Date(cursor.getTime() + step * 86_400_000);
  }
  return out;
}

/** A departure's end date, from the package's length. Same day when it is a day tour. */
export function endDateFor(startsOn: string, durationDays: number | null): string | null {
  if (!durationDays || durationDays <= 1) return null;
  const [y, m, d] = startsOn.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + durationDays - 1);
  return dt.toISOString().slice(0, 10);
}
