/**
 * Money formatting, safe on both server and client.
 *
 * Lives apart from `lib/catalogue.ts` deliberately: that module is server-only
 * and throws if it is ever evaluated in a browser, so a client component cannot
 * import anything from it at runtime — including a pure formatter.
 */

/** Cents in, localised currency string out. `null` renders as an em dash. */
export function formatPrice(
  cents: number | null | undefined,
  currency: string,
  locale = 'en-CA'
): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    // Travel prices are round numbers far more often than not; showing
    // "$2,150" rather than "$2,150.00" is quieter and just as precise.
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** A departure date as travellers read it: "4 May 2027". */
export function formatDepartureDate(iso: string | null | undefined, locale = 'en-CA'): string {
  if (!iso) return '';
  // Parse as a plain calendar date. A departure is a day, not an instant, and
  // `new Date('2027-05-04')` would otherwise shift by the viewer's timezone.
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/**
 * A departure's dates, collapsing whatever the two ends share:
 * "May 1–8, 2027", "May 28 – Jun 4, 2027", "Dec 28, 2027 – Jan 4, 2028".
 *
 * Composed by hand from `formatToParts`, not by `Intl.formatRange`. The range
 * formatter's output differs between ICU builds — Bun renders "May 1 – 8"
 * where Chrome renders "May 1–8" — so a server-rendered range never matched
 * the client's and every page showing one hydrated with a text mismatch.
 * Taking the locale's month names and day numbers from the parts, and doing
 * the joining ourselves, gives one string everywhere. The month-day order is
 * this function's (month first), which is right for the en-CA default and
 * the only locale the storefront passes.
 */
export function formatDateRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  locale = 'en-CA'
): string {
  if (!startIso) return '';
  if (!endIso) return formatDepartureDate(startIso, locale);

  // Plain calendar dates, as everywhere else in this file: a departure is a day,
  // not an instant, and parsing it as one would shift it by the viewer's offset.
  const pieces = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    const parts = new Intl.DateTimeFormat(locale, {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    }).formatToParts(new Date(Date.UTC(y, m - 1, d)));
    const of = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return { day: of('day'), month: of('month'), year: of('year') };
  };
  const a = pieces(startIso);
  const b = pieces(endIso);

  if (a.year === b.year && a.month === b.month) return `${a.month} ${a.day}–${b.day}, ${a.year}`;
  if (a.year === b.year) return `${a.month} ${a.day} – ${b.month} ${b.day}, ${a.year}`;
  return `${a.month} ${a.day}, ${a.year} – ${b.month} ${b.day}, ${b.year}`;
}

/** "3 left" / "Sold out" / null when there is nothing worth saying. */
export function seatsLabel(seatsAvailable: number, threshold = 4): string | null {
  if (seatsAvailable <= 0) return 'Sold out';
  if (seatsAvailable <= threshold) return `${seatsAvailable} left`;
  return null;
}
