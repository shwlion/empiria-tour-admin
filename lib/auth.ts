import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from './supabase/config';
import { createClient } from './supabase/server';

export type Role = 'partner' | 'admin';

export interface GuardResult {
  /** The signed-in Supabase user, or null in design-shell (unconfigured) mode. */
  user: { id: string; email: string | null } | null;
  configured: boolean;
}

/**
 * Gate a dashboard tree by role, keyed on the Supabase auth UUID (`users.id`) —
 * the replacement for the shop's `auth0_id`.
 *
 * DESIGN-SHELL BEHAVIOUR: when Supabase env vars are absent this is a
 * pass-through, so the sample dashboard renders with no backend. Once
 * configured it requires a signed-in user whose `users.role` equals `role`,
 * redirecting to /login (anonymous) or /unauthorized (wrong role).
 */
export async function requireRole(role: Role): Promise<GuardResult> {
  if (!isSupabaseConfigured()) return { user: null, configured: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== role) redirect('/unauthorized');

  return { user: { id: user.id, email: user.email ?? null }, configured: true };
}
