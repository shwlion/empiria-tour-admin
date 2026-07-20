import TopNav from '@/components/TopNav';
import { requireRole } from '@/lib/auth';

// Gated by the admin role; pass-through in design-shell mode (no Supabase env).
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireRole('admin');
  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
