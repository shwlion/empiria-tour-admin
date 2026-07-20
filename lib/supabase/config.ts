/**
 * Supabase env access + a "configured" flag.
 *
 * These apps ship as design shells: with no env vars set, the auth layer becomes
 * a pass-through so the dashboard still renders. Fill `.env.local` (see
 * `.env.local.example`) to switch auth on.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
