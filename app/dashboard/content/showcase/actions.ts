'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth';
import { requireWritableDb } from '@/lib/supabase';
import { recordAudit, diff } from '@/lib/audit';
import { cents, checkbox, explain, fail, ok, text, type ActionResult, type FieldErrors } from '@/lib/actions';
import { SHOWCASE_LIMITS as LIMITS } from '@/lib/admin/content';

/**
 * The landing page's postcards.
 *
 * Gated on manageSettings like the rest of the content area: the deck is the
 * first thing a visitor sees, and Exhibit A keeps what the platform says away
 * from the Agent role. Everything here is audited for the same reason the
 * disclosures are — "who swapped the hero photograph" is a question somebody
 * will ask.
 */

const PATH = '/dashboard/content/showcase';

/**
 * A photograph's address: https, or a root-relative path on the storefront.
 *
 * The seed rows point at `/showcase/….jpg` in the storefront's public folder,
 * so a bare path has to stay legal. Plain http is refused because the
 * storefront is served over https and a mixed-content image simply does not
 * load — the card would publish with a grey rectangle.
 */
function imageAddress(value: string): string | null {
  // A root-relative path is parsed the same way a storefront path is, so
  // "/\\evil.com" — which a browser folds into "//evil.com" — is refused
  // rather than stored.
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
 * A storefront path, normalised, or null.
 *
 * Parsed rather than pattern-matched: resolving against a throwaway origin
 * makes the URL parser do the work a browser would, so "//host/x",
 * "/\host/x" and "https://host" all come back with a different origin and are
 * refused, while "/tours?destination=greece" survives intact. The database's
 * own check (`^/[^/]`) is the backstop, not the message.
 */
function storefrontPath(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value, 'http://x');
  } catch {
    return null;
  }
  if (url.origin !== 'http://x') return null;
  const path = url.pathname + url.search + url.hash;
  return /^\/[^/]/.test(path) ? path : null;
}

export async function saveShowcaseCardAction(
  id: string | null,
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');

  const title = text(form.get('title'));
  const kicker = text(form.get('kicker'));
  const description = text(form.get('description'));
  const imageUrl = text(form.get('image_url'));
  const imageAlt = text(form.get('image_alt'));
  const linkUrl = text(form.get('link_url')) || '/tours';
  const status = text(form.get('status')) === 'published' ? 'published' : 'draft';

  // Migration 0021: whether a partner may buy this slot, and what it costs.
  // An empty rate is null, not zero — null falls back to the platform rate,
  // whereas zero would quote a partner nothing and read as a free card.
  const sellable = checkbox(form.get('sellable'));
  const rateRaw = text(form.get('rate_cents_per_week'));
  const rateCentsPerWeek = rateRaw === '' ? null : cents(form.get('rate_cents_per_week'));

  const fields: FieldErrors = {};
  if (!title) fields.title = 'Required';
  else if (title.length > LIMITS.title) fields.title = `At most ${LIMITS.title} characters`;
  if (kicker.length > LIMITS.kicker) fields.kicker = `At most ${LIMITS.kicker} characters`;
  if (!description) fields.description = 'Required';
  else if (description.length > LIMITS.description) fields.description = `At most ${LIMITS.description} characters`;

  const image = imageAddress(imageUrl) ?? '';
  if (!imageUrl) fields.image_url = 'Required';
  else if (!image) fields.image_url = 'An https:// address, or a path beginning with a single slash';

  const link = storefrontPath(linkUrl) ?? '';
  if (!link) fields.link_url = 'A path on the storefront, beginning with a single slash — not a full address';

  if (rateCentsPerWeek != null && rateCentsPerWeek < 0) {
    fields.rate_cents_per_week = 'Zero or more';
  }
  // A draft card cannot be sold: it is not on the landing page, so a partner
  // would be buying a slot nobody sees. Refused here rather than silently
  // unticked, because silently undoing somebody's choice is worse.
  if (sellable && status !== 'published') {
    fields.sellable = 'Publish the card first';
  }

  if (Object.keys(fields).length) return fail('Check the highlighted fields.', fields);

  const content = {
    title,
    kicker,
    description,
    image_url: image,
    image_alt: imageAlt,
    link_url: link,
    status,
    sellable,
    rate_cents_per_week: rateCentsPerWeek,
  };
  // updated_at is the trigger's job (0012); only the actor is ours to record.
  const row = { ...content, updated_by: user.id };

  try {
    const db = requireWritableDb();

    if (id) {
      const { data: before } = await db.from('showcase_cards').select('*').eq('id', id).maybeSingle();
      if (!before) return fail('That postcard no longer exists.');

      const changed = diff(before as Record<string, unknown>, content);
      if (!changed) return ok(undefined, 'Nothing changed.');

      const { error } = await db.from('showcase_cards').update(row).eq('id', id);
      if (error) throw error;

      await recordAudit(db, user, {
        entity: 'showcase_cards',
        entityId: id,
        action: 'update',
        before: changed.before,
        after: changed.after,
        summary: `Edited the “${title}” postcard`,
      });

      revalidatePath(PATH);
      return ok(
        undefined,
        status === 'published'
          ? 'Saved. The landing page shows this the next time it renders.'
          : 'Saved as a draft. Nobody sees it until it is published.'
      );
    }

    // New cards go to the end of the deck; Up moves them from there.
    const { data: last } = await db
      .from('showcase_cards')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const insert = { ...row, sort_order: (last?.sort_order ?? 0) + 1 };

    const { data, error } = await db.from('showcase_cards').insert(insert).select('id').single();
    if (error) throw error;

    await recordAudit(db, user, {
      entity: 'showcase_cards',
      entityId: data.id,
      action: 'create',
      after: insert,
      summary: `Created the “${title}” postcard${status === 'published' ? ' and published it' : ''}`,
    });

    revalidatePath(PATH);
    return ok(
      undefined,
      status === 'published'
        ? `“${title}” is on the landing page, at the end of the deck.`
        : `“${title}” is saved as a draft.`
    );
  } catch (e) {
    return fail(explain(e));
  }
}

