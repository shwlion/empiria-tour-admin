'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit, diff } from '@/lib/audit';
import { cents, explain, fail, nullable, ok, text, type ActionResult } from '@/lib/actions';
import { RESENDABLE } from '@/lib/admin/emails';

/**
 * The three writes B3 actually owns.
 *
 * Everything else on the booking is the database's: seats move inside
 * `claim_seats`/`confirm_hold_seats`, money and status inside `record_payment`.
 * The console records what happened offline; it never edits totals, status or
 * seats directly, because a hand-edited balance and a webhook would disagree
 * within the hour.
 */

export async function saveInternalNotesAction(
  bookingId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('manageBookings');

  try {
    const db = requireWritableDb();
    const { data: before } = await db
      .from('bookings')
      .select('id, reference, notes_internal')
      .eq('id', bookingId)
      .maybeSingle();
    if (!before) return fail('That booking no longer exists.');

    const notes = nullable(form.get('notes_internal'));
    const changes = diff(before as Record<string, unknown>, { notes_internal: notes });
    if (!changes) return ok(undefined, 'Nothing changed.');

    const { error } = await db
      .from('bookings')
      .update({ notes_internal: notes, updated_at: new Date().toISOString() })
      .eq('id', bookingId);
    if (error) return fail(explain(error));

    await recordAudit(db, user, {
      entity: 'booking',
      entityId: bookingId,
      action: 'update',
      before: changes.before,
      after: changes.after,
      summary: `Edited internal notes on ${before.reference}`,
    });

    revalidatePath(`/dashboard/bookings/${bookingId}`);
    return ok(undefined, 'Notes saved.');
  } catch (error) {
    return fail(explain(error));
  }
}

/**
 * A payment that arrived outside Stripe — bank transfer, cheque, a refund
 * issued by hand. It goes through `record_payment` like every other payment,
 * so the balance arithmetic, the status transition and the one-time seat
 * confirmation all happen in exactly one place. The provider_ref is generated
 * here so the function's idempotency key is never null.
 */
export async function recordManualPaymentAction(
  bookingId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('manageBookings');

  const kind = text(form.get('kind'));
  if (!['deposit', 'balance', 'full', 'manual', 'refund'].includes(kind)) {
    return fail('Choose what kind of payment this is.', { kind: 'Required' });
  }

  const magnitude = cents(form.get('amount'));
  if (magnitude <= 0) {
    return fail('The amount has to be more than zero.', { amount: 'Enter an amount' });
  }
  // Refunds are stored negative; staff type the amount they gave back.
  const amount = kind === 'refund' ? -magnitude : magnitude;

  const note = nullable(form.get('note'));

  try {
    const db = requireWritableDb();
    const { data: booking, error } = await db.rpc('record_payment', {
      p_payload: {
        booking_id: bookingId,
        kind,
        amount_cents: amount,
        status: 'succeeded',
        provider: 'manual',
        provider_ref: `manual_${randomUUID()}`,
        recorded_by: user.id,
      },
    });
    if (error) return fail(explain(error));

    await recordAudit(db, user, {
      entity: 'booking',
      entityId: bookingId,
      action: 'record_payment',
      after: {
        kind,
        amount_cents: amount,
        note,
        resulting_status: (booking as { status?: string } | null)?.status,
        resulting_paid_cents: (booking as { amount_paid_cents?: number } | null)?.amount_paid_cents,
      },
      summary:
        `Recorded a manual ${kind} of ${(Math.abs(amount) / 100).toFixed(2)}` +
        (note ? ` — ${note}` : ''),
    });

    revalidatePath(`/dashboard/bookings/${bookingId}`);
    revalidatePath('/dashboard/bookings');
    return ok(undefined, kind === 'refund' ? 'Refund recorded.' : 'Payment recorded.');
  } catch (error) {
    return fail(explain(error));
  }
}

/**
 * §4.6: Empiria populates the supplier cost; the platform never derives it.
 * Admin-only because it is finance, and B5's revenue share is computed from it.
 */
export async function saveSupplierCostAction(
  bookingId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('viewFinance');

  const raw = text(form.get('supplier_cost'));
  const value = raw === '' ? null : cents(form.get('supplier_cost'));
  if (value != null && value < 0) {
    return fail('Supplier cost cannot be negative.', { supplier_cost: 'Zero or more' });
  }

  try {
    const db = requireWritableDb();
    const { data: before } = await db
      .from('bookings')
      .select('id, reference, supplier_cost_cents')
      .eq('id', bookingId)
      .maybeSingle();
    if (!before) return fail('That booking no longer exists.');

    const changes = diff(before as Record<string, unknown>, { supplier_cost_cents: value });
    if (!changes) return ok(undefined, 'Nothing changed.');

    const { error } = await db
      .from('bookings')
      .update({ supplier_cost_cents: value, updated_at: new Date().toISOString() })
      .eq('id', bookingId);
    if (error) return fail(explain(error));

    await recordAudit(db, user, {
      entity: 'booking',
      entityId: bookingId,
      action: 'update',
      before: changes.before,
      after: changes.after,
      summary: `Set supplier cost on ${before.reference}`,
    });

    revalidatePath(`/dashboard/bookings/${bookingId}`);
    return ok(undefined, 'Supplier cost saved.');
  } catch (error) {
    return fail(explain(error));
  }
}

// ─── Part C: send it again ─────────────────────────────────────────────────

/**
 * B3's "resend confirmation, receipt, or balance-reminder emails".
 *
 * A plain enqueue with **no dedupe key**, which is the whole point: the
 * automatic sends carry one so a webhook redelivery cannot double them, and a
 * staff member pressing this button means "send it again" and must not be
 * swallowed by that same guard.
 *
 * Nothing is rendered or transmitted here. The row joins the outbox and leaves
 * on the next tick, through the one code path that talks to the mail provider.
 */
export async function resendEmailAction(
  bookingId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  try {
    const user = await requireCapability('manageBookings');
    const db = requireWritableDb();
    const templateKey = text(form.get('template_key'));

    if (!RESENDABLE.some((r) => r.key === templateKey)) {
      return fail('That is not a message staff can send by hand.');
    }

    const { data: booking } = await db
      .from('bookings')
      .select('id, reference, lead_email, lead_name')
      .eq('id', bookingId)
      .maybeSingle();
    if (!booking) return fail('That booking no longer exists.');
    if (!booking.lead_email) return fail('This booking has no email address on it.');

    // The facts are rebuilt from the booking as it stands now, not copied from
    // the original send — a resent balance reminder should quote today's
    // balance, not the one from three weeks ago.
    const { data: existing } = await db
      .from('email_messages')
      .select('merge_data')
      .eq('booking_id', bookingId)
      .eq('template_key', templateKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await db.rpc('enqueue_email', {
      p_payload: {
        template_key: templateKey,
        to_email: booking.lead_email,
        to_name: booking.lead_name,
        booking_id: bookingId,
        merge_data: existing?.merge_data ?? {},
        dedupe_key: null,
      } as never,
    });
    if (error) throw new Error(error.message);

    await recordAudit(db, user, {
      entity: 'booking',
      entityId: bookingId,
      action: 'resend_email',
      summary: `Queued a ${templateKey.replace(/_/g, ' ')} email to ${booking.lead_email}`,
    });

    revalidatePath(`/dashboard/bookings/${bookingId}`);
    return ok(undefined, 'Queued. It goes out on the next send.');
  } catch (error) {
    return fail(explain(error, 'That could not be queued.'));
  }
}
