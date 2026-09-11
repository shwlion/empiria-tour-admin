import { getSupabaseAdmin } from '@/lib/supabase';
import type { FieldErrors } from '@/lib/actions';

/**
 * Promotion codes — B6, under Platform settings.
 *
 * The rules that matter are not here. `check_promotion` (migration 0015) is
 * what refuses a code at booking time, under a row lock, and `usage_count` is
 * maintained by a trigger on `bookings` rather than by anything this console
 * writes. This module decides what to *offer* and what to *say* — the same
 * courtesy-not-enforcement split as the staff screen. If the two ever
 * disagree, the database wins.
 *
 * Exhibit A A5: "percentage or fixed, validity window, usage limit, package
 * scope". Part E adds nothing to that list, so neither does this screen.
 */

export const PROMOTION_LIMITS = { code: 40, description: 200 } as const;

export type DiscountType = 'percent' | 'fixed';

export type PromotionRow = {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  /** Whole percent, or cents. */
  discountValue: number;
  currency: string;
  /** ISO timestamps as stored; the screen shows the date part. */
  validFrom: string | null;
  validUntil: string | null;
  usageLimit: number | null;
  /** Non-cancelled bookings carrying this code. The trigger keeps it right. */
  usageCount: number;
  perUserLimit: number | null;
  status: 'active' | 'inactive';
  createdAt: string;
  /** Empty means every package. */
  scope: { id: string; title: string }[];
  /**
   * Every booking that names this code, cancelled ones included. Deleting the
   * promotion would set those to null — erasing from each booking's history
   * the fact that a discount was applied — so this is what deletion is
   * refused on.
   */
  referencedBy: number;
};

export type PackageChoice = { id: string; title: string; status: string };

type ScopeJoin = { promotion_id: string; packages: { id: string; title: string } | { id: string; title: string }[] | null };

function scopeByPromotion(rows: ScopeJoin[] | null): Map<string, { id: string; title: string }[]> {
  const map = new Map<string, { id: string; title: string }[]>();
  for (const s of rows ?? []) {
    const pkg = Array.isArray(s.packages) ? s.packages[0] : s.packages;
    if (!pkg) continue;
    map.set(s.promotion_id, [...(map.get(s.promotion_id) ?? []), { id: pkg.id, title: pkg.title }]);
  }
  return map;
}

function referencesByPromotion(rows: { promotion_id: string | null }[] | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows ?? []) {
    if (r.promotion_id) map.set(r.promotion_id, (map.get(r.promotion_id) ?? 0) + 1);
  }
  return map;
}

type PromoRaw = {
  id: string; code: string; description: string | null; discount_type: string; discount_value: number;
  currency: string; valid_from: string | null; valid_until: string | null; usage_limit: number | null;
  usage_count: number; per_user_limit: number | null; status: string; created_at: string;
};

function toRow(p: PromoRaw, scope: { id: string; title: string }[], referencedBy: number): PromotionRow {
  return {
    id: p.id,
    code: p.code,
    description: p.description,
    discountType: p.discount_type === 'fixed' ? 'fixed' : 'percent',
    discountValue: p.discount_value,
    currency: p.currency,
    validFrom: p.valid_from,
    validUntil: p.valid_until,
    usageLimit: p.usage_limit,
    usageCount: p.usage_count,
    perUserLimit: p.per_user_limit,
    status: p.status === 'inactive' ? 'inactive' : 'active',
    createdAt: p.created_at,
    scope: scope.sort((a, b) => a.title.localeCompare(b.title)),
    referencedBy,
  };
}

export async function listPromotions(): Promise<PromotionRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const [{ data: promos }, { data: scope }, { data: refs }] = await Promise.all([
    db.from('promotions').select('*').order('status').order('created_at', { ascending: false }),
    db.from('promotion_packages').select('promotion_id, packages ( id, title )'),
    db.from('bookings').select('promotion_id').not('promotion_id', 'is', null),
  ]);
  const scopes = scopeByPromotion(scope as ScopeJoin[] | null);
  const references = referencesByPromotion(refs);
  return (promos ?? []).map((p) => toRow(p, scopes.get(p.id) ?? [], references.get(p.id) ?? 0));
}

export async function getPromotion(id: string): Promise<PromotionRow | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const [{ data: promo }, { data: scope }, { count }] = await Promise.all([
    db.from('promotions').select('*').eq('id', id).maybeSingle(),
    db.from('promotion_packages').select('promotion_id, packages ( id, title )').eq('promotion_id', id),
    db.from('bookings').select('id', { count: 'exact', head: true }).eq('promotion_id', id),
  ]);
  if (!promo) return null;
  return toRow(promo, scopeByPromotion(scope as ScopeJoin[] | null).get(id) ?? [], count ?? 0);
}

