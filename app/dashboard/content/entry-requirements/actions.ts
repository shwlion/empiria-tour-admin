'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb, type Db } from '@/lib/supabase';
import { recordAudit, diff } from '@/lib/audit';
import { checkbox, explain, fail, ok, text, type ActionResult } from '@/lib/actions';
import type { RequirementKind } from '@/lib/entryAdvice';
import { todayInSellerCalendar } from '@/lib/admin/placements';
import {
  CHANGE_TEMPLATE,
  contentChanged,
  countCommittedUpcoming,
  listBookedTravellers,
  noticeDecision,
  noticeDecisionNeeded,
  noticeTemplateReady,
  failedNoticeKeys,
  pairLabel,
  staleNoticeRevision,
  validateEntryRequirement,
} from '@/lib/admin/entryRequirements';

/**
 * Content → Entry requirements (0036): Empiria's advice for each destination
 * country and passport country.
 *
 * Audited like every regulatory word the site says: what a traveller was told
 * is only half the question; the other half is who changed it since, and
 * when. TICO s.37 adds a third — whether the travellers already booked were
 * told — so a save that changes what they would be shown records that
 * decision too, as `notify`.
 */

const PATH = '/dashboard/content/entry-requirements';

/** What the Retire result lists, for staff to contact by hand. */
export type AffectedBooking = { reference: string; leadName: string; leadEmail: string; startsOn: string };

const ROW =
  'id, destination_country, passport_country, requirement, headline, before_arrival, why, processing_time, apply_days_before, apply_url, official_url, status, checked_on, notice_revision';

type BeforeRow = {
  id: string; destination_country: string; passport_country: string; requirement: string; headline: string | null;
  before_arrival: string; why: string | null; processing_time: string | null; apply_days_before: number | null;
  apply_url: string | null; official_url: string | null;
  status: string; checked_on: string | null; notice_revision: number;
};

/**
 * Record a "tell them" decision: bump `notice_revision` from the value read at
 * the start, and only from that value — if someone else recorded one in
 * between, nothing is written and this says `race` (a failed write says
 * `write`). It sends no date: the
 * database stamps `notice_revised_at`, the line between who is due and who is
 * not, when the revision changes, and it is read back here.
 */
async function bumpNoticeRevision(
  db: Db,
  id: string,
  from: number,
): Promise<{ ok: true; revision: number; revisedAt: string | null } | { ok: false; reason: 'race' | 'write' }> {
  const { data, error } = await db
    .from('entry_requirements')
    .update({ notice_revision: from + 1 })
    .eq('id', id)
    .eq('notice_revision', from)
    .select('notice_revision, notice_revised_at');
  if (error) {
    console.error('[entry-requirements] notice not recorded', error);
    return { ok: false, reason: 'write' };
  }
  return data && data.length === 1
    ? { ok: true, revision: data[0].notice_revision, revisedAt: data[0].notice_revised_at }
    : { ok: false, reason: 'race' };
}

/** How many bookings are now due a notice, for the result line; null when it could not be read. */
async function dueCount(id: string): Promise<number | null> {
  const { rows, error } = await listBookedTravellers(id);
  return error ? null : rows.filter((r) => r.noticeDue).length;
}

/** "N booked travellers are due …", with when it will actually go. */
async function dueLine(id: string): Promise<string> {
  const [due, ready] = await Promise.all([dueCount(id), noticeTemplateReady()]);
  const who =
    due === null ? 'The booked travellers advised under older wording are' : `${due} booked ${due === 1 ? 'traveller is' : 'travellers are'}`;
  const when = ready === false ? ', once the “Entry requirements changed” email is written and switched on' : '';
  return `${who} due the current wording. The next send run queues it${when}.`;
}

const contentOf = (r: BeforeRow) => ({
  requirement: r.requirement as RequirementKind,
  headline: r.headline,
  beforeArrival: r.before_arrival,
  why: r.why,
  processingTime: r.processing_time,
  applyDaysBefore: r.apply_days_before,
  applyUrl: r.apply_url,
  officialUrl: r.official_url,
});

