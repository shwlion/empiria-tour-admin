/**
 * Entry requirements: the one composer every surface uses.
 *
 * The tour page, the booking flow's tick, the booking page, the receipt, the
 * emails and the admin console's preview all turn a resolved row into words
 * here and nowhere else, so what a traveller ticks, what the receipt prints
 * and what the console previews are the same bytes.
 *
 * Pure and client-safe. It imports only `./countries`, by a relative path, so
 * the admin console's byte-identical copy compiles without the storefront's
 * `@/` alias (scripts/check-mirrors.mjs compares the two).
 *
 * No `Intl` and no clock, anywhere. The browser and the server must produce
 * identical text: the tick compares `JSON.stringify([label, body])`, and ICU
 * differs between Bun and the browsers (the same trap `formatDateRange` in
 * lib/money.ts works around). A day is an ISO `YYYY-MM-DD` string, moved by
 * plain day arithmetic and named from a fixed month table. "Today" is never
 * read here: the server passes in its UTC day, as SQL's `current_date` is.
 *
 * What is ticked never depends on today. The label and body carry Empiria's
 * headline and lead time ("At least 42 days before departure"), never a
 * date. The "Apply by" date, the urgency, the kicker and the "Short on time"
 * warning are worked out beside the advice, like the nudge, and are never
 * snapshotted.
 *
 * §2.3: every word of advice is Empiria's, from `entry_requirements` and two
 * platform settings. The captions and sentences below are mechanism copy,
 * marked (ours) in the spec and listed for Empiria's sign-off.
 */

import { countryName } from './countries';

// ─── Types ────────────────────────────────────────────────────────────────

export type RequirementKind = 'none' | 'eta' | 'evisa' | 'visa_on_arrival' | 'visa';

export type EntryState = 'advised' | 'other_passport' | 'own_country' | 'no_country';

/** How loudly the advice is shown: red when a visa is needed, amber otherwise. */
export type Urgency = 'red' | 'amber';

/** One active `entry_requirements` row, as the resolver returned it. */
export type EntryRow = {
  id: string;
  requirement: RequirementKind;
  /** One line: what a traveller must do. Null until Empiria writes it. */
  headline: string | null;
  beforeArrival: string;
  why: string | null;
  processingTime: string | null;
  /** Apply at least this many days before departure; null for no lead time. */
  applyDaysBefore: number | null;
  applyUrl: string | null;
  officialUrl: string | null;
  contentVersion: number;
};

export type ResolvedEntry = {
  state: EntryState;
  destinationCountry: string | null;
  passportCountry: string;
  /** Present exactly when `state` is 'advised'. */
  row: EntryRow | null;
};

/** One row of `entry_requirement_for` / `entry_requirement_by_country`. */
export type EntryRpcRow = {
  state: string;
  destination_country: string | null;
  passport_country: string;
  requirement_id: string | null;
  requirement: string | null;
  before_arrival: string | null;
  why: string | null;
  processing_time: string | null;
  apply_url: string | null;
  official_url: string | null;
  content_version: number | null;
  headline: string | null;
  apply_days_before: number | null;
};

/** `platform_settings.entry_requirements_disclaimer` and `…_other_passport`. */
export type EntrySettings = { disclaimer: string | null; otherPassport: string | null };

export type ComposedAdvice = { label: string; body: string };

/** How a booking's recorded advice relates to the advice as it stands now. */
export type AdviceState = 'as_given' | 'changed' | 'added';

/**
 * What an alert says before any departure or day is known: the whole of the
 * tour page's alert and the console's preview, and the part of the booking
 * flow's, the booking page's and My bookings' that no date changes.
 */
export type EntryAlert = {
  urgency: Urgency;
  /** `ENTRY_COPY.kicker` for the urgency. (ours) */
  kicker: string;
  /**
   * Empiria's headline. With none written, the requirement caption; for
   * other_passport, `ENTRY_COPY.otherPassportHeadline`. Only Empiria's own
   * headline is ever inside the ticked body.
   */
  headline: string;
  /**
   * The requirement caption, shown as a fact beside the headline. Null for
   * other_passport, and when the headline already is the caption.
   */
  requirement: string | null;
  applyDaysBefore: number | null;
  applyUrl: string | null;
  /** "Greece · India passport". */
  place: string;
  /** The tour page's warning line beside Book. (ours) */
  panel: string;
};

