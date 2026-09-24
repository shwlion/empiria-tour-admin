import { getSupabaseAdmin } from '@/lib/supabase';
import { formatPrice } from '@/lib/money';
import { STOREFRONT_URL } from '@/lib/storefront';

/**
 * Bookings and manifests — Exhibit A B3.
 *
 * Everything here is read-shaped. The console never moves seats or money
 * directly: seats belong to `claim_seats`/`confirm_hold_seats`, money to
 * `record_payment`, all inside the database. What B3 adds is the staff view of
 * what those functions have done — plus the few writes that are genuinely
 * staff's to make (internal notes, the §4.6 supplier cost, an offline payment
 * and the emails that follow it), which live in the server actions, not here.
 */

/**
 * `record_payment` appends a line starting with this to the internal notes
 * when money needs a person: it arrived after the places were released and
 * they are gone, it arrived for a cancelled or refunded booking, or it
 * overpaid the total (0023). The console lifts those lines out of the notes
 * so they are not missed; they stop showing once staff edit them out.
 */
export const ACTION_NEEDED = 'ACTION NEEDED:';

export function actionsNeeded(notes: string | null | undefined): string[] {
  return (notes ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(ACTION_NEEDED))
    .map((line) => line.slice(ACTION_NEEDED.length).trim());
}

/**
 * An amount as staff type it — "1850", "1850.00", "1,850.00", "$1,850" — in
 * cents, or null for anything else. Stricter than the shared `cents()`, which
 * keeps only digits, dots and minus signs: it read "1e3" as 13.00, "1.850,00"
 * as 1.85, and "tbc" as a supplier cost of zero, which counted the booking as
 * costed and cleared the statement's caveat. Money is refused, not guessed at.
 */
export function parseAmount(raw: string): number | null {
  const m = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!m) return null;
  const cents = Number(m[1].replace(/,/g, '')) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  // The columns are 32-bit; anything past that is a typing slip, not a price.
  return cents <= 2_147_483_647 ? cents : null;
}

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
  /** An ACTION NEEDED line sits in the internal notes. */
  actionNeeded: boolean;
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
  notes_internal: string | null;
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
        'total_cents, amount_paid_cents, currency, created_at, balance_due_on, notes_internal, ' +
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
    actionNeeded: actionsNeeded(b.notes_internal).length > 0,
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

// ─── Part C: a booking's emails, built from the booking as it stands ───────

/**
 * What a booking's emails quote, read now.
 *
 * Mirrors `loadBookingContext` and the per-message field sets in the
 * storefront's `lib/email/outbox.ts`, field for field. The renderer refuses a
 * message that is missing any field its template uses, so the two are kept in
 * step by hand — the same cost of three repositories as `parseTaxRules`. The
 * seller's `company.*` fields are not here: the drain supplies them to every
 * message from Settings at send time.
 */
export type BookingEmailFacts = {
  id: string;
  reference: string;
  status: string;
  leadName: string;
  leadEmail: string;
  userId: string | null;
  departureId: string;
  currency: string;
  totalCents: number;
  balanceCents: number;
  balanceDueOn: string | null;
  adults: number;
  children: number;
  infants: number;
  packageTitle: string;
  meetingPoint: string | null;
  whatToBring: string | null;
  startsOn: string;
  startTime: string | null;
  /** The most recent money in, for a resent "we've received …". Null when none has arrived. */
  lastPaymentCents: number | null;
};

export async function loadBookingEmailFacts(bookingId: string): Promise<BookingEmailFacts | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const [{ data }, { data: last }] = await Promise.all([
    db
      .from('bookings')
      .select(
        'id, reference, status, lead_name, lead_email, user_id, departure_id, currency, total_cents, ' +
          'balance_cents, balance_due_on, adults, children, infants, ' +
          'packages!inner ( title, meeting_point, what_to_bring ), departures!inner ( starts_on, start_time )'
      )
      .eq('id', bookingId)
      .maybeSingle(),
    db
      .from('payments')
      .select('amount_cents')
      .eq('booking_id', bookingId)
      .eq('status', 'succeeded')
      .gt('amount_cents', 0)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!data) return null;

  const b = data as unknown as {
    id: string; reference: string; status: string; lead_name: string; lead_email: string;
    user_id: string | null; departure_id: string; currency: string; total_cents: number;
    balance_cents: number | null; balance_due_on: string | null; adults: number; children: number; infants: number;
    packages: { title: string; meeting_point: string | null; what_to_bring: string | null };
    departures: { starts_on: string; start_time: string | null };
  };
  return {
    id: b.id,
    reference: b.reference,
    status: b.status,
    leadName: b.lead_name,
    leadEmail: b.lead_email,
    userId: b.user_id,
    departureId: b.departure_id,
    currency: b.currency,
    totalCents: b.total_cents,
    balanceCents: b.balance_cents ?? 0,
    balanceDueOn: b.balance_due_on,
    adults: b.adults,
    children: b.children,
    infants: b.infants,
    packageTitle: b.packages.title,
    meetingPoint: b.packages.meeting_point,
    whatToBring: b.packages.what_to_bring,
    startsOn: b.departures.starts_on,
    startTime: b.departures.start_time,
    lastPaymentCents: last?.amount_cents ?? null,
  };
}

