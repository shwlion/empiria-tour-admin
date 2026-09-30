import { getSupabaseAdmin } from '@/lib/supabase';
import { countryName, isCountryCode } from '@/lib/countries';
import type { EntrySettings, RequirementKind } from '@/lib/entryAdvice';
import type { ContentGap } from '@/lib/admin/content';
import { dateIn, REPORT_TIMEZONE } from '@/lib/admin/reports';

/**
 * Entry requirements by passport (0036): Empiria's advice for each
 * destination country and passport country.
 *
 * Every word in a row is Empiria's (§2.3). This module reads the rows and
 * checks a save; the storefront chooses, shows and records the advice. The
 * console previews it with `lib/entryAdvice.ts`, a byte-identical copy of the
 * storefront's composer, so the preview is what a traveller sees.
 *
 * Readers throw on a database error rather than return an empty list: an
 * empty list here reads as "no advice written", which is a different answer.
 */

export const REQUIREMENT_KINDS: readonly RequirementKind[] = ['none', 'eta', 'evisa', 'visa_on_arrival', 'visa'];
export const ENTRY_STATUSES = ['draft', 'active', 'retired'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export type EntryRequirementRecord = {
  id: string;
  destinationCountry: string;
  passportCountry: string;
  requirement: RequirementKind;
  /** v2: one line of what to do, shown first. Null until Empiria writes it. */
  headline: string | null;
  beforeArrival: string;
  why: string | null;
  processingTime: string | null;
  /** v2: apply at least this many days before departure; null for nothing to apply for ahead. */
  applyDaysBefore: number | null;
  applyUrl: string | null;
  officialUrl: string | null;
  status: EntryStatus;
  checkedOn: string | null;
  contentVersion: number;
  contentChangedAt: string | null;
  noticeRevision: number;
  noticeRevisedAt: string | null;
  updatedAt: string;
};

const COLUMNS =
  'id, destination_country, passport_country, requirement, headline, before_arrival, why, processing_time, apply_days_before, apply_url, official_url, status, checked_on, content_version, content_changed_at, notice_revision, notice_revised_at, updated_at';

type Raw = {
  id: string; destination_country: string; passport_country: string; requirement: string; headline: string | null;
  before_arrival: string; why: string | null; processing_time: string | null; apply_days_before: number | null;
  apply_url: string | null; official_url: string | null;
  status: string; checked_on: string | null; content_version: number; content_changed_at: string | null;
  notice_revision: number; notice_revised_at: string | null; updated_at: string;
};

// The database's checks guarantee both values; the casts only say so to TypeScript.
const toRecord = (r: Raw): EntryRequirementRecord => ({
  id: r.id,
  destinationCountry: r.destination_country,
  passportCountry: r.passport_country,
  requirement: r.requirement as RequirementKind,
  headline: r.headline,
  beforeArrival: r.before_arrival,
  why: r.why,
  processingTime: r.processing_time,
  applyDaysBefore: r.apply_days_before,
  applyUrl: r.apply_url,
  officialUrl: r.official_url,
  status: r.status as EntryStatus,
  checkedOn: r.checked_on,
  contentVersion: r.content_version,
  contentChangedAt: r.content_changed_at,
  noticeRevision: r.notice_revision,
  noticeRevisedAt: r.notice_revised_at,
  updatedAt: r.updated_at,
});

export async function listEntryRequirements(): Promise<EntryRequirementRecord[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from('entry_requirements')
    .select(COLUMNS)
    .order('destination_country')
    .order('passport_country')
    .limit(5000);
  if (error) throw error;
  return (data ?? []).map(toRecord);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getEntryRequirement(id: string): Promise<EntryRequirementRecord | null> {
  const db = getSupabaseAdmin();
  // A mistyped address is "not found", not a database error.
  if (!db || !UUID.test(id)) return null;
  const { data, error } = await db.from('entry_requirements').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toRecord(data) : null;
}

/** The two Settings texts the composer adds to every piece of advice. */
export async function getEntrySettings(): Promise<EntrySettings> {
  const db = getSupabaseAdmin();
  if (!db) return { disclaimer: null, otherPassport: null };
  const { data, error } = await db
    .from('platform_settings')
    .select('entry_requirements_disclaimer, entry_requirements_other_passport')
    .maybeSingle();
  if (error) throw error;
  return {
    disclaimer: data?.entry_requirements_disclaimer ?? null,
    otherPassport: data?.entry_requirements_other_passport ?? null,
  };
}

/** "Greece · Canada passport": how staff name a row in lists, audits and gaps. */
export function pairLabel(destination: string, passport: string): string {
  return `${countryName(destination) ?? destination} · ${countryName(passport) ?? passport} passport`;
}

// ─── Checking a save ──────────────────────────────────────────────────────

type Content = Pick<
  EntryRequirementRecord,
  'requirement' | 'headline' | 'beforeArrival' | 'why' | 'processingTime' | 'applyDaysBefore' | 'applyUrl' | 'officialUrl'
>;

const CONTENT_KEYS = [
  'requirement', 'headline', 'beforeArrival', 'why', 'processingTime', 'applyDaysBefore', 'applyUrl', 'officialUrl',
] as const;

/**
 * Whether the advice itself changes: the eight columns 0036's version trigger
 * counts, compared as it compares them (`is distinct from`, so null equals
 * null). A new headline or lead time is a change like any other (v2). Status,
 * the checked date and the notice fields are not content. A new row is all
 * content.
 */
export function contentChanged(before: Content | null, after: Content): boolean {
  if (!before) return true;
  return CONTENT_KEYS.some((k) => (before[k] ?? null) !== (after[k] ?? null));
}

/** https only, as 0036's checks require: the scheme exactly "https://", a host, no spaces. */
export function isHttpsAddress(value: string): boolean {
  if (!value.startsWith('https://') || /\s/.test(value)) return false;
  try {
    return new URL(value).hostname !== '';
  } catch {
    return false;
  }
}

export type EntryRequirementDraft = {
  destinationCountry: string; passportCountry: string; requirement: string; headline: string; beforeArrival: string;
  why: string; processingTime: string; applyDaysBefore: string; applyUrl: string; officialUrl: string; status: string;
};

export type EntryRequirementValues = Content & Pick<EntryRequirementRecord, 'destinationCountry' | 'passportCountry' | 'status'>;

/** Textarea text: a browser submits CRLF, the storefront wants one kind of line break. */
const tidy = (value: string) => value.replace(/\r\n?/g, '\n').trim();

/** The longest headline 0036's `entry_requirements_headline_check` allows, in characters. */
export const HEADLINE_MAX = 160;

/** Zero-width characters: they draw nothing, so a headline made only of them is blank. */
const INVISIBLE = /[\u200B\u200C\u200D\u2060\uFEFF]/g;

/** Unicode line breaks that `trim()` would strip at the edges, so they are checked before it. */
const LINE_BREAKS = /[\u2028\u2029\u0085]/;

/**
 * The headline as it is stored: trimmed, and null when nothing visible is
 * left (only spaces, NBSP, U+3000 or zero-width characters). The preview
 * shares it with the save.
 */
export function tidyHeadline(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.replace(INVISIBLE, '').trim() === '' ? null : trimmed;
}

/**
 * Whether the text holds a control character, as the check's `[[:cntrl:]]`
 * finds one: C0 (a line break or a tab is one), DEL and C1. Compared by code
 * point, not with a regex, so no control character sits in the source.
 */
const hasControlCharacter = (value: string) =>
  [...value].some((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code < 0x20 || (code >= 0x7f && code <= 0x9f);
  });

/**
 * The lead time as typed: blank is null (nothing to apply for ahead), a whole
 * number from 1 to 365 is that number, anything else is 'invalid'. The save
 * refuses 'invalid'; the preview shows it as no lead time. Pure, and asserted
 * in `entryRequirements.test.ts`.
 */
export function parseApplyDaysBefore(value: string): number | null | 'invalid' {
  const s = value.trim();
  if (s === '') return null;
  if (!/^\d+$/.test(s)) return 'invalid';
  const days = Number(s);
  return days >= 1 && days <= 365 ? days : 'invalid';
}

/**
 * The form, checked before the database has to refuse it. Field errors are
 * keyed by the form's input names. Pure, and asserted in
 * `entryRequirements.test.ts`.
 */
export function validateEntryRequirement(
  draft: EntryRequirementDraft
): { ok: true; values: EntryRequirementValues } | { ok: false; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const destinationCountry = draft.destinationCountry.trim();
  const passportCountry = draft.passportCountry.trim();
  if (!isCountryCode(destinationCountry)) fields.destination_country = 'Choose a country';
  if (!isCountryCode(passportCountry)) fields.passport_country = 'Choose a country';
  else if (passportCountry === destinationCountry) {
    fields.passport_country = 'Travellers visiting their own passport’s country see nothing, so this pair needs no row';
  }
  const requirement = REQUIREMENT_KINDS.find((k) => k === draft.requirement);
  if (!requirement) fields.requirement = 'Choose one';
  // v2. Trimmed, and blank is null: "not written yet", which the overview
  // reports. Counted in characters, as char_length counts them.
  const headline = tidyHeadline(draft.headline);
  if (LINE_BREAKS.test(draft.headline) || (headline && hasControlCharacter(headline))) fields.headline = 'Keep the headline to one line.';
  else if (headline && [...headline].length > HEADLINE_MAX) fields.headline = 'Keep the headline to 160 characters or fewer.';
  const beforeArrival = tidy(draft.beforeArrival);
  if (!beforeArrival) fields.before_arrival = 'Required — this is the advice itself';
  const applyDaysBefore = parseApplyDaysBefore(draft.applyDaysBefore);
  if (applyDaysBefore === 'invalid') {
    fields.apply_days_before = 'Enter a whole number of days from 1 to 365, or leave it blank.';
  }
  const applyUrl = tidy(draft.applyUrl) || null;
  if (applyUrl && !isHttpsAddress(applyUrl)) fields.apply_url = 'An https:// address';
  const officialUrl = tidy(draft.officialUrl) || null;
  if (officialUrl && !isHttpsAddress(officialUrl)) fields.official_url = 'An https:// address';
  const status = ENTRY_STATUSES.find((s) => s === draft.status);
  if (!status) fields.status = 'Choose one';

  if (Object.keys(fields).length > 0 || !requirement || !status || applyDaysBefore === 'invalid') {
    return { ok: false, fields };
  }
  return {
    ok: true,
    values: {
      destinationCountry,
      passportCountry,
      requirement,
      headline,
      beforeArrival,
      why: tidy(draft.why) || null,
      processingTime: tidy(draft.processingTime) || null,
      applyDaysBefore,
      applyUrl,
      officialUrl,
      status,
    },
  };
}

// ─── s.37: the travellers already booked ─────────────────────────────────

/** A booking that is the traveller's: something paid, not cancelled. 0036's functions count the same three. */
export const COMMITTED_STATUSES = ['confirmed', 'balance_due', 'paid_in_full'] as const;

/** The change-notice email Loop B sends (0036). */
export const CHANGE_TEMPLATE = 'entry_requirements_changed';

/** The database's `current_date`, which is UTC: 0036 counts "upcoming" from it, and so does this. */
const utcToday = () => new Date().toISOString().slice(0, 10);

export type BookedTraveller = {
  bookingId: string;
  reference: string;
  leadName: string;
  leadEmail: string;
  startsOn: string;
  passportSource: 'profile' | 'default';
  advisedVersion: number | null;
  acceptedAt: string | null;
  sawCurrent: boolean;
  noticeDue: boolean;
  noticeKey: string | null;
};

export type NoticeStatus = 'none' | 'due' | 'queued' | 'sent' | 'failed';

/**
 * Committed bookings on upcoming, non-cancelled departures, platform-wide.
 * The form asks the s.37 question only when there are some, and the save
 * counts again rather than trusting a page that may be minutes old.
 */
export async function countCommittedUpcoming(): Promise<number> {
  const db = getSupabaseAdmin();
  if (!db) return 0;
  const { count, error } = await db
    .from('bookings')
    .select('id, departures!inner ( starts_on, status )', { count: 'exact', head: true })
    .in('status', [...COMMITTED_STATUSES])
    .gte('departures.starts_on', utcToday())
    .neq('departures.status', 'cancelled');
  if (error) throw error;
  return count ?? 0;
}

/**
 * Who was advised for this row's destination and passport and is still going:
 * `entry_advice_bookings` (0036), plus the outbox's status for each one's
 * notice under the current revision, keyed by dedupe key. An error is
 * returned, not swallowed: "nobody booked" and "could not look" must not look
 * the same on a card that decides who gets told.
 */
export async function listBookedTravellers(
  requirementId: string
): Promise<{ rows: BookedTraveller[]; messages: Record<string, string>; error: string | null }> {
  const db = getSupabaseAdmin();
  if (!db) return { rows: [], messages: {}, error: null };
  const { data, error } = await db.rpc('entry_advice_bookings', { p_requirement: requirementId });
  if (error) return { rows: [], messages: {}, error: error.message };

  const rows: BookedTraveller[] = (data ?? [])
    .map((r) => ({
      bookingId: r.booking_id,
      reference: r.reference,
      leadName: r.lead_name,
      leadEmail: r.lead_email,
      startsOn: r.starts_on,
      passportSource: r.passport_source === 'profile' ? ('profile' as const) : ('default' as const),
      advisedVersion: r.advised_version ?? null,
      acceptedAt: r.accepted_at ?? null,
      sawCurrent: r.saw_current === true,
      noticeDue: r.notice_due === true,
      noticeKey: r.notice_key ?? null,
    }))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.reference.localeCompare(b.reference));

  // Exact keys, fifty to a request: each is about a hundred characters, and
  // they travel in the request's address.
  const keys = rows.map((r) => r.noticeKey).filter((k): k is string => k !== null);
  const messages: Record<string, string> = {};
  for (let i = 0; i < keys.length; i += 50) {
    const { data: found, error: readError } = await db
      .from('email_messages')
      .select('dedupe_key, status')
      .in('dedupe_key', keys.slice(i, i + 50));
    if (readError) return { rows, messages: {}, error: readError.message };
    for (const m of found ?? []) if (m.dedupe_key) messages[m.dedupe_key] = m.status;
  }
  return { rows, messages, error: null };
}

/**
 * Whether a save must ask "tell them, or a correction?" (spec §6): the row is
 * active after the save; its advice changed, or it was put in front of
 * travellers (a new row, an activation, a re-activation); and committed
 * bookings on upcoming departures exist anywhere on the platform. Retiring, a
 * status-only change to draft or retired, and a checked-only save never ask.
 * Pure, and asserted in `entryRequirements.test.ts`.
 */
export function noticeDecisionNeeded(input: {
  beforeStatus: string | null;
  afterStatus: string;
  contentChanged: boolean;
  bookingsExist: boolean;
}): boolean {
  if (input.afterStatus !== 'active' || !input.bookingsExist) return false;
  return input.contentChanged || input.beforeStatus !== 'active';
}

/**
 * One booking's notice under the row's current revision: the outbox's word
 * when a message exists under its key, otherwise due or nothing. "Queued"
 * covers sending; nothing says "sent" unless the outbox did. Nothing in the
 * platform cancels an email today; if something ever does, the traveller was
 * still not told, so it reads as failed. Pure, and asserted in
 * `entryRequirements.test.ts`.
 */
export function noticeStatus(row: BookedTraveller, messageStatus: string | undefined): NoticeStatus {
  if (messageStatus === 'sent') return 'sent';
  if (messageStatus === 'queued' || messageStatus === 'sending') return 'queued';
  if (messageStatus === 'failed' || messageStatus === 'cancelled') return 'failed';
  return row.noticeDue ? 'due' : 'none';
}

/**
 * Whether Loop B can send at all: the change email is switched on, with a
 * subject and a body, as 0036's scan requires. Null when it could not be
 * read, so a caller says nothing rather than something wrong.
 */
export async function noticeTemplateReady(): Promise<boolean | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data, error } = await db
    .from('email_templates')
    .select('is_active, subject, body_html')
    .eq('key', CHANGE_TEMPLATE)
    .maybeSingle();
  if (error) return null;
  return Boolean(data && data.is_active && data.subject.trim() && data.body_html.trim());
}

