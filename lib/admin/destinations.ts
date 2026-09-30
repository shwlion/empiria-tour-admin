import { getSupabaseAdmin } from '@/lib/supabase';
import { isCountryCode } from '@/lib/countries';

/**
 * B6 — destination records: name, hero image, description, SEO fields,
 * publish state. A tree ('greece/cyclades/santorini') whose `path` the
 * storefront filters on; moves go through `move_destination` (0018) so the
 * children follow.
 */

export const DESTINATION_STATUSES = ['draft', 'published', 'archived'] as const;

export type DestinationRow = {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  path: string;
  description: string | null;
  heroImage: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  status: string;
  sortOrder: number;
  updatedAt: string;
  /** 0036: the ISO code set on this place itself, or null. */
  countryCode: string | null;
  /**
   * The nearest place above this one that has a code. A tour here with no
   * code of its own uses that one, as 0036's `package_country()` does.
   */
  coveredBy: { code: string; name: string } | null;
  /** 0 for a country, 1 for a region within it, and so on. */
  depth: number;
  /** Tours pointing at this place directly. */
  packageCount: number;
  childCount: number;
};

export type DestinationRaw = {
  id: string; parent_id: string | null; slug: string; name: string; path: string; description: string | null;
  hero_image: string | null; meta_title: string | null; meta_description: string | null; status: string;
  sort_order: number; updated_at: string; country_code: string | null;
};

export async function listDestinations(): Promise<DestinationRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const [{ data: rows }, { data: pkgs }] = await Promise.all([
    db.from('destinations').select('id, parent_id, slug, name, path, description, hero_image, meta_title, meta_description, status, sort_order, updated_at, country_code').limit(2000),
    db.from('packages').select('destination_id').not('destination_id', 'is', null).limit(10000),
  ]);
  const counts = new Map<string, number>();
  for (const p of (pkgs ?? []) as { destination_id: string | null }[]) {
    if (p.destination_id) counts.set(p.destination_id, (counts.get(p.destination_id) ?? 0) + 1);
  }
  return arrangeDestinations((rows ?? []) as DestinationRaw[], counts);
}

/**
 * Tree order — siblings by sort order then name, each followed by its
 * subtree — with each place's depth, counts and covering code. Pure, and
 * asserted in `destinations.test.ts`.
 */
export function arrangeDestinations(all: DestinationRaw[], packageCounts: Map<string, number>): DestinationRow[] {
  const children = new Map<string, number>();
  for (const r of all) if (r.parent_id) children.set(r.parent_id, (children.get(r.parent_id) ?? 0) + 1);

  const byParent = new Map<string | null, DestinationRaw[]>();
  for (const r of all) {
    const list = byParent.get(r.parent_id) ?? [];
    list.push(r);
    byParent.set(r.parent_id, list);
  }
  const out: DestinationRow[] = [];
  const walk = (parent: string | null, depth: number, cover: DestinationRow['coveredBy']) => {
    const list = (byParent.get(parent) ?? []).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    for (const r of list) {
      out.push(shape(r, depth, packageCounts.get(r.id) ?? 0, children.get(r.id) ?? 0, cover));
      // The nearest coded place at or above wins: a code here covers every
      // place inside, and a code further down overrides it for its subtree.
      walk(r.id, depth + 1, r.country_code ? { code: r.country_code, name: r.name } : cover);
    }
  };
  walk(null, 0, null);
  return out;
}

const shape = (
  r: DestinationRaw,
  depth: number,
  packageCount: number,
  childCount: number,
  coveredBy: DestinationRow['coveredBy']
): DestinationRow => ({
  id: r.id,
  parentId: r.parent_id,
  slug: r.slug,
  name: r.name,
  path: r.path,
  description: r.description,
  heroImage: r.hero_image,
  metaTitle: r.meta_title,
  metaDescription: r.meta_description,
  status: r.status,
  sortOrder: r.sort_order,
  updatedAt: r.updated_at,
  countryCode: r.country_code,
  coveredBy,
  depth,
  packageCount,
  childCount,
});

export async function getDestination(id: string): Promise<DestinationRow | null> {
  const all = await listDestinations();
  return all.find((d) => d.id === id) ?? null;
}

/** Where a destination shows on the storefront: the catalogue filtered to it. */
export const destinationStorefrontPath = (path: string) => `/tours?destination=${encodeURIComponent(path)}`;

/**
 * A country select's value. '' is "none" where none is allowed; anything else
 * must be a code on the ISO list (`lib/countries.ts`, the storefront's, copied
 * byte for byte). The database checks only the shape, `^[A-Z]{2}$`, so the
 * list is checked here. Pure, and asserted in `destinations.test.ts`.
 */
export function countryChoice(raw: string, allowNone: boolean): { ok: true; code: string | null } | { ok: false } {
  const value = raw.trim();
  if (value === '') return allowNone ? { ok: true, code: null } : { ok: false };
  return isCountryCode(value) ? { ok: true, code: value } : { ok: false };
}
