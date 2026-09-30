'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit, diff } from '@/lib/audit';
import { checkbox, explain, fail, ok, text, type ActionResult } from '@/lib/actions';
import type { RequirementKind } from '@/lib/entryAdvice';
import { todayInSellerCalendar } from '@/lib/admin/placements';
import { contentChanged, pairLabel, validateEntryRequirement } from '@/lib/admin/entryRequirements';

/**
 * Content → Entry requirements (0036): Empiria's advice for each destination
 * country and passport country.
 *
 * Audited like every regulatory word the site says: what a traveller was told
 * is only half the question; the other half is who changed it since, and
 * when.
 */

const PATH = '/dashboard/content/entry-requirements';

const ROW =
  'id, destination_country, passport_country, requirement, headline, before_arrival, why, processing_time, apply_days_before, apply_url, official_url, status, checked_on, notice_revision';

type BeforeRow = {
  id: string; destination_country: string; passport_country: string; requirement: string; headline: string | null;
  before_arrival: string; why: string | null; processing_time: string | null; apply_days_before: number | null;
  apply_url: string | null; official_url: string | null;
  status: string; checked_on: string | null; notice_revision: number;
};

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
      const { error } = await db.from('entry_requirements').update(columns).eq('id', before.id);
      if (error) throw error;
      savedId = before.id;
    }

    // 2. The trail.
    const delta = before ? diff(before as Record<string, unknown>, audited) : null;
    if (!before || delta) {
      await recordAudit(db, user, {
        entity: 'entry_requirements',
        entityId: savedId,
        action: before ? 'update' : 'create',
        before: delta?.before,
        after: delta?.after ?? { destination_country: v.destinationCountry, passport_country: v.passportCountry, ...audited },
        summary: before
          ? `Updated ${Object.keys(delta?.after ?? {}).join(', ')} on ${label}`
          : `Created ${label} as ${v.status}`,
      });
    }

    revalidatePath(PATH);
    revalidatePath(`${PATH}/${savedId}`);
    revalidatePath('/dashboard');
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