export type OwedNotices = { requirementId: string; label: string; due: number; failed: number };

/**
 * For each active row, the notices owed: `due` bookings have no message yet
 * and `failed` ones failed to send. A queued notice is on its way and is not
 * owed. Bookings never shown the current wording that no notice will reach
 * were left out on purpose (a correction makes no one due, spec §6), so they
 * are not owed either. Rows with none are left out.
 */
export async function listOwedNotices(rows: EntryRequirementRecord[]): Promise<{ owed: OwedNotices[]; error: string | null }> {
  const told = rows.filter((r) => r.status === 'active');
  const results = await Promise.all(told.map((r) => listBookedTravellers(r.id)));
  const owed: OwedNotices[] = [];
  for (let i = 0; i < told.length; i++) {
    const { rows: booked, messages, error } = results[i];
    if (error) return { owed: [], error };
    const count = { due: 0, failed: 0 };
    for (const b of booked) {
      const status = noticeStatus(b, b.noticeKey ? messages[b.noticeKey] : undefined);
      if (status === 'due') count.due++;
      else if (status === 'failed') count.failed++;
    }
    if (count.due + count.failed > 0) {
      owed.push({ requirementId: told[i].id, label: pairLabel(told[i].destinationCountry, told[i].passportCountry), ...count });
    }
  }
  return { owed, error: null };
}

