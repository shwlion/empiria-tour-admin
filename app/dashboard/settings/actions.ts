'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit, diff } from '@/lib/audit';
import { cents, explain, fail, integer, nullable, ok, text, type ActionResult } from '@/lib/actions';
import type { TaxRuleRow } from '@/lib/admin/settings';

/**
 * Read the tax-rule rows back out of the form.
 *
 * They arrive as parallel arrays because the editor lets rows be added and
 * removed freely. Percentages are plain numbers; everything else is money the
 * person typed as currency, so it is converted to cents on the way in — the
 * storefront's pricing engine only ever deals in integer cents.
 */
function readTaxRules(form: FormData): { rules: TaxRuleRow[]; error?: string } {
  const labels = form.getAll('tax_label');
  const kinds = form.getAll('tax_kind');
  const bases = form.getAll('tax_basis');
  const values = form.getAll('tax_value');
  const rules: TaxRuleRow[] = [];

  for (let i = 0; i < labels.length; i++) {
    const label = text(labels[i]);
    // A blank row is somebody who clicked Add and changed their mind.
    if (!label) continue;

    const kind = text(kinds[i]) === 'fee' ? 'fee' : 'tax';
    const basisRaw = text(bases[i]);
    const basis =
      basisRaw === 'per_booking' || basisRaw === 'per_person' ? basisRaw : 'percent';

    const value = basis === 'percent' ? Number(text(values[i])) : cents(values[i]);
    if (!Number.isFinite(value) || value < 0) {
      return { rules, error: `“${label}” needs a value of zero or more.` };
    }
    if (basis === 'percent' && value > 100) {
      return { rules, error: `“${label}” is a percentage, so it cannot be above 100.` };
    }
    rules.push({ label, kind, basis, value });
  }
  return { rules };
}

export async function saveSettingsAction(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  // Exhibit A puts settings out of an Agent's reach. Checked here rather than
  // only in the navigation, because a hidden link is not a permission.
  const user = await requireCapability('manageSettings');

  const { rules, error } = readTaxRules(form);
  if (error) return fail(error);

  const holdMinutes = integer(form.get('hold_minutes'), 20);
  const paymentWindow = integer(form.get('payment_window_minutes'), 60);
  // 0021. Zero is meaningful: it means no rate is published, so nothing
  // can be quoted and the Promotions queue says so rather than offering
  // to approve a placement at nothing.
  const showcaseRate = cents(form.get('showcase_rate_cents_per_week'), 0);
  if (holdMinutes < 1) return fail('The hold window must be at least a minute.', { hold_minutes: 'Too short' });
  if (paymentWindow < 1) {
    return fail('The payment window must be at least a minute.', { payment_window_minutes: 'Too short' });
  }
  if (paymentWindow < holdMinutes) {
    return fail(
      'The payment window should not be shorter than the browsing hold — a traveller who has committed deserves at least as long as one who is still deciding.',
      { payment_window_minutes: 'Shorter than the hold window' }
    );
  }

  const address = {
    line1: text(form.get('address_line1')),
    line2: text(form.get('address_line2')),
    city: text(form.get('address_city')),
    region: text(form.get('address_region')),
    postal_code: text(form.get('address_postal')),
    country: text(form.get('address_country')),
  };

  const next = {
    company_name: nullable(form.get('company_name')),
    registration_number: nullable(form.get('registration_number')),
    statutory_notice: nullable(form.get('statutory_notice')),
    contact_email: nullable(form.get('contact_email')),
    contact_phone: nullable(form.get('contact_phone')),
    contact_address: Object.fromEntries(Object.entries(address).filter(([, v]) => v !== '')),
    default_currency: text(form.get('default_currency')) || 'CAD',
    hold_minutes: holdMinutes,
    payment_window_minutes: paymentWindow,
    showcase_rate_cents_per_week: Math.max(0, showcaseRate),
    showcase_promoted_label: nullable(form.get('showcase_promoted_label')),
    tax_rates: rules,
    receipt_title: nullable(form.get('receipt_title')),
    receipt_intro: nullable(form.get('receipt_intro')),
    receipt_footer: nullable(form.get('receipt_footer')),
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  try {
    const db = requireWritableDb();
    const { data: before } = await db.from('platform_settings').select('*').maybeSingle();

    // The row is a singleton keyed on a boolean that is always true — an old
    // trick for "there is exactly one of these" that the schema relies on.
    const { error: writeError } = await db
      .from('platform_settings')
      .update(next as never)
      .eq('id', true);
    if (writeError) throw writeError;

    const changed = before ? diff(before as Record<string, unknown>, next) : null;
    if (changed || !before) {
      await recordAudit(db, user, {
        entity: 'platform_settings',
        action: 'update',
        before: changed?.before,
        after: changed?.after ?? next,
        summary: changed
          ? `Updated ${Object.keys(changed.after).join(', ')}`
          : 'Saved platform settings',
      });
    }

    // The storefront's footer and policy pages read this row and revalidate on
    // their own five-minute clock; nothing here can push into that deployment.
    revalidatePath('/dashboard/settings');
    return ok(undefined, 'Settings saved. The public site picks these up within five minutes.');
  } catch (e) {
    return fail(explain(e));
  }
}
