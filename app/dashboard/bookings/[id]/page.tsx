import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarRange } from 'lucide-react';
import { Badge, Card, Table } from '@/components/ui';
import { formatDateRange, formatDepartureDate, formatPrice } from '@/lib/money';
import { requireCapability } from '@/lib/auth';
import { getBookingDetail } from '@/lib/admin/bookings';
import { RESENDABLE, listEmailsForBooking } from '@/lib/admin/emails';
import { formatEmergencyContact } from '@/lib/admin/manifests';
import { ManualPaymentForm, NotesForm, ResendForm, SupplierCostForm } from './forms';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Booking · Empiria Tour Admin' };

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/**
 * One booking, in full — Exhibit A B3.
 *
 * Everything the database knows: who is travelling, the price they were shown
 * line by line, every payment attempt, and the disclosures they agreed to with
 * the exact wording snapshot. The page edits almost none of it, deliberately;
 * see actions.ts for why.
 */
export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireCapability('manageBookings');
  const { id } = await params;
  const booking = await getBookingDetail(id, user.can.scopedToOwnPackages ? user.id : null);
  const emails = booking ? await listEmailsForBooking(booking.id) : [];
  if (!booking) notFound();

  const outstanding = Math.max(booking.totalCents - booking.amountPaidCents, 0);
  const bookingLevelResponses = booking.fieldResponses.filter((r) => !r.travellerId);
  const responsesByTraveller = new Map<string, typeof booking.fieldResponses>();
  for (const r of booking.fieldResponses) {
    if (!r.travellerId) continue;
    const list = responsesByTraveller.get(r.travellerId) ?? [];
    list.push(r);
    responsesByTraveller.set(r.travellerId, list);
  }

  return (
    <>
      <div className="mb-6">
        <Link
          href="/dashboard/bookings"
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          All bookings
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">
            {booking.reference}
          </h1>
          <Badge value={booking.status} />
          {booking.cancelledAt && (
            <span className="text-[13px] text-muted-foreground">
              cancelled {dateTime(booking.cancelledAt)}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {booking.packageTitle} · {formatDateRange(booking.departureStartsOn, booking.departureEndsOn)} ·
          booked {dateTime(booking.createdAt)}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Travellers">
            <div className="divide-y divide-border">
              {booking.travellers.map((t) => {
                const extrasForT = responsesByTraveller.get(t.id) ?? [];
                return (
                  <div key={t.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium text-foreground">{t.legalName}</span>
                      <span className="text-[12px] capitalize text-muted-foreground">{t.travellerType}</span>
                      {t.isLead && (
                        <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                          Lead
                        </span>
                      )}
                      {t.dateOfBirth && (
                        <span className="text-[12px] text-muted-foreground">
                          born {formatDepartureDate(t.dateOfBirth)}
                        </span>
                      )}
                    </div>
                    <dl className="mt-1.5 space-y-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                      {t.dietaryNotes && (
                        <div><dt className="inline font-medium">Dietary: </dt><dd className="inline">{t.dietaryNotes}</dd></div>
                      )}
                      {t.accessibilityNotes && (
                        <div><dt className="inline font-medium">Accessibility: </dt><dd className="inline">{t.accessibilityNotes}</dd></div>
                      )}
                      {t.emergencyContact && (
                        <div><dt className="inline font-medium">Emergency contact: </dt><dd className="inline">{formatEmergencyContact(t.emergencyContact)}</dd></div>
                      )}
                      {extrasForT.map((r) => (
                        <div key={r.id}><dt className="inline font-medium">{r.label}: </dt><dd className="inline">{r.value}</dd></div>
                      ))}
                    </dl>
                  </div>
                );
              })}
            </div>
            {bookingLevelResponses.length > 0 && (
              <dl className="mt-4 space-y-0.5 border-t border-border pt-3 text-[12.5px] leading-relaxed text-muted-foreground">
                {bookingLevelResponses.map((r) => (
                  <div key={r.id}><dt className="inline font-medium">{r.label}: </dt><dd className="inline">{r.value}</dd></div>
                ))}
              </dl>
            )}
          </Card>

          <Card
            title="Price breakdown"
            description="Captured when the booking was made. These lines are what the traveller saw, and they never change."
          >
            <Table head={['Item', 'Qty', 'Unit', 'Amount']}>
              {booking.priceLines.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 text-foreground">{l.label}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{l.quantity}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    {formatPrice(l.unitCents, booking.currency)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-foreground">
                    {formatPrice(l.amountCents, booking.currency)}
                  </td>
                </tr>
              ))}
              <tr className="bg-secondary/40">
                <td className="px-4 py-2.5 font-semibold text-foreground" colSpan={3}>Total</td>
                <td className="px-4 py-2.5 font-semibold tabular-nums text-foreground">
                  {formatPrice(booking.totalCents, booking.currency)}
                </td>
              </tr>
            </Table>
          </Card>

          <Card
            title="Payments"
            description="Card payments are written by the Stripe webhook and nothing else. Use the form to the right only for money that arrived outside Stripe."
          >
            {booking.payments.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No payments yet.</p>
            ) : (
              <Table head={['When', 'Kind', 'Amount', 'Via', 'Reference', 'Status']}>
                {booking.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 text-muted-foreground">{dateTime(p.createdAt)}</td>
                    <td className="px-4 py-2.5 capitalize text-foreground">{p.kind}</td>
                    <td className={`px-4 py-2.5 tabular-nums ${p.amountCents < 0 ? 'text-destructive' : 'text-foreground'}`}>
                      {formatPrice(p.amountCents, p.currency)}
                    </td>
                    <td className="px-4 py-2.5 capitalize text-muted-foreground">{p.provider}</td>
                    <td className="max-w-[180px] truncate px-4 py-2.5 font-mono text-[11.5px] text-muted-foreground">
                      {p.providerRef ?? '—'}
                    </td>
                    <td className="px-4 py-2.5"><Badge value={p.status} /></td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card
            title="Acknowledgements"
            description="Part D: the disclosures agreed to at booking, with the wording exactly as shown at the time."
          >
            {booking.acknowledgements.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                None recorded. Older test bookings may predate the disclosure blocks.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {booking.acknowledgements.map((a) => (
                  <details key={a.id} className="group py-2.5 first:pt-0 last:pb-0">
                    <summary className="cursor-pointer list-none text-[13px]">
                      <span className="font-medium text-foreground">{a.label}</span>
                      <span className="ml-2 text-muted-foreground">accepted {dateTime(a.acceptedAt)}</span>
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap rounded-md bg-secondary/60 p-3 text-[12.5px] leading-relaxed text-muted-foreground">
                      {a.bodySnapshot}
                    </p>
                  </details>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Summary">
            <dl className="space-y-2.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Lead contact</dt>
                <dd className="text-right font-medium text-foreground">{booking.leadName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="max-w-[180px] truncate text-right text-foreground">{booking.leadEmail}</dd>
              </div>
              {booking.leadPhone && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="text-right text-foreground">{booking.leadPhone}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Party</dt>
                <dd className="text-right text-foreground">
                  {booking.adults} adult{booking.adults === 1 ? '' : 's'}
                  {booking.children > 0 && `, ${booking.children} child${booking.children === 1 ? '' : 'ren'}`}
                  {booking.infants > 0 && `, ${booking.infants} infant${booking.infants === 1 ? '' : 's'}`}
                </dd>
              </div>
              {booking.roomTypeName && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Room</dt>
                  <dd className="text-right text-foreground">
                    {booking.roomTypeName}
                    {booking.singleSupplement && ' · single'}
                  </dd>
                </div>
              )}
              {booking.promotionCode && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Promotion</dt>
                  <dd className="text-right font-mono text-foreground">{booking.promotionCode}</dd>
                </div>
              )}
              <div className="border-t border-border pt-2.5" />
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="text-right font-semibold tabular-nums text-foreground">
                  {formatPrice(booking.totalCents, booking.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="text-right tabular-nums text-foreground">
                  {formatPrice(booking.amountPaidCents, booking.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Outstanding</dt>
                <dd className={`text-right tabular-nums ${outstanding > 0 ? 'font-semibold text-amber-700' : 'text-muted-foreground'}`}>
                  {formatPrice(outstanding, booking.currency)}
                </dd>
              </div>
              {booking.balanceDueOn && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Balance due</dt>
                  <dd className="text-right text-foreground">{formatDepartureDate(booking.balanceDueOn)}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 border-t border-border pt-3">
              <Link
                href={`/dashboard/departures/${booking.departureId}`}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary transition-colors hover:text-[#d6420f]"
              >
                <CalendarRange size={14} aria-hidden="true" />
                Departure manifest
              </Link>
            </div>
          </Card>

          <Card title="Record an offline payment">
            <ManualPaymentForm
              bookingId={booking.id}
              currency={booking.currency}
              outstandingCents={outstanding}
            />
          </Card>

          {user.can.viewFinance && (
            <Card title="Supplier cost">
              <SupplierCostForm
                bookingId={booking.id}
                currency={booking.currency}
                supplierCostCents={booking.supplierCostCents}
              />
            </Card>
          )}

          <Card
            title="Emails"
            description="What the platform has sent about this booking, and what it actually said."
          >
            {emails.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Nothing queued yet. Messages appear here as the booking moves —
                confirmation on payment, reminders as dates approach.
              </p>
            ) : (
              <ul className="mb-4 flex flex-col divide-y divide-border">
                {emails.map((m) => (
                  <li key={m.id} className="py-2.5 first:pt-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13px] font-medium capitalize text-foreground">
                        {m.templateKey.replace(/_/g, ' ')}
                      </span>
                      <Badge value={m.status} />
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {m.sentAt
                        ? `Sent ${formatDepartureDate(m.sentAt)} to ${m.toEmail}`
                        : `Queued ${formatDepartureDate(m.createdAt)} for ${m.toEmail}`}
                      {m.attempts > 1 && ` · ${m.attempts} attempts`}
                    </p>
                    {m.subjectSnapshot && (
                      <p className="mt-0.5 text-[12px] text-foreground">{m.subjectSnapshot}</p>
                    )}
                    {m.lastError && (
                      <p className="mt-0.5 text-[12px] text-destructive">{m.lastError}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <ResendForm bookingId={booking.id} options={RESENDABLE} />
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              Nothing leaves the queue until the Resend sending domain is verified.
              A message sitting here is waiting on that, not lost.
            </p>
          </Card>

          <Card title="Notes">
            <NotesForm bookingId={booking.id} notes={booking.notesInternal} />
          </Card>
        </div>
      </div>
    </>
  );
}