/** "2 adults, 1 child" — the storefront's `partyLabel`. */
function partyLabel(f: BookingEmailFacts): string {
  const parts = [`${f.adults} adult${f.adults === 1 ? '' : 's'}`];
  if (f.children > 0) parts.push(`${f.children} child${f.children === 1 ? '' : 'ren'}`);
  if (f.infants > 0) parts.push(`${f.infants} infant${f.infants === 1 ? '' : 's'}`);
  return parts.join(', ');
}

/**
 * The merge data for one of a booking's messages. `paymentCents` is the money
 * the message is about — the payment just recorded, or for a resend the most
 * recent one — and is needed by the three that quote it.
 */
export function bookingEmailData(
  f: BookingEmailFacts,
  templateKey: string,
  paymentCents: number | null = null
): Record<string, unknown> {
  const base = {
    _currency: f.currency,
    _locale: 'en-CA',
    'booking.reference': f.reference,
    'traveller.name': f.leadName,
    'package.title': f.packageTitle,
  };
  const trip = { ...base, 'departure.date': f.startsOn };
  switch (templateKey) {
    case 'booking_confirmed':
      return { ...trip, 'booking.total': f.totalCents, 'departure.meeting_point': f.meetingPoint, 'booking.travellers': partyLabel(f) };
    case 'deposit_taken':
      return { ...trip, 'payment.amount': paymentCents, 'booking.balance': f.balanceCents, 'booking.balance_due_on': f.balanceDueOn };
    case 'balance_paid':
      return { ...trip, 'payment.amount': paymentCents, 'booking.total': f.totalCents };
    case 'balance_due':
      // The booking's own page on the storefront, where the balance is paid.
      return {
        ...trip,
        'booking.balance': f.balanceCents,
        'booking.balance_due_on': f.balanceDueOn,
        'payment.link': `${STOREFRONT_URL}/booking/${encodeURIComponent(f.reference)}`,
      };
    case 'pre_departure':
      return { ...trip, 'departure.start_time': f.startTime, 'departure.meeting_point': f.meetingPoint, 'package.what_to_bring': f.whatToBring };
    case 'refund_issued':
      // An offline refund goes back the way the money came, as the storefront's
      // own emails promise; the console records no more than that.
      return { ...base, 'payment.amount': Math.abs(paymentCents ?? 0), 'payment.method': 'the original payment method' };
    default:
      return trip;
  }
}

/**
 * Why a message cannot go out about the booking as it stands, or null when it
 * can. The rules are the ones that send each message automatically — a
 * confirmation once money has arrived, a deposit acknowledgement while a
 * balance remains, a reminder only for money owed by a date — so a resend
 * never tells a traveller something the booking contradicts, and never queues
 * a message that could only fail at the drain for want of a fact.
 */
export function whyNotSendable(f: BookingEmailFacts, templateKey: string): string | null {
  const status = f.status.replace(/_/g, ' ');
  const committed = (TRAVELLING_STATUSES as readonly string[]).includes(f.status);
  switch (templateKey) {
    case 'booking_confirmed':
      return committed ? null : `A confirmation goes out once money has arrived, and this booking is ${status}.`;
    case 'deposit_taken':
      if (!committed || f.lastPaymentCents == null) return 'There is no payment on this booking to acknowledge.';
      return f.balanceCents > 0 ? null : 'This booking is paid in full. Send the paid-in-full confirmation instead.';
    case 'balance_paid':
      if (!committed || f.lastPaymentCents == null) return 'There is no payment on this booking to acknowledge.';
      return f.balanceCents <= 0 ? null : `This booking still has ${formatPrice(f.balanceCents, f.currency)} to pay.`;
    case 'balance_due':
      if (!['confirmed', 'balance_due'].includes(f.status) || f.balanceCents <= 0) {
        return 'Nothing is owed on this booking, so there is no balance to remind them of.';
      }
      return f.balanceDueOn ? null : 'This booking has no balance due date to quote.';
    case 'pre_departure':
      return ['confirmed', 'balance_due', 'paid_in_full'].includes(f.status)
        ? null
        : `Pre-departure information goes to bookings that are travelling, and this booking is ${status}.`;
    default:
      return 'That is not a message staff can send by hand.';
  }
}
