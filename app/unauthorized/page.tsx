import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <ShieldAlert size={22} />
        </div>
        <h1 className="text-lg font-bold text-foreground">No admin access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account doesn&rsquo;t have the admin role. If you think this is a mistake, contact the
          Empiria Tour team.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
            Sign out
          </button>
        </form>
        <Link href="/dashboard" className="mt-3 inline-block text-sm text-muted-foreground hover:text-foreground">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
