import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * B4 — the customer directory.
 *
 * Reads `customer_directory` (migration 0018): one row per customer, which is
 * every traveller account plus every guest who has booked, keyed on the
 * account when there is one and on the lead email when there is not. The
 * view does the joining; this module only shapes rows and finds a customer's
 * bookings — which, for a registered traveller, include guest bookings made
 * under the same address before they signed up, exactly as the view counts
 * them.
 *
 * Lifetime value is money received, in the platform's default currency at
 * each booking's frozen rate. Never the value of bookings nobody paid for.
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
  firstBookedAt: r.first_booked_at,
  lastBookedAt: r.last_booked_at,
  since: r.since,
});

/** PostgREST's or() syntax characters cannot be searched for; they become spaces. */
const needle = (q: string) => q.replace(/[,()%]/g, ' ').trim();

export async function listCustomers(filters: { q?: string; limit?: number } = {}): Promise<CustomerRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  let query = db
    .from('customer_directory')
    .select('*')
    .order('last_booked_at', { ascending: false, nullsFirst: false })
    .order('since', { ascending: false })
    .limit(filters.limit ?? 300);

  const q = filters.q ? needle(filters.q) : '';
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) {
    console.error('[customers] list failed', error.message);
    return [];
  }
  return ((data ?? []) as DirectoryRow[]).map(fromRow).filter((c) => c.key);
}

export async function getCustomer(key: string): Promise<CustomerRecord | null> {
  const db = getSupabaseAdmin();
  if (!db || !key) return null;

  const { data } = await db.from('customer_directory').select('*').eq('customer_key', key).maybeSingle();
  if (!data) return null;
  const customer = fromRow(data as DirectoryRow);

  // The bookings the view counted for this customer: by account, plus guest
  // bookings under the same address for a registered traveller.
  let bq = db
    .from('bookings')
    .select(
      'id, reference, status, created_at, total_cents, amount_paid_cents, currency, user_id, ' +
        'packages!inner ( title ), departures!inner ( starts_on )'
    )
    .order('created_at', { ascending: false })
    .limit(200);
  const email = customer.email ? needle(customer.email) : '';
  if (customer.userId) {
    bq = email
      ? bq.or(`user_id.eq.${customer.userId},and(user_id.is.null,lead_email.ilike.${email})`)
      : bq.eq('user_id', customer.userId);
  } else {
    bq = bq.is('user_id', null).ilike('lead_email', key.replace(/^guest:/, ''));
  }
  const { data: rows } = await bq;

  let address: Record<string, string> | null = null;
  if (customer.registered && customer.userId) {
    const { data: u } = await db.from('users').select('address').eq('id', customer.userId).maybeSingle();
    const a = u?.address;
    address = a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, string>) : {};
  }

  type Joined = {
    id: string; reference: string; status: string; created_at: string; total_cents: number;
    amount_paid_cents: number; currency: string; user_id: string | null;
    packages: { title: string }; departures: { starts_on: string };
  };
  return {
    customer,
    address,
    bookings: ((rows ?? []) as unknown as Joined[]).map((b) => ({
      id: b.id,
      reference: b.reference,
      status: b.status,
      createdAt: b.created_at,
      packageTitle: b.packages.title,
      departureStartsOn: b.departures.starts_on,
      totalCents: b.total_cents,
      amountPaidCents: b.amount_paid_cents,
      currency: b.currency,
      guest: b.user_id === null,
    })),
  };
}

// ── CSV ───────────────────────────────────────────────────────────────────────

/** Excel on Windows reads UTF-8 only when told; the BOM is how it is told. */
export const CSV_BOM = '﻿';

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // A cell beginning with =, +, -, @ is a formula to a spreadsheet, and a
  // customer typed their own name: neutralise it rather than trust it.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function customersToCsv(rows: CustomerRow[], currency: string): string {
  const head = ['Name', 'Email', 'Phone', 'Registered', 'Marketing opt-in', 'Bookings', `Lifetime value (${currency})`, 'First booked', 'Last booked'];
  const lines = rows.map((c) =>
    [
      c.name,
      c.email,
      c.phone,
      c.registered ? 'yes' : 'guest',
      c.marketingOptIn ? 'yes' : 'no',
      c.bookingsCount,
      (c.lifetimePaidBaseCents / 100).toFixed(2),
      c.firstBookedAt?.slice(0, 10) ?? '',
      c.lastBookedAt?.slice(0, 10) ?? '',
    ]
      .map(cell)
      .join(',')
  );
  return [head.map(cell).join(','), ...lines].join('\r\n') + '\r\n';
}