/** A departure's "Apply by" day, as it stands on a given today. */
export type ApplyDeadline = {
  /** ISO `YYYY-MM-DD`: the departure less the lead time. */
  applyBy: string;
  /** Today is after `applyBy`: the traveller is short on time. */
  late: boolean;
  /** Whole days from today to the departure. */
  daysToGo: number;
  /** "Apply by 1 May 2027", or "Apply now" when late. (ours) */
  fact: string;
  /** "42 days before departure", or "The usual deadline, 1 May 2027, has passed" when late. (ours) */
  note: string;
};

// ─── Copy (ours) ──────────────────────────────────────────────────────────

/** The requirement line of every advised body. (ours) */
export const REQUIREMENT_CAPTIONS: Record<RequirementKind, string> = {
  none: 'No visa or travel authorisation required',
  eta: 'Electronic travel authorisation (eTA) required',
  evisa: 'eVisa required',
  visa_on_arrival: 'Visa on arrival',
  visa: 'Visa required',
};

/** The colour each requirement is shown in: red for a visa. (ours) */
export const REQUIREMENT_URGENCY: Record<RequirementKind, Urgency> = {
  none: 'amber',
  eta: 'amber',
  evisa: 'red',
  visa_on_arrival: 'amber',
  visa: 'red',
};

