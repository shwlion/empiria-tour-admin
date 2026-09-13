import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge, Card, PageHeader, Table } from '@/components/ui';
import { formatDepartureDate, formatPrice } from '@/lib/money';
import { requireCapability } from '@/lib/auth';
import { getCustomer } from '@/lib/admin/customers';
import { getSettings } from '@/lib/admin/settings';
import CustomerForm from './CustomerForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customer · Empiria Tour Admin' };

/**
 * B4 — one customer: contact details, booking history, lifetime value,
 * communication preferences.
 *
 * A registered traveller's details are editable here; a guest's are read
 * from their bookings, where they are edited. The two are told apart plainly
 * rather than by which fields happen to be disabled.
 */
export default async function CustomerPage({ params }: { params: Promise<{ key: string }> }) {
  await requireCapability('manageCustomers');
  const { key } = await params;
  const [record, settings] = await Promise.all([getCustomer(decodeURIComponent(key)), getSettings()]);
  if (!record) notFound();
  const { customer, bookings, address } = record;
  const currency = settings.defaultCurrency;
  const paidBookings = bookings.filter((b) => b.amountPaidCents > 0).length;

  return (
    <>
      <Link
        href="/dashboard/customers"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Customers
      </Link>

      <PageHeader
        title={customer.name ?? customer.email ?? 'Unnamed customer'}
        description={
          customer.registered
            ? `Account since ${customer.since ? formatDepartureDate(customer.since.slice(0, 10)) : '—'}${customer.accountStatus === 'closed' ? ' · closed' : ''}.`
            : 'Booked as a guest — no account. Their details are those of their latest booking.'
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card title="Contact details">
            {customer.registered && customer.userId && customer.accountStatus !== 'closed' ? (
              <CustomerForm customer={customer} address={address ?? {}} />
            ) : (
              <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Name</dt>
                  <dd className="font-medium text-foreground">{customer.name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="font-medium text-foreground">{customer.email ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="font-medium text-foreground">{customer.phone ?? '—'}</dd>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">
                    {customer.accountStatus === 'closed'
                      ? 'This account was closed by its owner and its profile erased; the bookings remain the record of the sale.'
                      : 'Guest details belong to each booking. Open the booking to change who it is for or where its emails go.'}
                  </p>
                </div>
              </dl>
            )}
          </Card>

          <Card title="Bookings" description={bookings.length === 0 ? 'None yet.' : `${bookings.length} in total, ${paidBookings} with money received.`}>
            {bookings.length > 0 && (
              <Table head={['Reference', 'Tour', 'Departs', 'Total', 'Paid', 'Status']}>
                {bookings.map((b) => (
                  <tr key={b.id} className="transition-colors hover:bg-secondary/50">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/bookings/${b.id}`} className="font-mono text-[13px] font-medium text-foreground hover:text-primary">
                        {b.reference}
                      </Link>
                      {b.guest && customer.registered && (
                        <div className="text-[11px] text-muted-foreground">as a guest</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">{b.packageTitle}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDepartureDate(b.departureStartsOn)}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{formatPrice(b.totalCents, b.currency)}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatPrice(b.amountPaidCents, b.currency)}</td>
                    <td className="px-4 py-3"><Badge value={b.status} /></td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card title="Lifetime value" description={`Money received across every booking, in ${currency}.`}>
            <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
              {formatPrice(customer.lifetimePaidBaseCents, currency)}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-muted-foreground">Bookings</dt>
                <dd className="font-medium tabular-nums text-foreground">{customer.bookingsCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">First booked</dt>
                <dd className="font-medium text-foreground">{customer.firstBookedAt ? formatDepartureDate(customer.firstBookedAt.slice(0, 10)) : '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last booked</dt>
                <dd className="font-medium text-foreground">{customer.lastBookedAt ? formatDepartureDate(customer.lastBookedAt.slice(0, 10)) : '—'}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Communication preferences">
            <dl className="text-[13px]">
              <dt className="text-muted-foreground">Marketing email</dt>
              <dd className="font-medium text-foreground">
                {customer.registered ? (customer.marketingOptIn ? 'Opted in' : 'Not opted in') : 'Not asked — guests are not on a mailing list'}
              </dd>
              <dt className="mt-3 text-muted-foreground">Transactional email</dt>
              <dd className="font-medium text-foreground">Always, to the address on each booking</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
