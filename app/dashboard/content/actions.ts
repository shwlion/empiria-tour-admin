'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit, diff } from '@/lib/audit';
import { checkbox, explain, fail, nullable, ok, text, type ActionResult } from '@/lib/actions';
import { PLACEMENTS } from '@/lib/admin/content';

/**
 * B6 content writes.
 *
 * All three are wording the public site renders, so all three are audited: the
 * interesting question about a disclosure is never only what it says now but
 * when it changed and who changed it.
 */

// ─── Static pages ─────────────────────────────────────────────────────────

/**
 * The slug is not editable, and is not read from the form.
 *
 * `app/terms/page.tsx` and its three siblings pass a hard-coded slug to
 * `getStaticPage()` and call `notFound()` when the row is missing. A rename
 * here would take a live page off the site and break the footer link to it,
 * with nothing in this console to suggest that had happened.
 */
export async function saveStaticPageAction(
  slug: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');

  const title = text(form.get('title'));
  const body = text(form.get('body'));
  if (!title) return fail('The page needs a title.', { title: 'Required' });
  if (!body) return fail('An empty page is worse than a missing one — it looks deliberate.', { body: 'Required' });

  const next = {
    slug,
    title,
    body,
    meta_title: nullable(form.get('meta_title')),
    meta_description: nullable(form.get('meta_description')),
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  try {
    const db = requireWritableDb();
    const { data: before } = await db.from('static_pages').select('*').eq('slug', slug).maybeSingle();

    // Upsert rather than update: one of the four required pages may have no row
    // at all, and the storefront 404s until it does.
    const { error } = await db.from('static_pages').upsert(next, { onConflict: 'slug' });
    if (error) throw error;

    const changed = before ? diff(before as Record<string, unknown>, next) : null;
    await recordAudit(db, user, {
      entity: 'static_pages',
      entityId: slug,
      action: before ? 'update' : 'create',
      before: changed?.before,
      after: changed?.after ?? next,
      summary: before ? `Edited the ${title} page` : `Created the ${title} page`,
    });

    revalidatePath('/dashboard/content/pages');
    return ok(
      undefined,
      'Saved. The public page picks this up within five minutes — it revalidates rather than rebuilding.'
    );
  } catch (e) {
    return fail(explain(e));
  }
}

// ─── Disclosure blocks ────────────────────────────────────────────────────

const VALID_PLACEMENTS = new Set(PLACEMENTS.map((p) => p.value));

export async function saveDisclosureAction(
  blockId: string | null,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');

  const name = text(form.get('name'));
  const body = text(form.get('body'));
  const slug = text(form.get('slug'));
  if (!name) return fail('The block needs a name — it is what staff see when assigning it.', { name: 'Required' });
  if (!body) return fail('The block needs wording.', { body: 'Required' });
  if (!slug) return fail('The block needs a reference.', { slug: 'Required' });

  const chosen = form
    .getAll('placement')
    .map((p) => text(p))
    .filter((p) => VALID_PLACEMENTS.has(p));

  const requiresAck = checkbox(form.get('requires_acknowledgement'));
  const status = text(form.get('status')) === 'inactive' ? 'inactive' : 'active';

  if (status === 'active' && chosen.length === 0) {
    return fail(
      'An active block assigned to no placement is shown to nobody. Either place it, or set it inactive.'
    );
  }

  try {
    const db = requireWritableDb();
    const row = {
      slug,
      name,
      body,
      requires_acknowledgement: requiresAck,
      status,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    let id = blockId;
    if (id) {
      const { data: before } = await db.from('disclosure_blocks').select('*').eq('id', id).maybeSingle();
      const { error } = await db.from('disclosure_blocks').update(row).eq('id', id);
      if (error) throw error;

      const changed = before ? diff(before as Record<string, unknown>, row) : null;
      await recordAudit(db, user, {
        entity: 'disclosure_blocks',
        entityId: id,
        action: 'update',
        before: changed?.before,
        after: changed?.after ?? row,
        // Worth spelling out in the trail, because it is the one an auditor asks
        // about: changing this text does not change what anyone already agreed
        // to. booking_acknowledgements holds its own snapshot.
        summary: `Edited the wording of “${name}”. Past acknowledgements keep the text shown at the time.`,
      });
    } else {
      const { data, error } = await db.from('disclosure_blocks').insert(row).select('id').single();
      if (error) throw error;
      id = data.id;
      await recordAudit(db, user, {
        entity: 'disclosure_blocks',
        entityId: id,
        action: 'create',
        after: row,
        summary: `Created the disclosure “${name}”`,
      });
    }

    // Placements are replaced wholesale. Nothing references a placement row —
    // acknowledgements point at the block — so there is no history to preserve.
    // Package-scoped assignments are left alone: they are made on the tour, not
    // here, and this form has no way to express them.
    const { data: existing } = await db
      .from('disclosure_placements')
      .select('id, placement, package_id')
      .eq('block_id', id);

    const globals = (existing ?? []).filter((p) => p.package_id === null);
    const toRemove = globals.filter((p) => !chosen.includes(p.placement)).map((p) => p.id);
    const have = globals.map((p) => p.placement);
    const toAdd = chosen.filter((p) => !have.includes(p));

    if (toRemove.length) {
      const { error } = await db.from('disclosure_placements').delete().in('id', toRemove);
      if (error) throw error;
    }
    if (toAdd.length) {
      const { error } = await db.from('disclosure_placements').insert(
        toAdd.map((placement, i) => ({ block_id: id, placement, package_id: null, sort_order: i }))
      );
      if (error) throw error;
    }

    revalidatePath('/dashboard/content/disclosures');
    return ok(undefined, 'Saved. Everywhere this block is placed now shows the new wording.');
  } catch (e) {
    return fail(explain(e));
  }
}

/**
 * Retire a block rather than delete it.
 *
 * `booking_acknowledgements.block_id` points here with ON DELETE SET NULL, so
 * deleting one would sever every past acknowledgement from the thing that was
 * acknowledged. The snapshot survives, but the link is what makes it findable.
 */
export async function retireDisclosureAction(blockId: string): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');
  try {
    const db = requireWritableDb();
    const { data: before } = await db
      .from('disclosure_blocks')
      .select('name, status')
      .eq('id', blockId)
      .maybeSingle();
    if (!before) return fail('That block no longer exists.');

    const { error } = await db
      .from('disclosure_blocks')
      .update({ status: 'inactive', updated_at: new Date().toISOString(), updated_by: user.id })
      .eq('id', blockId);
    if (error) throw error;

    // Take it off the site, but keep the rows so re-activating restores it.
    await db.from('disclosure_placements').delete().eq('block_id', blockId).is('package_id', null);

    await recordAudit(db, user, {
      entity: 'disclosure_blocks',
      entityId: blockId,
      action: 'unpublish',
      before: { status: before.status },
      after: { status: 'inactive' },
      summary: `Retired “${before.name}” and removed it from every placement`,
    });

    revalidatePath('/dashboard/content/disclosures');
    return ok(undefined, `“${before.name}” is retired and no longer appears anywhere.`);
  } catch (e) {
    return fail(explain(e));
  }
}

// ─── Email templates ──────────────────────────────────────────────────────

export async function saveEmailTemplateAction(
  key: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');

  const subject = text(form.get('subject'));
  const bodyHtml = text(form.get('body_html'));
  if (!subject) return fail('The email needs a subject line.', { subject: 'Required' });
  if (!bodyHtml) return fail('The email needs a body.', { body_html: 'Required' });

  const next = {
    subject,
    body_html: bodyHtml,
    body_text: nullable(form.get('body_text')),
    is_active: checkbox(form.get('is_active')),
    updated_at: new Date().toISOString(),
  };

  try {
    const db = requireWritableDb();
    const { data: before } = await db.from('email_templates').select('*').eq('key', key).maybeSingle();
    if (!before) return fail('That template does not exist.');

    const { error } = await db.from('email_templates').update(next).eq('key', key);
    if (error) throw error;

    const changed = diff(before as Record<string, unknown>, next);
    if (changed) {
      await recordAudit(db, user, {
        entity: 'email_templates',
        entityId: key,
        action: 'update',
        before: changed.before,
        after: changed.after,
        summary: `Edited the “${before.name}” email`,
      });
    }

    revalidatePath('/dashboard/content/emails');
    return ok(
      undefined,
      'Saved. Nothing sends yet — Part C is waiting on the Resend sending domain — but this is what it will send.'
    );
  } catch (e) {
    return fail(explain(e));
  }
}
