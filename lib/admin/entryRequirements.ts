import { getSupabaseAdmin } from '@/lib/supabase';
import { countryName, isCountryCode } from '@/lib/countries';
import type { EntrySettings, RequirementKind } from '@/lib/entryAdvice';

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

export type OwedNotices = { requirementId: string; label: string; due: number; failed: number; unshown: number; uncovered: number };

/**
 * For each active row, the bookings not yet told:
 * `due` has no message yet, `failed` failed to send, and `unshown` is queued
 * but not sent, so the traveller has not seen it. `uncovered` counts bookings
 * never shown this row's current wording that no notice will reach: brought
 * into scope by a destination, country or row change, or by a "correction"
 * on a new row (spec §7, "bookings brought into scope"). Rows with none are
 * left out.
 */
export async function listOwedNotices(rows: EntryRequirementRecord[]): Promise<{ owed: OwedNotices[]; error: string | null }> {
  const told = rows.filter((r) => r.status === 'active');
  const results = await Promise.all(told.map((r) => listBookedTravellers(r.id)));
  const owed: OwedNotices[] = [];
  for (let i = 0; i < told.length; i++) {
    const { rows: booked, messages, error } = results[i];
    if (error) return { owed: [], error };
    const count = { due: 0, failed: 0, unshown: 0, uncovered: 0 };
    for (const b of booked) {
      const status = noticeStatus(b, b.noticeKey ? messages[b.noticeKey] : undefined);
      if (status === 'due') count.due++;
      else if (status === 'failed') count.failed++;
      else if (status === 'queued') count.unshown++;
      if (!b.sawCurrent && !b.noticeDue) count.uncovered++;
    }
    if (count.due + count.failed + count.unshown + count.uncovered > 0) {
      owed.push({ requirementId: told[i].id, label: pairLabel(told[i].destinationCountry, told[i].passportCountry), ...count });
    }
  }
  return { owed, error: null };
}
