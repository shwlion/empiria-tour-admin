import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * B6 — collections and featured content for the home page.
 *
 * A collection is a curated, themed set of tours ("Island hopping") the
 * storefront shows as a row; a tour is in many collections and has one
 * category. Featured tours are the `is_featured` flag the home page's first
 * row is built from — the same flag the tour editor's checkbox sets, gathered
 * here so the whole home page is curated from one screen.
 */

export const COLLECTION_STATUSES = ['draft', 'published', 'archived'] as const;

export type CollectionRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  heroImage: string | null;
  sortOrder: number;
  status: string;
  packageCount: number;
};

export type CollectionDetail = CollectionRow & {
  /** Member package ids, in the collection's order. */
  members: string[];
};

export type PackageChoice = { id: string; title: string; status: string; isFeatured: boolean; destination: string | null };

export async function listCollections(): Promise<CollectionRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const [{ data: rows }, { data: links }] = await Promise.all([
    db.from('collections').select('id, slug, name, description, hero_image, sort_order, status').order('sort_order').order('name'),
    db.from('package_collections').select('collection_id'),
  ]);
  const counts = new Map<string, number>();
  for (const l of (links ?? []) as { collection_id: string }[]) counts.set(l.collection_id, (counts.get(l.collection_id) ?? 0) + 1);
  return ((rows ?? []) as { id: string; slug: string; name: string; description: string | null; hero_image: string | null; sort_order: number; status: string }[]).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    heroImage: c.hero_image,
    sortOrder: c.sort_order,
    status: c.status,
    packageCount: counts.get(c.id) ?? 0,
  }));
}

export async function getCollection(id: string): Promise<CollectionDetail | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data } = await db.from('collections').select('id, slug, name, description, hero_image, sort_order, status').eq('id', id).maybeSingle();
  if (!data) return null;
  const { data: links } = await db.from('package_collections').select('package_id, sort_order').eq('collection_id', id).order('sort_order');
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description,
    heroImage: data.hero_image,
    sortOrder: data.sort_order,
    status: data.status,
    packageCount: (links ?? []).length,
    members: ((links ?? []) as { package_id: string }[]).map((l) => l.package_id),
  };
}

/** Every tour that is not archived, for membership and featuring. */
export async function listPackageChoices(): Promise<PackageChoice[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data } = await db
    .from('packages')
    .select('id, title, status, is_featured, destinations ( name )')
    .neq('status', 'archived')
    .order('title');
  type Row = { id: string; title: string; status: string; is_featured: boolean; destinations: { name: string } | null };
  return ((data ?? []) as unknown as Row[]).map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    isFeatured: p.is_featured,
    destination: p.destinations?.name ?? null,
  }));
}
