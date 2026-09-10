'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff, requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit, diff } from '@/lib/audit';
import { explain, fail, nullable, ok, text, type ActionResult } from '@/lib/actions';
import { uniqueSlug, blogObjectPathsIn } from '@/lib/admin/blogSlug';
import { validateBlogImage, blogObjectPath } from '@/lib/blogUpload';

/**
 * Blog moderation and authoring, from the admin console.
 *
 * Unpublish is the primary action and delete is not, because a post that was
 * false or defamatory is a record Empiria may need *after* it is gone. Both
 * write `audit_log`: the interesting question about a takedown is never only
 * that it happened but who decided, when, and why.
 *
 * See docs/BLOG.md.
 */

const REVALIDATE = '/dashboard/content/blog';

// ─── Authoring ────────────────────────────────────────────────────────────

export async function saveBlogPostAction(
  id: string | null,
  _prev: ActionResult<{ id: string }> | null,
  form: FormData
): Promise<ActionResult<{ id: string }>> {
  const user = await requireStaff();

  const title = text(form.get('title'));
  const body = text(form.get('body'));
  if (!title) return fail('The post needs a title.', { title: 'Required' });
  if (!body) return fail('An empty post is worse than no post — it looks deliberate.', { body: 'Required' });

  try {
    const db = requireWritableDb();

    const fields = {
      title,
      body,
      excerpt: nullable(form.get('excerpt')),
      hero_image: nullable(form.get('hero_image')),
      package_id: nullable(form.get('package_id')),
      destination_id: nullable(form.get('destination_id')),
    };

    if (!id) {
      const { data, error } = await db
        .from('blog_posts')
        .insert({ ...fields, slug: await uniqueSlug(title), author_id: user.id })
        .select('id, slug')
        .single();
      if (error || !data) return fail(explain(error));

      await recordAudit(db, user, {
        entity: 'blog_post',
        entityId: data.id,
        action: 'create',
        after: { ...fields, slug: data.slug },
        summary: `Created “${title}”`,
      });
      revalidatePath(REVALIDATE);
      return ok({ id: data.id }, 'Saved as a draft.');
    }

    const { data: before } = await db.from('blog_posts').select('*').eq('id', id).maybeSingle();
    if (!before) return fail('That post no longer exists.');

    // The slug follows the title only while the post has never been published.
    // After that migration 0013's trigger refuses the change anyway; not
    // sending it means an editor sees a saved post rather than an error.
    const next: typeof fields & { slug?: string } = { ...fields };
    if (!before.published_at) next.slug = await uniqueSlug(title, id);

    const { error } = await db.from('blog_posts').update(next).eq('id', id);
    if (error) return fail(explain(error));

    const changes = diff(before as Record<string, unknown>, next);
    if (changes) {
      await recordAudit(db, user, {
        entity: 'blog_post',
        entityId: id,
        action: 'update',
        ...changes,
        summary: `Edited “${title}”`,
      });
    }
    revalidatePath(REVALIDATE);
    return ok({ id }, 'Saved.');
  } catch (error) {
    return fail(explain(error));
  }
}

// ─── Publishing ───────────────────────────────────────────────────────────

/**
 * Publishing goes through the RPC even here, where the console already knows
 * the actor is staff. The rule it enforces spans two codebases, and a second
 * path that skips it is how the rule stops being true.
 */
export async function publishBlogPostAction(id: string): Promise<ActionResult> {
  const user = await requireStaff();
  try {
    const db = requireWritableDb();
    const { data: before } = await db.from('blog_posts').select('*').eq('id', id).maybeSingle();
    if (!before) return fail('That post no longer exists.');

    const { error } = await db.rpc('publish_blog_post', { p_post: id, p_actor: user.id });
    if (error) return fail(explain(error));

    await recordAudit(db, user, {
      entity: 'blog_post',
      entityId: id,
      action: 'publish',
      before: { status: before.status },
      after: { status: 'published' },
      summary: `Published “${before.title}”`,
    });
    revalidatePath(REVALIDATE);
    return ok(undefined, 'Published.');
  } catch (error) {
    return fail(explain(error));
  }
}