export async function saveEntryRequirementAction(
  id: string | null,
  _prev: ActionResult<{ id: string }> | null,
  form: FormData
): Promise<ActionResult<{ id: string }>> {
  // Outside the try: a refusal is a redirect, which throws by design, and the
  // catch would turn "you may not" into "that did not save".
  const user = await requireCapability('manageSettings');
  try {
    const db = requireWritableDb();

    // The pair is fixed once a row exists: bookings' advice records name it,
    // and moving the row would leave them behind. An edit takes the pair from
    // the row, never from the form (whose selects are disabled and send
    // nothing).
    let before: BeforeRow | null = null;
    if (id) {
      const { data, error } = await db.from('entry_requirements').select(ROW).eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return fail('That row no longer exists. Reload the list.');
      before = data;
    }

    const checked = validateEntryRequirement({
      destinationCountry: before ? before.destination_country : text(form.get('destination_country')),
      passportCountry: before ? before.passport_country : text(form.get('passport_country')),
      requirement: text(form.get('requirement')),
      headline: text(form.get('headline')),
      beforeArrival: text(form.get('before_arrival')),
      why: text(form.get('why')),
      processingTime: text(form.get('processing_time')),
      applyDaysBefore: text(form.get('apply_days_before')),
      applyUrl: text(form.get('apply_url')),
      officialUrl: text(form.get('official_url')),
      status: text(form.get('status')),
    });
    if (!checked.ok) return fail('A few things need fixing.', checked.fields);
    const v = checked.values;
    const label = pairLabel(v.destinationCountry, v.passportCountry);

    // Retiring has its own button, because it lists the travellers to contact.
    if (v.status === 'retired' && before?.status !== 'retired') {
      return fail('Use “Retire” to retire a row: it lists the booked travellers to contact by hand.', { status: 'Use Retire' });
    }

    const changed = contentChanged(before ? contentOf(before) : null, v);

    // s.37: a save that puts new advice in front of travellers asks what to
    // do about those already booked, with no default. The count is the
    // form's, taken again here: the page may be minutes old.
    const mayAsk = noticeDecisionNeeded({
      beforeStatus: before?.status ?? null,
      afterStatus: v.status,
      contentChanged: changed,
      bookingsExist: true,
    });
    const asked = mayAsk && (await countCommittedUpcoming()) > 0;
    const notice = text(form.get('notice'));
    if (asked && notice !== 'tell' && notice !== 'correction') {
      return fail('Choose whether to tell the travellers already booked.', { notice: 'Choose one' });
    }
    // An answer to a question that was not asked is ignored: a repeat save
    // from a stale tab must not record a second notice.
    const decision = noticeDecision({ asked, notice });

    // An explicit column list: nothing the form did not mean to write, and
    // never the version or notice fields, which the trigger and the notice
    // decision own.
    const audited = {
      requirement: v.requirement,
      headline: v.headline,
      before_arrival: v.beforeArrival,
      why: v.why,
      processing_time: v.processingTime,
      apply_days_before: v.applyDaysBefore,
      apply_url: v.applyUrl,
      official_url: v.officialUrl,
      status: v.status,
      // Stamped only when ticked; otherwise the last check stands.
      checked_on: checkbox(form.get('checked')) ? todayInSellerCalendar() : (before?.checked_on ?? null),
    };
    const columns = { ...audited, updated_by: user.id };

    // 1. The row.
    let savedId: string;
    if (!before) {
      const { data, error } = await db
        .from('entry_requirements')
        .insert({ ...columns, destination_country: v.destinationCountry, passport_country: v.passportCountry })
        .select('id')
        .single();
      if (error) throw error;
      savedId = data.id;
    } else {
      const { data, error } = await db.from('entry_requirements').update(columns).eq('id', before.id).select('id').single();
      if (error) throw error;
      savedId = data.id;
    }

    // 2. The decision. The revision is the one read at the start of the save.
    // This is a statement of its own, after the save has committed, and the
    // database stamps the date then: every booking advised under the old
    // wording, including one made while the save was in flight, accepted it
    // before the stamp.
    const from = before?.notice_revision ?? 0;
    const attempt = decision === 'tell' ? await bumpNoticeRevision(db, savedId, from) : null;
    const bumped = attempt?.ok ? attempt : null;
    const revision = bumped?.revision ?? null;
    const decided =
      decision === 'correction'
        ? ' Saved as a correction; booked travellers not told.'
        : decision === 'tell'
          ? revision !== null
            ? ` Booked travellers to be told (revision ${revision}).`
            : ' Undecided: “Tell them” was chosen but not recorded.'
          : '';

    // 3. The trail: the save, and the decision on its own line as `notify`.
    const delta = before ? diff(before as Record<string, unknown>, audited) : null;
    if (!before || delta) {
      await recordAudit(db, user, {
        entity: 'entry_requirements',
        entityId: savedId,
        action: before ? 'update' : 'create',
        before: delta?.before,
        after: delta?.after ?? { destination_country: v.destinationCountry, passport_country: v.passportCountry, ...audited },
        summary: (before
          ? `Updated ${Object.keys(delta?.after ?? {}).join(', ')} on ${label}.`
          : `Created ${label} as ${v.status}.`) + decided,
      });
    }
    if (decision) {
      await recordAudit(db, user, {
        entity: 'entry_requirements',
        entityId: savedId,
        action: 'notify',
        before: { notice_revision: from },
        after: bumped ? { notice_revision: bumped.revision, notice_revised_at: bumped.revisedAt } : { notice_revision: from },
        summary:
          decision === 'correction'
            ? `${label}: saved as a correction; booked travellers not told.`
            : revision !== null
              ? `${label}: booked travellers advised under older wording to be told (revision ${revision}).`
              : `${label}: undecided — “Tell them” was chosen but not recorded (the row’s notices changed during the save, or the write failed).`,
      });
    }

    revalidatePath(PATH);
    revalidatePath(`${PATH}/${savedId}`);
    revalidatePath('/dashboard');
    if (decision === 'tell' && revision === null) {
      return fail(
        'Saved, but “Tell them” was not recorded: the row’s notices changed during the save, or the write failed. Open the row from the Entry requirements list and use “Send the current wording…” on its Booked travellers card.'
      );
    }
    if (revision !== null) return ok({ id: savedId }, `Saved. ${await dueLine(savedId)}`);
    if (decision === 'correction') return ok({ id: savedId }, 'Saved as a correction. Nobody already booked is told.');
    if (!before) {
      return ok({ id: savedId }, v.status === 'active' ? `${label} created. Travellers on this passport see it now.` : `${label} created as a draft. Nobody sees it yet.`);
    }
    if (!delta) return ok({ id: savedId }, 'Nothing changed.');
    return ok({ id: savedId }, changed && v.status === 'active' ? 'Saved. Travellers on this passport now see the new wording.' : 'Saved.');
  } catch (error) {
    // The pair is unique (entry_requirements_pair_key); say which field.
    const raw = (error as { message?: unknown } | null)?.message;
    if (typeof raw === 'string' && raw.includes('entry_requirements_pair_key')) {
      return fail(explain(error), { passport_country: 'Already has a row' });
    }
    return fail(explain(error));
  }
}

