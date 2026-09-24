/**
 * The shape every server action in this console returns.
 *
 * Uniform on purpose: forms are the entire product here, and a form that
 * sometimes throws, sometimes redirects and sometimes returns a string is three
 * different error experiences for the person using it. One shape means one
 * banner component and one way to show which field is wrong.
 */

export type FieldErrors = Record<string, string>;

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message: string; fields?: FieldErrors };

export function ok<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, message, data };
}

export function fail(message: string, fields?: FieldErrors): ActionResult<never> {
  return { ok: false, message, fields };
}

/**
 * Turn whatever went wrong into something worth reading.
 *
 * Postgres constraint names leak schema and mean nothing to the person holding
 * the form, so the ones we deliberately rely on are translated and everything
 * else becomes a generic line. The raw error still goes to the server log,
 * where it is useful.
 */
export function explain(error: unknown, fallback = 'That did not save. Please try again.'): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  console.error('[action]', message);

  if (!message) return fallback;
  if (message.includes('SUPABASE_KEY')) return message;

  const known: [RegExp, string][] = [
    [/duplicate key.*packages_slug_key/i, 'A tour already uses that web address. Choose another.'],
    [/duplicate key.*departures_unique_slot/i, 'A departure already exists on that date and time.'],
    [/duplicate key.*static_pages_pkey/i, 'A page with that address already exists.'],
    [/duplicate key.*disclosure_blocks_slug_key/i, 'A disclosure block already uses that reference.'],
    [/duplicate key.*currencies_pkey/i, 'That currency is already configured.'],
    [/duplicate key.*promotions_code_key/i, 'Another promotion already uses that code.'],
    [/duplicate key/i, 'Something with that name or reference already exists.'],
    [/departures_capacity_not_exceeded/i, 'Capacity cannot go below the seats already booked or held.'],
    [/showcase_cards_.*_check/i, 'A field is over its length limit, or the link is not a storefront path.'],
    [/violates foreign key/i, 'That refers to something which no longer exists. Reload and try again.'],
    [/violates check constraint/i, 'One of those values is out of range.'],
    [/violates not-null/i, 'A required field was left empty.'],
  ];
  for (const [pattern, text] of known) if (pattern.test(message)) return text;

  return fallback;
}

/** Trim, and treat an empty string as absent — forms send '' where the database wants null. */
export function nullable(value: FormDataEntryValue | null): string | null {
  const s = typeof value === 'string' ? value.trim() : '';
  return s === '' ? null : s;
}

export function text(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A whole number, or `fallback` when the field is blank, absent or not a number.
 *
 * Blank is checked before parsing because Number('') is 0, which is finite:
 * without it the fallback only ever applied to text that was not a number, and
 * a field the form did not render at all was saved as 0.
 */
export function integer(value: FormDataEntryValue | null, fallback = 0): number {
  const s = text(value);
  if (s === '') return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** What `<input type="number">` submits: digits, a point, an exponent. */
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/**
 * Currency input arrives as "1,850.00"; the database wants 185000.
 *
 * A plain number is parsed as it stands, because that is what a number input
 * submits and the browser accepts exponent notation — "1e3" is a thousand, and
 * stripping it to its digits first read it as thirteen. Only text that is not
 * a plain number has its separators and symbols stripped before parsing.
 */
export function cents(value: FormDataEntryValue | null, fallback = 0): number {
  const s = text(value);
  const raw = PLAIN_NUMBER.test(s) ? s : s.replace(/[^0-9.-]/g, '');
  if (raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : fallback;
}

export function checkbox(value: FormDataEntryValue | null): boolean {
  return value === 'on' || value === 'true' || value === '1';
}
