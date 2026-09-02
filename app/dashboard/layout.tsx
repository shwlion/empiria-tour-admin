import TopNav from '@/components/TopNav';
import { requireStaff } from '@/lib/auth';
import { isDbWritable } from '@/lib/supabase';
import { countPending } from '@/lib/admin/partners';
import { Banner } from '@/components/ui';

/**
 * Every console route sits under this. The role check happens once, here, and
 * again inside each server action — a layout guard protects the pages, not the
 * mutations, and it is the mutations that matter.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const writable = isDbWritable();
  // A head-only count, so this costs one cheap round trip per page rather than
  // a list nobody asked for. Skipped entirely for an agent, who cannot open the
  // section anyway.
  const pendingPartners = user.can.manageSettings ? await countPending() : 0;

  return (
    <div className="min-h-screen">
      <TopNav
        name={user.name}
        email={user.email}
        role={user.role}
        can={user.can}
        counts={{ partners: pendingPartners }}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {!writable && (
          <Banner tone="error">
            <p className="font-medium">This console is read-only.</p>
            <p className="mt-1">
              <code className="rounded bg-black/5 px-1">SUPABASE_KEY</code> is not set, so nothing
              can be saved. Add the service-role key to <code className="rounded bg-black/5 px-1">.env.local</code> —
              see <code className="rounded bg-black/5 px-1">.env.local.example</code>.
            </p>
          </Banner>
        )}
        {children}
      </main>
    </div>
  );
}
