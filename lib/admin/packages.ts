import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * The package builder's data layer — Exhibit A B1.
 *
 * Reads with the service-role client so drafts and archived tours are visible;
 * the storefront's `anon` role can only ever see `status = 'published'`, which
 * is exactly why the console cannot share its queries.
 *
 * Every list function takes an optional `partnerId`. Passing it is how the
 * partner app reuses this module without a second copy: `packages.partner_id`
 * is the ownership column, and filtering here means no page can forget to.
 */

export type PackageListRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  isFeatured: boolean;
  currency: string;
  basePriceCents: number;
  destination: string | null;
  category: string | null;
  durationLabel: string | null;
  departureCount: number;
  nextDepartureOn: string | null;
  seatsSold: number;
  updatedAt: string;
};

export type PackageRecord = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  overview: string | null;
  status: string;
  isFeatured: boolean;
  destinationId: string | null;
  categoryId: string | null;
  tags: string[];
  durationDays: number | null;
  durationNights: number | null;
  durationLabel: string | null;
  heroImage: string | null;
  gallery: string[];
  meetingPoint: string | null;
  minimumAge: number | null;
  physicalRating: string | null;
  whatToBring: string | null;
  latitude: number | null;
  longitude: number | null;
  metaTitle: string | null;
  metaDescription: string | null;
  currency: string;
  basePriceCents: number;
  childPriceCents: number | null;
  infantPriceCents: number | null;
  singleSupplementCents: number;
  depositType: string;
  depositValue: number;
  balanceDueDaysBefore: number;
  cancellationPolicyId: string | null;
  partnerId: string | null;
  updatedAt: string;
};

export type ItineraryDay = {
  id: string; position: number; title: string; description: string | null; image: string | null;
};
export type InclusionRow = { id: string; kind: string; position: number; text: string };
export type RoomTypeRow = {
  id: string; name: string; description: string | null;
  priceAdjustmentCents: number; maxOccupancy: number; isDefault: boolean; sortOrder: number;
};
export type ExtraRow = {
  id: string; name: string; description: string | null; priceCents: number;
  per: string; capacity: number | null; status: string; sortOrder: number;
};
export type CustomFieldRow = {
  id: string; key: string; label: string; fieldType: string;
  options: string[] | null; isRequired: boolean; appliesTo: string; sortOrder: number;
};
export type CurrencyPriceRow = {
  currency: string; basePriceCents: number; childPriceCents: number | null;
  infantPriceCents: number | null; singleSupplementCents: number; depositValue: number | null;
};

/** The whole tour, for the editor. One round of queries rather than one per tab. */
export type PackageDetail = {
  pkg: PackageRecord;
  itinerary: ItineraryDay[];
  inclusions: InclusionRow[];
  rooms: RoomTypeRow[];
  extras: ExtraRow[];
  customFields: CustomFieldRow[];
  prices: CurrencyPriceRow[];
  departureCount: number;
};

export async function listPackages(partnerId?: string | null): Promise<PackageListRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  let q = db
    .from('packages')
    .select(
      'id, slug, title, status, is_featured, currency, base_price_cents, duration_label, updated_at, partner_id, destinations ( name ), categories ( name )'
    )
    .order('updated_at', { ascending: false });
  if (partnerId) q = q.eq('partner_id', partnerId);

  const { data: rows } = await q;
  if (!rows?.length) return [];

  // Departure counts in one pass rather than a query per tour.
  const today = new Date().toISOString().slice(0, 10);
  const { data: deps } = await db
    .from('departures')
    .select('package_id, starts_on, seats_booked, status')
    .in('package_id', rows.map((r) => r.id));

  const stats = new Map<string, { count: number; next: string | null; sold: number }>();
  for (const d of deps ?? []) {
    const s = stats.get(d.package_id) ?? { count: 0, next: null, sold: 0 };
    s.count += 1;
    s.sold += d.seats_booked;
    if (d.starts_on >= today && (s.next === null || d.starts_on < s.next)) s.next = d.starts_on;
    stats.set(d.package_id, s);
  }

  return rows.map((r) => {
    const s = stats.get(r.id);
    const dest = (r as { destinations?: { name: string } | null }).destinations;
    const cat = (r as { categories?: { name: string } | null }).categories;
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      status: r.status,
      isFeatured: r.is_featured,
      currency: r.currency,
      basePriceCents: r.base_price_cents,
      destination: dest?.name ?? null,
      category: cat?.name ?? null,
      durationLabel: r.duration_label,
      departureCount: s?.count ?? 0,
      nextDepartureOn: s?.next ?? null,
      seatsSold: s?.sold ?? 0,
      updatedAt: r.updated_at,
    };
  });
}

