import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * The blog, from Empiria's side.
 *
 * Partners publish without review, so this list is the mitigation rather than
 * an afterthought: §2.2 makes Empiria the seller of record under its own TICO
 * registration, and a partner's false claim sits on Empiria's domain as
 * Empiria's exposure for as long as it takes somebody to notice. Newest first,
 * every author, so a new post is the first thing seen.
 *
 * See docs/BLOG.md.
 */

export type BlogStatus = 'draft' | 'published' | 'unpublished';

export type AdminBlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  heroImage: string | null;
  status: BlogStatus;
  publishedAt: string | null;
  updatedAt: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  packageId: string | null;
  destinationId: string | null;
  /** Set means an administrator took it down; the author cannot put it back. */
  unpublishedBy: string | null;
  unpublishedAt: string | null;
  unpublishReason: string | null;
};

const SELECT = `
  id, slug, title, excerpt, body, hero_image, status, published_at, updated_at,
  author_id, package_id, destination_id,
  unpublished_by, unpublished_at, unpublish_reason,
  author:users!blog_posts_author_id_fkey ( full_name, role )
`;

type Row = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  hero_image: string | null;
  status: BlogStatus;
  published_at: string | null;
  updated_at: string;
  author_id: string;
  package_id: string | null;
  destination_id: string | null;
  unpublished_by: string | null;
  unpublished_at: string | null;
  unpublish_reason: string | null;
  author: { full_name: string | null; role: string } | null;
};

function toPost(row: Row): AdminBlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    heroImage: row.hero_image,
    status: row.status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    authorId: row.author_id,
    authorName: row.author?.full_name?.trim() || 'Unnamed account',
    authorRole: row.author?.role ?? 'unknown',
    packageId: row.package_id,
    destinationId: row.destination_id,
    unpublishedBy: row.unpublished_by,
    unpublishedAt: row.unpublished_at,
    unpublishReason: row.unpublish_reason,
  };
}

/**
 * Every post by every author.
 *
 * Ordered by `updated_at` rather than `published_at`: a draft a partner is
 * working on has no publish date, and the question this list answers is "what
 * has moved", not "what is live".
 */
export async function listBlogPosts(status?: BlogStatus | 'all'): Promise<AdminBlogPost[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  let query = db.from('blog_posts').select(SELECT).order('updated_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toPost);
}

export async function getBlogPost(id: string): Promise<AdminBlogPost | null> {
  const db = getSupabaseAdmin();
  if (!db || !id) return null;
  const { data, error } = await db.from('blog_posts').select(SELECT).eq('id', id).maybeSingle();
  if (error || !data) return null;
  return toPost(data as unknown as Row);
}

/** Counts for the filter chips, so a status with nothing in it says so. */
export async function blogStatusCounts(): Promise<Record<BlogStatus | 'all', number>> {
  const empty = { all: 0, draft: 0, published: 0, unpublished: 0 };
  const db = getSupabaseAdmin();
  if (!db) return empty;
  const { data } = await db.from('blog_posts').select('status');
  if (!data) return empty;
  const counts = { ...empty, all: data.length };
  for (const row of data as { status: BlogStatus }[]) counts[row.status] += 1;
  return counts;
}

/** Tours and destinations an author can attach a post to. */
export async function blogLinkOptions(): Promise<{
  packages: { id: string; title: string }[];
  destinations: { id: string; name: string }[];
}> {
  const db = getSupabaseAdmin();
  if (!db) return { packages: [], destinations: [] };
  const [pkgs, dests] = await Promise.all([
    db.from('packages').select('id, title').eq('status', 'published').order('title'),
    db.from('destinations').select('id, name').eq('status', 'published').order('name'),
  ]);
  return {
    packages: (pkgs.data ?? []) as { id: string; title: string }[],
    destinations: (dests.data ?? []) as { id: string; name: string }[],
  };
}