/**
 * Taking a post down. A reason is required, and it is shown to the author in
 * their own editor rather than left to be guessed at.
 *
 * Admin only — `manageSettings` is the console's administrator capability.
 * An agent writes and publishes like a partner; taking somebody else's work
 * off a regulated seller's site is an administrator's decision.
 */
export async function unpublishBlogPostAction(
  id: string,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');

  const reason = text(form.get('reason'));
  if (!reason) {
    return fail('Say why. The author sees this, and so does the audit trail.', { reason: 'Required' });
  }

  try {
    const db = requireWritableDb();
    const { data: before } = await db.from('blog_posts').select('*').eq('id', id).maybeSingle();
    if (!before) return fail('That post no longer exists.');

    const { error } = await db
      .from('blog_posts')
      .update({
        status: 'unpublished',
        unpublished_by: user.id,
        unpublished_at: new Date().toISOString(),
        unpublish_reason: reason,
      })
      .eq('id', id);
    if (error) return fail(explain(error));

    await recordAudit(db, user, {
      entity: 'blog_post',
      entityId: id,
      action: 'unpublish',
      before: { status: before.status },
      after: { status: 'unpublished', unpublish_reason: reason },
      summary: `Took down “${before.title}” — ${reason}`,
    });
    revalidatePath(REVALIDATE);
    return ok(undefined, 'Taken down. The author cannot put it back.');
  } catch (error) {
    return fail(explain(error));
  }
}

/**
 * Permanent, and it takes the uploaded pictures with it.
 *
 * The audit entry keeps the whole row rather than a diff: after this runs the
 * row is the only place the post existed, and a summary line is not a record.
 */
export async function deleteBlogPostAction(id: string): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');
  try {
    const db = requireWritableDb();
    const { data: before } = await db.from('blog_posts').select('*').eq('id', id).maybeSingle();
    if (!before) return fail('That post no longer exists.');

    const objects = blogObjectPathsIn(before.hero_image, before.body);

    const { error } = await db.from('blog_posts').delete().eq('id', id);
    if (error) return fail(explain(error));

    // After the row is gone. A storage failure must not leave the post
    // standing — an orphaned object is a wasted byte, an undeleted post is the
    // thing somebody asked to be removed.
    if (objects.length) {
      const { error: storageError } = await db.storage.from('blog').remove(objects);
      if (storageError) console.error('[blog] objects left behind', objects, storageError);
    }

    await recordAudit(db, user, {
      entity: 'blog_post',
      entityId: id,
      action: 'delete',
      before,
      summary: `Deleted “${before.title}” and ${objects.length} uploaded file${objects.length === 1 ? '' : 's'}`,
    });
    revalidatePath(REVALIDATE);
    return ok(undefined, 'Deleted.');
  } catch (error) {
    return fail(explain(error));
  }
}

// ─── Uploads ──────────────────────────────────────────────────────────────

/**
 * Pictures are uploaded, never linked.
 *
 * `next.config.ts` on the storefront permits remote images from exactly one
 * host, so a pasted URL from anywhere else renders as a broken image — and
 * widening that allowlist to fix it would let any site's images appear on
 * Empiria's domain. The service role does the write; nothing grants `anon` or
 * `authenticated` insert on the bucket.
 */
export async function uploadBlogImageAction(
  _prev: ActionResult<{ url: string }> | null,
  form: FormData
): Promise<ActionResult<{ url: string }>> {
  const user = await requireStaff();

  const file = form.get('file');
  if (!(file instanceof File)) return fail('Choose a file to upload.');

  const check = await validateBlogImage(file);
  if (!check.ok) return fail(check.reason);

  try {
    const db = requireWritableDb();
    const path = blogObjectPath(user.id, check.ext);

    const { error } = await db.storage
      .from('blog')
      .upload(path, file, { contentType: check.contentType, upsert: false });
    if (error) return fail(explain(error));

    const { data } = db.storage.from('blog').getPublicUrl(path);
    return ok({ url: data.publicUrl }, 'Uploaded.');
  } catch (error) {
    return fail(explain(error));
  }
}
