'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit, diff } from '@/lib/audit';
import { cents, explain, fail, integer, nullable, ok, text, type ActionResult } from '@/lib/actions';
import { getPromotion, promotionProblems, type PromotionDraft } from '@/lib/admin/promotions';

/**
 * Promotion codes — B6.
 *
 * Gated on manageSettings: Exhibit A gives the Agent role no settings, and a
 * discount is a pricing decision. Every action writes an audit row, because
 * "who made the 100%-off code" is a question somebody will ask.
 *
 * Nothing here enforces a rule at booking time. That is `check_promotion`'s
 * job, under a lock, in the database. This file makes sure what is stored is
 * well-formed and that the person is told, in advance, what would be refused.
 */

const PATH = '/dashboard/settings/promotions';

/**
 * The window's edges. A date typed as "until 30 September" should include the
 * 30th, so the end is stored as the last instant of that day. UTC, on purpose:
 * a code that expires at 19:59 Toronto time on the last day is a smaller
 * surprise than one whose end depends on which server rendered the form.
 */
function windowStart(date: string | null): string | null {
  return date ? `${date}T00:00:00.000Z` : null;
}
function windowEnd(date: string | null): string | null {
  return date ? `${date}T23:59:59.999Z` : null;
}

function readDraft(form: FormData): PromotionDraft {
  const discountType = text(form.get('discount_type')) === 'fixed' ? 'fixed' : 'percent';
  const limit = (v: FormDataEntryValue | null) => (nullable(v) == null ? null : integer(v, -1));
  return {
    // Uppercased and squeezed: the storefront matches case-insensitively, and
    // two codes that differ only in case would be one code with two counts.
    code: text(form.get('code')).toUpperCase().replace(/\s+/g, ''),
    description: nullable(form.get('description')),
    discountType,
    discountValue: discountType === 'percent' ? integer(form.get('discount_value'), 0) : cents(form.get('discount_value'), 0),
    currency: text(form.get('currency')).toUpperCase() || 'CAD',
    validFrom: nullable(form.get('valid_from')),
    validUntil: nullable(form.get('valid_until')),
    usageLimit: limit(form.get('usage_limit')),
    perUserLimit: limit(form.get('per_user_limit')),
    packageIds: form.getAll('package_ids').map(String).filter(Boolean),
  };
}

export async function savePromotionAction(
  id: string | null,
  _prev: ActionResult<{ id: string }> | null,
  form: FormData
): Promise<ActionResult<{ id: string }>> {
  const user = await requireCapability('manageSettings');
  const draft = readDraft(form);

  try {
    const db = requireWritableDb();
    const existing = id ? await getPromotion(id) : null;
    if (id && !existing) return fail('That promotion no longer exists.');

    const fields = promotionProblems(draft, existing);
    if (Object.keys(fields).length) return fail('Check the highlighted fields.', fields);

    // Case-insensitive, because that is how the storefront looks codes up.
    let clash = db.from('promotions').select('id').ilike('code', draft.code);
    if (id) clash = clash.neq('id', id);
    const { data: taken } = await clash.maybeSingle();
    if (taken) return fail('Check the highlighted fields.', { code: 'Another promotion already uses this code' });

    const content = {
      code: draft.code,
      description: draft.description,
      discount_type: draft.discountType,
      discount_value: draft.discountValue,
      currency: draft.currency,
      valid_from: windowStart(draft.validFrom),
      valid_until: windowEnd(draft.validUntil),
      usage_limit: draft.usageLimit,
      per_user_limit: draft.perUserLimit,
    };

    let promotionId: string;
    if (existing) {
      promotionId = existing.id;
      const before = {
        code: existing.code,
        description: existing.description,
        discount_type: existing.discountType,
        discount_value: existing.discountValue,
        currency: existing.currency,
        valid_from: existing.validFrom,
        valid_until: existing.validUntil,
        usage_limit: existing.usageLimit,
        per_user_limit: existing.perUserLimit,
      };
      const changed = diff(before as Record<string, unknown>, content);
      if (changed) {
        const { error } = await db.from('promotions').update(content).eq('id', existing.id);
        if (error) throw error;
      }

      // Scope is reconciled, not replaced: only the rows that actually change
      // are written, so a save that touched nothing writes nothing.
      const had = new Set(existing.scope.map((s) => s.id));
      const want = new Set(draft.packageIds);
      const add = [...want].filter((p) => !had.has(p));
      const remove = [...had].filter((p) => !want.has(p));
      if (add.length) {
        const { error } = await db
          .from('promotion_packages')
          .insert(add.map((package_id) => ({ promotion_id: existing.id, package_id })));
        if (error) throw error;
      }
      if (remove.length) {
        const { error } = await db
          .from('promotion_packages')
          .delete()
          .eq('promotion_id', existing.id)
          .in('package_id', remove);
        if (error) throw error;
      }

      if (!changed && !add.length && !remove.length) return ok({ id: existing.id }, 'Nothing changed.');

      await recordAudit(db, user, {
        entity: 'promotions',
        entityId: existing.id,
        action: 'update',
        before: { ...(changed?.before ?? {}), ...(remove.length ? { scope_removed: remove } : {}) },
        after: { ...(changed?.after ?? {}), ...(add.length ? { scope_added: add } : {}) },
        summary: `Edited promotion ${draft.code}`,
      });
    } else {
      const { data, error } = await db.from('promotions').insert(content).select('id').single();
      if (error) throw error;
      promotionId = data.id;

      if (draft.packageIds.length) {
        const { error: scopeError } = await db
          .from('promotion_packages')
          .insert(draft.packageIds.map((package_id) => ({ promotion_id: promotionId, package_id })));
        if (scopeError) throw scopeError;
      }

      await recordAudit(db, user, {
        entity: 'promotions',
        entityId: promotionId,
        action: 'create',
        after: { ...content, scope: draft.packageIds },
        summary: `Created promotion ${draft.code}`,
      });
    }

    revalidatePath(PATH);
    revalidatePath(`${PATH}/${promotionId}`);
    return ok(
      { id: promotionId },
      existing
        ? 'Saved.'
        : draft.packageIds.length
          ? `${draft.code} is live on ${draft.packageIds.length} ${draft.packageIds.length === 1 ? 'tour' : 'tours'}.`
          : `${draft.code} is live on every tour.`
    );
  } catch (e) {
    return fail(explain(e));
  }
}

