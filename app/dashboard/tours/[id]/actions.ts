'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability, type StaffUser } from '@/lib/auth';
import { requireWritableDb, type Db } from '@/lib/supabase';
import { recordAudit, diff } from '@/lib/audit';
import {
  cents, checkbox, explain, fail, integer, nullable, ok, text, type ActionResult,
} from '@/lib/actions';
import { slugify } from '@/lib/admin/packages';
import type { TablesInsert } from '@/lib/database.types';

/**
 * Editing one tour.
 *
 * Child collections — itinerary days, rooms, extras, custom fields — are saved
 * whole rather than row by row, because that is how they are edited: a list you
 * reorder and prune, submitted once. But "saved whole" is done by reconciling
 * against the rows already there, not by deleting everything and re-inserting.
 * Those ids are referenced from bookings that have already happened, and
 * throwing them away would quietly detach a traveller's chosen room from the
 * room it was.
 */

/**
 * Confirm the person may edit this specific tour, and hand back the client.
 *
 * The capability check is each action's first line, outside its try: a refusal
 * is a redirect, which throws by design, and a catch would turn "you may not"
 * into "that did not save". What is left here fails like any other write.
 */
async function authorise(user: StaffUser, packageId: string): Promise<Db> {
  const db = requireWritableDb();

  if (user.can.scopedToOwnPackages) {
    const { data } = await db.from('packages').select('partner_id').eq('id', packageId).maybeSingle();
    if (!data || data.partner_id !== user.id) {
      throw new Error('That tour belongs to somebody else.');
    }
  }
  return db;
}

function touch() {
  return { updated_at: new Date().toISOString() };
}

/**
 * The ids of one child list's rows on this tour.
 *
 * `authorise` proves the person may edit this tour; it proves nothing about
 * the child ids in the form, and an update keyed on another tour's day or room
 * would move that row into this tour — the row's new `package_id` travels in
 * the update. So the ids the form names are checked against this list before
 * anything is written, and every update is pinned to the tour as well.
 */
async function childIds(
  db: Db,
  table: 'room_types' | 'package_extras' | 'package_custom_fields',
  packageId: string
): Promise<Set<string>> {
  const { data, error } = await db.from(table).select('id').eq('package_id', packageId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.id));
}

/**
 * Whether every row the form will write names one of this tour's own ids, and
 * none twice. Rows with no name are skipped, exactly as the save loops skip
 * them; rows with no id are new.
 */
function ownsEvery(ids: string[], names: string[], own: Set<string>): boolean {
  const seen = new Set<string>();
  for (let i = 0; i < names.length; i++) {
    if (!names[i] || !ids[i]) continue;
    if (!own.has(ids[i]) || seen.has(ids[i])) return false;
    seen.add(ids[i]);
  }
  return true;
}

/** What the person sees when the form names a row that is not this tour's. */
const STALE_FORM =
  'Something on this page has changed since it was opened, so nothing was saved. Reload it and try again.';

// ─── Basics ───────────────────────────────────────────────────────────────

export async function saveBasicsAction(
  packageId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('managePackages');
  try {
    const db = await authorise(user, packageId);

    const title = text(form.get('title'));
    if (!title) return fail('A tour needs a title.', { title: 'Required' });

    const slug = slugify(text(form.get('slug')) || title);
    if (!slug) return fail('That needs a usable web address.', { slug: 'Required' });

    const next = {
      title,
      slug,
      summary: nullable(form.get('summary')),
      overview: nullable(form.get('overview')),
      destination_id: nullable(form.get('destination_id')),
      category_id: nullable(form.get('category_id')),
      // Comma-separated in the form; an array in the database. Blank entries
      // dropped so a trailing comma does not create an empty tag.
      tags: text(form.get('tags')).split(',').map((t) => t.trim()).filter(Boolean),
      duration_days: integer(form.get('duration_days')) || null,
      duration_nights: integer(form.get('duration_nights')) || null,
      duration_label: nullable(form.get('duration_label')),
      hero_image: nullable(form.get('hero_image')),
      gallery: text(form.get('gallery')).split('\n').map((g) => g.trim()).filter(Boolean),
      meeting_point: nullable(form.get('meeting_point')),
      minimum_age: integer(form.get('minimum_age')) || null,
      physical_rating: nullable(form.get('physical_rating')),
      what_to_bring: nullable(form.get('what_to_bring')),
      meta_title: nullable(form.get('meta_title')),
      meta_description: nullable(form.get('meta_description')),
      is_featured: checkbox(form.get('is_featured')),
      ...touch(),
    };

    const { data: before } = await db.from('packages').select('*').eq('id', packageId).maybeSingle();
    const { error } = await db.from('packages').update(next).eq('id', packageId);
    if (error) throw error;

    const changed = before ? diff(before as Record<string, unknown>, next) : null;
    if (changed) {
      await recordAudit(db, user, {
        entity: 'packages', entityId: packageId, action: 'update',
        before: changed.before, after: changed.after,
        summary: `${title}: ${Object.keys(changed.after).join(', ')}`,
      });
    }

    revalidatePath(`/dashboard/tours/${packageId}`);
    return ok(undefined, changed ? 'Saved.' : 'Nothing had changed.');
  } catch (e) {
    return fail(explain(e));
  }
}

