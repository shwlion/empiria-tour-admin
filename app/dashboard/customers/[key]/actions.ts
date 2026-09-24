'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit, diff } from '@/lib/audit';
import { explain, fail, ok, text, nullable, checkbox, type ActionResult } from '@/lib/actions';

/**
 * B4 — editing a registered customer's contact details.
 *
 * Only an account has details of its own to edit: a guest's live on each
 * booking, and changing where a confirmation goes is a booking edit (B3),
 * not a directory one. Written under the service role after the capability
 * check — the traveller's own `update own profile` policy pins the role, and
 * so does this: the form carries no role and the update names no role.
 */
export async function saveCustomerAction(
  userId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  try {
    const actor = await requireCapability('manageCustomers');
    const db = requireWritableDb();

    const address = {
      line1: text(form.get('line1')),
      line2: text(form.get('line2')),
      city: text(form.get('city')),
      region: text(form.get('region')),
      postcode: text(form.get('postcode')),
      country: text(form.get('country')),
    };
    const anyAddress = Object.values(address).some(Boolean);
    const next = {
      full_name: nullable(form.get('full_name')),
      phone: nullable(form.get('phone')),
      address: anyAddress ? Object.fromEntries(Object.entries(address).filter(([, v]) => v)) : null,
      marketing_opt_in: checkbox(form.get('marketing_opt_in')),
    };

    const { data: before } = await db
      .from('users')
      .select('id, role, status, full_name, phone, address, marketing_opt_in')
      .eq('id', userId)
      .maybeSingle();
    if (!before) return fail('That account no longer exists.');
    if (before.role !== 'traveller') return fail('Staff and partner accounts are edited under Settings, not here.');
    // The record page hides this form once an account is closed, but a page
    // left open while its traveller closed the account still posts. Writing
    // it would put back the name, phone and address that closure erased, so
    // the update itself carries the same conditions and is refused if either
    // stopped holding since the read.
    if (before.status === 'closed') return fail('This account has been closed, so its details can no longer be edited.');

    const { data: saved, error } = await db
      .from('users')
      .update(next)
      .eq('id', userId)
      .eq('role', 'traveller')
      .neq('status', 'closed')
      .select('id');
    if (error) throw error;
    if (!saved?.length) return fail('This account was closed or changed while the page was open. Nothing was saved.');

    const changed = diff(
      { full_name: before.full_name, phone: before.phone, address: before.address, marketing_opt_in: before.marketing_opt_in },
      next
    );
    if (changed) {
      await recordAudit(db, actor, {
        entity: 'user',
        entityId: userId,
        action: 'update',
        before: changed.before,
        after: changed.after,
        summary: `Updated customer ${Object.keys(changed.after).join(', ')}`,
      });
    }

    revalidatePath(`/dashboard/customers/${userId}`);
    revalidatePath('/dashboard/customers');
    return ok(undefined, changed ? 'Saved.' : 'Nothing changed.');
  } catch (error) {
    return fail(explain(error));
  }
}
