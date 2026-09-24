import { getSupabaseAdmin } from '@/lib/supabase';
import { csvCell } from './reports';

/**
 * B4 — the customer directory.
 *
 * Reads `customer_directory` (migrations 0018, 0029): one row per customer,
 * which is every traveller account plus every guest who has booked, keyed on
 * the traveller's account when there is one and on the lead email when there
 * is not. A booking made while signed in to a staff or partner account is
 * keyed like a guest's — by its lead email — because that account is not a
 * customer's. The view does the joining; this module only shapes rows and
 * finds a customer's bookings, by the same rule the view counts them with.
 *
 * Lifetime value is money received, in the reporting currency at each
 * booking's frozen rate. Never the value of bookings nobody paid for, and
 * never money in another currency with no rate on record — that is left out
 * and counted in `unconvertedBookings` instead.
 */

export type CustomerRow = {
  /** The account id, or `guest:<email>` — the URL segment of the record page. */
  key: string;
  userId: string | null;
  registered: boolean;
  name: string | null;
  email: string | null;
  phone: string | null;
  marketingOptIn: boolean;
  accountStatus: string | null;
  bookingsCount: number;
  lifetimePaidBaseCents: number;
  /** Bookings holding money in another currency with no rate on record, left out of lifetime value. */
  unconvertedBookings: number;
  firstBookedAt: string | null;
  lastBookedAt: string | null;
  since: string | null;
};

export type CustomerBooking = {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
  packageTitle: string;
  departureStartsOn: string;
  totalCents: number;
  amountPaidCents: number;
  currency: string;
  guest: boolean;
};

export type CustomerRecord = {
  customer: CustomerRow;
  bookings: CustomerBooking[];
  /** The account's own address, for the edit form. Null for a guest. */
  address: Record<string, string> | null;
};

type DirectoryRow = {
  customer_key: string | null;
  user_id: string | null;
  registered: boolean | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  marketing_opt_in: boolean | null;
  account_status: string | null;
  bookings_count: number | null;
  lifetime_paid_base_cents: number | null;
  unconverted_bookings?: number | null;
  first_booked_at: string | null;
  last_booked_at: string | null;
  since: string | null;
};

const fromRow = (r: DirectoryRow): CustomerRow => ({
  key: r.customer_key ?? '',
  userId: r.user_id,
  registered: r.registered === true,
  name: r.name,
  email: r.email,
  phone: r.phone,
  marketingOptIn: r.marketing_opt_in === true,
  accountStatus: r.account_status,
  bookingsCount: r.bookings_count ?? 0,
  lifetimePaidBaseCents: Number(r.lifetime_paid_base_cents ?? 0),
  unconvertedBookings: r.unconverted_bookings ?? 0,
  firstBookedAt: r.first_booked_at,
  lastBookedAt: r.last_booked_at,
  since: r.since,
});

/** PostgREST's or() syntax characters cannot be searched for; they become spaces. */
const needle = (q: string) => q.replace(/[,()%]/g, ' ').trim();

/**
 * The directory, newest booker first. PostgREST caps every response at the
 * project's max-rows (1,000 unless raised) whatever `.limit()` asks for, and
 * caps silently — the export of 1,500 customers held 1,000 — so this reads a
 * page at a time until it has `limit` rows or the directory runs out. Pass
 * `Infinity` for all of them.
 */
export async function listCustomers(filters: { q?: string; limit?: number } = {}): Promise<CustomerRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const limit = filters.limit ?? 300;
  const q = filters.q ? needle(filters.q) : '';

  const rows: DirectoryRow[] = [];
  while (rows.length < limit) {
    let query = db
      .from('customer_directory')
      .select('*')
      .order('last_booked_at', { ascending: false, nullsFirst: false })
      .order('since', { ascending: false })
      // A unique tie-break, so consecutive pages neither overlap nor skip.
      .order('customer_key')
      .range(rows.length, Math.min(rows.length + 1000, limit) - 1);
    if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);

    const { data, error } = await query;
    if (error) {
      console.error('[customers] list failed', error.message);
      return [];
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as DirectoryRow[]));
  }
  return rows.map(fromRow).filter((c) => c.key);
}