// ─── Pricing ──────────────────────────────────────────────────────────────

export async function savePricingAction(
  packageId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('managePackages');
  try {
    const db = await authorise(user, packageId);
    // Exhibit A denies the Agent role pricing. Enforced on the action, not
    // merely by hiding the tab.
    if (!user.can.setPricing) return fail('Your role cannot set prices.');

    const depositType = text(form.get('deposit_type')) || 'none';
    const depositValue =
      depositType === 'percent' ? integer(form.get('deposit_percent')) : cents(form.get('deposit_amount'));

    if (depositType === 'percent' && (depositValue < 0 || depositValue > 100)) {
      return fail('A deposit percentage has to sit between 0 and 100.', { deposit_percent: 'Out of range' });
    }

    const next = {
      currency: text(form.get('currency')) || 'CAD',
      base_price_cents: cents(form.get('base_price')),
      child_price_cents: text(form.get('child_price')) === '' ? null : cents(form.get('child_price')),
      infant_price_cents: text(form.get('infant_price')) === '' ? null : cents(form.get('infant_price')),
      single_supplement_cents: cents(form.get('single_supplement')),
      deposit_type: depositType,
      deposit_value: depositValue,
      balance_due_days_before: integer(form.get('balance_due_days_before'), 30),
      cancellation_policy_id: nullable(form.get('cancellation_policy_id')),
      ...touch(),
    };

    const { data: before } = await db.from('packages').select('*').eq('id', packageId).maybeSingle();
    const { error } = await db.from('packages').update(next).eq('id', packageId);
    if (error) throw error;

    // Per-currency prices. Empiria charges in the currency being browsed and
    // never converts, so a currency with no row here simply is not for sale in
    // that currency — which is a decision, not a gap.
    const codes = form.getAll('price_currency').map((c) => text(c));
    const rows = codes
      .map((code, i) => ({
        package_id: packageId,
        currency: code,
        base_price_cents: cents(form.getAll('price_base')[i]),
        child_price_cents:
          text(form.getAll('price_child')[i]) === '' ? null : cents(form.getAll('price_child')[i]),
        infant_price_cents:
          text(form.getAll('price_infant')[i]) === '' ? null : cents(form.getAll('price_infant')[i]),
        single_supplement_cents: cents(form.getAll('price_single')[i]),
      }))
      .filter((r) => r.currency && r.base_price_cents > 0);

    const { error: priceError } = await db
      .from('package_prices')
      .upsert(rows, { onConflict: 'package_id,currency' });
    if (priceError) throw priceError;

    // Remove any currency the person cleared out.
    const keep = rows.map((r) => r.currency);
    let del = db.from('package_prices').delete().eq('package_id', packageId);
    if (keep.length) del = del.not('currency', 'in', `(${keep.join(',')})`);
    await del;

    const changed = before ? diff(before as Record<string, unknown>, next) : null;
    await recordAudit(db, user, {
      entity: 'packages', entityId: packageId, action: 'update',
      before: changed?.before, after: changed?.after ?? next,
      summary: `Pricing updated (${rows.length} ${rows.length === 1 ? 'currency' : 'currencies'})`,
    });

    revalidatePath(`/dashboard/tours/${packageId}/pricing`);
    return ok(undefined, 'Pricing saved.');
  } catch (e) {
    return fail(explain(e));
  }
}

