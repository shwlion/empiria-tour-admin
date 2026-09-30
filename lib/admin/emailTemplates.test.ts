import { mergeFieldErrors, unknownMergeFields } from './emailTemplates';
import { MERGE_FIELDS, TEMPLATE_TRIGGERS } from './content';

/**
 * The save-time check on an email template. What it guards is silent: a
 * template naming a field its email cannot fill saves fine and then fails
 * every message of its kind in the storefront's outbox, for good.
 *
 *   bun run lib/admin/emailTemplates.test.ts
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

// booking_confirmed's own fields, and its list as the editor draws it: those
// plus the seller's.
const confirmedOwn = [
  'booking.reference', 'booking.total', 'traveller.name', 'package.title', 'departure.date',
  'departure.meeting_point', 'booking.travellers',
  'booking.link', 'booking.entry_requirements', 'booking.traveller_names',
];
const confirmed = [...confirmedOwn, 'company.name', 'company.registration_number', 'company.contact_email'];

// ── what passes ─────────────────────────────────────────────────────────────
eq('fields on the list pass', unknownMergeFields(confirmed, 'Hello {{traveller.name}}, ref {{booking.reference}}'), []);
eq('spaces inside the braces are tolerated, as the renderer tolerates them', unknownMergeFields(confirmed, '{{  booking.reference  }}'), []);
eq('no placeholders at all', unknownMergeFields(confirmed, '<p>Thank you.</p>'), []);
eq('an empty plain-text body', unknownMergeFields(confirmed, null), []);
eq('braces around something that is not a field name are left alone — they arrive as typed',
  unknownMergeFields(confirmed, '{{booking-ref}} {{ booking reference }} {single}'), []);

// ── what is refused ─────────────────────────────────────────────────────────
eq('a typo is caught', unknownMergeFields(confirmed, 'Ref {{booking.ref}}'), ['booking.ref']);
eq('a field valid elsewhere but not in this email is caught', unknownMergeFields(confirmed, '{{payment.method}}'), ['payment.method']);
eq('case matters, as it does to the renderer', unknownMergeFields(confirmed, '{{Booking.Reference}}'), ['Booking.Reference']);
eq('each unknown field is named once, in order', unknownMergeFields(confirmed, '{{a.b}} {{c.d}} {{a.b}}'), ['a.b', 'c.d']);

// ── the verdict the save returns ────────────────────────────────────────────
eq('a clean template has no errors', mergeFieldErrors(confirmed, {
  subject: 'Your booking {{booking.reference}}', body_html: '<p>{{traveller.name}}</p>', body_text: null,
}), null);
eq('errors are keyed by the form field that holds them, the plain-text body included', mergeFieldErrors(confirmed, {
  subject: 'Your booking {{booking.ref}}', body_html: '<p>{{traveller.name}}</p>', body_text: 'Total {{booking.totl}}',
}), {
  subject: 'Not a field this email can fill: {{booking.ref}}',
  body_text: 'Not a field this email can fill: {{booking.totl}}',
});

// ── the lists themselves ────────────────────────────────────────────────────
// MERGE_FIELDS is kept by hand in step with TEMPLATE_FIELDS in the
// storefront's lib/email/fields.ts, which goes live first: a field offered
// here before the live renderer knows it saves, then fails at send. These are
// the lists entry requirements changed (spec 2026-09-26 §5).
const TRIP = ['booking.reference', 'traveller.name', 'package.title', 'departure.date'];
// The six v1 fields, then v2's headline and apply-by date (spec, "v2
// interface contract", Emails), which only the two entry emails are offered.
const ENTRY = [
  'booking.link', 'booking.entry_requirements', 'booking.traveller_names',
  'entry.destination', 'entry.passport', 'entry.apply_link', 'entry.headline', 'entry.apply_by',
];
eq('the reminder offers the trip and the eight entry fields', MERGE_FIELDS.entry_requirements_reminder, [...TRIP, ...ENTRY]);
eq('the change notice offers the same', MERGE_FIELDS.entry_requirements_changed, [...TRIP, ...ENTRY]);
eq('booking_confirmed keeps its fields and gains the three booking ones', MERGE_FIELDS.booking_confirmed, confirmedOwn);
eq('pre_departure keeps its fields and gains the three booking ones', MERGE_FIELDS.pre_departure, [
  'booking.reference', 'traveller.name', 'package.title', 'departure.date',
  'departure.meeting_point', 'departure.start_time', 'package.what_to_bring',
  'booking.link', 'booking.entry_requirements', 'booking.traveller_names',
]);
const OFFERED = ['entry_requirements_reminder', 'entry_requirements_changed', 'booking_confirmed', 'pre_departure'];
eq('no other email is offered an entry field',
  Object.entries(MERGE_FIELDS)
    .filter(([key]) => !OFFERED.includes(key))
    .flatMap(([key, fields]) => fields.filter((f) => ENTRY.includes(f)).map((f) => `${key}:${f}`)),
  []);
eq('pre_departure tells staff it can carry the advice to late bookings', TEMPLATE_TRIGGERS.pre_departure,
  'Shortly before departure, with the practical details. Offers {{booking.entry_requirements}} for late bookings.');
eq('the advice and the booking link save on a confirmation',
  unknownMergeFields(confirmed, '{{booking.entry_requirements}} {{booking.link}} {{booking.traveller_names}}'), []);
eq('…and not on a balance reminder', unknownMergeFields(MERGE_FIELDS.balance_due, '{{booking.entry_requirements}}'),
  ['booking.entry_requirements']);

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
