import { getSupabaseAdmin } from '@/lib/supabase';
import type { Role } from '@/lib/auth';

/**
 * Who can get into the console, and what they can do once they are in.
 *
 * B6's last piece. Until it existed the only way to make somebody an
 * administrator was a hand-written UPDATE, which made the developer a permanent
 * dependency of the client's own console.
 *
 * The guards live in the database (`set_user_role`, `set_user_status`), not
 * here. This module only decides what to *offer*, so the screen never presents
 * a control that the database will refuse — and if the two ever disagree, the
 * database wins and the screen shows why.
 */

export const STAFF_ROLES = [
  { value: 'admin' as const, label: 'Administrator', detail: 'Everything, including pricing, money and settings.' },
  { value: 'agent' as const, label: 'Agent', detail: 'Tours, departures, bookings and customers. Not pricing, finance or settings.' },
];

export type StaffRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: Role;
  status: string;
  createdAt: string;
  closedAt: string | null;
};

/** Staff only. Travellers are B4's directory, and partners have their own screen. */
export async function listStaff(): Promise<StaffRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data } = await db
    .from('users')
    .select('id, email, full_name, role, status, created_at, closed_at')
    .in('role', ['admin', 'agent'])
    .order('created_at');
  return (data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    role: u.role as Role,
    status: u.status,
    createdAt: u.created_at,
    closedAt: u.closed_at,
  }));
}

export async function countActiveAdmins(): Promise<number> {
  const db = getSupabaseAdmin();
  if (!db) return 0;
  const { count } = await db
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('status', 'active');
  return count ?? 0;
}

/**
 * What this viewer may do to this row.
 *
 * Mirrors the database's rules so the screen can grey a control and say why,
 * rather than offering it and then showing an error. The database is still the
 * thing that enforces them — this is courtesy, not security.
 */
export function permittedActions(
  row: StaffRow,
  viewerId: string,
  activeAdmins: number
): { changeRole: string | null; changeStatus: string | null } {
  if (row.id === viewerId) {
    return {
      changeRole: 'You cannot change your own role. Ask another administrator.',
      changeStatus: 'You cannot close your own account.',
    };
  }
  const lastAdmin = row.role === 'admin' && row.status === 'active' && activeAdmins <= 1;
  const why = 'This is the only active administrator. Promote somebody else first.';
  return {
    changeRole: lastAdmin ? why : null,
    changeStatus: lastAdmin ? why : null,
  };
}
