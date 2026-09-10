import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Slugs for blog posts.
 *
 * A near-copy of the storefront's `lib/blog.ts`, for the same reason
 * `lib/database.types.ts` exists three times: these are three separate
 * repositories and there is no shared package. What is *not* duplicated is the
 * rule that matters — a published slug may never change — because that lives in
 * a trigger from migration 0013 and both consoles inherit it whether or not
 * they remember to check.
 */

export function slugify(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return base || 'post';
}

/** The first free slug of `base`, `base-2`, `base-3`… */
export async function uniqueSlug(title: string, exceptId?: string): Promise<string> {
  const db = getSupabaseAdmin();
  const base = slugify(title);
  if (!db) return base;

  const { data } = await db.from('blog_posts').select('id, slug').like('slug', `${base}%`);
  const taken = new Set((data ?? []).filter((r) => r.id !== exceptId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Storage object paths referenced by a post — its hero and anything in the
 * body — so a hard delete can take the pictures with it.
 *
 * Only paths inside our own public bucket are returned; a URL pointing
 * anywhere else was never ours to delete.
 */
export function blogObjectPathsIn(...sources: (string | null | undefined)[]): string[] {
  const prefix = '/storage/v1/object/public/blog/';
  const found = new Set<string>();

  for (const source of sources) {
    if (!source) continue;
    for (const match of source.matchAll(/https:\/\/[^\s)"']+/g)) {
      let url: URL;
      try {
        url = new URL(match[0]);
      } catch {
        continue;
      }
      if (url.hostname !== 'supabase.co' && !url.hostname.endsWith('.supabase.co')) continue;
      if (!url.pathname.startsWith(prefix)) continue;
      const path = decodeURIComponent(url.pathname.slice(prefix.length));
      // A path that climbs out of the bucket is not one of ours either.
      if (path && !path.includes('..')) found.add(path);
    }
  }

  return [...found];
}
