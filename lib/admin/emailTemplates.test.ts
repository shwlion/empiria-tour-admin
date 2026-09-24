import { mergeFieldErrors, unknownMergeFields } from './emailTemplates';

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

// booking_confirmed's list as the editor draws it: its own fields plus the seller's.
const confirmed = [
  'booking.reference', 'booking.total', 'traveller.name', 'package.title', 'departure.date',
  'departure.meeting_point', 'booking.travellers',
  'company.name', 'company.registration_number', 'company.contact_email',
];

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

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