// ─── What is still owed ───────────────────────────────────────────────────

/**
 * A tour's country, as 0036's `package_country()` finds it: the code on the
 * nearest place at or above the tour's destination. "Above" is a whole path
 * segment — `hx036-r2` is not inside `hx036-r`. Pure, and asserted in
 * `entryRequirements.test.ts`.
 */
export function countryForPath(path: string | null, coded: { path: string; code: string }[]): string | null {
  if (!path) return null;
  let best: { path: string; code: string } | null = null;
  for (const c of coded) {
    if (c.path !== path && !path.startsWith(`${c.path}/`)) continue;
    if (!best || c.path.length > best.path.length) best = c;
  }
  return best?.code ?? null;
}

export type EntryGapInput = {
  tours: { id: string; title: string; status: string; country: string | null; hasUpcomingBookings: boolean }[];
  rows: EntryRequirementRecord[];
  owed: OwedNotices[];
  disclaimer: string | null;
  otherPassport: string | null;
  contactPhone: string | null;
  /** YYYY-MM-DD in the seller's calendar, as `checked_on` is stamped. */
  today: string;
};

const AREA = 'Entry requirements';
const LIST = '/dashboard/content/entry-requirements';
const SETTINGS = '/dashboard/settings';
/** How long a check stands before the overview asks for another (spec §11: 180 days). */
export const RECHECK_DAYS = 180;

