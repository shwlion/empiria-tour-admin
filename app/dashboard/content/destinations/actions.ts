'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit, diff } from '@/lib/audit';
import { explain, fail, ok, text, nullable, integer, type ActionResult, type FieldErrors } from '@/lib/actions';
import { slugify } from '@/lib/admin/packages';
import { DESTINATION_STATUSES } from '@/lib/admin/destinations';

/**
 * B6 — destinations.
 *
 * The slug and the parent are the tree; they go through `move_destination`
 * so every child's path is rewritten in the same statement and no storefront
 * filter link goes dark. The rest are plain columns. A destination is
 * archived, never deleted: tours point at it (`on delete restrict`), and an
 * archive is refused while any tour still does or any child is still live —
 * the storefront's menu is built from published destinations, and a live
 * tour under an invisible place is a tour nobody can find.
 */

const PATH = '/dashboard/content/destinations';

function imageAddress(value: string): string | null {
  if (!value) return null;
  if (value.startsWith('/')) {
    try {
      const url = new URL(value, 'http://x');
      return url.origin === 'http://x' && /^\/[^/]/.test(url.pathname) ? url.pathname + url.search : null;
    } catch {
      return null;
    }
  }
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

export async function saveDestinationAction(
  id: string | null,
  _prev: ActionResult<{ id: string }> | null,
  form: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCapability('manageSettings');
    const db = requireWritableDb();

    const name = text(form.get('name'));
    const slug = slugify(text(form.get('slug')) || name);
    const parentId = nullable(form.get('parent_id'));
    const status = text(form.get('status'));
    const heroRaw = text(form.get('hero_image'));
    const heroImage = imageAddress(heroRaw);

    const fields: FieldErrors = {};
    if (!name) fields.name = 'Required';
    if (!slug) fields.slug = 'Required';
    if (!(DESTINATION_STATUSES as readonly string[]).includes(status)) fields.status = 'Choose one';
    if (heroRaw && !heroImage) fields.hero_image = 'An https address, or a path on the storefront';
    if (Object.keys(fields).length) return fail('A few things need fixing.', fields);

    const columns = {
      name,
      description: nullable(form.get('description')),
      hero_image: heroImage,
      meta_title: nullable(form.get('meta_title')),
      meta_description: nullable(form.get('meta_description')),
      status,
      sort_order: integer(form.get('sort_order'), 0),
    };

    if (!id) {
      let path = slug;
      if (parentId) {
        const { data: parent } = await db.from('destinations').select('path').eq('id', parentId).maybeSingle();
        if (!parent) return fail('That parent destination no longer exists.', { parent_id: 'Choose another' });
        path = `${parent.path}/${slug}`;
      }
      const { data, error } = await db
        .from('destinations')
        .insert({ ...columns, slug, parent_id: parentId, path })
        .select('id')
        .single();
      if (error) throw error;
      await recordAudit(db, user, { entity: 'destination', entityId: data.id, action: 'create', after: { ...columns, slug, path }, summary: `Created destination ${path}` });
      revalidatePath(PATH);
      return ok({ id: data.id }, `${name} created.`);
    }

    const { data: before } = await db
      .from('destinations')
      .select('id, parent_id, slug, name, path, description, hero_image, meta_title, meta_description, status, sort_order')
      .eq('id', id)
      .maybeSingle();
    if (!before) return fail('That destination no longer exists.');

    if (status === 'archived' && before.status !== 'archived') {
      const [{ count: tours }, { count: children }] = await Promise.all([
        db.from('packages').select('id', { count: 'exact', head: true }).eq('destination_id', id),
        db.from('destinations').select('id', { count: 'exact', head: true }).eq('parent_id', id).neq('status', 'archived'),
      ]);
      if ((tours ?? 0) > 0) return fail(`${tours} ${tours === 1 ? 'tour points' : 'tours point'} at this destination. Move them first.`, { status: 'In use' });
      if ((children ?? 0) > 0) return fail(`${children} ${children === 1 ? 'place inside it is' : 'places inside it are'} still live. Archive those first.`, { status: 'In use' });
    }

    if (slug !== before.slug || parentId !== before.parent_id) {
      const { error } = await db.rpc('move_destination', { p_id: id, p_parent: parentId, p_slug: slug } as never);
      if (error) throw error;
    }
    const { error } = await db.from('destinations').update(columns).eq('id', id);
    if (error) throw error;

    const { data: after } = await db.from('destinations').select('path').eq('id', id).maybeSingle();
    const changed = diff(
      { ...before, parent_id: before.parent_id, slug: before.slug, path: before.path } as Record<string, unknown>,
      { ...columns, parent_id: parentId, slug, path: after?.path ?? before.path }
    );
    if (changed) {
      await recordAudit(db, user, { entity: 'destination', entityId: id, action: 'update', before: changed.before, after: changed.after, summary: `Updated ${Object.keys(changed.after).join(', ')} on ${name}` });
    }
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${id}`);
    return ok({ id }, changed ? 'Saved.' : 'Nothing changed.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/cannot sit inside itself|inside one of its own|web address is|no longer exists/i.test(message)) return fail(message);
    if (/duplicate key.*destinations_path_key|duplicate key.*destinations_parent_id_slug_key/i.test(message)) {
      return fail('Another destination already has that web address under the same parent.', { slug: 'In use' });
    }
    return fail(explain(error));
  }
}