export async function getCustomer(key: string): Promise<CustomerRecord | null> {
  const db = getSupabaseAdmin();
  if (!db || !key) return null;

  const { data } = await db.from('customer_directory').select('*').eq('customer_key', key).maybeSingle();
  if (!data) return null;
  const customer = fromRow(data as DirectoryRow);

  // The account's own address and email. The directory's `email` falls back
  // to the latest booking's once an account is closed and its email erased,
  // but the view attaches guest bookings by the account's own address only.
  let account: { email: string | null; address: unknown } | null = null;
  if (customer.userId) {
    const { data: u } = await db.from('users').select('email, address').eq('id', customer.userId).maybeSingle();
    account = u;
  }
  let address: Record<string, string> | null = null;
  if (customer.registered && customer.userId) {
    const a = account?.address;
    address = a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, string>) : {};
  }

  // The bookings the view counted for this customer, found by its rule: the
  // account's own, plus bookings under the same address that no traveller's
  // account owns — a guest's, or one made while signed in to a staff or
  // partner account. The address is compared exactly: create_booking stores
  // it lower-cased, and a LIKE pattern read an `_` in it as "any character",
  // listing other travellers' bookings on this record.
  const columns =
    'id, reference, status, created_at, total_cents, amount_paid_cents, currency, user_id, ' +
    'packages!inner ( title ), departures!inner ( starts_on ), booker:users!bookings_user_id_fkey ( role )';
  const email = customer.userId ? (account?.email ?? '').toLowerCase() : key.replace(/^guest:/, '');
  const [own, byEmail] = await Promise.all([
    customer.userId
      ? db.from('bookings').select(columns).eq('user_id', customer.userId).order('created_at', { ascending: false }).limit(200)
      : null,
    email ? db.from('bookings').select(columns).eq('lead_email', email).order('created_at', { ascending: false }).limit(200) : null,
  ]);

  type Joined = {
    id: string; reference: string; status: string; created_at: string; total_cents: number;
    amount_paid_cents: number; currency: string; user_id: string | null;
    packages: { title: string }; departures: { starts_on: string }; booker: { role: string } | null;
  };
  const noTravellerOwns = (b: Joined) => b.user_id === null || b.booker?.role !== 'traveller';
  const byId = new Map<string, Joined>();
  for (const b of (own?.data ?? []) as unknown as Joined[]) byId.set(b.id, b);
  for (const b of (byEmail?.data ?? []) as unknown as Joined[]) if (noTravellerOwns(b)) byId.set(b.id, b);
  const rows = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200);

  return {
    customer,
    address,
    bookings: rows.map((b) => ({
      id: b.id,
      reference: b.reference,
      status: b.status,
      createdAt: b.created_at,
      packageTitle: b.packages.title,
      departureStartsOn: b.departures.starts_on,
      totalCents: b.total_cents,
      amountPaidCents: b.amount_paid_cents,
      currency: b.currency,
      guest: noTravellerOwns(b),
    })),
  };
}

// ── CSV ───────────────────────────────────────────────────────────────────────

/** Excel on Windows reads UTF-8 only when told; the BOM is how it is told. */
export const CSV_BOM = '﻿';

export function customersToCsv(rows: CustomerRow[], currency: string): string {
  const head = ['Name', 'Email', 'Phone', 'Registered', 'Marketing opt-in', 'Bookings', `Lifetime value (${currency})`, 'Bookings left out (no exchange rate)', 'First booked', 'Last booked'];
  const lines = rows.map((c) =>
    [
      c.name,
      c.email,
      c.phone,
      c.registered ? 'yes' : 'guest',
      c.marketingOptIn ? 'yes' : 'no',
      c.bookingsCount,
      (c.lifetimePaidBaseCents / 100).toFixed(2),
      c.unconvertedBookings,
      c.firstBookedAt?.slice(0, 10) ?? '',
      c.lastBookedAt?.slice(0, 10) ?? '',
    ]
      .map(csvCell)
      .join(',')
  );
  return [head.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n';
}