const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** “A”, “B”, “C” and 2 more. */
const titles = (list: string[]) =>
  list.slice(0, 3).map((t) => `“${t}”`).join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '');

/**
 * Spec §7 "Owed content", for the overview. A tour counts when it is
 * published, or when travellers are booked on an upcoming departure of it —
 * taking a tour off sale does not take its travellers off the road. Pure, and
 * asserted in `entryRequirements.test.ts`.
 */
export function entryGaps(input: EntryGapInput): ContentGap[] {
  const gaps: ContentGap[] = [];
  const live = input.tours.filter((t) => t.status === 'published' || t.hasUpcomingBookings);

  const noCountry = live.filter((t) => !t.country);
  if (noCountry.length > 0) {
    gaps.push({
      area: AREA,
      detail: `${noCountry.length} ${noCountry.length === 1 ? 'tour has' : 'tours have'} no country — no place at or above ${noCountry.length === 1 ? 'its destination has' : 'their destinations have'} a code, so travellers see “not yet published”: ${titles(noCountry.map((t) => t.title))}.`,
      href: '/dashboard/content/destinations',
    });
  }

  // TICO's online minimum: the advice for a Canadian citizen on a Canadian
  // passport. A tour in Canada needs none for Canadians.
  const abroad = [...new Set(live.map((t) => t.country).filter((c): c is string => c !== null && c !== 'CA'))].sort(
    (a, b) => (countryName(a) ?? a).localeCompare(countryName(b) ?? b)
  );
  for (const code of abroad) {
    const row = input.rows.find((r) => r.destinationCountry === code && r.passportCountry === 'CA');
    if (row?.status === 'active') continue;
    gaps.push({
      area: AREA,
      detail: `${countryName(code) ?? code}: tours are on sale or booked with no active advice for Canadian passports — TICO’s online minimum.`,
      href: row ? `${LIST}/${row.id}` : `${LIST}/new?destination=${code}&passport=CA`,
    });
  }

  for (const r of input.rows) {
    if (r.status !== 'active') continue;
    const label = pairLabel(r.destinationCountry, r.passportCountry);
    if (!r.checkedOn) {
      gaps.push({ area: AREA, detail: `${label} is active and has never been marked as checked against official sources.`, href: `${LIST}/${r.id}` });
    } else if (days(r.checkedOn, input.today) > RECHECK_DAYS) {
      gaps.push({ area: AREA, detail: `${label} was last checked against official sources ${days(r.checkedOn, input.today)} days ago.`, href: `${LIST}/${r.id}` });
    }
    // v2. Null is "not written yet" (the database refuses a blank one). The
    // alert still works, led by the requirement caption, but the one line of
    // what to do is Empiria's to write.
    if (!r.headline) {
      gaps.push({ area: AREA, detail: `${label} has no headline, so its alert leads with the requirement caption — the one line of what to do is Empiria’s to write.`, href: `${LIST}/${r.id}` });
    }
  }

  if (!input.disclaimer?.trim()) {
    gaps.push({ area: AREA, detail: 'The disclaimer is empty, so nothing beside the advice tells travellers to check the official government website.', href: SETTINGS });
  }
  if (!input.otherPassport?.trim()) {
    gaps.push({ area: AREA, detail: 'The text for travellers on other passports is empty, so they see only the contact line.', href: SETTINGS });
  }

  // Owed is due (no message queued yet) plus failed. A queued notice is on its way.
  for (const o of input.owed) {
    const href = `${LIST}/${o.requirementId}`;
    if (o.due > 0) {
      gaps.push({ area: AREA, detail: `${o.label}: ${o.due} booked ${o.due === 1 ? 'traveller is' : 'travellers are'} owed the changed wording, and nothing is queued yet.`, href });
    }
    if (o.failed > 0) {
      gaps.push({ area: AREA, detail: `${o.label}: ${o.failed} ${o.failed === 1 ? 'notice' : 'notices'} failed to send.`, href });
    }
  }

  if (!input.contactPhone?.trim()) {
    gaps.push({ area: AREA, detail: 'No contact phone. s.38 wants the seller’s phone on the receipt, and the contact line beside the advice shows email only.', href: SETTINGS });
  }
  return gaps;
}