// ─── Itinerary and inclusions ─────────────────────────────────────────────

export async function saveItineraryAction(
  packageId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('managePackages');
  try {
    const db = await authorise(user, packageId);

    const ids = form.getAll('day_id').map((v) => text(v));
    const titles = form.getAll('day_title').map((v) => text(v));
    const descriptions = form.getAll('day_description');
    const images = form.getAll('day_image');

    // Where each of this tour's days sits now: the ids the form names are
    // checked against it, as `childIds` explains, and the renumbering below
    // needs the current positions.
    const { data: existing, error: readError } = await db
      .from('itinerary_days')
      .select('id, position')
      .eq('package_id', packageId);
    if (readError) throw readError;
    const positionOf = new Map((existing ?? []).map((d) => [d.id, d.position]));
    if (!ownsEvery(ids, titles, new Set(positionOf.keys()))) return fail(STALE_FORM);

    const days: { id: string | null; row: TablesInsert<'itinerary_days'> }[] = [];
    for (let i = 0; i < titles.length; i++) {
      if (!titles[i]) continue;
      days.push({
        id: ids[i] || null,
        row: {
          package_id: packageId,
          position: days.length + 1,
          title: titles[i],
          description: nullable(descriptions[i]),
          image: nullable(images[i]),
        },
      });
    }
    const kept = days.flatMap((d) => (d.id ? [d.id] : []));

    // `(package_id, position)` is unique and Postgres checks it row by row, so
    // writing the new order straight over the old one collides the moment a
    // day moves up or any day but the last is removed. Three steps avoid every
    // collision: removed days go first, which frees their numbers; each kept
    // day whose number changes steps aside to a temporary one below every
    // number in use; then every day is written at its final place. A save cut
    // off between the steps leaves the temporary numbers behind, and the next
    // save puts them right — they sit below everything, so they collide with
    // nothing.
    let del = db.from('itinerary_days').delete().eq('package_id', packageId);
    if (kept.length) del = del.not('id', 'in', `(${kept.join(',')})`);
    const { error: delError } = await del;
    if (delError) throw delError;

    const floor = Math.min(0, ...positionOf.values());
    let parked = 0;
    for (const day of days) {
      if (!day.id || positionOf.get(day.id) === day.row.position) continue;
      parked += 1;
      const { error } = await db
        .from('itinerary_days')
        .update({ position: floor - parked })
        .eq('id', day.id)
        .eq('package_id', packageId);
      if (error) throw error;
    }

    for (const day of days) {
      const { error } = day.id
        ? await db.from('itinerary_days').update(day.row).eq('id', day.id).eq('package_id', packageId)
        : await db.from('itinerary_days').insert(day.row);
      if (error) throw error;
    }

    // Inclusions and exclusions are two lists of plain lines with nothing
    // referencing them, so they are simply replaced.
    const included = text(form.get('included')).split('\n').map((s) => s.trim()).filter(Boolean);
    const excluded = text(form.get('excluded')).split('\n').map((s) => s.trim()).filter(Boolean);
    const { error: clearError } = await db.from('package_inclusions').delete().eq('package_id', packageId);
    if (clearError) throw clearError;
    const inclusionRows = [
      ...included.map((t, i) => ({ package_id: packageId, kind: 'included', position: i + 1, text: t })),
      ...excluded.map((t, i) => ({ package_id: packageId, kind: 'excluded', position: i + 1, text: t })),
    ];
    if (inclusionRows.length) {
      const { error } = await db.from('package_inclusions').insert(inclusionRows);
      if (error) throw error;
    }

    await recordAudit(db, user, {
      entity: 'itinerary_days', entityId: packageId, action: 'update',
      summary: `${kept.length} ${kept.length === 1 ? 'day' : 'days'}, ${included.length} included, ${excluded.length} excluded`,
    });

    revalidatePath(`/dashboard/tours/${packageId}/itinerary`);
    return ok(undefined, 'Itinerary saved.');
  } catch (e) {
    return fail(explain(e));
  }
}

