'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit } from '@/lib/audit';
import { explain, fail, ok, text, type ActionResult } from '@/lib/actions';

/**
 * Staff administration — B6.
 *
 * Every rule that matters is in the database (`set_user_role`,
 * `set_user_status`): nobody changes their own role, an active administrator
 * must always remain, `partner` is not grantable here, and a partner holding
 * packages cannot be demoted. These actions call those functions and translate
 * what comes back. They deliberately re-check nothing themselves — one copy of
 * a rule cannot drift from itself.
 */

const STAFF_ROLES = ['admin', 'agent'] as const;

export async function inviteStaffAction(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  try {
    const user = await requireCapability('manageSettings');
    const db = requireWritableDb();

    const email = text(form.get('email')).toLowerCase();
    const name = text(form.get('full_name'));
    const role = text(form.get('role'));

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return fail('That does not look like an email address.', { email: 'Check this' });
    }
    if (!(STAFF_ROLES as readonly string[]).includes(role)) {
      return fail('Choose administrator or agent.', { role: 'Required' });
    }

    // Somebody may already be here as a traveller — they booked a holiday
    // before they were hired. Promote that account rather than failing on a
    // duplicate address, which is the shape of the error Supabase would give.
    const { data: existing } = await db
      .from('users').select('id, role, status').ilike('email', email).maybeSingle();

    let userId: string;
    if (existing) {
      if (existing.role === 'partner') {
        return fail('That address belongs to a partner. Partner and staff accounts are separate.');
      }
      userId = existing.id;
    } else {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_KEY;
      if (!url || !key) return fail('SUPABASE_KEY is not set, so no account can be created.');
      const auth = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data, error } = await auth.auth.admin.inviteUserByEmail(email, {
        data: { full_name: name || null },
        redirectTo: process.env.ADMIN_URL ? `${process.env.ADMIN_URL}/dashboard` : undefined,
      });
      if (error || !data?.user) throw new Error(error?.message ?? 'The invitation could not be sent.');
      userId = data.user.id;
    }

    const { error } = await db.rpc('set_user_role', {
      p_user: userId, p_role: role, p_actor: user.id,
    });
    if (error) throw new Error(error.message);

    if (name && !existing) {
      await db.from('users').update({ full_name: name }).eq('id', userId);
    }
    // A closed account being re-invited is somebody coming back.
    if (existing?.status === 'closed') {
      await db.rpc('set_user_status', { p_user: userId, p_status: 'active', p_actor: user.id });
    }

    await recordAudit(db, user, {
      entity: 'user',
      entityId: userId,
      action: 'update',
      summary: `${existing ? 'Gave' : 'Invited'} ${email} the ${role} role`,
      after: { role },
    });

    revalidatePath('/dashboard/settings/staff');
    return ok(undefined, existing
      ? `${email} now has console access.`
      : `Invited ${email}. They will get a link to set a password.`);
  } catch (error) {
    return fail(explain(error, 'That invitation could not be sent.'));
  }
}

export async function setRoleAction(
  userId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  try {
    const user = await requireCapability('manageSettings');
    const db = requireWritableDb();
    const role = text(form.get('role'));

    const { error } = await db.rpc('set_user_role', {
      p_user: userId, p_role: role, p_actor: user.id,
    });
    if (error) throw new Error(error.message);

    await recordAudit(db, user, {
      entity: 'user', entityId: userId, action: 'update',
      summary: `Changed a staff role to ${role}`, after: { role },
    });
    revalidatePath('/dashboard/settings/staff');
    return ok(undefined, 'Role changed.');
  } catch (error) {
    return fail(explain(error, 'That role could not be changed.'));
  }
}

export async function setStatusAction(
  userId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  try {
    const user = await requireCapability('manageSettings');
    const db = requireWritableDb();
    const status = text(form.get('status')) === 'closed' ? 'closed' : 'active';

    const { error } = await db.rpc('set_user_status', {
      p_user: userId, p_status: status, p_actor: user.id,
    });
    if (error) throw new Error(error.message);

    await recordAudit(db, user, {
      entity: 'user', entityId: userId, action: 'update',
      summary: status === 'closed' ? 'Closed a staff account' : 'Reopened a staff account',
      after: { status },
    });
    revalidatePath('/dashboard/settings/staff');
    return ok(undefined, status === 'closed'
      ? 'Closed. They can no longer sign in.'
      : 'Reopened. They can sign in again.');
  } catch (error) {
    return fail(explain(error, 'That account could not be changed.'));
  }
}