/**
 * Everything `entryGaps` needs, read in one go. Null when the console has no
 * database key. Throws on a read error, so the overview can say it could not
 * check rather than report gaps that are not there.
 */
export async function readEntryGapInput(): Promise<EntryGapInput | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const [packages, destinations, booked, settings, rows] = await Promise.all([
    db.from('packages').select('id, title, status, destination_id').limit(5000),
    db.from('destinations').select('id, path, country_code').limit(2000),
    db
      .from('bookings')
      .select('package_id, departures!inner ( starts_on, status )')
      .in('status', [...COMMITTED_STATUSES])
      .gte('departures.starts_on', utcToday())
      .neq('departures.status', 'cancelled')
      .limit(10000),
    db
      .from('platform_settings')
      .select('entry_requirements_disclaimer, entry_requirements_other_passport, contact_phone')
      .maybeSingle(),
    listEntryRequirements(),
  ]);
  if (packages.error) throw packages.error;
  if (destinations.error) throw destinations.error;
  if (booked.error) throw booked.error;
  if (settings.error) throw settings.error;

  const owed = await listOwedNotices(rows);
  if (owed.error) throw new Error(owed.error);

  const pathOf = new Map((destinations.data ?? []).map((d) => [d.id, d.path]));
  const coded = (destinations.data ?? [])
    .filter((d): d is typeof d & { country_code: string } => d.country_code !== null)
    .map((d) => ({ path: d.path, code: d.country_code }));
  const withTravellers = new Set((booked.data ?? []).map((b) => b.package_id));

  return {
    tours: (packages.data ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      country: countryForPath(p.destination_id ? pathOf.get(p.destination_id) ?? null : null, coded),
      hasUpcomingBookings: withTravellers.has(p.id),
    })),
    rows,
    owed: owed.owed,
    disclaimer: settings.data?.entry_requirements_disclaimer ?? null,
    otherPassport: settings.data?.entry_requirements_other_passport ?? null,
    contactPhone: settings.data?.contact_phone ?? null,
    // todayInSellerCalendar(), without importing placements.ts, which imports content.ts.
    today: dateIn(new Date(), REPORT_TIMEZONE),
  };
}

