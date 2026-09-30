import { explain } from '@/lib/actions';
import {
  contentChanged,
  countryForPath,
  entryGaps,
  isHttpsAddress,
  failedNoticeKeys,
  noticeDecision,
  noticeDecisionNeeded,
  noticeStatus,
  offerSendCurrent,
  pairLabel,
  parseApplyDaysBefore,
  staleNoticeRevision,
  validateEntryRequirement,
  type BookedTraveller,
  type EntryGapInput,
  type EntryRequirementDraft,
  type EntryRequirementRecord,
} from './entryRequirements';

/**
 * Entry requirements (0036): what counts as a change to the advice, what a
 * save accepts, when it must ask about the travellers already booked (s.37),
 * what the Booked travellers card says about each notice, and what the
 * overview lists as still owed.
 *
 *   bun run lib/admin/entryRequirements.test.ts
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

// ── what counts as a change to the advice ───────────────────────────────────
const content = {
  requirement: 'evisa' as const,
  headline: 'Apply for an eVisa before you fly.',
  beforeArrival: 'Passport valid for six months.',
  why: null,
  processingTime: 'About a week.',
  applyDaysBefore: 30,
  applyUrl: 'https://apply.example.gov/',
  officialUrl: null,
};
eq('a new row is all content', contentChanged(null, content), true);
eq('the same eight fields are no change', contentChanged(content, { ...content }), false);
eq('the requirement changing is a change', contentChanged(content, { ...content, requirement: 'visa' }), true);
eq('"Before you arrive" changing is a change', contentChanged(content, { ...content, beforeArrival: 'Passport valid for three months.' }), true);
eq('an optional text appearing is a change', contentChanged(content, { ...content, why: 'Greece is in Schengen.' }), true);
eq('an optional text going is a change', contentChanged(content, { ...content, processingTime: null }), true);
eq('a link changing is a change', contentChanged(content, { ...content, officialUrl: 'https://travel.gc.ca/destinations/greece' }), true);
eq('a new headline is a change', contentChanged(content, { ...content, headline: 'Apply for an eVisa a month before you fly.' }), true);
eq('the headline going is a change', contentChanged(content, { ...content, headline: null }), true);
eq('the lead time changing is a change', contentChanged(content, { ...content, applyDaysBefore: 31 }), true);
eq('the lead time going is a change', contentChanged(content, { ...content, applyDaysBefore: null }), true);
eq('null and a missing value are the same, as `is distinct from` says', contentChanged({ ...content, why: null }, { ...content, why: undefined as unknown as null }), false);

// ── what a save accepts ─────────────────────────────────────────────────────
const draft: EntryRequirementDraft = {
  destinationCountry: 'GR', passportCountry: 'CA', requirement: 'none', headline: '  No visa for up to 90 days.  ',
  beforeArrival: '  Passport valid for three months.\r\nNo visa for 90 days.  ', why: '', processingTime: ' ', applyDaysBefore: ' ',
  applyUrl: '', officialUrl: 'https://travel.gc.ca/destinations/greece', status: 'active',
};
eq('a good row passes, with CRLF made LF, trimmed, and blanks made null', validateEntryRequirement(draft), {
  ok: true,
  values: {
    destinationCountry: 'GR', passportCountry: 'CA', requirement: 'none', headline: 'No visa for up to 90 days.',
    beforeArrival: 'Passport valid for three months.\nNo visa for 90 days.', why: null, processingTime: null, applyDaysBefore: null,
    applyUrl: null, officialUrl: 'https://travel.gc.ca/destinations/greece', status: 'active',
  },
});
const fieldsOf = (d: Partial<EntryRequirementDraft>) => {
  const r = validateEntryRequirement({ ...draft, ...d });
  return r.ok ? {} : r.fields;
};
const valuesOf = (d: Partial<EntryRequirementDraft>) => {
  const r = validateEntryRequirement({ ...draft, ...d });
  return r.ok ? r.values : null;
};
eq('a destination off the list is refused', Object.keys(fieldsOf({ destinationCountry: 'XX' })), ['destination_country']);
eq('a passport off the list is refused', Object.keys(fieldsOf({ passportCountry: 'ca' })), ['passport_country']);
eq('the destination as its own passport is refused', Object.keys(fieldsOf({ passportCountry: 'GR' })), ['passport_country']);
eq('an unknown requirement is refused', Object.keys(fieldsOf({ requirement: 'schengen' })), ['requirement']);
eq('empty "Before you arrive" is refused', Object.keys(fieldsOf({ beforeArrival: ' \r\n ' })), ['before_arrival']);
eq('an http link is refused', Object.keys(fieldsOf({ applyUrl: 'http://apply.example.gov/' })), ['apply_url']);
eq('an unknown status is refused', Object.keys(fieldsOf({ status: 'published' })), ['status']);
eq('several problems are all reported', Object.keys(fieldsOf({ destinationCountry: '', beforeArrival: '', officialUrl: 'travel.gc.ca' })).sort(), ['before_arrival', 'destination_country', 'official_url']);

// ── the headline and the lead time (v2) ─────────────────────────────────────
eq('a blank headline saves null: not written yet', valuesOf({ headline: '   ' })?.headline, null);
eq('a headline on two lines is refused', fieldsOf({ headline: 'Get a visa.\r\nApply early.' }), { headline: 'Keep the headline to one line.' });
eq('a tab is refused too: the database refuses any control character', fieldsOf({ headline: 'Get\ta visa.' }), { headline: 'Keep the headline to one line.' });
const ONE_LINE = { headline: 'Keep the headline to one line.' };
eq('U+2028 (line separator) is refused', fieldsOf({ headline: 'Get a visa. Apply early.' }), ONE_LINE);
eq('U+2029 (paragraph separator) is refused', fieldsOf({ headline: 'Get a visa. Apply early.' }), ONE_LINE);
eq('U+0085 (next line) is refused', fieldsOf({ headline: 'Get a visa.\u0085Apply early.' }), ONE_LINE);
eq('a separator at the edge is refused, not trimmed away', ['Visa. ', ' Visa.', '\u0085'].map((h) => fieldsOf({ headline: h })), [ONE_LINE, ONE_LINE, ONE_LINE]);
eq('a headline of only spaces, NBSP and ideographic space saves null', valuesOf({ headline: '  　 \t' })?.headline, null);
eq('a headline of only invisible characters saves null', valuesOf({ headline: '​‌‍⁠﻿' })?.headline, null);
eq('whitespace mixed with invisible characters saves null', valuesOf({ headline: ' ​ 　﻿' })?.headline, null);
eq('a real headline keeps its text', valuesOf({ headline: ' Visa required.　' })?.headline, 'Visa required.');
eq('a headline of 160 characters passes', valuesOf({ headline: 'h'.repeat(160) })?.headline, 'h'.repeat(160));
eq('a headline of 161 characters is refused', fieldsOf({ headline: 'h'.repeat(161) }), { headline: 'Keep the headline to 160 characters or fewer.' });
eq('characters are counted as char_length counts them, not in UTF-16 units', valuesOf({ headline: '🛂'.repeat(160) })?.headline, '🛂'.repeat(160));
eq('a lead time is a whole number of days, 1 to 365', [' 1 ', '42', '365'].map((d) => valuesOf({ applyDaysBefore: d })?.applyDaysBefore), [1, 42, 365]);
eq('0, 366, a fraction, a word and a negative are refused', ['0', '366', '4.5', 'six', '-3'].map((d) => fieldsOf({ applyDaysBefore: d }).apply_days_before), [
  'Enter a whole number of days from 1 to 365, or leave it blank.',
  'Enter a whole number of days from 1 to 365, or leave it blank.',
  'Enter a whole number of days from 1 to 365, or leave it blank.',
  'Enter a whole number of days from 1 to 365, or leave it blank.',
  'Enter a whole number of days from 1 to 365, or leave it blank.',
]);
eq('the preview reads a lead time as the save does, an invalid one as none', ['', '42', '0', 'six'].map(parseApplyDaysBefore), [null, 42, 'invalid', 'invalid']);

eq('https with a host is a link', isHttpsAddress('https://travel.gc.ca/destinations/greece'), true);
eq('upper-case HTTPS is refused, as the database regex is case-sensitive', isHttpsAddress('HTTPS://travel.gc.ca/'), false);
eq('https with no host is refused', isHttpsAddress('https://'), false);
eq('a space inside is refused', isHttpsAddress('https://travel.gc.ca/a page'), false);
eq('javascript: is refused', isHttpsAddress('javascript:alert(1)'), false);
eq('mailto: is refused', isHttpsAddress('mailto:info@example.com'), false);


// ── what staff read when the database refuses ───────────────────────────────
const silent = (fn: () => string) => { const log = console.error; console.error = () => {}; try { return fn(); } finally { console.error = log; } };
eq('the fixed-countries trigger is explained in a sentence', silent(() => explain({ message: "a row's countries are fixed; retire it and add another", code: '23514' })), 'A row’s countries are fixed. To cover another passport or destination, retire this row and add another.');
eq('the unique pair is explained', silent(() => explain({ message: 'duplicate key value violates unique constraint "entry_requirements_pair_key"' })), 'There is already a row for that destination and passport. Open it from the list.');
eq('the headline check is explained', silent(() => explain({ message: 'violates check constraint "entry_requirements_headline_check"' })), 'Keep the headline to 160 characters or fewer.');

eq('a pair is named by its countries', pairLabel('GR', 'CA'), 'Greece · Canada passport');

// ── when a save asks "tell them, or a correction?" ──────────────────────────
const ask = (beforeStatus: string | null, afterStatus: string, changed: boolean, bookingsExist = true) =>
  noticeDecisionNeeded({ beforeStatus, afterStatus, contentChanged: changed, bookingsExist });
eq('a content change to an active row asks', ask('active', 'active', true), true);
eq('activating a draft asks, even with the wording unchanged', ask('draft', 'active', false), true);
eq('a new row saved active asks', ask(null, 'active', true), true);
eq('re-activating a retired row asks', ask('retired', 'active', false), true);
eq('retiring does not ask', ask('active', 'retired', false), false);
eq('retiring with the wording changed still does not ask', ask('active', 'retired', true), false);
eq('a status-only change to draft does not ask', ask('active', 'draft', false), false);
eq('a checked-only save does not ask', ask('active', 'active', false), false);
eq('editing a draft does not ask — nobody sees it', ask('draft', 'draft', true), false);
eq('a new row saved as a draft does not ask', ask(null, 'draft', true), false);
eq('no committed upcoming bookings: nobody to tell, no question', ask('active', 'active', true, false), false);
eq('v2: a new headline on an active row asks', ask('active', 'active', contentChanged(content, { ...content, headline: 'Apply for an eVisa a month before you fly.' })), true);
eq('v2: a new lead time on an active row asks', ask('active', 'active', contentChanged(content, { ...content, applyDaysBefore: 45 })), true);

// ── what the card says about each notice ────────────────────────────────────
const booked = (o: Partial<BookedTraveller> = {}): BookedTraveller => ({
  bookingId: 'b1', reference: 'EMP-1', leadName: 'Ana', leadEmail: 'ana@example.com', startsOn: '2026-11-02',
  passportSource: 'profile', advisedVersion: 1, acceptedAt: '2026-09-01T10:00:00Z', sawCurrent: false,
  noticeDue: false, noticeKey: null, ...o,
});
const dueRow = booked({ noticeDue: true, noticeKey: 'entry_requirements_changed:b1:r1:1' });
eq('no revision, no message: nothing to say', noticeStatus(booked(), undefined), 'none');
eq('shown the current version: nothing to say', noticeStatus(booked({ sawCurrent: true, advisedVersion: 2 }), undefined), 'none');
eq('due and no message yet: due', noticeStatus(dueRow, undefined), 'due');
eq('queued in the outbox: queued, never "sent"', noticeStatus(dueRow, 'queued'), 'queued');
eq('being sent counts as queued', noticeStatus(dueRow, 'sending'), 'queued');
eq('the outbox says sent: sent', noticeStatus(dueRow, 'sent'), 'sent');
eq('the outbox says failed: failed', noticeStatus(dueRow, 'failed'), 'failed');
eq('a cancelled message still means not told: failed', noticeStatus(dueRow, 'cancelled'), 'failed');
eq('the message outranks the due flag', noticeStatus(booked({ noticeDue: false, noticeKey: 'k' }), 'sent'), 'sent');

// ── a tour's country, as package_country() finds it ─────────────────────────
const coded = [
  { path: 'greece', code: 'GR' },
  { path: 'europe/italy', code: 'IT' },
  { path: 'hx036-r', code: 'GR' },
];
eq('a place inside a coded country takes its code', countryForPath('greece/cyclades/santorini', coded), 'GR');
eq('the coded place itself', countryForPath('greece', coded), 'GR');
eq('the nearest code wins under an uncoded continent', countryForPath('europe/italy/sicily', coded), 'IT');
eq('an uncoded continent has no country', countryForPath('europe', coded), null);
eq('a sibling whose address starts the same inherits nothing', countryForPath('hx036-r2/beach', coded), null);
eq('a tour with no destination has no country', countryForPath(null, coded), null);

// ── what the overview lists as owed ─────────────────────────────────────────
const rec = (o: Partial<EntryRequirementRecord> = {}): EntryRequirementRecord => ({
  id: 'r-gr-ca', destinationCountry: 'GR', passportCountry: 'CA', requirement: 'none', headline: 'No visa for up to 90 days.',
  beforeArrival: 'Passport valid for three months.', why: null, processingTime: null, applyDaysBefore: null,
  applyUrl: null, officialUrl: null, status: 'active', checkedOn: '2026-09-17',
  contentVersion: 1, contentChangedAt: null, noticeRevision: 0, noticeRevisedAt: null, updatedAt: '2026-09-17T12:00:00Z', ...o,
});
const tour = (o: Partial<EntryGapInput['tours'][number]> = {}) => ({
  id: 't1', title: 'Aegean Odyssey', status: 'published', country: 'GR' as string | null, hasUpcomingBookings: false, ...o,
});
const base: EntryGapInput = {
  tours: [tour()], rows: [rec()], owed: [],
  disclaimer: 'Always check the official government website for the specifics of your trip before you travel.',
  otherPassport: 'Travelling on another passport? Contact us before you book.', contactPhone: '+1 416 555 0100', today: '2026-09-27',
};
const gaps = (o: Partial<EntryGapInput>) => entryGaps({ ...base, ...o });
const hrefs = (o: Partial<EntryGapInput>) => gaps(o).map((g) => g.href);

eq('everything written, checked and sent: nothing owed', entryGaps(base), []);

eq('a published tour with no country is listed, by name', gaps({ tours: [tour({ country: null })] }).map((g) => [g.href, g.detail.includes('“Aegean Odyssey”')]), [['/dashboard/content/destinations', true]]);
eq('a draft tour with no country and nobody booked is not', gaps({ tours: [tour({ country: null, status: 'draft' })] }), []);
eq('a draft tour with no country but travellers booked is', hrefs({ tours: [tour({ country: null, status: 'draft', hasUpcomingBookings: true })] }), ['/dashboard/content/destinations']);
eq('an archived tour with nobody booked is not', gaps({ tours: [tour({ country: null, status: 'archived' })] }), []);
const four = gaps({ tours: ['A', 'B', 'C', 'D'].map((t) => tour({ id: t, title: t, country: null })) })[0].detail;
eq('four tours with no country: counted, and three named', [four.startsWith('4 tours have no country'), four.endsWith('“A”, “B”, “C” and 1 more.')], [true, true]);

eq('a country on sale with no Canadian-passport row: the gap names TICO and offers a new row', gaps({ tours: [tour({ country: 'IT' })], rows: [] }).map((g) => [g.detail, g.href]), [
  ['Italy: tours are on sale or booked with no active advice for Canadian passports — TICO’s online minimum.', '/dashboard/content/entry-requirements/new?destination=IT&passport=CA'],
]);
eq('a draft Canadian-passport row still leaves the gap, pointing at the draft', hrefs({ rows: [rec({ status: 'draft' })] }), ['/dashboard/content/entry-requirements/r-gr-ca']);
eq('a row for another passport does not cover Canadians', hrefs({ rows: [rec({ id: 'r-gr-de', passportCountry: 'DE' })] }), ['/dashboard/content/entry-requirements/new?destination=GR&passport=CA']);
eq('a tour in Canada needs no Canadian-passport row', gaps({ tours: [tour({ country: 'CA' })], rows: [] }), []);
eq('a country with only a draft tour and nobody booked is not owed a row', gaps({ tours: [tour({ status: 'draft' })], rows: [] }), []);

eq('checked 179 days ago: fine', gaps({ rows: [rec({ checkedOn: '2026-04-01' })] }), []);
eq('checked 180 days ago: still fine', gaps({ rows: [rec({ checkedOn: '2026-03-31' })] }), []);
eq('checked 181 days ago: listed, with the age', gaps({ rows: [rec({ checkedOn: '2026-03-30' })] }).map((g) => g.detail), ['Greece · Canada passport was last checked against official sources 181 days ago.']);
eq('an active row never checked is listed', gaps({ rows: [rec({ checkedOn: null })] }).map((g) => g.href), ['/dashboard/content/entry-requirements/r-gr-ca']);
eq('a draft row is never stale', gaps({ rows: [rec(), rec({ id: 'r2', passportCountry: 'DE', status: 'draft', checkedOn: null })] }), []);
eq('v2: an active row with no headline is listed, pointing at the row', gaps({ rows: [rec({ headline: null })] }).map((g) => [g.detail, g.href]), [
  ['Greece · Canada passport has no headline, so its alert leads with the requirement caption — the one line of what to do is Empiria’s to write.', '/dashboard/content/entry-requirements/r-gr-ca'],
]);
eq('v2: a draft row with no headline is not', gaps({ rows: [rec(), rec({ id: 'r2', passportCountry: 'DE', status: 'draft', headline: null })] }), []);
eq('v2: a row never checked and with no headline is listed twice, the check first', gaps({ rows: [rec({ checkedOn: null, headline: null })] }).map((g) => g.detail), [
  'Greece · Canada passport is active and has never been marked as checked against official sources.',
  'Greece · Canada passport has no headline, so its alert leads with the requirement caption — the one line of what to do is Empiria’s to write.',
]);

eq('an empty disclaimer is listed', hrefs({ disclaimer: '  ' }), ['/dashboard/settings']);
eq('empty other-passport text is listed', hrefs({ otherPassport: null }), ['/dashboard/settings']);
eq('no contact phone is listed', gaps({ contactPhone: null }).map((g) => g.detail.startsWith('No contact phone. s.38')), [true]);

eq('owed and failed notices are each listed', gaps({
  owed: [{ requirementId: 'r-gr-ca', label: 'Greece · Canada passport', due: 2, failed: 1 }],
}).map((g) => g.detail), [
  'Greece · Canada passport: 2 booked travellers are owed the changed wording, and nothing is queued yet.',
  'Greece · Canada passport: 1 notice failed to send.',
]);
eq('a queued notice is on its way, so nothing is listed for it', gaps({ owed: [] }), []);
eq('every entry gap is filed under one area', gaps({ disclaimer: null, contactPhone: null }).every((g) => g.area === 'Entry requirements'), true);

// ── an answer counts only to a question that was asked ──────────────────────
eq('an unasked tell is ignored', noticeDecision({ asked: false, notice: 'tell' }), null);
eq('an unasked correction is ignored', noticeDecision({ asked: false, notice: 'correction' }), null);
eq('asked and tell: tell', noticeDecision({ asked: true, notice: 'tell' }), 'tell');
eq('asked and correction: correction', noticeDecision({ asked: true, notice: 'correction' }), 'correction');
eq('asked and unanswered: no decision, the save refuses', noticeDecision({ asked: true, notice: '' }), null);

// ── when the card offers "Send the current wording" ─────────────────────────
const offer = (o: Partial<Parameters<typeof offerSendCurrent>[0]> = {}) =>
  offerSendCurrent({
    older: 2, uncovered: 0, noticeRevision: 1,
    contentChangedAt: '2026-09-20T10:00:00Z', noticeRevisedAt: '2026-09-21T10:00:00Z', ...o,
  });
eq('nobody holds older wording: not offered', offer({ older: 0, uncovered: 2 }), false);
eq('someone holds older wording with no notice coming: offered', offer({ uncovered: 1 }), true);
eq('everyone due under the last tell and wording unchanged since: not offered', offer(), false);
eq('all due under revision 1 but the wording changed after the stamp: offered', offer({ contentChangedAt: '2026-09-25T10:00:00Z' }), true);
eq('revision 0 with older bookings: offered', offer({ noticeRevision: 0, noticeRevisedAt: null }), true);
eq('a revision with no stamp and changed wording: offered', offer({ noticeRevisedAt: null }), true);
eq('a revision, wording never changed: not offered', offer({ contentChangedAt: null }), false);

// ── "Send the current wording" from a page that is out of date ──────────────
eq('the page saw the row\'s revision: sends', staleNoticeRevision(3, 3), false);
eq('someone recorded a notice since the page loaded: refused', staleNoticeRevision(2, 3), true);
eq('a revision ahead of the row: refused', staleNoticeRevision(4, 3), true);
eq('revision 0, never told: sends', staleNoticeRevision(0, 0), false);
eq('no revision sent: refused', staleNoticeRevision(undefined, 0), true);
eq('a revision as text: refused', staleNoticeRevision('3', 3), true);
eq('not a whole number: refused', [1.5, Number.NaN, -1, Number.POSITIVE_INFINITY].map((n) => staleNoticeRevision(n, 1)), [true, true, true, true]);

// ── retry: one test for "failed", on the card and in the action ─────────────
const keyed = (k: string) => booked({ bookingId: k, noticeKey: k, noticeDue: true });
eq(
  'only failed messages are released; cancelled cannot be',
  failedNoticeKeys([keyed('a'), keyed('b'), keyed('c'), booked()], { a: 'failed', b: 'cancelled', c: 'sent' }),
  ['a']
);

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
