'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit } from '@/lib/audit';
import { cents, explain, fail, integer, nullable, ok, text, type ActionResult } from '@/lib/actions';
import { endDateFor, expandRecurrence } from '@/lib/admin/departures';

/**
 * B2. Two operations: generate a season, and correct what was generated.
 *
 * Neither touches `seats_booked` or `seats_held`. Those belong to `claim_seats`
 * and `confirm_hold_seats`, which hold a row lock on the departure while they
 * move them. A form writing those columns directly would be racing the booking
 * flow for the last seat, and would sometimes win.
 */

export async function generateDeparturesAction(
  packageId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('managePackages');

  const from = text(form.get('from'));
  const to = text(form.get('to'));
  const capacity = integer(form.get('capacity'), 0);
  const startTime = nullable(form.get('start_time'));
  const weekdays = form.getAll('weekday').map((w) => Number(text(w))).filter((n) => n >= 0 && n <= 6);
  const everyDays = integer(form.get('every_days'), 7);

  if (!from || !to) return fail('Choose the first and last date of the season.');
  if (to < from) return fail('The last date is before the first.', { to: 'Before the start' });
  if (capacity < 1) return fail('Every departure needs at least one seat.', { capacity: 'Too few' });

  const dates = expandRecurrence({ from, to, weekdays, everyDays });
  if (dates.length === 0) return fail('That pattern produces no dates.');

  try {
    const db = requireWritableDb();
    const { data: pkg } = await db
      .from('packages')
      .select('title, duration_days, partner_id')
      .eq('id', packageId)
      .maybeSingle();
    if (!pkg) return fail('That tour no longer exists.');
    if (user.can.scopedToOwnPackages && pkg.partner_id !== user.id) {
      return fail('That tour belongs to somebody else.');
    }

    const rows = dates.map((startsOn) => ({
      package_id: packageId,
      starts_on: startsOn,
      ends_on: endDateFor(startsOn, pkg.duration_days),
      start_time: startTime,
      capacity,
      status: 'open',
    }));

    // `departures_unique_slot` is UNIQUE NULLS NOT DISTINCT, so re-running the
    // generator over a season that already exists creates nothing rather than
    // doubling it. That constraint is migration 0004 and it exists because the
    // first version of it let a null start_time defeat the uniqueness entirely.
    const { data: inserted, error } = await db
      .from('departures')
      .upsert(rows, { onConflict: 'package_id,starts_on,start_time', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;

    const created = inserted?.length ?? 0;
    const skipped = dates.length - created;

    await recordAudit(db, user, {
      entity: 'departures',
      entityId: packageId,
      action: 'generate',
      after: { from, to, capacity, weekdays, everyDays, created },
      summary: `${pkg.title}: generated ${created} departures, ${from} → ${to}`,
    });

    revalidatePath(`/dashboard/tours/${packageId}/departures`);
    return ok(
      undefined,
      skipped > 0
        ? `Created ${created}. ${skipped} already existed and were left alone.`
        : `Created ${created} ${created === 1 ? 'departure' : 'departures'}.`
    );
  } catch (e) {
    return fail(explain(e));
  }
}

export async function saveDeparturesAction(
  packageId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('managePackages');

  try {
    const db = requireWritableDb();
    const { data: pkg } = await db
      .from('packages')
      .select('title, partner_id')
      .eq('id', packageId)
      .maybeSingle();
    if (!pkg) return fail('That tour no longer exists.');
    if (user.can.scopedToOwnPackages && pkg.partner_id !== user.id) {
      return fail('That tour belongs to somebody else.');
    }

    const ids = form.getAll('departure_id').map((v) => text(v));
    const { data: existing } = await db
      .from('departures')
      .select('id, capacity, seats_booked, seats_held, status, starts_on, price_override_cents, child_price_override_cents')
      .eq('package_id', packageId);
    const byId = new Map((existing ?? []).map((d) => [d.id, d]));

    let changes = 0;
    for (let i = 0; i < ids.length; i++) {
      const current = byId.get(ids[i]);
      if (!current) continue;

      const capacity = integer(form.getAll('departure_capacity')[i], current.capacity);
      const committed = current.seats_booked + current.seats_held;
      // There is a check constraint for this, but a form should say what is
      // wrong in words rather than surface a constraint name.
      if (capacity < committed) {
        return fail(
          `${current.starts_on} already has ${committed} ${committed === 1 ? 'seat' : 'seats'} booked or held, so capacity cannot go below that.`,
          { [`departure_capacity_${ids[i]}`]: `Minimum ${committed}` }
        );
      }

      const overrideRaw = text(form.getAll('departure_price')[i]);
      const childRaw = text(form.getAll('departure_child_price')[i]);
      const next = {
        capacity,
        status: text(form.getAll('departure_status')[i]) || current.status,
        price_override_cents: overrideRaw === '' ? null : cents(overrideRaw),
        child_price_override_cents: childRaw === '' ? null : cents(childRaw),
      };

      const unchanged =
        next.capacity === current.capacity &&
        next.status === current.status &&
        next.price_override_cents === current.price_override_cents &&
        next.child_price_override_cents === current.child_price_override_cents;
      if (unchanged) continue;

      const { error } = await db.from('departures').update(next).eq('id', ids[i]);
      if (error) throw error;
      changes += 1;
    }

    if (changes > 0) {
      await recordAudit(db, user, {
        entity: 'departures',
        entityId: packageId,
        action: 'update',
        summary: `${pkg.title}: ${changes} ${changes === 1 ? 'departure' : 'departures'} updated`,
      });
    }

    revalidatePath(`/dashboard/tours/${packageId}/departures`);
    return ok(undefined, changes === 0 ? 'Nothing had changed.' : `Updated ${changes}.`);
  } catch (e) {
    return fail(explain(e));
  }
}

/**
 * Remove a departure nobody has booked.
 *
 * Refuses once there are seats on it. `bookings.departure_id` is ON DELETE
 * RESTRICT, and a departure with travellers on it should be cancelled — which
 * is a conversation with those travellers, not a delete button.
 */
export async function deleteDepartureAction(
  packageId: string,
  departureId: string
): Promise<ActionResult> {
  const user = await requireCapability('managePackages');
  try {
    const db = requireWritableDb();
    const { data: dep } = await db
      .from('departures')
      .select('starts_on, seats_booked, seats_held')
      .eq('id', departureId)
      .maybeSingle();
    if (!dep) return fail('That departure has already gone.');
    if (dep.seats_booked > 0) {
      return fail('That departure has bookings on it. Close sales or cancel it rather than deleting it.');
    }
    if (dep.seats_held > 0) {
      return fail('Somebody is booking that departure right now. Try again in a few minutes.');
    }

    const { error } = await db.from('departures').delete().eq('id', departureId);
    if (error) throw error;

    await recordAudit(db, user, {
      entity: 'departures',
      entityId: departureId,
      action: 'delete',
      before: dep,
      summary: `Deleted the ${dep.starts_on} departure`,
    });

    revalidatePath(`/dashboard/tours/${packageId}/departures`);
    return ok(undefined, 'Departure removed.');
  } catch (e) {
    return fail(explain(e));
  }
}