/**
 * Retire a row. It never asks "tell them" and never records a revision
 * (spec §6): a retired row's wording is shown to nobody, so there is nothing
 * current to send. The travellers advised under it are read before the save
 * and returned, for staff to contact by hand, and the trail says they were
 * not notified.
 */
export async function retireEntryRequirementAction(id: string): Promise<ActionResult<{ affected: AffectedBooking[] }>> {
  const user = await requireCapability('manageSettings');
  try {
    const db = requireWritableDb();
    const { data: before, error: readError } = await db
      .from('entry_requirements')
      .select('id, destination_country, passport_country, status')
      .eq('id', id)
      .maybeSingle();
    if (readError) throw readError;
    if (!before) return fail('That row no longer exists. Reload the list.');
    if (before.status === 'retired') return fail('That row is already retired.');

    // Read first: a list that could not be read must stop the retire, or
    // staff would be told "nobody to contact" when nobody looked.
    const booked = await listBookedTravellers(id);
    if (booked.error) return fail(`The booked travellers could not be read, so nothing was retired: ${booked.error}`);
    const affected: AffectedBooking[] = booked.rows.map((r) => ({
      reference: r.reference,
      leadName: r.leadName,
      leadEmail: r.leadEmail,
      startsOn: r.startsOn,
    }));

    const { error } = await db.from('entry_requirements').update({ status: 'retired', updated_by: user.id }).eq('id', id);
    if (error) throw error;

    const label = pairLabel(before.destination_country, before.passport_country);
    await recordAudit(db, user, {
      entity: 'entry_requirements',
      entityId: id,
      action: 'unpublish',
      before: { status: before.status },
      after: { status: 'retired' },
      summary:
        affected.length === 0
          ? `Retired ${label}. No upcoming booking was advised under it.`
          : `Retired ${label}. ${affected.length} booked ${affected.length === 1 ? 'traveller was' : 'travellers were'} not notified by the retire: ${affected.map((a) => a.reference).join(', ')}.`,
    });

    revalidatePath(PATH);
    revalidatePath(`${PATH}/${id}`);
    revalidatePath('/dashboard');
    return ok(
      { affected },
      affected.length === 0
        ? `${label} is retired. No upcoming booking was advised under it.`
        : `${label} is retired. Retiring tells nobody by itself; notices already due from an earlier “Tell them” still go out once the change email is on. To reach ${affected.length === 1 ? 'this booking' : `these ${affected.length} bookings`} now, contact them by hand:`
    );
  } catch (e) {
    return fail(explain(e));
  }
}