/**
 * What a save does with the answer to the s.37 question: the answer counts
 * only when the question was asked. An answer to a question that was not
 * asked (a second tab repeating an edit already saved, a stale form) is
 * ignored, so it can never record a second notice. Asked and unanswered is
 * null too; the save refuses that before it gets here. Pure, and asserted in
 * `entryRequirements.test.ts`.
 */
export function noticeDecision(input: { asked: boolean; notice: string }): 'tell' | 'correction' | null {
  if (!input.asked) return null;
  return input.notice === 'tell' || input.notice === 'correction' ? input.notice : null;
}

/**
 * Whether the card offers "Send the current wording…": some booking holds
 * older wording, and the current wording has not been the subject of a "tell"
 * since it last changed (or no tell was ever recorded, or a booking has no
 * notice coming). `older` and `uncovered` are counts of bookings. Timestamps
 * are compared as instants. Pure, and asserted in `entryRequirements.test.ts`.
 */
export function offerSendCurrent(input: {
  older: number;
  uncovered: number;
  noticeRevision: number;
  contentChangedAt: string | null;
  noticeRevisedAt: string | null;
}): boolean {
  if (input.older <= 0) return false;
  if (input.uncovered > 0 || input.noticeRevision === 0) return true;
  if (input.contentChangedAt === null) return false;
  return input.noticeRevisedAt === null || Date.parse(input.contentChangedAt) > Date.parse(input.noticeRevisedAt);
}

/**
 * The dedupe keys of notices that can be released for retry: those the outbox
 * says `failed`. A `cancelled` message reads as failed on the card but the
 * retry cannot release it (the update matches `status = 'failed'`), so the
 * button and the action both count only these.
 */
export function failedNoticeKeys(rows: BookedTraveller[], messages: Record<string, string>): string[] {
  return rows.map((r) => r.noticeKey).filter((k): k is string => k !== null && messages[k] === 'failed');
}
