import TopNav from '@/components/TopNav';
import { requireStaff } from '@/lib/auth';
import { isDbWritable } from '@/lib/supabase';
import { Banner } from '@/components/ui';

/**
 * Every console route sits under this. The role check happens once, here, and
 * again inside each server action — a layout guard protects the pages, not the
 * mutations, and it is the mutations that matter.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const writable = isDbWritable();

  return (
    <div className="min-h-screen">
      <TopNav name={user.name} email={user.email} role={user.role} can={user.can} />
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