export async function setShowcaseStatusAction(
  id: string,
  status: 'draft' | 'published'
): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');
  // A server action is a public endpoint; the type on `status` is not a check.
  if (status !== 'draft' && status !== 'published') return fail('Status must be draft or published.');
  try {
    const db = requireWritableDb();
    const { data: before } = await db
      .from('showcase_cards')
      .select('title, status')
      .eq('id', id)
      .maybeSingle();
    if (!before) return fail('That postcard no longer exists.');
    if (before.status === status) return ok(undefined, `Already ${status}.`);

    const { error } = await db
      .from('showcase_cards')
      .update({ status, updated_by: user.id })
      .eq('id', id);
    if (error) throw error;

    await recordAudit(db, user, {
      entity: 'showcase_cards',
      entityId: id,
      action: status === 'published' ? 'publish' : 'unpublish',
      before: { status: before.status },
      after: { status },
      summary: `${before.title}: ${before.status} → ${status}`,
    });

    revalidatePath(PATH);
    return ok(
      undefined,
      status === 'published'
        ? `“${before.title}” is on the landing page.`
        : `“${before.title}” is off the landing page. It is kept as a draft.`
    );
  } catch (e) {
    return fail(explain(e));
  }
}

/**
 * Swap places with the neighbour above or below.
 *
 * The deck is renumbered 1…n after the swap and only rows whose number
 * actually changes are written — two, normally. Renumbering rather than
 * swapping two values means a deck where several cards share a sort_order
 * (nothing forbids it) still ends up in the order the person asked for.
 */
export async function moveShowcaseCardAction(
  id: string,
  direction: 'up' | 'down'
): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');
  if (direction !== 'up' && direction !== 'down') return fail('Direction must be up or down.');
  try {
    const db = requireWritableDb();
    const { data: cards } = await db
      .from('showcase_cards')
      .select('id, title, sort_order')
      .order('sort_order')
      .order('created_at');
    const deck = cards ?? [];

    const from = deck.findIndex((c) => c.id === id);
    if (from === -1) return fail('That postcard no longer exists.');
    const to = direction === 'up' ? from - 1 : from + 1;
    if (to < 0 || to >= deck.length) return ok(undefined, 'Nothing to move.');

    const next = [...deck];
    [next[from], next[to]] = [next[to], next[from]];

    for (let i = 0; i < next.length; i++) {
      const card = next[i];
      const sortOrder = i + 1;
      if (card.sort_order === sortOrder) continue;
      const { error } = await db
        .from('showcase_cards')
        .update({ sort_order: sortOrder, updated_by: user.id })
        .eq('id', card.id);
      if (error) throw error;
    }

    await recordAudit(db, user, {
      entity: 'showcase_cards',
      entityId: id,
      action: 'update',
      before: { sort_order: deck[from].sort_order },
      after: { sort_order: to + 1 },
      summary: `Moved “${deck[from].title}” ${direction}`,
    });

    revalidatePath(PATH);
    return ok(undefined, `Moved “${deck[from].title}” ${direction}.`);
  } catch (e) {
    return fail(explain(e));
  }
}

/**
 * Deletion is real here — nothing references a postcard, so unlike a
 * disclosure block there is no history to sever. A published card is refused
 * all the same: taking something off the landing page should be a decision
 * somebody made, not a side effect of tidying up.
 */
export async function deleteShowcaseCardAction(id: string): Promise<ActionResult> {
  const user = await requireCapability('manageSettings');
  try {
    const db = requireWritableDb();
    const { data: before } = await db.from('showcase_cards').select('*').eq('id', id).maybeSingle();
    if (!before) return fail('That postcard has already gone.');
    if (before.status === 'published') {
      return fail('That postcard is on the landing page. Unpublish it first, then delete it.');
    }

    const { error } = await db.from('showcase_cards').delete().eq('id', id);
    if (error) throw error;

    await recordAudit(db, user, {
      entity: 'showcase_cards',
      entityId: id,
      action: 'delete',
      before,
      summary: `Deleted the “${before.title}” postcard`,
    });

    revalidatePath(PATH);
    return ok(undefined, `“${before.title}” is deleted.`);
  } catch (e) {
    return fail(explain(e));
  }
}
