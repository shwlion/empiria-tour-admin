import { getSupabaseAdmin } from '@/lib/supabase';
import {
  TRAVELLING_STATUSES,
  type EmergencyContact,
  type TravellerRow,
} from './bookings';

/**
 * The departure manifest — B3's operational half.
 *
 * One departure, everyone travelling on it, and everything the ground team
 * needs to know about them: rooms, extras, dietary and accessibility notes,
 * emergency contacts, and the answers to the package's custom fields. Only
 * bookings whose seats are actually committed appear — a pending_payment
 * booking is a hold, not a passenger.
 */

export type ManifestExtra = { label: string; quantity: number };

export type ManifestBooking = {
  id: string;
  reference: string;
  status: string;
  leadName: string;
  leadEmail: string;
  leadPhone: string | null;
  adults: number;
  children: number;
  infants: number;
  roomTypeName: string | null;
  singleSupplement: boolean;
  notesInternal: string | null;
  extras: ManifestExtra[];
  travellers: TravellerRow[];
  /** field id → value, for booking-level custom fields. */
  bookingResponses: Record<string, string>;
  /** traveller id → (field id → value), for per-traveller fields. */
  travellerResponses: Record<string, Record<string, string>>;
};

export type ManifestField = { id: string; label: string; appliesTo: string };

export type Manifest = {
  departureId: string;
  startsOn: string;
  endsOn: string | null;
  startTime: string | null;
  status: string;
  capacity: number;
  seatsBooked: number;
  seatsHeld: number;
  packageId: string;
  packageTitle: string;
  packageSlug: string;
  currency: string;
  partnerId: string | null;
  fields: ManifestField[];
  bookings: ManifestBooking[];
  travellerCount: number;
};

