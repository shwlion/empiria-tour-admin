import { explain } from '@/lib/actions';
import {
  contentChanged,
  isHttpsAddress,
  pairLabel,
  parseApplyDaysBefore,
  validateEntryRequirement,
  type EntryRequirementDraft,
} from './entryRequirements';

/**
 * Entry requirements (0036): what counts as a change to the advice, and what
 * a save accepts.
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

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
