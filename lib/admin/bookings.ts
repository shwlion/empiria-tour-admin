import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Bookings and manifests — Exhibit A B3.
 *
 * Everything here is read-shaped. The console never moves seats or money
 * directly: seats belong to `claim_seats`/`confirm_hold_seats`, money to
 * `record_payment`, all inside the database. What B3 adds is the staff view of
 * what those functions have done — plus the two writes that are genuinely
 * staff's to make (internal notes and the §4.6 supplier cost), which live in
 * the server actions, not here.
 */

/** Statuses that mean somebody is actually travelling. */
export const TRAVELLING_STATUSES = ['confirmed', 'balance_due', 'paid_in_full', 'travelled'] as const;

export const BOOKING_STATUSES = [
  'pending_payment', 'confirmed', 'balance_due', 'paid_in_full',
  'travelled', 'cancelled', 'refunded',
] as const;

export type EmergencyContact = { name?: string; phone?: string; relationship?: string } | null;

export type BookingListRow = {
  id: string;
  reference: string;
  status: string;
  leadName: string;
  leadEmail: string;
  adults: number;
  children: number;
  infants: number;
  totalCents: number;
  amountPaidCents: number;
  currency: string;
  createdAt: string;
  balanceDueOn: string | null;
  packageId: string;
  packageTitle: string;
  departureStartsOn: string;
};

export type BookingListFilters = {
  status?: string;
  packageId?: string;
  /** Matches reference, lead name or lead email. */
  q?: string;
  partnerId?: string | null;
  limit?: number;
};

type ListJoined = {
  id: string; reference: string; status: string; lead_name: string; lead_email: string;
  adults: number; children: number; infants: number; total_cents: number;
  amount_paid_cents: number; currency: string; created_at: string; balance_due_on: string | null;
  packages: { id: string; title: string; partner_id: string | null };
  departures: { starts_on: string };
};

export async function listBookings(filters: BookingListFilters = {}): Promise<BookingListRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  let q = db
    .from('bookings')
    .select(
      'id, reference, status, lead_name, lead_email, adults, children, infants, ' +
        'total_cents, amount_paid_cents, currency, created_at, balance_due_on, ' +
        'packages!inner ( id, title, partner_id ), departures!inner ( starts_on )'
    )
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.status && (BOOKING_STATUSES as readonly string[]).includes(filters.status)) {
    q = q.eq('status', filters.status);
  }
  if (filters.packageId) q = q.eq('package_id', filters.packageId);
  if (filters.partnerId) q = q.eq('packages.partner_id', filters.partnerId);
  if (filters.q) {
    // Escape PostgREST's or() syntax characters rather than trying to support them.
    const needle = filters.q.replace(/[,()%]/g, ' ').trim();
    if (needle) {
      q = q.or(
        `reference.ilike.%${needle}%,lead_name.ilike.%${needle}%,lead_email.ilike.%${needle}%`
      );
    }
  }

  const { data } = await q;
  return ((data ?? []) as unknown as ListJoined[]).map((b) => ({
    id: b.id,
    reference: b.reference,
    status: b.status,
    leadName: b.lead_name,
    leadEmail: b.lead_email,
    adults: b.adults,
    children: b.children,
    infants: b.infants,
    totalCents: b.total_cents,
    amountPaidCents: b.amount_paid_cents,
    currency: b.currency,
    createdAt: b.created_at,
    balanceDueOn: b.balance_due_on,
    packageId: b.packages.id,
    packageTitle: b.packages.title,
    departureStartsOn: b.departures.starts_on,
  }));
}

/** id/title pairs for the list page's tour filter. */
export async function listPackagesForFilter(
  partnerId?: string | null
): Promise<{ id: string; title: string }[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  let q = db.from('packages').select('id, title').order('title');
  if (partnerId) q = q.eq('partner_id', partnerId);
  const { data } = await q;
  return data ?? [];
}

export type TravellerRow = {
  id: string;
  position: number;
  travellerType: string;
  legalName: string;
  dateOfBirth: string | null;
  isLead: boolean;
  dietaryNotes: string | null;
  accessibilityNotes: string | null;
  emergencyContact: EmergencyContact;
};

export type PriceLineRow = {
  id: string;
  kind: string;
  label: string;
  quantity: number;
  unitCents: number;
  amountCents: number;
};

export type PaymentRow = {
  id: string;
  kind: string;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  providerRef: string | null;
  processorFeeCents: number | null;
  recordedBy: string | null;
  createdAt: string;
};

export type AcknowledgementRow = {
  id: string;
  label: string;
  bodySnapshot: string;
  acceptedAt: string;
};

export type FieldResponseRow = {
  id: string;
  travellerId: string | null;
  label: string;
  value: string | null;
};

export type BookingDetail = {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  leadName: string;
  leadEmail: string;
  leadPhone: string | null;
  adults: number;
  children: number;
  infants: number;
  singleSupplement: boolean;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  feesCents: number;
  totalCents: number;
  amountPaidCents: number;
  depositDueCents: number;
  balanceDueOn: string | null;
  supplierCostCents: number | null;
  notesInternal: string | null;
  cancelledAt: string | null;
  userId: string | null;
  packageId: string;
  packageTitle: string;
  packageSlug: string;
  departureId: string;
  departureStartsOn: string;
  departureEndsOn: string | null;
  roomTypeName: string | null;
  promotionCode: string | null;
  travellers: TravellerRow[];
  priceLines: PriceLineRow[];
  payments: PaymentRow[];
  acknowledgements: AcknowledgementRow[];
  fieldResponses: FieldResponseRow[];
};