export async function setPromotionStatusAction(
  id: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');
  const status = text(form.get('status'));
  // A server action is a public endpoint; the form's options are not a check.
  if (status !== 'active' && status !== 'inactive') return fail('Status must be active or inactive.');
  try {
    const db = requireWritableDb();
    const { data: before } = await db.from('promotions').select('code, status').eq('id', id).maybeSingle();
    if (!before) return fail('That promotion no longer exists.');
    if (before.status === status) return ok(undefined, `Already ${status}.`);

    const { error } = await db.from('promotions').update({ status }).eq('id', id);
    if (error) throw error;

    await recordAudit(db, user, {
      entity: 'promotions',
      entityId: id,
      action: 'update',
      before: { status: before.status },
      after: { status },
      summary: `${before.code}: ${before.status} → ${status}`,
    });

    revalidatePath(PATH);
    revalidatePath(`${PATH}/${id}`);
    return ok(
      undefined,
      status === 'active'
        ? `${before.code} can be used again.`
        : `${before.code} is switched off. Bookings that already used it are unchanged.`
    );
  } catch (e) {
    return fail(explain(e));
  }
}

/**
 * Deletion is refused twice over. An active code is switched off first, so
 * removing it is a decision and not a side effect of tidying. A code any
 * booking names is never deleted at all: `bookings.promotion_id` is
 * `on delete set null`, so deleting it would erase from those bookings the
 * fact that a discount was applied — the same reasoning that retires a
 * disclosure block rather than deleting it.
 */
export async function deletePromotionAction(id: string): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');
  try {
    const db = requireWritableDb();
    const existing = await getPromotion(id);
    if (!existing) return fail('That promotion has already gone.');
    if (existing.status === 'active') return fail('Switch it off first. Deleting should be a decision, not a tidy-up.');
    if (existing.referencedBy > 0) {
      return fail(
        `${existing.referencedBy} ${existing.referencedBy === 1 ? 'booking names' : 'bookings name'} this code. It stays switched off instead — deleting it would erase the discount from their history.`
      );
    }

    const { error } = await db.from('promotions').delete().eq('id', id);
    if (error) throw error;

    await recordAudit(db, user, {
      entity: 'promotions',
      entityId: id,
      action: 'delete',
      before: { code: existing.code, discount_type: existing.discountType, discount_value: existing.discountValue },
      summary: `Deleted promotion ${existing.code}`,
    });

    revalidatePath(PATH);
    return ok(undefined, `${existing.code} is deleted.`);
  } catch (e) {
    return fail(explain(e));
  }
}
