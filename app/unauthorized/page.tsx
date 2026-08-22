import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export const metadata: Metadata = { title: 'No access · Empiria Tour Admin' };
export const dynamic = 'force-dynamic';

/**
 * Why somebody is not getting in.
 *
 * Four different situations end up here and they need four different next
 * steps — "you are in the wrong console" and "this server is misconfigured" are
 * not the same problem, and a single "access denied" makes the second one
 * unfindable.
 */
type Reason = { title: string; body: string; action?: { href: string; label: string } };

const REASONS: Record<string, Reason> = {
  unconfigured: {
    title: 'This console is not connected',
    body:
      'The Supabase environment variables are missing, so there is no database to sign in against. Copy .env.local.example to .env.local and fill it in with the keys from the Tours project.',
  },
  partner: {
    title: 'Partners have their own console',
    body:
      'This one manages the whole platform. Your tours, departures and bookings live in the partner dashboard, where everything is scoped to you.',
  },
  capability: {
    title: 'That section is not yours to open',
    body:
      'Your role covers the day-to-day but not pricing, financial reporting or platform settings. An administrator can change what you see.',
    action: { href: '/dashboard', label: 'Back to the overview' },
  },
};

const DEFAULT: Reason = {
  title: 'This account cannot use the admin console',
  body:
    'Signing in worked, but this account is not staff. If that is wrong, an administrator can change your role.',
};

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const copy = (reason && REASONS[reason]) || DEFAULT;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <ShieldAlert size={28} className="text-primary" aria-hidden="true" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{copy.title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{copy.body}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        {copy.action && (
          <Link
            href={copy.action.href}
            className="rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-[#d6420f]"
          >
            {copy.action.label}
          </Link>
        )}
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md border border-border px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