/** The captions inside an advised body, above Empiria's words. (ours) */
const SECTION_CAPTIONS = {
  headline: 'What you must do',
  beforeArrival: 'Before you arrive',
  why: 'Why',
  processingTime: 'How long it takes',
  applyDaysBefore: 'When to apply',
  apply: 'Apply',
} as const;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** "1 day", "42 days". */
const dayCount = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** "Jane", "Jane and Marc", "Jane, Marc and Ana". */
const nameList = (names: readonly string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * Every sentence the entry-requirements surfaces show that is not Empiria's.
 * (ours) — spec §3 and the v2 interface contract. `changed` is also the
 * exact message `create_booking_with_entry_advice` raises (migration 0036),
 * which `friendly()` in lib/bookingMessages.ts passes through.
 */
export const ENTRY_COPY = {
  nudge:
    'Travelling on a different passport? Add your passport country to your profile to see the advice for it, or contact us.',
  notPublished: 'Entry requirements for this tour have not been published yet.',
  unavailableTour: 'Entry requirements could not be loaded just now. Please reload the page.',
  unavailableBook: "We couldn't load the entry requirements for this tour. Please try again in a moment.",
  confirm: 'Please confirm the entry requirements.',
  changed:
    'The entry requirements changed while you were booking. Reload the page to read them, then confirm again.',
  shownFor: (passport: string) => `Shown for: ${passport} passport`,
  changeInProfile: 'Change in your profile',
  beforeTravelHeading: (destination: string) => `Before you travel to ${destination}`,
  adviceGivenHeading: 'Entry requirements advice given',
  notOnRecord: 'No entry-requirements advice is on record for this booking.',
  asGiven: (date: string) => `As shown when you booked on ${date}`,
  updatedSince: (date: string) => `Updated since you booked on ${date}`,
  whatYouWereShown: 'What you were shown',
  addedSince: 'Added since you booked',
  forTravellers: 'For:',
  contact: 'Contact:',
  // v2, the urgent design (29 Sep 2026).
  kicker: { red: 'Action needed before you travel', amber: 'Check before you travel' },
  otherPassportHeadline: (passport: string) =>
    `We have no advice yet for ${passport} passports. Contact us to find out what you need.`,
  place: (destination: string, passport: string) => `${destination} · ${passport} passport`,
  shownUntilSet: '(shown until you set yours)',
  forNames: (names: readonly string[]) => (names.length === 0 ? '' : `for ${nameList(names)}`),
  applyAtLeast: (days: number) => `Apply at least ${dayCount(days)} before departure`,
  atLeastBefore: (days: number) => `At least ${dayCount(days)} before departure`,
  applyBy: (date: string) => `Apply by ${date}`,
  applyNow: 'Apply now',
  daysBeforeDeparture: (days: number) => `${dayCount(days)} before departure`,
  deadlinePassed: (date: string) => `The usual deadline, ${date}, has passed`,
  shortOnTime: 'Short on time.',
  shortOnTimeDetail: (daysToGo: number, applyDaysBefore: number) =>
    `${daysToGo <= 0 ? 'This trip starts today.' : `This trip starts in ${dayCount(daysToGo)}.`} ` +
    `Empiria advises applying at least ${dayCount(applyDaysBefore)} before departure — contact us before you book.`,
  applyOnline: 'Apply online',
  fullRequirements: 'Full requirements',
  readAndConfirm: 'Read and confirm to continue',
  panelRequired: (caption: string, passport: string) => `${caption} for ${passport} passports`,
  panelCheck: (passport: string) => `Check the entry requirements for ${passport} passports`,
  statePill: { changed: 'Updated since you booked', added: 'New since you booked' },
  badge: { red: 'Action needed', amber: 'Check before you travel' },
} as const;

// ─── Mapping the resolver's row ───────────────────────────────────────────

const STATES: readonly string[] = ['advised', 'other_passport', 'own_country', 'no_country'];
const KINDS: readonly string[] = ['none', 'eta', 'evisa', 'visa_on_arrival', 'visa'];

/** A lead time the database accepts: a whole number of days, 1 to 365. */
const isLeadTime = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 365;

/**
 * The resolver's snake_case row as a `ResolvedEntry`.
 *
 * Throws on a row that breaks the resolver's contract (an unknown state, an
 * advised row with no id, version or known requirement, a headline that is
 * not text or a lead time that is not 1 to 365 days). The loaders catch that
 * and show "unavailable": a malformed answer is not an empty one.
 */
export function toResolvedEntry(row: EntryRpcRow): ResolvedEntry {
  if (!STATES.includes(row.state)) throw new Error(`Unknown entry-requirements state: ${row.state}`);
  const state = row.state as EntryState;
  const passportCountry = row.passport_country;

  if (state === 'no_country') {
    return { state, destinationCountry: null, passportCountry, row: null };
  }
  if (!row.destination_country) throw new Error(`Entry-requirements state ${state} has no destination`);
  const destinationCountry = row.destination_country;

  if (state !== 'advised') return { state, destinationCountry, passportCountry, row: null };

  if (
    !row.requirement_id ||
    row.requirement == null ||
    !KINDS.includes(row.requirement) ||
    row.before_arrival == null ||
    row.content_version == null ||
    (row.headline !== null && typeof row.headline !== 'string') ||
    (row.apply_days_before !== null && !isLeadTime(row.apply_days_before))
  ) {
    throw new Error('Advised entry-requirements row is incomplete');
  }
  return {
    state,
    destinationCountry,
    passportCountry,
    row: {
      id: row.requirement_id,
      requirement: row.requirement as RequirementKind,
      headline: row.headline,
      beforeArrival: row.before_arrival,
      why: row.why,
      processingTime: row.processing_time,
      applyDaysBefore: row.apply_days_before,
      applyUrl: row.apply_url,
      officialUrl: row.official_url,
      contentVersion: row.content_version,
    },
  };
}

// ─── Composing ────────────────────────────────────────────────────────────

/** Unix newlines, no outer whitespace; null when nothing is left. */
function clean(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  const s = text.replace(/\r\n?/g, '\n').trim();
  return s === '' ? null : s;
}

/** `clean`, on one line: every run of whitespace becomes one space. */
function oneLine(text: string | null | undefined): string | null {
  const s = clean(text);
  return s === null ? null : s.replace(/\s+/g, ' ');
}

/** A caption line over Empiria's words, or nothing when there are none. */
function section(caption: string, text: string | null): string | null {
  const words = clean(text);
  return words === null ? null : `${caption}\n${words}`;
}

/** The disclaimer, then the official URL on its own line. */
function disclaimerBlock(disclaimer: string | null, officialUrl: string | null): string | null {
  const lines = [clean(disclaimer), clean(officialUrl)].filter((l): l is string => l !== null);
  return lines.length > 0 ? lines.join('\n') : null;
}

const nameOf = (code: string) => countryName(code) ?? code;

/**
 * The advice a traveller is shown and ticks: `{label, body}`, or null when
 * there is nothing to advise (`own_country`, `no_country`).
 *
 * - The label names both countries, so a changed passport changes the tick
 *   even when two passports share the same other-passport text.
 * - The advised body, sections separated by a blank line: "What you must do"
 *   and Empiria's headline; the requirement caption; "Before you arrive",
 *   "Why" and "How long it takes"; "When to apply" with the lead time in
 *   days; "Apply" and the link; each only when Empiria wrote it. Then the
 *   disclaimer with the official URL on the next line, and the other-passport
 *   text last. A row with no headline and no lead time composes exactly as
 *   it did before v2.
 * - The other-passport body: the disclaimer, then the other-passport text.
 *   With both settings empty it is the "not published yet" sentence, so a
 *   ticked body is never empty (the advice record's snapshot check needs
 *   one).
 * - Never in either: the nudge, the kicker, a fallback headline, a date. It
 *   takes no departure and no today, so a tick survives midnight.
 */
export function composeEntryAdvice(resolved: ResolvedEntry, settings: EntrySettings): ComposedAdvice | null {
  if (resolved.state === 'own_country' || resolved.state === 'no_country') return null;
  if (!resolved.destinationCountry) throw new Error('Entry advice needs a destination country');

  const label = `Entry requirements for ${nameOf(resolved.destinationCountry)} — ${nameOf(resolved.passportCountry)} passport`;
  const otherPassport = clean(settings.otherPassport);

  if (resolved.state === 'other_passport') {
    const parts = [disclaimerBlock(settings.disclaimer, null), otherPassport].filter(
      (p): p is string => p !== null
    );
    return { label, body: parts.length > 0 ? parts.join('\n\n') : ENTRY_COPY.notPublished };
  }

  const row = resolved.row;
  if (!row) throw new Error('Advised entry requirements need a row');
  const parts = [
    section(SECTION_CAPTIONS.headline, oneLine(row.headline)),
    REQUIREMENT_CAPTIONS[row.requirement],
    section(SECTION_CAPTIONS.beforeArrival, row.beforeArrival),
    section(SECTION_CAPTIONS.why, row.why),
    section(SECTION_CAPTIONS.processingTime, row.processingTime),
    row.applyDaysBefore === null
      ? null
      : section(SECTION_CAPTIONS.applyDaysBefore, ENTRY_COPY.atLeastBefore(row.applyDaysBefore)),
    section(SECTION_CAPTIONS.apply, row.applyUrl),
    disclaimerBlock(settings.disclaimer, row.officialUrl),
    otherPassport,
  ].filter((p): p is string => p !== null);
  return { label, body: parts.join('\n\n') };
}

/** What a tick stands for, and what the server compares it with. */
export function tickValue(advice: ComposedAdvice): string {
  return JSON.stringify([advice.label, advice.body]);
}

/**
 * How a booking's advice record relates to the advice now resolved for its
 * recorded destination and passport — the booking page's note.
 *
 * - `as_given`: the same row at the same version, or the other-passport
 *   fallback then and now.
 * - `changed`: a different row or version than the one recorded, or the row
 *   the booking was advised under is no longer active.
 * - `added`: a row now covers a passport that had none when they booked.
 * - null when nothing is advised now (`own_country`, `no_country`).
 */
export function adviceStateFor(
  record: { kind: string; requirementId: string | null; requirementVersion: number | null },
  resolved: ResolvedEntry
): AdviceState | null {
  if (resolved.state === 'own_country' || resolved.state === 'no_country') return null;

  if (resolved.state === 'advised') {
    if (record.kind !== 'advised') return 'added';
    const row = resolved.row;
    return row && record.requirementId === row.id && record.requirementVersion === row.contentVersion
      ? 'as_given'
      : 'changed';
  }

  // other_passport now. A record with no advice at all (own_country,
  // no_country) cannot meet this through the booking page, which resolves
  // the record's own countries; if it ever does, advice has appeared since.
  if (record.kind === 'other_passport') return 'as_given';
  if (record.kind === 'advised') return 'changed';
  return 'added';
}

// ─── Urgency and the alert (v2) ───────────────────────────────────────────

/**
 * How loudly to show the advice, or null when there is none to show.
 *
 * - advised: `REQUIREMENT_URGENCY` for the row's requirement.
 * - other_passport: red. No row covers the passport, so what it needs is
 *   unknown and may be a visa; the action is to contact Empiria.
 * - own_country, no_country: null. There is no alert.
 */
export function urgencyFor(resolved: ResolvedEntry): Urgency | null {
  if (resolved.state === 'other_passport') return 'red';
  if (resolved.state !== 'advised') return null;
  if (!resolved.row) throw new Error('Advised entry requirements need a row');
  return REQUIREMENT_URGENCY[resolved.row.requirement];
}

/**
 * The alert's words, or null when there is no alert (`own_country`,
 * `no_country`). Takes no departure and no today: the dated parts come from
 * `applyDeadline`.
 */
export function entryAlert(resolved: ResolvedEntry): EntryAlert | null {
  const urgency = urgencyFor(resolved);
  if (urgency === null) return null;
  if (!resolved.destinationCountry) throw new Error('An entry alert needs a destination country');

  const passport = nameOf(resolved.passportCountry);
  const place = ENTRY_COPY.place(nameOf(resolved.destinationCountry), passport);
  const kicker = ENTRY_COPY.kicker[urgency];

  if (resolved.state === 'other_passport') {
    return {
      urgency,
      kicker,
      headline: ENTRY_COPY.otherPassportHeadline(passport),
      requirement: null,
      applyDaysBefore: null,
      applyUrl: null,
      place,
      panel: ENTRY_COPY.panelCheck(passport),
    };
  }

  const row = resolved.row;
  if (!row) throw new Error('Advised entry requirements need a row');
  const caption = REQUIREMENT_CAPTIONS[row.requirement];
  const headline = oneLine(row.headline);
  const lead = row.applyDaysBefore;
  const panel =
    (urgency === 'red' ? ENTRY_COPY.panelRequired(caption, passport) : ENTRY_COPY.panelCheck(passport)) +
    (lead === null ? '' : ` · ${ENTRY_COPY.applyAtLeast(lead)}`);
  return {
    urgency,
    kicker,
    headline: headline ?? caption,
    requirement: headline === null ? null : caption,
    applyDaysBefore: lead,
    applyUrl: clean(row.applyUrl),
    place,
    panel,
  };
}

// ─── Days (v2) ────────────────────────────────────────────────────────────
// Plain arithmetic on ISO days. Nothing here reads a clock or a time zone.

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 of a Gregorian day (H. Hinnant, days_from_civil). */
function dayNumber(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * ((m + 9) % 12) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The Gregorian year, month and day of a day number (civil_from_days). */
function civil(n: number): [number, number, number] {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

function isoOf(n: number): string {
  const [y, m, d] = civil(n);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/** An ISO calendar day as a day number. Throws on anything else. */
function parseDay(iso: string): number {
  const match = typeof iso === 'string' ? ISO_DAY.exec(iso) : null;
  if (!match) throw new Error(`Not an ISO calendar day: ${String(iso)}`);
  const n = dayNumber(Number(match[1]), Number(match[2]), Number(match[3]));
  if (isoOf(n) !== iso) throw new Error(`Not an ISO calendar day: ${iso}`);
  return n;
}

/** The departure less the lead time, as an ISO day. */
export function applyByDate(departure: string, applyDaysBefore: number): string {
  if (!isLeadTime(applyDaysBefore)) throw new Error(`A lead time is 1 to 365 days, not ${applyDaysBefore}`);
  return isoOf(parseDay(departure) - applyDaysBefore);
}

/** Whole days from one ISO day to another; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return parseDay(to) - parseDay(from);
}

/** Today is after the apply-by day. On the day itself there is still time. */
export function isLate(today: string, applyBy: string): boolean {
  return parseDay(today) > parseDay(applyBy);
}

/** "1 May 2027": the day, the English month, the year. The same everywhere. */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = civil(parseDay(iso));
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * A departure's deadline on a given today, or null when the row has no lead
 * time. `today` is the server's UTC day, passed in (spec: "today is an
 * input").
 */
export function applyDeadline(
  departure: string,
  applyDaysBefore: number | null,
  today: string
): ApplyDeadline | null {
  if (applyDaysBefore === null) return null;
  const applyBy = applyByDate(departure, applyDaysBefore);
  const late = isLate(today, applyBy);
  const date = formatIsoDate(applyBy);
  return {
    applyBy,
    late,
    daysToGo: daysBetween(today, departure),
    fact: late ? ENTRY_COPY.applyNow : ENTRY_COPY.applyBy(date),
    note: late ? ENTRY_COPY.deadlinePassed(date) : ENTRY_COPY.daysBeforeDeparture(applyDaysBefore),
  };
}

/** My bookings' badge: the urgency's word, then the deadline when there is one. */
export function entryBadge(alert: EntryAlert, deadline: ApplyDeadline | null): string {
  const word = ENTRY_COPY.badge[alert.urgency];
  return deadline ? `${word} · ${deadline.fact}` : word;
}
