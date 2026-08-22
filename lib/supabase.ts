import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * The admin app's privileged database client.
 *
 * Every staff read and every staff write goes through this. The public
 * storefront reads under RLS as `anon`; the console does not, because Part B
 * needs to see draft packages, other people's bookings and the audit trail —
 * none of which any RLS policy exposes, by design. Migration 0002 says it
 * plainly: "No staff write policies are defined here on purpose."
 *
 * That makes the role check in `lib/auth.ts` the only thing standing between a
 * request and the whole database. It runs before anything here is touched.
 *
 * Returns null when the service-role key is absent, so the app can still be
 * opened and looked at — but every write refuses rather than silently
 * pretending, which is what `requireWritableDb()` is for.
 */
export type Db = SupabaseClient<Database>;

let cached: Db | null = null;

export function getSupabaseAdmin(): Db | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return null;

  if (!cached) {
    cached = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

export function isDbWritable(): boolean {
  return getSupabaseAdmin() !== null;
}

/**
 * The same client, but it throws instead of returning null.
 *
 * Use this in every server action. A write path that silently no-ops when the
 * key is missing is worse than one that fails: the form says "Saved", and
 * nothing was.
 */
export function requireWritableDb(): Db {
  const db = getSupabaseAdmin();
  if (!db) {
    throw new Error(
      'SUPABASE_KEY (service role) is not set — the console can be viewed but cannot save. ' +
        'Add it to .env.local; see .env.local.example.'
    );
  }
  return db;
}
