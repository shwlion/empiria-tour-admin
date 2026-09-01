import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Partner applications, from the reviewer's side.
 *
 * The interesting part of this module is what it tells the reviewer that the
 * applicant was never told: whether the email they applied with already has an
 * account here, and what kind. On the public form that would be an
 * account-enumeration oracle. Here it is the single most useful fact on the
 * page, because it decides which of two very different approvals happens —
 * promote the account that exists, or invite a new one.
 */

export const APPLICATION_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;

export type ApplicationRow = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  country: string | null;
  website: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
};

export type ExistingAccount = {
  id: string;
  role: string;
  fullName: string | null;
  createdAt: string;
};

export type ApplicationDetail = ApplicationRow & {
  phone: string | null;
  operatingRegions: string | null;
  tourTypes: string | null;
  departuresPerYear: number | null;
  message: string | null;
  reviewNote: string | null;
  reviewedByEmail: string | null;
  approvedUserId: string | null;
  /** The account already using this email, if any. Null means we would invite. */
  existingAccount: ExistingAccount | null;
};

export async function listApplications(status?: string): Promise<ApplicationRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  let q = db
    .from('partner_applications')
    .select('id, company_name, contact_name, email, country, website, status, created_at, reviewed_at')
    .order('created_at', { ascending: false });
  if (status && (APPLICATION_STATUSES as readonly string[]).includes(status)) {
    q = q.eq('status', status as 'pending');
  }
  const { data } = await q;
  return (data ?? []).map((a) => ({
    id: a.id,
    companyName: a.company_name,
    contactName: a.contact_name,
    email: a.email,
    country: a.country,
    website: a.website,
    status: a.status,
    createdAt: a.created_at,
    reviewedAt: a.reviewed_at,
  }));
}

export async function countPending(): Promise<number> {
  const db = getSupabaseAdmin();
  if (!db) return 0;
  const { count } = await db
    .from('partner_applications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count ?? 0;
}

export async function getApplication(id: string): Promise<ApplicationDetail | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data: a } = await db
    .from('partner_applications')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!a) return null;

  // Matched on the normalised address the submit function stored.
  const { data: existing } = await db
    .from('users')
    .select('id, role, full_name, created_at')
    .ilike('email', a.email)
    .maybeSingle();

  let reviewedByEmail: string | null = null;
  if (a.reviewed_by) {
    const { data: reviewer } = await db
      .from('users').select('email').eq('id', a.reviewed_by).maybeSingle();
    reviewedByEmail = reviewer?.email ?? null;
  }

  return {
    id: a.id,
    companyName: a.company_name,
    contactName: a.contact_name,
    email: a.email,
    country: a.country,
    website: a.website,
    status: a.status,
    createdAt: a.created_at,
    reviewedAt: a.reviewed_at,
    phone: a.phone,
    operatingRegions: a.operating_regions,
    tourTypes: a.tour_types,
    departuresPerYear: a.departures_per_year,
    message: a.message,
    reviewNote: a.review_note,
    reviewedByEmail,
    approvedUserId: a.approved_user_id,
    existingAccount: existing
      ? { id: existing.id, role: existing.role, fullName: existing.full_name, createdAt: existing.created_at }
      : null,
  };
}

/**
 * Whether this application can be approved at all, and what approving it means.
 *
 * Returned rather than decided in the page, so the button and the explanation
 * beside it can never disagree about which case they are in.
 */
export function approvalPlan(app: ApplicationDetail):
  | { can: true; kind: 'promote' | 'invite'; detail: string }
  | { can: false; detail: string } {
  if (app.status !== 'pending') {
    return { can: false, detail: `This application was already ${app.status}.` };
  }
  const account = app.existingAccount;
  if (!account) {
    return {
      can: true,
      kind: 'invite',
      detail:
        'No account uses this address yet. Approving creates one and emails an invitation to set a password.',
    };
  }
  if (account.role === 'admin' || account.role === 'agent') {
    return {
      can: false,
      detail:
        'This address belongs to Empiria staff. Making it a partner would leave it with no console to use — ask them to apply from a business address instead.',
    };
  }
  if (account.role === 'partner') {
    return { can: false, detail: 'This address is already a partner.' };
  }
  return {
    can: true,
    kind: 'promote',
    detail:
      'This address already has a traveller account. Approving turns that account into a partner — one account holds one role, so they will no longer see it as a traveller account.',
  };
}
