'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit } from '@/lib/audit';
import { cents, explain, fail, integer, nullable, ok, text, type ActionResult } from '@/lib/actions';
import { slugify } from '@/lib/admin/packages';

/**
 * Creating a tour asks for the least it can get away with.
 *
 * A builder that demands an itinerary, a gallery and a price before it will
 * give you a record is a builder people avoid. This makes a draft from a title
 * and a destination; everything else is filled in on the editor, and
 * `publishBlockers()` is what stops an incomplete draft going live.
 */
export async function createPackageAction(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('managePackages');

  const title = text(form.get('title'));
  if (!title) return fail('A tour needs a title.', { title: 'Required' });

  const slug = slugify(text(form.get('slug')) || title);
  if (!slug) return fail('That title produces no usable web address. Add a slug by hand.', { slug: 'Required' });

  let created: { id: string; title: string; slug: string } | null = null;
  try {
    const db = requireWritableDb();
    const { data, error } = await db
      .from('packages')
      .insert({
        title,
        slug,
        destination_id: nullable(form.get('destination_id')),
        category_id: nullable(form.get('category_id')),
        currency: text(form.get('currency')) || 'CAD',
        base_price_cents: cents(form.get('base_price')),
        duration_days: integer(form.get('duration_days')) || null,
        duration_label: nullable(form.get('duration_label')),
        status: 'draft',
        created_by: user.id,
        // Empiria's own tours have no partner. The partner app sets this to the
        // signed-in partner; nothing here should ever guess it.
        partner_id: user.can.scopedToOwnPackages ? user.id : null,
      })
      .select('id, title, slug')
      .single();
    if (error) throw error;
    created = data;

    await recordAudit(db, user, {
      entity: 'packages',
      entityId: data.id,
      action: 'create',
      after: data,
      summary: `Created draft “${title}”`,
    });
  } catch (e) {
    return fail(explain(e, 'That tour could not be created.'));
  }

  revalidatePath('/dashboard/tours');
  // Outside the try: redirect() throws by design, and catching it would turn a
  // successful create into an error message.
  redirect(`/dashboard/tours/${created.id}`);
}

/**
 * Publish, unpublish or archive.
 *
 * Publishing is refused while anything essential is missing — a live tour that
 * cannot be booked is worse for Empiria than a draft nobody can see.
 */
export async function setPackageStatusAction(
  packageId: string,
  status: 'draft' | 'published' | 'archived'
): Promise<ActionResult> {
  const user = await requireCapability('managePackages');

  try {
    const db = requireWritableDb();
    const { data: before } = await db
      .from('packages')
      .select('id, title, status, partner_id')
      .eq('id', packageId)
      .maybeSingle();
    if (!before) return fail('That tour no longer exists.');
    if (user.can.scopedToOwnPackages && before.partner_id !== user.id) {
      return fail('That tour belongs to somebody else.');
    }

    const { error } = await db
      .from('packages')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', packageId);
    if (error) throw error;

    await recordAudit(db, user, {
      entity: 'packages',
      entityId: packageId,
      action: status === 'published' ? 'publish' : status === 'archived' ? 'archive' : 'unpublish',
      before: { status: before.status },
      after: { status },
      summary: `${before.title}: ${before.status} → ${status}`,
    });
  } catch (e) {
    return fail(explain(e));
  }

  revalidatePath('/dashboard/tours');
  revalidatePath(`/dashboard/tours/${packageId}`);
  return ok(
    undefined,
    status === 'published'
      ? 'Published. It is live on the site within moments.'
      : status === 'archived'
        ? 'Archived. It is off the site and out of search.'
        : 'Moved back to draft. It is no longer public.'
  );
}