// ─── Rooms, extras and custom fields ──────────────────────────────────────

export async function saveOptionsAction(
  packageId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('managePackages');
  try {
    const db = await authorise(user, packageId);
    if (!user.can.setPricing) {
      return fail('Rooms and extras carry prices, which your role cannot set.');
    }

    const roomIds = form.getAll('room_id').map((v) => text(v));
    const roomNames = form.getAll('room_name').map((v) => text(v));
    const extraIds = form.getAll('extra_id').map((v) => text(v));
    const extraNames = form.getAll('extra_name').map((v) => text(v));
    const fieldIds = form.getAll('field_id').map((v) => text(v));
    const fieldLabels = form.getAll('field_label').map((v) => text(v));

    // All three lists are checked before the first write, so a form naming
    // somebody else's row changes nothing at all rather than half the page.
    const [ownRooms, ownExtras, ownFields] = await Promise.all([
      childIds(db, 'room_types', packageId),
      childIds(db, 'package_extras', packageId),
      childIds(db, 'package_custom_fields', packageId),
    ]);
    if (
      !ownsEvery(roomIds, roomNames, ownRooms) ||
      !ownsEvery(extraIds, extraNames, ownExtras) ||
      !ownsEvery(fieldIds, fieldLabels, ownFields)
    ) {
      return fail(STALE_FORM);
    }

    // The whole form is read and checked before anything is written. A save
    // can be refused for two reasons — a booked room removed, an answered
    // question removed — and each of them used to surface halfway through,
    // after the rows above it had been written, so the page said "failed"
    // over a half-applied save.

    // ── rooms ──
    const defaultRoom = text(form.get('room_default'));
    const rooms: { id: string | null; row: TablesInsert<'room_types'> }[] = [];
    for (let i = 0; i < roomNames.length; i++) {
      if (!roomNames[i]) continue;
      rooms.push({
        id: roomIds[i] || null,
        row: {
          package_id: packageId,
          name: roomNames[i],
          description: nullable(form.getAll('room_description')[i]),
          price_adjustment_cents: cents(form.getAll('room_adjustment')[i]),
          max_occupancy: Math.max(1, integer(form.getAll('room_occupancy')[i], 2)),
          // The schema allows one default per package; the form is a radio group,
          // so this can only ever be true for one row.
          is_default: defaultRoom !== '' && defaultRoom === (roomIds[i] || `new-${i}`),
          sort_order: rooms.length,
        },
      });
    }

    // ── extras ──
    const extras: { id: string | null; row: TablesInsert<'package_extras'> }[] = [];
    for (let i = 0; i < extraNames.length; i++) {
      if (!extraNames[i]) continue;
      const capacityRaw = text(form.getAll('extra_capacity')[i]);
      extras.push({
        id: extraIds[i] || null,
        row: {
          package_id: packageId,
          name: extraNames[i],
          description: nullable(form.getAll('extra_description')[i]),
          price_cents: cents(form.getAll('extra_price')[i]),
          per: text(form.getAll('extra_per')[i]) === 'booking' ? 'booking' : 'person',
          capacity: capacityRaw === '' ? null : integer(capacityRaw),
          status: text(form.getAll('extra_status')[i]) === 'inactive' ? 'inactive' : 'active',
          sort_order: extras.length,
        },
      });
    }

    // ── custom fields ──
    const fields: { id: string | null; row: TablesInsert<'package_custom_fields'> }[] = [];
    for (let i = 0; i < fieldLabels.length; i++) {
      if (!fieldLabels[i]) continue;
      const fieldType = text(form.getAll('field_type')[i]) || 'text';
      // Choices belong to choose-one questions only: one switched to another
      // type keeps none, rather than choices nobody can see.
      const options =
        fieldType === 'dropdown'
          ? text(form.getAll('field_options')[i]).split(',').map((o) => o.trim()).filter(Boolean)
          : [];
      fields.push({
        id: fieldIds[i] || null,
        row: {
          package_id: packageId,
          key: slugify(text(form.getAll('field_key')[i]) || fieldLabels[i]).replace(/-/g, '_'),
          label: fieldLabels[i],
          field_type: fieldType,
          options: options.length ? options : null,
          is_required: form.getAll('field_required').map((v) => text(v))[i] === 'true',
          applies_to: text(form.getAll('field_applies')[i]) === 'traveller' ? 'traveller' : 'booking',
          sort_order: fields.length,
        },
      });
    }

    const removedRooms = [...ownRooms].filter((id) => !rooms.some((r) => r.id === id));
    const removedExtras = [...ownExtras].filter((id) => !extras.some((x) => x.id === id));
    const removedFields = [...ownFields].filter((id) => !fields.some((f) => f.id === id));

    // A booked room cannot be deleted. bookings.room_type_id is ON DELETE SET
    // NULL, so the delete would succeed and silently erase which room a
    // traveller paid for — the manifest would print "no room type". Rooms have
    // no retired state to fall back on, the way extras do, so it is refused.
    if (removedRooms.length) {
      const { count, error } = await db
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .in('room_type_id', removedRooms);
      if (error) throw error;
      if (count) {
        return fail(
          'One of the rooms you removed has already been booked, so it cannot be deleted — the booking would lose the room it was sold. Leave it in place.'
        );
      }
    }

    // Writes from here. Removed questions go first. custom_field_responses
    // references them ON DELETE RESTRICT, so a question somebody has already
    // answered cannot be removed — and should not be, because the answers
    // would lose their question — and as the first write, that refusal leaves
    // the page exactly as it was. Going first also frees their keys. Postgres
    // reports a RESTRICT refusal as 23001; older servers said 23503.
    if (removedFields.length) {
      const { error } = await db
        .from('package_custom_fields')
        .delete()
        .eq('package_id', packageId)
        .in('id', removedFields);
      if (error?.code === '23001' || error?.code === '23503') {
        return fail(
          'One of the questions you removed has already been answered on a booking, so it cannot be deleted. Leave it in place — travellers only see it if it is still listed.'
        );
      }
      if (error) throw error;
    }

    if (removedRooms.length) {
      const { error } = await db.from('room_types').delete().eq('package_id', packageId).in('id', removedRooms);
      if (error) throw error;
    }

    // room_types_one_default_idx allows one default per tour and Postgres
    // checks it row by row, so the old default is cleared before any room is
    // written. In form order, a default moving up the list was otherwise set
    // while the old one further down still held the flag, and the save failed.
    const chosen = rooms.find((r) => r.row.is_default);
    let unset = db.from('room_types').update({ is_default: false }).eq('package_id', packageId).eq('is_default', true);
    if (chosen?.id) unset = unset.neq('id', chosen.id);
    const { error: unsetError } = await unset;
    if (unsetError) throw unsetError;

    for (const room of rooms) {
      const { error } = room.id
        ? await db.from('room_types').update(room.row).eq('id', room.id).eq('package_id', packageId)
        : await db.from('room_types').insert(room.row);
      if (error) throw error;
    }

    // An extra that has been sold is referenced from booking_price_lines. The
    // constraint nulls that reference on delete rather than blocking, which
    // would silently detach a line on a paid booking from what it was — so a
    // removed extra is retired instead of deleted.
    if (removedExtras.length) {
      const { error } = await db
        .from('package_extras')
        .update({ status: 'inactive' })
        .eq('package_id', packageId)
        .in('id', removedExtras);
      if (error) throw error;
    }
    for (const extra of extras) {
      const { error } = extra.id
        ? await db.from('package_extras').update(extra.row).eq('id', extra.id).eq('package_id', packageId)
        : await db.from('package_extras').insert(extra.row);
      if (error) throw error;
    }

    for (const field of fields) {
      const { error } = field.id
        ? await db.from('package_custom_fields').update(field.row).eq('id', field.id).eq('package_id', packageId)
        : await db.from('package_custom_fields').insert(field.row);
      if (error) throw error;
    }

    await recordAudit(db, user, {
      entity: 'package_options', entityId: packageId, action: 'update',
      summary: `${rooms.length} rooms, ${extras.length} extras, ${fields.length} questions`,
    });

    revalidatePath(`/dashboard/tours/${packageId}/options`);
    return ok(undefined, 'Rooms, extras and questions saved.');
  } catch (e) {
    return fail(explain(e));
  }
}
