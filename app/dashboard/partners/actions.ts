'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit } from '@/lib/audit';
import { explain, fail, ok, text, type ActionResult } from '@/lib/actions';
import { approvalPlan, getApplication } from '@/lib/admin/partners';

// Where an approved partner signs in. The same PARTNER_URL the invitation's
// redirect uses; the default is the production console.
const PARTNER_URL = (process.env.PARTNER_URL || 'https://partners.empiria.events').replace(/\/$/, '');

/**
 * Deciding a partner application.
 *
 * Approving is the only way `role = 'partner'` ever appears in this system.
 * Behind `manageSettings`, so admins only — an agent may run bookings but does
 * not decide who Empiria sells on behalf of. Every decision is audited with the
 * note the reviewer wrote, because "why did we let this company on" is a
 * question somebody will ask.
 */

/**
 * Invite an account into existence.
 *
 * A separate admin client because this is the one place in the console that
 * touches Supabase's auth admin API rather than the database. `inviteUserByEmail`
 * sends the set-a-password link; the on_auth_user_created trigger creates the
 * matching public.users row with the default traveller role, and
 * `approve_partner_application` is what changes it.
 */
async function inviteAccount(email: string, fullName: string): Promise<string> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('SUPABASE_KEY is not set, so no account can be created.');

  const auth = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const redirectTo = `${PARTNER_URL}/dashboard`;

  const { data, error } = await auth.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo,
  });
  if (error || !data?.user) {
    throw new Error(error?.message ?? 'The invitation could not be sent.');
  }
  return data.user.id;
}

export async function approveApplicationAction(
  applicationId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  try {
    const user = await requireCapability('manageSettings');
    const db = requireWritableDb();

    // Re-read and re-decide here rather than trusting what the page rendered.
    // The account behind this email may have appeared, or changed role, since
    // the reviewer opened the page.
    const app = await getApplication(applicationId);
    if (!app) return fail('That application no longer exists.');
    const plan = approvalPlan(app);
    if (!plan.can) return fail(plan.detail);

    const note = text(form.get('review_note')) || undefined;
    const userId =
      plan.kind === 'promote' && app.existingAccount
        ? app.existingAccount.id
        : await inviteAccount(app.email, app.contactName);

    const { error } = await db.rpc('approve_partner_application', {
      p_application: applicationId,
      p_user: userId,
      p_reviewer: user.id,
      p_note: note,
    });
    if (error) throw new Error(error.message);

    await recordAudit(db, user, {
      entity: 'partner_application',
      entityId: applicationId,
      action: 'update',
      summary: `Approved ${app.companyName} as a partner (${plan.kind === 'promote' ? 'promoted an existing account' : 'invited a new account'})`,
      after: { status: 'approved', user_id: userId, note },
    });

    await db.rpc('enqueue_email', {
      p_payload: {
        template_key: 'partner_application_approved',
        to_email: app.email,
        to_name: app.contactName,
        dedupe_key: `partner_approved:${applicationId}`,
        merge_data: { 'applicant.name': app.contactName, 'applicant.company': app.companyName, 'partner.console_link': PARTNER_URL },
      } as never,
    });

    revalidatePath('/dashboard/partners');
    revalidatePath(`/dashboard/partners/${applicationId}`);
    return ok(undefined, plan.kind === 'promote'
      ? 'Approved. Their existing account is now a partner account.'
      : 'Approved. An invitation to set a password is on its way.');
  } catch (error) {
    return fail(explain(error, 'That could not be approved.'));
  }
}

export async function declineApplicationAction(
  applicationId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  try {
    const user = await requireCapability('manageSettings');
    const db = requireWritableDb();
    const note = text(form.get('review_note'));

    // A decline with no reason is a decline nobody can explain later, and the
    // applicant is owed better than silence.
    if (!note) {
      return fail('Please say why. It goes to them, and it is what the record will show.', {
        review_note: 'Required',
      });
    }

    const app = await getApplication(applicationId);
    if (!app) return fail('That application no longer exists.');

    const { error } = await db.rpc('reject_partner_application', {
      p_application: applicationId,
      p_reviewer: user.id,
      p_note: note,
    });
    if (error) throw new Error(error.message);

    await recordAudit(db, user, {
      entity: 'partner_application',
      entityId: applicationId,
      action: 'update',
      summary: `Declined ${app.companyName}`,
      after: { status: 'rejected', note },
    });

    await db.rpc('enqueue_email', {
      p_payload: {
        template_key: 'partner_application_declined',
        to_email: app.email,
        to_name: app.contactName,
        dedupe_key: `partner_declined:${applicationId}`,
        merge_data: {
          'applicant.name': app.contactName,
          'applicant.company': app.companyName,
          'application.note': note,
        },
      } as never,
    });

    revalidatePath('/dashboard/partners');
    revalidatePath(`/dashboard/partners/${applicationId}`);
    return ok(undefined, 'Declined, and they have been told why.');
  } catch (error) {
    return fail(explain(error, 'That could not be declined.'));
  }
}