type DetailJoined = {
  id: string; reference: string; status: string; created_at: string; updated_at: string;
  lead_name: string; lead_email: string; lead_phone: string | null;
  adults: number; children: number; infants: number; single_supplement: boolean;
  currency: string; subtotal_cents: number; discount_cents: number; tax_cents: number;
  fees_cents: number; total_cents: number; amount_paid_cents: number;
  deposit_due_cents: number; balance_due_on: string | null;
  supplier_cost_cents: number | null; notes_internal: string | null;
  cancelled_at: string | null; user_id: string | null;
  departure_id: string;
  packages: { id: string; title: string; slug: string; partner_id: string | null };
  departures: { starts_on: string; ends_on: string | null };
  room_types: { name: string } | null;
  promotions: { code: string } | null;
};

export async function getBookingDetail(
  id: string,
  partnerId?: string | null
): Promise<BookingDetail | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data: b } = await db
    .from('bookings')
    .select(
      '*, packages!inner ( id, title, slug, partner_id ), ' +
        'departures!inner ( starts_on, ends_on ), room_types ( name ), promotions ( code )'
    )
    .eq('id', id)
    .maybeSingle();
  if (!b) return null;

  const booking = b as unknown as DetailJoined;
  // Partner scoping is enforced here as well as in the query the partner app
  // will use, because a detail page fetched by id is exactly where a missing
  // filter would leak somebody else's booking.
  if (partnerId && booking.packages.partner_id !== partnerId) return null;

  const [travellers, lines, payments, acks, responses] = await Promise.all([
    db.from('travellers').select('*').eq('booking_id', id).order('position'),
    db.from('booking_price_lines').select('*').eq('booking_id', id).order('sort_order'),
    db.from('payments').select('*').eq('booking_id', id).order('created_at'),
    db.from('booking_acknowledgements').select('*').eq('booking_id', id).order('accepted_at'),
    db
      .from('custom_field_responses')
      .select('id, traveller_id, value, package_custom_fields!inner ( label, sort_order )')
      .eq('booking_id', id),
  ]);

  type ResponseJoined = {
    id: string; traveller_id: string | null; value: string | null;
    package_custom_fields: { label: string; sort_order: number };
  };
  const fieldResponses = ((responses.data ?? []) as unknown as ResponseJoined[])
    .sort((a, z) => a.package_custom_fields.sort_order - z.package_custom_fields.sort_order)
    .map((r) => ({
      id: r.id,
      travellerId: r.traveller_id,
      label: r.package_custom_fields.label,
      value: r.value,
    }));

  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
    leadName: booking.lead_name,
    leadEmail: booking.lead_email,
    leadPhone: booking.lead_phone,
    adults: booking.adults,
    children: booking.children,
    infants: booking.infants,
    singleSupplement: booking.single_supplement,
    currency: booking.currency,
    subtotalCents: booking.subtotal_cents,
    discountCents: booking.discount_cents,
    taxCents: booking.tax_cents,
    feesCents: booking.fees_cents,
    totalCents: booking.total_cents,
    amountPaidCents: booking.amount_paid_cents,
    depositDueCents: booking.deposit_due_cents,
    balanceDueOn: booking.balance_due_on,
    supplierCostCents: booking.supplier_cost_cents,
    notesInternal: booking.notes_internal,
    cancelledAt: booking.cancelled_at,
    userId: booking.user_id,
    packageId: booking.packages.id,
    packageTitle: booking.packages.title,
    packageSlug: booking.packages.slug,
    departureId: booking.departure_id,
    departureStartsOn: booking.departures.starts_on,
    departureEndsOn: booking.departures.ends_on,
    roomTypeName: booking.room_types?.name ?? null,
    promotionCode: booking.promotions?.code ?? null,
    travellers: (travellers.data ?? []).map((t) => ({
      id: t.id,
      position: t.position,
      travellerType: t.traveller_type,
      legalName: t.legal_name,
      dateOfBirth: t.date_of_birth,
      isLead: t.is_lead,
      dietaryNotes: t.dietary_notes,
      accessibilityNotes: t.accessibility_notes,
      emergencyContact: (t.emergency_contact ?? null) as EmergencyContact,
    })),
    priceLines: (lines.data ?? []).map((l) => ({
      id: l.id,
      kind: l.kind,
      label: l.label,
      quantity: l.quantity,
      unitCents: l.unit_cents,
      amountCents: l.amount_cents,
    })),
    payments: (payments.data ?? []).map((p) => ({
      id: p.id,
      kind: p.kind,
      amountCents: p.amount_cents,
      currency: p.currency,
      status: p.status,
      provider: p.provider,
      providerRef: p.provider_ref,
      processorFeeCents: p.processor_fee_cents,
      recordedBy: p.recorded_by,
      createdAt: p.created_at,
    })),
    acknowledgements: (acks.data ?? []).map((a) => ({
      id: a.id,
      label: a.label,
      bodySnapshot: a.body_snapshot,
      acceptedAt: a.accepted_at,
    })),
    fieldResponses,
  };
}
