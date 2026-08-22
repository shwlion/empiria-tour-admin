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

/** "4–11 May 2027", collapsing the repeated month and year where possible. */
export function formatDateRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  locale = 'en-CA'
): string {
  if (!startIso) return '';
  if (!endIso) return formatDepartureDate(startIso, locale);

  const parse = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const a = parse(startIso);
  const b = parse(endIso);
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'UTC' };

  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const sameMonth = sameYear && a.getUTCMonth() === b.getUTCMonth();

  if (sameMonth) {
    return `${a.toLocaleDateString(locale, { ...opts, day: 'numeric' })}–${b.toLocaleDateString(
      locale, { ...opts, day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  if (sameYear) {
    return `${a.toLocaleDateString(locale, { ...opts, day: 'numeric', month: 'short' })} – ${b.toLocaleDateString(
      locale, { ...opts, day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return `${formatDepartureDate(startIso, locale)} – ${formatDepartureDate(endIso, locale)}`;
}

/** "3 left" / "Sold out" / null when there is nothing worth saying. */
export function seatsLabel(seatsAvailable: number, threshold = 4): string | null {
  if (seatsAvailable <= 0) return 'Sold out';
  if (seatsAvailable <= threshold) return `${seatsAvailable} left`;
  return null;
}
