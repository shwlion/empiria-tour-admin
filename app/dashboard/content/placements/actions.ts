'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit } from '@/lib/audit';
import { cents, explain, fail, ok, text, type ActionResult } from '@/lib/actions';
import { conflictsFor, getPlacement, MAX_PLACEMENT_DAYS, placementDays } from '@/lib/admin/placements';

/**
 * Deciding on a partner's request for a postcard (migration 0021).
 *
 * Gated on `manageSettings`, like the showcase editor next door: what the
 * landing page says is the first thing a visitor reads, and Exhibit A keeps
 * that away from the Agent role. Selling the slot does not change who may
 * decide what appears in it.
 *
 * Every decision is audited. "Who approved the placement that ran during the
 * spring sale, and what did they charge for it" is a question somebody will
 * ask — and unlike most audit trails, this one has an invoice behind it.
 */

const PATH = '/dashboard/content/placements';

/**
 * Approve a request and fix its price.
 *
 * The price is frozen here for the same reason a booking freezes its own: what
 * was agreed is what is owed, whatever the rate card does afterwards. The
 * partner is quoted this number and pays exactly it.
 *
 * The overlap check below is a courtesy that produces a readable error. The
 * *rule* is 0021's exclusion constraint, which is why the UPDATE is attempted
 * regardless and its violation is translated rather than pre-empted: two
 * admins approving overlapping windows at the same instant both pass the
 * check and only one passes the constraint.
 */
export async function approvePlacementAction(
  placementId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');

  const priceCents = cents(form.get('price_cents'), -1);
  if (priceCents < 0) {
    return fail('Enter a price for this placement.', { price_cents: 'A price in dollars' });
  }
  const holdUntil = text(form.get('hold_until')) || null;
  if (holdUntil && !/^\d{4}-\d{2}-\d{2}$/.test(holdUntil)) {
    return fail('That hold date is not a date.', { hold_until: 'YYYY-MM-DD' });
  }

  try {
    const placement = await getPlacement(placementId);
    if (!placement) return fail('That request no longer exists.');
    if (placement.status !== 'requested') {
      return fail(`That request is already ${placement.status}. Reload the page to see where it stands.`);
    }

    const days = placementDays(placement.startsOn, placement.endsOn);
    if (days <= 0) return fail('That request has an impossible date range.');
    if (days > MAX_PLACEMENT_DAYS) {
      return fail(`That window is ${days} days. Approve at most ${MAX_PLACEMENT_DAYS} at a time.`);
    }

    const clashes = await conflictsFor(placement.cardId, placement.startsOn, placement.endsOn, placement.id);
    if (clashes.length > 0) {
      const c = clashes[0];
      return fail(
        `“${placement.cardTitle}” is already held for ${c.startsOn} to ${c.endsOn} by ${c.partnerName}. ` +
          'Reject this one, or ask the partner for different dates.'
      );
    }

    const db = requireWritableDb();
    const { error } = await db
      .from('showcase_placements')
      .update({
        status: 'approved',
        price_cents: priceCents,
        hold_until: holdUntil,
        note: text(form.get('note')) || null,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', placementId)
      .eq('status', 'requested');   // lost race → zero rows, never a second approval

    if (error) {
      // 23P01 is exclusion_violation: another approval took these days between
      // the check above and this write. The constraint is doing its job; the
      // partner is not interested in the SQLSTATE.
      if (error.code === '23P01') {
        return fail('Those days were just taken on that card by another approval. Reload and try again.');
      }
      return fail(explain(error));
    }

    await recordAudit(db, user, {
      entity: 'showcase_placement',
      entityId: placementId,
      action: 'update',
      before: { status: 'requested', price_cents: placement.priceCents },
      after: { status: 'approved', price_cents: priceCents },
      summary: `Approved “${placement.cardTitle}” for ${placement.partnerName}, ${placement.startsOn} to ${placement.endsOn}`,
    });

    revalidatePath(PATH);
    return ok(undefined, 'Approved. The partner can pay for it now.');
  } catch (error) {
    return fail(explain(error));
  }
}

/**
 * Turn a request down.
 *
 * The reason is required and it is shown to the partner: a rejection with no
 * reason produces an email asking why, which somebody then has to answer.
 */
export async function rejectPlacementAction(
  placementId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');

  const note = text(form.get('note'));
  if (note.length < 3) {
    return fail('Say why, briefly. The partner sees this.', { note: 'A short reason' });
  }

  try {
    const placement = await getPlacement(placementId);
    if (!placement) return fail('That request no longer exists.');
    if (placement.status === 'paid') {
      return fail('That placement is paid for. Cancel it instead, and settle the refund outside the platform.');
    }

    const db = requireWritableDb();
    const { error } = await db
      .from('showcase_placements')
      .update({
        status: 'rejected',
        note,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', placementId)
      .in('status', ['requested', 'approved']);
    if (error) return fail(explain(error));

    await recordAudit(db, user, {
      entity: 'showcase_placement',
      entityId: placementId,
      action: 'update',
      before: { status: placement.status },
      after: { status: 'rejected', note },
      summary: `Rejected “${placement.cardTitle}” for ${placement.partnerName}: ${note}`,
    });

    revalidatePath(PATH);
    return ok(undefined, 'Rejected, and the partner has been told why.');
  } catch (error) {
    return fail(explain(error));
  }
}

/**
 * Release an approved slot that was never paid for.
 *
 * An approval holds days against every other partner, and nothing expires it
 * on its own — deliberately, because a slot quietly going back on sale while a
 * partner is arranging payment is worse than one an admin has to release. This
 * is that release, and the console flags approvals past their hold date so
 * nobody has to remember.
 */
export async function cancelPlacementAction(
  placementId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');

  try {
    const placement = await getPlacement(placementId);
    if (!placement) return fail('That request no longer exists.');

    const db = requireWritableDb();
    const { error } = await db
      .from('showcase_placements')
      .update({
        status: 'cancelled',
        note: text(form.get('note')) || placement.note,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', placementId);
    if (error) return fail(explain(error));

    await recordAudit(db, user, {
      entity: 'showcase_placement',
      entityId: placementId,
      action: 'update',
      before: { status: placement.status, paid_at: placement.paidAt },
      after: { status: 'cancelled' },
      // Worth spelling out in the log: cancelling something already paid for
      // leaves money with Empiria that the platform is not tracking.
      summary:
        placement.status === 'paid'
          ? `Cancelled the PAID placement “${placement.cardTitle}” for ${placement.partnerName} — a refund is owed outside the platform`
          : `Released “${placement.cardTitle}” held for ${placement.partnerName}`,
    });

    revalidatePath(PATH);
    return ok(
      undefined,
      placement.status === 'paid'
        ? 'Cancelled. This one was paid for — settle the refund with the partner directly.'
        : 'Released. Those days are back on sale.'
    );
  } catch (error) {
    return fail(explain(error));
  }
}