/**
 * "Send the current wording to the N booked travellers advised under older
 * wording": records a revision, exactly as "Tell them" does, for a change that
 * was saved as a correction and should not have been, or whose "Tell them"
 * was not recorded. Loop B does the sending.
 *
 * The bump is keyed on `seenRevision`, the revision the card was loaded
 * with, as the save's is keyed on the revision it read. A second click from
 * a stale tab or another desk is refused rather than recorded, so it never
 * sends every older booking a second notice.
 */
export async function notifyEntryRequirementAction(id: string, seenRevision: number): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');
  try {
    const db = requireWritableDb();
    const { data: row, error: readError } = await db
      .from('entry_requirements')
      .select('id, destination_country, passport_country, status, notice_revision')
      .eq('id', id)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) return fail('That row no longer exists. Reload the list.');
    if (row.status !== 'active') return fail('Only an active row can be sent: travellers are shown active rows only.');
    if (staleNoticeRevision(seenRevision, row.notice_revision)) {
      return fail(
        'Someone already recorded a notice on this row after this page loaded, so nothing was recorded again. Reload the page to see where the notices stand.'
      );
    }

    const booked = await listBookedTravellers(id);
    if (booked.error) return fail(`The booked travellers could not be read: ${booked.error}`);
    if (!booked.rows.some((r) => !r.sawCurrent)) {
      return fail('Every booked traveller was advised under the current wording. There is nothing to send.');
    }

    const attempt = await bumpNoticeRevision(db, id, seenRevision);
    if (!attempt.ok) {
      return fail(
        attempt.reason === 'race'
          ? 'Someone else recorded a notice on this row a moment ago. Reload to see it.'
          : 'The notice could not be recorded. Try again in a moment.'
      );
    }
    const bumped = attempt;

    const label = pairLabel(row.destination_country, row.passport_country);
    await recordAudit(db, user, {
      entity: 'entry_requirements',
      entityId: id,
      action: 'notify',
      before: { notice_revision: row.notice_revision },
      after: { notice_revision: bumped.revision, notice_revised_at: bumped.revisedAt },
      summary: `${label}: booked travellers advised under older wording to be sent the current wording (revision ${bumped.revision}).`,
    });

    revalidatePath(PATH);
    revalidatePath(`${PATH}/${id}`);
    revalidatePath('/dashboard');
    return ok(undefined, `Recorded. ${await dueLine(id)}`);
  } catch (e) {
    return fail(explain(e));
  }
}

/**
 * Release the failed notices' dedupe keys so the next send run queues them
 * again, as 0025 did once for `balance_due`. The keys are this row's, at its
 * current revision, for bookings still upcoming — the exact `notice_key`s
 * `entry_advice_bookings` returns — rather than a LIKE pattern, in which the
 * "_" of the prefix is a wildcard. The update re-checks the status, so a
 * message that moved on in between is left alone.
 */
export async function retryFailedNoticesAction(id: string): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');
  try {
    const db = requireWritableDb();
    const { data: row, error: readError } = await db
      .from('entry_requirements')
      .select('id, destination_country, passport_country, status, notice_revision')
      .eq('id', id)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) return fail('That row no longer exists. Reload the list.');
    if (row.status !== 'active') return fail('Only an active row’s notices are sent.');

    const booked = await listBookedTravellers(id);
    if (booked.error) return fail(`The booked travellers could not be read: ${booked.error}`);
    const keys = failedNoticeKeys(booked.rows, booked.messages);
    if (keys.length === 0) return fail('No notice of the current wording has failed.');

    let released = 0;
    for (let i = 0; i < keys.length; i += 50) {
      const { data, error } = await db
        .from('email_messages')
        .update({ dedupe_key: null })
        .in('dedupe_key', keys.slice(i, i + 50))
        .eq('template_key', CHANGE_TEMPLATE)
        .eq('status', 'failed')
        .select('id');
      if (error) throw error;
      released += data?.length ?? 0;
    }

    const label = pairLabel(row.destination_country, row.passport_country);
    await recordAudit(db, user, {
      entity: 'entry_requirements',
      entityId: id,
      action: 'notify',
      summary: `${label}: released ${released} failed ${released === 1 ? 'notice' : 'notices'} of revision ${row.notice_revision} for the next send run.`,
    });

    revalidatePath(PATH);
    revalidatePath(`${PATH}/${id}`);
    revalidatePath('/dashboard');
    return ok(undefined, `${released} failed ${released === 1 ? 'notice goes' : 'notices go'} out again with the next send run.`);
  } catch (e) {
    return fail(explain(e));
  }
}
