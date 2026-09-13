'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit, diff } from '@/lib/audit';
import { explain, fail, ok, text, nullable, integer, type ActionResult, type FieldErrors } from '@/lib/actions';
import { slugify } from '@/lib/admin/packages';
import { COLLECTION_STATUSES } from '@/lib/admin/collections';

const PATH = '/dashboard/content/collections';

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

/**
 * Save a collection and reconcile its members. Membership is the set of
 * ticked tours, in the order the form listed them; rows that are no longer
 * ticked are removed, which is safe — a collection is a shelf, not a record
 * of anything a traveller agreed to.
 */
export async function saveCollectionAction(
  id: string | null,
  _prev: ActionResult<{ id: string }> | null,
  form: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCapability('manageSettings');
    const db = requireWritableDb();

    const name = text(form.get('name'));
    const slug = slugify(text(form.get('slug')) || name);
    const status = text(form.get('status'));
    const heroRaw = text(form.get('hero_image'));
    const heroImage = imageAddress(heroRaw);
    const members = form.getAll('package_id').map(String).filter(Boolean);

    const fields: FieldErrors = {};
    if (!name) fields.name = 'Required';
    if (!slug) fields.slug = 'Required';
    if (!(COLLECTION_STATUSES as readonly string[]).includes(status)) fields.status = 'Choose one';
    if (heroRaw && !heroImage) fields.hero_image = 'An https address, or a path on the storefront';
    if (Object.keys(fields).length) return fail('A few things need fixing.', fields);

    const columns = {
      name,
      slug,
      description: nullable(form.get('description')),
      hero_image: heroImage,
      status,
      sort_order: integer(form.get('sort_order'), 0),
    };

    let collectionId = id;
    let before: Record<string, unknown> | null = null;
    if (!collectionId) {
      const { data, error } = await db.from('collections').insert(columns).select('id').single();
      if (error) throw error;
      collectionId = data.id;
    } else {
      const { data } = await db.from('collections').select('slug, name, description, hero_image, status, sort_order').eq('id', collectionId).maybeSingle();
      if (!data) return fail('That collection no longer exists.');
      before = data as Record<string, unknown>;
      const { error } = await db.from('collections').update(columns).eq('id', collectionId);
      if (error) throw error;
    }

    // Reconcile membership: remove what is no longer ticked, upsert the rest with its order.
    const { data: existing } = await db.from('package_collections').select('package_id').eq('collection_id', collectionId);
    const had = new Set(((existing ?? []) as { package_id: string }[]).map((l) => l.package_id));
    const gone = [...had].filter((p) => !members.includes(p));
    if (gone.length) {
      const { error } = await db.from('package_collections').delete().eq('collection_id', collectionId).in('package_id', gone);
      if (error) throw error;
    }
    if (members.length) {
      const { error } = await db
        .from('package_collections')
        .upsert(members.map((package_id, i) => ({ collection_id: collectionId!, package_id, sort_order: i })), { onConflict: 'package_id,collection_id' });
      if (error) throw error;
    }

    const changedColumns = before ? diff(before, columns) : null;
    const membersChanged = gone.length > 0 || members.some((m) => !had.has(m));
    if (!before || changedColumns || membersChanged) {
      await recordAudit(db, user, {
        entity: 'collection',
        entityId: collectionId,
        action: before ? 'update' : 'create',
        before: changedColumns?.before,
        after: { ...(changedColumns?.after ?? (before ? {} : columns)), ...(membersChanged ? { members } : {}) },
        summary: before ? `Updated collection ${name}${membersChanged ? ` (${members.length} tours)` : ''}` : `Created collection ${name}`,
      });
    }

    revalidatePath(PATH);
    revalidatePath(`${PATH}/${collectionId}`);
    return ok({ id: collectionId }, before ? (changedColumns || membersChanged ? 'Saved.' : 'Nothing changed.') : `${name} created.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/duplicate key.*collections_slug_key/i.test(message)) return fail('Another collection already uses that web address.', { slug: 'In use' });
    return fail(explain(error));
  }
}

/** The home page's featured row: the ticked tours are featured, the rest are not. */
export async function setFeaturedAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireCapability('manageSettings');
    const db = requireWritableDb();
    const featured = new Set(form.getAll('featured').map(String));

    const { data: pkgs } = await db.from('packages').select('id, title, is_featured').neq('status', 'archived');
    const changes: { id: string; title: string; to: boolean }[] = [];
    for (const p of (pkgs ?? []) as { id: string; title: string; is_featured: boolean }[]) {
      const to = featured.has(p.id);
      if (to !== p.is_featured) changes.push({ id: p.id, title: p.title, to });
    }
    for (const c of changes) {
      const { error } = await db.from('packages').update({ is_featured: c.to }).eq('id', c.id);
      if (error) throw error;
      await recordAudit(db, user, {
        entity: 'package',
        entityId: c.id,
        action: 'update',
        before: { is_featured: !c.to },
        after: { is_featured: c.to },
        summary: `${c.to ? 'Featured' : 'Unfeatured'} ${c.title} on the home page`,
      });
    }
    revalidatePath(PATH);
    revalidatePath('/dashboard/tours');
    return ok(undefined, changes.length ? `Featured row updated (${changes.length} ${changes.length === 1 ? 'change' : 'changes'}).` : 'Nothing changed.');
  } catch (error) {
    return fail(explain(error));
  }
}