export async function getManifest(
  departureId: string,
  partnerId?: string | null
): Promise<Manifest | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data: d } = await db
    .from('departures')
    .select(
      'id, starts_on, ends_on, start_time, status, capacity, seats_booked, seats_held, ' +
        'packages!inner ( id, title, slug, currency, partner_id )'
    )
    .eq('id', departureId)
    .maybeSingle();
  if (!d) return null;

  type DepartureJoined = {
    id: string; starts_on: string; ends_on: string | null; start_time: string | null;
    status: string; capacity: number; seats_booked: number; seats_held: number;
    packages: { id: string; title: string; slug: string; currency: string; partner_id: string | null };
  };
  const departure = d as unknown as DepartureJoined;
  if (partnerId && departure.packages.partner_id !== partnerId) return null;

  const { data: bookingRows } = await db
    .from('bookings')
    .select(
      'id, reference, status, lead_name, lead_email, lead_phone, adults, children, infants, ' +
        'single_supplement, notes_internal, room_types ( name )'
    )
    .eq('departure_id', departureId)
    .in('status', [...TRAVELLING_STATUSES])
    .order('created_at');

  type BookingJoined = {
    id: string; reference: string; status: string; lead_name: string; lead_email: string;
    lead_phone: string | null; adults: number; children: number; infants: number;
    single_supplement: boolean; notes_internal: string | null;
    room_types: { name: string } | null;
  };
  const bookings = (bookingRows ?? []) as unknown as BookingJoined[];
  const bookingIds = bookings.map((b) => b.id);

  const [fieldRows, travellerRows, extraRows, responseRows] = await Promise.all([
    db
      .from('package_custom_fields')
      .select('id, label, applies_to, sort_order')
      .eq('package_id', departure.packages.id)
      .order('sort_order'),
    bookingIds.length
      ? db.from('travellers').select('*').in('booking_id', bookingIds).order('position')
      : Promise.resolve({ data: [] as never[] }),
    bookingIds.length
      ? db
          .from('booking_price_lines')
          .select('booking_id, label, quantity')
          .eq('kind', 'extra')
          .in('booking_id', bookingIds)
      : Promise.resolve({ data: [] as never[] }),
    bookingIds.length
      ? db
          .from('custom_field_responses')
          .select('booking_id, traveller_id, field_id, value')
          .in('booking_id', bookingIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const travellersByBooking = new Map<string, TravellerRow[]>();
  for (const t of (travellerRows.data ?? []) as {
    id: string; booking_id: string; position: number; traveller_type: string;
    legal_name: string; date_of_birth: string | null; is_lead: boolean;
    dietary_notes: string | null; accessibility_notes: string | null;
    emergency_contact: unknown;
  }[]) {
    const list = travellersByBooking.get(t.booking_id) ?? [];
    list.push({
      id: t.id,
      position: t.position,
      travellerType: t.traveller_type,
      legalName: t.legal_name,
      dateOfBirth: t.date_of_birth,
      isLead: t.is_lead,
      dietaryNotes: t.dietary_notes,
      accessibilityNotes: t.accessibility_notes,
      emergencyContact: (t.emergency_contact ?? null) as EmergencyContact,
    });
    travellersByBooking.set(t.booking_id, list);
  }

  const extrasByBooking = new Map<string, ManifestExtra[]>();
  for (const e of (extraRows.data ?? []) as { booking_id: string; label: string; quantity: number }[]) {
    const list = extrasByBooking.get(e.booking_id) ?? [];
    list.push({ label: e.label, quantity: e.quantity });
    extrasByBooking.set(e.booking_id, list);
  }

  const bookingResponses = new Map<string, Record<string, string>>();
  const travellerResponses = new Map<string, Record<string, string>>();
  for (const r of (responseRows.data ?? []) as {
    booking_id: string; traveller_id: string | null; field_id: string; value: string | null;
  }[]) {
    if (r.value == null || r.value === '') continue;
    if (r.traveller_id) {
      const bag = travellerResponses.get(r.traveller_id) ?? {};
      bag[r.field_id] = r.value;
      travellerResponses.set(r.traveller_id, bag);
    } else {
      const bag = bookingResponses.get(r.booking_id) ?? {};
      bag[r.field_id] = r.value;
      bookingResponses.set(r.booking_id, bag);
    }
  }

  const manifestBookings: ManifestBooking[] = bookings.map((b) => ({
    id: b.id,
    reference: b.reference,
    status: b.status,
    leadName: b.lead_name,
    leadEmail: b.lead_email,
    leadPhone: b.lead_phone,
    adults: b.adults,
    children: b.children,
    infants: b.infants,
    roomTypeName: b.room_types?.name ?? null,
    singleSupplement: b.single_supplement,
    notesInternal: b.notes_internal,
    extras: extrasByBooking.get(b.id) ?? [],
    travellers: travellersByBooking.get(b.id) ?? [],
    bookingResponses: bookingResponses.get(b.id) ?? {},
    travellerResponses: Object.fromEntries(
      (travellersByBooking.get(b.id) ?? []).map((t) => [t.id, travellerResponses.get(t.id) ?? {}])
    ),
  }));

  return {
    departureId: departure.id,
    startsOn: departure.starts_on,
    endsOn: departure.ends_on,
    startTime: departure.start_time,
    status: departure.status,
    capacity: departure.capacity,
    seatsBooked: departure.seats_booked,
    seatsHeld: departure.seats_held,
    packageId: departure.packages.id,
    packageTitle: departure.packages.title,
    packageSlug: departure.packages.slug,
    currency: departure.packages.currency,
    partnerId: departure.packages.partner_id,
    fields: (fieldRows.data ?? []).map((f) => ({ id: f.id, label: f.label, appliesTo: f.applies_to })),
    bookings: manifestBookings,
    travellerCount: manifestBookings.reduce((n, b) => n + b.travellers.length, 0),
  };
}

export function formatEmergencyContact(c: EmergencyContact): string {
  if (!c) return '';
  const parts = [c.name, c.phone, c.relationship].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== ''
  );
  return parts.join(' · ');
}

/**
 * A UTF-8 byte-order mark.
 *
 * Excel on Windows assumes the system code page for a .csv unless the file
 * opens with this, which turns every non-ASCII name on the manifest into
 * mojibake — and a passenger list is exactly where names like Nguyễn, José and
 * 김민준 appear. Three bytes to stop a support ticket. Prepended at the
 * response rather than inside `manifestToCsv`, so that function still returns
 * CSV and not CSV-plus-a-surprise.
 */
export const CSV_BOM = '\uFEFF';

/** RFC 4180 quoting: doubled quotes, wrapped when a comma, quote or newline appears. */
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The manifest flattened to one row per traveller, booking columns repeated —
 * the shape a ground operator drops straight into their own spreadsheet.
 * Custom fields become trailing columns, per-booking answers repeated on each
 * of that booking's rows.
 */
export function manifestToCsv(manifest: Manifest): string {
  const head = [
    'Booking', 'Booking status', 'Lead contact', 'Lead email', 'Lead phone', 'Room', 'Extras',
    'Traveller', 'Type', 'Legal name', 'Date of birth', 'Dietary', 'Accessibility',
    'Emergency contact',
    ...manifest.fields.map((f) => f.label),
  ];
  const rows: string[] = [head.map(csvCell).join(',')];

  for (const b of manifest.bookings) {
    const extras = b.extras
      .map((e) => (e.quantity > 1 ? `${e.label} ×${e.quantity}` : e.label))
      .join('; ');
    for (const t of b.travellers) {
      rows.push(
        [
          b.reference,
          b.status,
          b.leadName,
          b.leadEmail,
          b.leadPhone ?? '',
          b.roomTypeName ?? '',
          extras,
          t.position,
          t.travellerType,
          t.legalName,
          t.dateOfBirth ?? '',
          t.dietaryNotes ?? '',
          t.accessibilityNotes ?? '',
          formatEmergencyContact(t.emergencyContact),
          ...manifest.fields.map((f) =>
            f.appliesTo === 'traveller'
              ? (b.travellerResponses[t.id]?.[f.id] ?? '')
              : (b.bookingResponses[f.id] ?? '')
          ),
        ]
          .map(csvCell)
          .join(',')
      );
    }
  }
  return rows.join('\r\n') + '\r\n';
}
