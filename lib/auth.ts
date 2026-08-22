import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from './supabase/config';
import { createClient } from './supabase/server';

/**
 * Who may do what in the console.
 *
 * The role names are Exhibit A's, and migration 0002 made them the database's
 * too: traveller < partner < agent < admin. The scaffold said
 * `'partner' | 'admin'`, which no row has ever had.
 *
 * The capability split is not cosmetic. Exhibit A denies the Agent role pricing,
 * financial reporting and settings explicitly — that is a contractual boundary,
 * so it is expressed once, here, rather than re-derived at each call site where
 * one `role === 'admin'` could quietly be forgotten.
 */
export type Role = 'traveller' | 'partner' | 'agent' | 'admin';

export type Capabilities = {
  /** Create and edit packages, itineraries, rooms, extras. */
  managePackages: boolean;
  /** Set prices, deposits and promotions. Denied to Agent. */
  setPricing: boolean;
  /** Revenue, revenue share, supplier cost. Denied to Agent. */
  viewFinance: boolean;
  /** Platform settings, disclosure wording, email templates. Admin only. */
  manageSettings: boolean;
  /** Bookings, manifests, refunds. */
  manageBookings: boolean;
  /** The customer directory. */
  manageCustomers: boolean;
  /** True for partners: every query must filter on `packages.partner_id`. */
  scopedToOwnPackages: boolean;
};

const CAPABILITIES: Record<Role, Capabilities> = {
  admin: {
    managePackages: true, setPricing: true, viewFinance: true,
    manageSettings: true, manageBookings: true, manageCustomers: true,
    scopedToOwnPackages: false,
  },
  // Exhibit A: an Agent runs the day-to-day and is trusted with travellers'
  // bookings, but not with what things cost or what the platform says.
  agent: {
    managePackages: true, setPricing: false, viewFinance: false,
    manageSettings: false, manageBookings: true, manageCustomers: true,
    scopedToOwnPackages: false,
  },
  // A partner sees their own tours and the bookings on them, prices their own
  // product, and nothing else. They belong in the partner app, not this one.
  partner: {
    managePackages: true, setPricing: true, viewFinance: true,
    manageSettings: false, manageBookings: true, manageCustomers: false,
    scopedToOwnPackages: true,
  },
  traveller: {
    managePackages: false, setPricing: false, viewFinance: false,
    manageSettings: false, manageBookings: false, manageCustomers: false,
    scopedToOwnPackages: true,
  },
};

export type StaffUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  can: Capabilities;
};

/**
 * The staff member behind this request, or a redirect.
 *
 * Anonymous → /login. Signed in but not staff → /unauthorized. A partner is
 * *deliberately* refused here rather than shown a reduced console: they get
 * their own app, and half-hiding a surface is how the other half leaks.
 *
 * The scaffold let this pass straight through when Supabase was unconfigured so
 * the sample dashboard would render. That is a reasonable trick for a design
 * shell and a bad one for a console that can now write to a live database, so
 * unconfigured now refuses too — see `/unauthorized`.
 */
export async function requireStaff(): Promise<StaffUser> {
  if (!isSupabaseConfigured()) redirect('/unauthorized?reason=unconfigured');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role, full_name')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile?.role as Role | undefined) ?? 'traveller';
  if (role !== 'admin' && role !== 'agent') {
    redirect(role === 'partner' ? '/unauthorized?reason=partner' : '/unauthorized');
  }

  return {
    id: user.id,
    email: user.email ?? null,
    name: (profile as { full_name?: string | null } | null)?.full_name ?? null,
    role,
    can: CAPABILITIES[role],
  };
}

/**
 * Gate one capability. Server actions call this rather than checking a role,
 * so a new role slots into CAPABILITIES above without touching any of them.
 */
export async function requireCapability(capability: keyof Capabilities): Promise<StaffUser> {
  const user = await requireStaff();
  if (!user.can[capability]) redirect('/unauthorized?reason=capability');
  return user;
}

export function capabilitiesFor(role: Role): Capabilities {
  return CAPABILITIES[role];
}
