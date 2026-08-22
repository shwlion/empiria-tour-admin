import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Platform settings — Exhibit A B6, and the reason Part D works at all.
 *
 * The company name, registration number and statutory notice render on every
 * public page and on every document. They live in a row rather than in the
 * markup so Empiria can correct them without a deploy, which for a regulated
 * seller is the difference between a five-minute fix and a release.
 */

export type TaxRuleRow = {
  label: string;
  kind: 'tax' | 'fee';
  basis: 'percent' | 'per_booking' | 'per_person';
  value: number;
};

export type PlatformSettings = {
  companyName: string | null;
  registrationNumber: string | null;
  statutoryNotice: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: Record<string, string>;
  defaultCurrency: string;
  holdMinutes: number;
  paymentWindowMinutes: number;
  taxRates: TaxRuleRow[];
  socialLinks: Record<string, string>;
  updatedAt: string | null;
};

const EMPTY: PlatformSettings = {
  companyName: null,
  registrationNumber: null,
  statutoryNotice: null,
  contactEmail: null,
  contactPhone: null,
  contactAddress: {},
  defaultCurrency: 'CAD',
  holdMinutes: 20,
  paymentWindowMinutes: 60,
  taxRates: [],
  socialLinks: {},
  updatedAt: null,
};

/**
 * Parse whatever is in the `tax_rates` jsonb, discarding anything malformed.
 *
 * The storefront's `lib/pricing.ts` has the same guard for the same reason: an
 * unlabelled or negative rule becomes an unexplained charge on an invoice, and
 * dropping it is the safer failure. Kept in step with that module by hand —
 * the cost of the two apps being separate repositories.
 */
export function parseTaxRules(raw: unknown): TaxRuleRow[] {
  if (!Array.isArray(raw)) return [];
  const out: TaxRuleRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const label = typeof r.label === 'string' ? r.label.trim() : '';
    const value = typeof r.value === 'number' ? r.value : Number(r.value);
    if (!label || !Number.isFinite(value) || value < 0) continue;
    out.push({
      label,
      kind: r.kind === 'fee' ? 'fee' : 'tax',
      basis: r.basis === 'per_booking' || r.basis === 'per_person' ? r.basis : 'percent',
      value,
    });
  }
  return out;
}

function record(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v;
  }
  return out;
}

export async function getSettings(): Promise<PlatformSettings> {
  const db = getSupabaseAdmin();
  if (!db) return EMPTY;

  const { data } = await db.from('platform_settings').select('*').maybeSingle();
  if (!data) return EMPTY;

  return {
    companyName: data.company_name,
    registrationNumber: data.registration_number,
    statutoryNotice: data.statutory_notice,
    contactEmail: data.contact_email,
    contactPhone: data.contact_phone,
    contactAddress: record(data.contact_address),
    defaultCurrency: data.default_currency,
    holdMinutes: data.hold_minutes,
    paymentWindowMinutes: data.payment_window_minutes,
    taxRates: parseTaxRules(data.tax_rates),
    socialLinks: record(data.social_links),
    updatedAt: data.updated_at,
  };
}

/** The currencies the platform can price in — needed for the default-currency choice. */
export async function getCurrencyCodes(): Promise<{ code: string; name: string }[]> {
  const db = getSupabaseAdmin();
  if (!db) return [{ code: 'CAD', name: 'Canadian dollar' }];
  const { data } = await db
    .from('currencies')
    .select('code, name, status')
    .eq('status', 'active')
    .order('code');
  return (data ?? []).map((c) => ({ code: c.code, name: c.name }));
}

/**
 * What is still missing before the storefront can honestly take money.
 *
 * Surfaced as a checklist rather than left for someone to notice: with an empty
 * row the booking flow renders no seller identity and no tax, which is not a
 * cosmetic gap.
 */
export function settingsGaps(s: PlatformSettings): string[] {
  const gaps: string[] = [];
  if (!s.companyName) gaps.push('Company name — shown in the footer and on every document.');
  if (!s.registrationNumber) gaps.push('Registration number — Part D requires it site-wide.');
  if (!s.statutoryNotice) gaps.push('Statutory notice — shown before a traveller reserves.');
  if (!s.contactEmail) gaps.push('Contact email — travellers reply to it.');
  if (s.taxRates.length === 0) gaps.push('Tax rates — every quote is currently tax-free.');
  return gaps;
}
