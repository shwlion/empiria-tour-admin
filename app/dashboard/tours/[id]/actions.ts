'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability, type StaffUser } from '@/lib/auth';
import { requireWritableDb, type Db } from '@/lib/supabase';
import { recordAudit, diff } from '@/lib/audit';
import {
  cents, checkbox, explain, fail, integer, nullable, ok, text, type ActionResult,
} from '@/lib/actions';
import { slugify } from '@/lib/admin/packages';

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

/** Confirm the person may edit this specific tour, and hand back the client. */
async function authorise(packageId: string): Promise<{ db: Db; user: StaffUser }> {
  const user = await requireCapability('managePackages');
  const db = requireWritableDb();

  if (user.can.scopedToOwnPackages) {
    const { data } = await db.from('packages').select('partner_id').eq('id', packageId).maybeSingle();
    if (!data || data.partner_id !== user.id) {
      throw new Error('That tour belongs to somebody else.');
    }
  }
  return { db, user };
}

function touch() {
  return { updated_at: new Date().toISOString() };
}

// ─── Basics ───────────────────────────────────────────────────────────────

export async function saveBasicsAction(
  packageId: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  try {
    const { db, user } = await authorise(packageId);

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
  try {
    const { db, user } = await authorise(packageId);
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
  try {
    const { db, user } = await authorise(packageId);

    const ids = form.getAll('day_id').map((v) => text(v));
    const titles = form.getAll('day_title').map((v) => text(v));
    const descriptions = form.getAll('day_description');
    const images = form.getAll('day_image');

    const kept: string[] = [];
    for (let i = 0; i < titles.length; i++) {
      if (!titles[i]) continue;
      const row = {
        package_id: packageId,
        position: kept.length + 1,
        title: titles[i],
        description: nullable(descriptions[i]),
        image: nullable(images[i]),
      };
      if (ids[i]) {
        const { error } = await db.from('itinerary_days').update(row).eq('id', ids[i]);
        if (error) throw error;
        kept.push(ids[i]);
      } else {
        const { data, error } = await db.from('itinerary_days').insert(row).select('id').single();
        if (error) throw error;
        kept.push(data.id);
      }
    }

    let del = db.from('itinerary_days').delete().eq('package_id', packageId);
    if (kept.length) del = del.not('id', 'in', `(${kept.join(',')})`);
    const { error: delError } = await del;
    if (delError) throw delError;

    // Inclusions and exclusions are two lists of plain lines with nothing
    // referencing them, so they are simply replaced.
    const included = text(form.get('included')).split('\n').map((s) => s.trim()).filter(Boolean);
    const excluded = text(form.get('excluded')).split('\n').map((s) => s.trim()).filter(Boolean);
    await db.from('package_inclusions').delete().eq('package_id', packageId);
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
  try {
    const { db, user } = await authorise(packageId);
    if (!user.can.setPricing) {
      return fail('Rooms and extras carry prices, which your role cannot set.');
    }

    // ── rooms ──
    const roomIds = form.getAll('room_id').map((v) => text(v));
    const roomNames = form.getAll('room_name').map((v) => text(v));
    const defaultRoom = text(form.get('room_default'));
    const keptRooms: string[] = [];

    for (let i = 0; i < roomNames.length; i++) {
      if (!roomNames[i]) continue;
      const row = {
        package_id: packageId,
        name: roomNames[i],
        description: nullable(form.getAll('room_description')[i]),
        price_adjustment_cents: cents(form.getAll('room_adjustment')[i]),
        max_occupancy: Math.max(1, integer(form.getAll('room_occupancy')[i], 2)),
        // The schema allows one default per package; the form is a radio group,
        // so this can only ever be true for one row.
        is_default: defaultRoom !== '' && defaultRoom === (roomIds[i] || `new-${i}`),
        sort_order: keptRooms.length,
      };
      if (roomIds[i]) {
        const { error } = await db.from('room_types').update(row).eq('id', roomIds[i]);
        if (error) throw error;
        keptRooms.push(roomIds[i]);
      } else {
        const { data, error } = await db.from('room_types').insert(row).select('id').single();
        if (error) throw error;
        keptRooms.push(data.id);
      }
    }
    let delRooms = db.from('room_types').delete().eq('package_id', packageId);
    if (keptRooms.length) delRooms = delRooms.not('id', 'in', `(${keptRooms.join(',')})`);
    await delRooms;

    // ── extras ──
    const extraIds = form.getAll('extra_id').map((v) => text(v));
    const extraNames = form.getAll('extra_name').map((v) => text(v));
    const keptExtras: string[] = [];

    for (let i = 0; i < extraNames.length; i++) {
      if (!extraNames[i]) continue;
      const capacityRaw = text(form.getAll('extra_capacity')[i]);
      const row = {
        package_id: packageId,
        name: extraNames[i],
        description: nullable(form.getAll('extra_description')[i]),
        price_cents: cents(form.getAll('extra_price')[i]),
        per: text(form.getAll('extra_per')[i]) === 'booking' ? 'booking' : 'person',
        capacity: capacityRaw === '' ? null : integer(capacityRaw),
        status: text(form.getAll('extra_status')[i]) === 'inactive' ? 'inactive' : 'active',
        sort_order: keptExtras.length,
      };
      if (extraIds[i]) {
        const { error } = await db.from('package_extras').update(row).eq('id', extraIds[i]);
        if (error) throw error;
        keptExtras.push(extraIds[i]);
      } else {
        const { data, error } = await db.from('package_extras').insert(row).select('id').single();
        if (error) throw error;
        keptExtras.push(data.id);
      }
    }
    // An extra that has been sold is referenced from booking_price_lines. The
    // constraint nulls that reference on delete rather than blocking, which
    // would silently detach a line on a paid booking from what it was — so a
    // removed extra is retired instead of deleted.
    let retire = db.from('package_extras').update({ status: 'inactive' }).eq('package_id', packageId);
    if (keptExtras.length) retire = retire.not('id', 'in', `(${keptExtras.join(',')})`);
    await retire;

    // ── custom fields ──
    const fieldIds = form.getAll('field_id').map((v) => text(v));
    const fieldLabels = form.getAll('field_label').map((v) => text(v));
    const keptFields: string[] = [];

    for (let i = 0; i < fieldLabels.length; i++) {
      if (!fieldLabels[i]) continue;
      const optionsRaw = text(form.getAll('field_options')[i]);
      const row = {
        package_id: packageId,
        key: slugify(text(form.getAll('field_key')[i]) || fieldLabels[i]).replace(/-/g, '_'),
        label: fieldLabels[i],
        field_type: text(form.getAll('field_type')[i]) || 'text',
        options: optionsRaw ? optionsRaw.split(',').map((o) => o.trim()).filter(Boolean) : null,
        is_required: form.getAll('field_required').map((v) => text(v))[i] === 'true',
        applies_to: text(form.getAll('field_applies')[i]) === 'traveller' ? 'traveller' : 'booking',
        sort_order: keptFields.length,
      };
      if (fieldIds[i]) {
        const { error } = await db.from('package_custom_fields').update(row).eq('id', fieldIds[i]);
        if (error) throw error;
        keptFields.push(fieldIds[i]);
      } else {
        const { data, error } = await db.from('package_custom_fields').insert(row).select('id').single();
        if (error) throw error;
        keptFields.push(data.id);
      }
    }
    let delFields = db.from('package_custom_fields').delete().eq('package_id', packageId);
    if (keptFields.length) delFields = delFields.not('id', 'in', `(${keptFields.join(',')})`);
    const { error: fieldDeleteError } = await delFields;
    // custom_field_responses references these with ON DELETE RESTRICT, so a
    // field somebody has already answered cannot be removed — and should not
    // be, because the answers would lose their question.
    if (fieldDeleteError) {
      return fail(
        'One of the questions you removed has already been answered on a booking, so it cannot be deleted. Leave it in place — travellers only see it if it is still listed.'
      );
    }

    await recordAudit(db, user, {
      entity: 'package_options', entityId: packageId, action: 'update',
      summary: `${keptRooms.length} rooms, ${keptExtras.length} extras, ${keptFields.length} questions`,
    });

    revalidatePath(`/dashboard/tours/${packageId}/options`);
    return ok(undefined, 'Rooms, extras and questions saved.');
  } catch (e) {
    return fail(explain(e));
  }
}
