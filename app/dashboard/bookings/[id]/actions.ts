'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit, diff } from '@/lib/audit';
import { checkbox, explain, fail, nullable, ok, text, type ActionResult } from '@/lib/actions';
import { formatPrice } from '@/lib/money';
import { RESENDABLE } from '@/lib/admin/emails';
import { parseAmount } from '@/lib/admin/bookings';

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

  const magnitude = parseAmount(text(form.get('amount')));
  if (magnitude == null) {
    return fail('Enter the amount as a number, like 1850.00.', { amount: 'Like 1850.00' });
  }
  if (magnitude <= 0) {
    return fail('The amount has to be more than zero.', { amount: 'Enter an amount' });
  }
  // Refunds are stored negative; staff type the amount they gave back.
  const amount = kind === 'refund' ? -magnitude : magnitude;

  const note = nullable(form.get('note'));

  try {
    const db = requireWritableDb();

    // Bounded by the booking as it stands. A refund cannot give back more than
    // was paid: record_payment has no floor, and the booking would show a
    // negative amount paid and more outstanding than its total. A payment
    // larger than what is owed is nearly always a slipped digit, and one that
    // could only be undone by recording a refund that never happened, so it
    // is recorded only once staff confirm the excess really arrived.
    const { data: current } = await db
      .from('bookings')
      .select('total_cents, amount_paid_cents, currency')
      .eq('id', bookingId)
      .maybeSingle();
    if (!current) return fail('That booking no longer exists.');
    const outstanding = Math.max(current.total_cents - current.amount_paid_cents, 0);
    if (kind === 'refund' && magnitude > current.amount_paid_cents) {
      const paid = formatPrice(Math.max(current.amount_paid_cents, 0), current.currency);
      return fail(`Only ${paid} has been paid on this booking, so no more than that can be refunded.`, {
        amount: `At most ${paid}`,
      });
    }
    if (kind !== 'refund' && magnitude > outstanding && !checkbox(form.get('overpaid'))) {
      return fail(
        `That is more than the ${formatPrice(outstanding, current.currency)} outstanding. If that much really arrived, ` +
          'tick "More than is owed" and record it again, then refund the difference.',
        { amount: 'More than is outstanding', overpaid: 'Confirm' }
      );
    }

    const providerRef = `manual_${randomUUID()}`;
    const { data: booking, error } = await db.rpc('record_payment', {
      p_payload: {
        booking_id: bookingId,
        kind,
        amount_cents: amount,
        status: 'succeeded',
        provider: 'manual',
        provider_ref: providerRef,
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

  // Empty means "not known yet", which the statement counts as a caveat.
  // Anything else must be a real amount: a cost of zero is a costed booking.
  const raw = text(form.get('supplier_cost'));
  if (raw.startsWith('-')) {
    return fail('Supplier cost cannot be negative.', { supplier_cost: 'Zero or more' });
  }
  const value = raw === '' ? null : parseAmount(raw);
  if (raw !== '' && value == null) {
    return fail('Enter the cost as a number, like 1850.00, or leave it empty until it is known.', {
      supplier_cost: 'Like 1850.00',
    });
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