/** Every package, drafts included: a code is often made before the tour is published. */
export async function listPackageChoices(): Promise<PackageChoice[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data } = await db.from('packages').select('id, title, status').neq('status', 'archived').order('title');
  return (data ?? []).map((p) => ({ id: p.id, title: p.title, status: p.status }));
}

export async function listCurrencyCodes(): Promise<string[]> {
  const db = getSupabaseAdmin();
  if (!db) return ['CAD'];
  const { data } = await db.from('currencies').select('code').eq('status', 'active').order('code');
  const codes = (data ?? []).map((c) => c.code);
  return codes.length ? codes : ['CAD'];
}

// ─── Validation the screen can do before asking ─────────────────────────────

export type PromotionDraft = {
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: number;
  currency: string;
  /** 'YYYY-MM-DD' or null. */
  validFrom: string | null;
  validUntil: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  packageIds: string[];
};

const CODE_SHAPE = /^[A-Z0-9][A-Z0-9-]*$/;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What the database would refuse, said before it is asked — plus the two
 * things it would *not* refuse but a person should: a usage limit below what
 * has already been used, and a window that ends before it starts.
 */
export function promotionProblems(
  draft: PromotionDraft,
  existing?: Pick<PromotionRow, 'usageCount'> | null
): FieldErrors {
  const f: FieldErrors = {};

  if (!draft.code) f.code = 'Required';
  else if (draft.code.length > PROMOTION_LIMITS.code) f.code = `At most ${PROMOTION_LIMITS.code} characters`;
  else if (!CODE_SHAPE.test(draft.code)) f.code = 'Letters, digits and hyphens only';

  if (draft.description && draft.description.length > PROMOTION_LIMITS.description) {
    f.description = `At most ${PROMOTION_LIMITS.description} characters`;
  }

  if (!Number.isInteger(draft.discountValue) || draft.discountValue <= 0) {
    f.discount_value = draft.discountType === 'percent' ? 'A whole number from 1 to 100' : 'An amount above zero';
  } else if (draft.discountType === 'percent' && draft.discountValue > 100) {
    f.discount_value = 'A percentage cannot exceed 100';
  }

  if (!/^[A-Z]{3}$/.test(draft.currency)) f.currency = 'Choose a currency';

  if (draft.validFrom && !DATE_SHAPE.test(draft.validFrom)) f.valid_from = 'A date';
  if (draft.validUntil && !DATE_SHAPE.test(draft.validUntil)) f.valid_until = 'A date';
  if (draft.validFrom && draft.validUntil && !f.valid_from && !f.valid_until && draft.validUntil < draft.validFrom) {
    f.valid_until = 'Ends before it starts';
  }

  if (draft.usageLimit != null) {
    if (!Number.isInteger(draft.usageLimit) || draft.usageLimit < 1) f.usage_limit = 'Leave blank for unlimited, or 1 or more';
    else if (existing && draft.usageLimit < existing.usageCount) {
      f.usage_limit = `Already used ${existing.usageCount} times — a limit below that would refuse nobody new and confuse everyone`;
    }
  }
  if (draft.perUserLimit != null && (!Number.isInteger(draft.perUserLimit) || draft.perUserLimit < 1)) {
    f.per_user_limit = 'Leave blank for unlimited, or 1 or more';
  }

  return f;
}

// ─── Words for the screen ───────────────────────────────────────────────────

export function describeDiscount(p: Pick<PromotionRow, 'discountType' | 'discountValue' | 'currency'>): string {
  if (p.discountType === 'percent') return `${p.discountValue}% off`;
  const money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: p.currency }).format(p.discountValue / 100);
  return `${money} off`;
}

/** The date part of a stored timestamp, for a `<input type="date">` or a label. */
export function datePart(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

/**
 * Where a code stands today. The database decides at booking time; this only
 * has to be right enough for a list.
 */
export function validityLabel(p: Pick<PromotionRow, 'validFrom' | 'validUntil' | 'status'>, now = new Date()): string {
  if (p.status === 'inactive') return 'Switched off';
  const from = p.validFrom ? new Date(p.validFrom) : null;
  const until = p.validUntil ? new Date(p.validUntil) : null;
  if (from && from > now) return `From ${datePart(p.validFrom)}`;
  if (until && until < now) return 'Expired';
  if (until) return `Until ${datePart(p.validUntil)}`;
  return 'No end date';
}

export function usageLabel(p: Pick<PromotionRow, 'usageCount' | 'usageLimit'>): string {
  return p.usageLimit == null ? `${p.usageCount} used` : `${p.usageCount} of ${p.usageLimit} used`;
}