export async function getPackage(id: string, partnerId?: string | null): Promise<PackageDetail | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  let q = db.from('packages').select('*').eq('id', id);
  if (partnerId) q = q.eq('partner_id', partnerId);
  const { data: p } = await q.maybeSingle();
  if (!p) return null;

  const [
    { data: itinerary }, { data: inclusions }, { data: rooms },
    { data: extras }, { data: fields }, { data: prices }, { count: departureCount },
  ] = await Promise.all([
    db.from('itinerary_days').select('*').eq('package_id', id).order('position'),
    db.from('package_inclusions').select('*').eq('package_id', id).order('position'),
    db.from('room_types').select('*').eq('package_id', id).order('sort_order'),
    db.from('package_extras').select('*').eq('package_id', id).order('sort_order'),
    db.from('package_custom_fields').select('*').eq('package_id', id).order('sort_order'),
    db.from('package_prices').select('*').eq('package_id', id).order('currency'),
    db.from('departures').select('id', { count: 'exact', head: true }).eq('package_id', id),
  ]);

  return {
    pkg: {
      id: p.id, slug: p.slug, title: p.title, summary: p.summary, overview: p.overview,
      status: p.status, isFeatured: p.is_featured,
      destinationId: p.destination_id, categoryId: p.category_id, tags: p.tags,
      durationDays: p.duration_days, durationNights: p.duration_nights, durationLabel: p.duration_label,
      heroImage: p.hero_image, gallery: p.gallery,
      meetingPoint: p.meeting_point, minimumAge: p.minimum_age,
      physicalRating: p.physical_rating, whatToBring: p.what_to_bring,
      latitude: p.latitude, longitude: p.longitude,
      metaTitle: p.meta_title, metaDescription: p.meta_description,
      currency: p.currency, basePriceCents: p.base_price_cents,
      childPriceCents: p.child_price_cents, infantPriceCents: p.infant_price_cents,
      singleSupplementCents: p.single_supplement_cents,
      depositType: p.deposit_type, depositValue: p.deposit_value,
      balanceDueDaysBefore: p.balance_due_days_before,
      cancellationPolicyId: p.cancellation_policy_id,
      partnerId: p.partner_id, updatedAt: p.updated_at,
    },
    itinerary: (itinerary ?? []).map((d) => ({
      id: d.id, position: d.position, title: d.title, description: d.description, image: d.image,
    })),
    inclusions: (inclusions ?? []).map((i) => ({
      id: i.id, kind: i.kind, position: i.position, text: i.text,
    })),
    rooms: (rooms ?? []).map((r) => ({
      id: r.id, name: r.name, description: r.description,
      priceAdjustmentCents: r.price_adjustment_cents, maxOccupancy: r.max_occupancy,
      isDefault: r.is_default, sortOrder: r.sort_order,
    })),
    extras: (extras ?? []).map((e) => ({
      id: e.id, name: e.name, description: e.description, priceCents: e.price_cents,
      per: e.per, capacity: e.capacity, status: e.status, sortOrder: e.sort_order,
    })),
    customFields: (fields ?? []).map((f) => ({
      id: f.id, key: f.key, label: f.label, fieldType: f.field_type,
      options: f.options, isRequired: f.is_required, appliesTo: f.applies_to, sortOrder: f.sort_order,
    })),
    prices: (prices ?? []).map((pr) => ({
      currency: pr.currency, basePriceCents: pr.base_price_cents,
      childPriceCents: pr.child_price_cents, infantPriceCents: pr.infant_price_cents,
      singleSupplementCents: pr.single_supplement_cents, depositValue: pr.deposit_value,
    })),
    departureCount: departureCount ?? 0,
  };
}

/** Destinations, categories, policies and currencies — the editor's dropdowns. */
export async function getPackageOptions() {
  const db = getSupabaseAdmin();
  if (!db) {
    return { destinations: [], categories: [], policies: [], currencies: [] };
  }
  const [{ data: destinations }, { data: categories }, { data: policies }, { data: currencies }] =
    await Promise.all([
      db.from('destinations').select('id, name, path, status').order('path'),
      db.from('categories').select('id, name, status').order('sort_order'),
      db.from('policies').select('id, name, kind').order('name'),
      db.from('currencies').select('code, name, symbol, status').eq('status', 'active').order('code'),
    ]);
  return {
    destinations: (destinations ?? []).map((d) => ({ id: d.id, name: d.name, path: d.path, status: d.status })),
    categories: (categories ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status })),
    policies: (policies ?? []).map((p) => ({ id: p.id, name: p.name, kind: p.kind })),
    currencies: (currencies ?? []).map((c) => ({ code: c.code, name: c.name, symbol: c.symbol })),
  };
}

/**
 * What still stops this tour going on sale.
 *
 * Publishing something with no price, no departures and no itinerary produces a
 * live page that cannot be booked, so the checks are shown on the editor rather
 * than discovered by a traveller.
 */
export function publishBlockers(detail: PackageDetail): string[] {
  const out: string[] = [];
  const { pkg } = detail;
  if (!pkg.summary) out.push('A summary — it is the card text everywhere the tour is listed.');
  if (!pkg.heroImage) out.push('A hero image.');
  if (!pkg.destinationId) out.push('A destination, or it appears under nothing.');
  if (pkg.basePriceCents <= 0 && detail.prices.every((p) => p.basePriceCents <= 0)) {
    out.push('A price in at least one currency.');
  }
  if (detail.departureCount === 0) out.push('At least one departure, or there is nothing to book.');
  if (detail.itinerary.length === 0) out.push('An itinerary.');
  return out;
}

/** A URL-safe slug from a title, so nobody has to invent one by hand. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
