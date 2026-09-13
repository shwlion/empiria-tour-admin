import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, Search } from 'lucide-react';
import { Badge, Button, EmptyState, PageHeader, Table } from '@/components/ui';
import { formatDepartureDate, formatPrice } from '@/lib/money';
import { requireCapability } from '@/lib/auth';
import { listCustomers } from '@/lib/admin/customers';
import { getSettings } from '@/lib/admin/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customers · Empiria Tour Admin' };

/**
 * B4 — the customer list.
 *
 * Everybody who has booked or registered, searchable by name, email or
 * phone. Open to the Agent role: this is the day-to-day desk. Lifetime value
 * is in the default currency, because a customer may have booked in two.
 */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireCapability('manageCustomers');
  const { q } = await searchParams;
  const [customers, settings] = await Promise.all([listCustomers({ q }), getSettings()]);
  const currency = settings.defaultCurrency;
  const registered = customers.filter((c) => c.registered).length;

  return (
    <>
      <PageHeader
        title="Customers"
        description={
          customers.length === 0
            ? q
              ? 'Nobody matches that search.'
              : 'Nobody yet. A customer appears here the moment they book or open an account.'
            : `${customers.length}${q ? ' matching' : ''} · ${registered} with an account · ${customers.length - registered} booked as guests.`
        }
        actions={
          <a href={`/dashboard/customers/csv${q ? `?q=${encodeURIComponent(q)}` : ''}`}>
            <Button variant="secondary">
              <Download size={14} aria-hidden="true" />
              Export CSV
            </Button>
          </a>
        }
      />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <label htmlFor="q" className="mb-1.5 block text-[13px] font-medium text-foreground">
            Search
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q ?? ''}
            placeholder="Name, email or phone"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
          />
        </div>
        <Button type="submit" variant="secondary">
          <Search size={14} aria-hidden="true" />
          Search
        </Button>
        {q && (
          <Link href="/dashboard/customers" className="py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">
            Clear
          </Link>
        )}
      </form>

      {customers.length === 0 ? (
        <EmptyState
          title={q ? 'No matching customers' : 'No customers yet'}
          description={q ? 'Try part of a name or an email address.' : 'Bookings and traveller accounts both create a customer record.'}
        />
      ) : (
        <Table head={['Customer', 'Contact', 'Bookings', `Lifetime value`, 'Last booked', 'Account']}>
          {customers.map((c) => (
            <tr key={c.key} className="transition-colors hover:bg-secondary/50">
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/customers/${encodeURIComponent(c.key)}`}
                  className="font-medium text-foreground transition-colors hover:text-primary"
                >
                  {c.name ?? c.email ?? 'Unnamed'}
                </Link>
                {c.marketingOptIn && (
                  <div className="mt-0.5 text-[12px] text-muted-foreground">Accepts marketing email</div>
                )}
              </td>
              <td className="px-4 py-3 text-[13px] text-muted-foreground">
                <div>{c.email ?? '—'}</div>
                {c.phone && <div>{c.phone}</div>}
              </td>
              <td className="px-4 py-3 tabular-nums text-foreground">{c.bookingsCount}</td>
              <td className="px-4 py-3 tabular-nums text-foreground">
                {c.lifetimePaidBaseCents > 0 ? formatPrice(c.lifetimePaidBaseCents, currency) : '—'}
              </td>
              <td className="px-4 py-3 text-[12px] text-muted-foreground">
                {c.lastBookedAt ? formatDepartureDate(c.lastBookedAt.slice(0, 10)) : 'Never'}
              </td>
              <td className="px-4 py-3">
                {c.registered ? <Badge value={c.accountStatus === 'closed' ? 'closed' : 'registered'} /> : <Badge value="guest" />}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
