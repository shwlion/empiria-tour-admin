import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { formatDateRange, formatDepartureDate } from '@/lib/money';
import { requireCapability } from '@/lib/auth';
import { formatEmergencyContact, getManifest } from '@/lib/admin/manifests';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Manifest · Empiria Tour Admin' };

/**
 * The departure manifest — who is actually travelling on this date.
 *
 * Only bookings whose seats are committed appear (confirmed and beyond); a
 * pending_payment booking is a hold that may still evaporate. The CSV link
 * serves the same data flattened to one row per traveller, for the ground
 * operator's spreadsheet.
 */
export default async function ManifestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCapability('manageBookings');
  const { id } = await params;
  const manifest = await getManifest(id, user.can.scopedToOwnPackages ? user.id : null);
  if (!manifest) notFound();

  return (
    <>
      <Link
        href="/dashboard/departures"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        All departures
      </Link>
      <PageHeader
        title={`${manifest.packageTitle} — ${formatDepartureDate(manifest.startsOn)}`}
        description={
          `${formatDateRange(manifest.startsOn, manifest.endsOn)}` +
          (manifest.startTime ? ` · departs ${manifest.startTime.slice(0, 5)}` : '') +
          ` · ${manifest.travellerCount} traveller${manifest.travellerCount === 1 ? '' : 's'} across ` +
          `${manifest.bookings.length} booking${manifest.bookings.length === 1 ? '' : 's'} · ` +
          `${manifest.seatsBooked}/${manifest.capacity} seats booked` +
          (manifest.seatsHeld > 0 ? ` (+${manifest.seatsHeld} held)` : '')
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge value={manifest.status} />
            {manifest.bookings.length > 0 && (
              <a
                href={`/dashboard/departures/${manifest.departureId}/csv`}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
                download
              >
                <Download size={14} aria-hidden="true" />
                Download CSV
              </a>
            )}
          </div>
        }
      />

      {manifest.bookings.length === 0 ? (
        <EmptyState
          title="Nobody confirmed on this departure yet"
          description="Bookings appear here once their first payment succeeds. Unpaid bookings are visible under Bookings."
        />
      ) : (
        <div className="space-y-5">
          {manifest.bookings.map((b) => (
            <Card key={b.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Link
                    href={`/dashboard/bookings/${b.id}`}
                    className="font-mono text-[14px] font-semibold text-foreground transition-colors hover:text-primary"
                  >
                    {b.reference}
                  </Link>
                  <Badge value={b.status} />
                  <span className="text-[13px] text-muted-foreground">
                    {b.leadName} · {b.leadEmail}
                    {b.leadPhone ? ` · ${b.leadPhone}` : ''}
                  </span>
                </div>
                <div className="text-[13px] text-muted-foreground">
                  {b.roomTypeName ?? 'No room type'}
                  {b.singleSupplement && ' · single'}
                </div>
              </div>

              {b.extras.length > 0 && (
                <p className="mb-3 text-[12.5px] text-muted-foreground">
                  <span className="font-medium text-foreground">Extras: </span>
                  {b.extras
                    .map((e) => (e.quantity > 1 ? `${e.label} ×${e.quantity}` : e.label))
                    .join(', ')}
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      {['Traveller', 'Type', 'Date of birth', 'Dietary', 'Accessibility', 'Emergency contact']
                        .concat(manifest.fields.filter((f) => f.appliesTo === 'traveller').map((f) => f.label))
                        .map((h) => (
                          <th
                            key={h}
                            scope="col"
                            className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                          >
                            {h}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {b.travellers.map((t) => (
                      <tr key={t.id}>
                        <td className="px-3 py-2 font-medium text-foreground">
                          {t.legalName}
                          {t.isLead && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-widest text-primary">Lead</span>}
                        </td>
                        <td className="px-3 py-2 capitalize text-muted-foreground">{t.travellerType}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {t.dateOfBirth ? formatDepartureDate(t.dateOfBirth) : '—'}
                        </td>
                        <td className="max-w-[160px] px-3 py-2 text-muted-foreground">{t.dietaryNotes ?? '—'}</td>
                        <td className="max-w-[160px] px-3 py-2 text-muted-foreground">{t.accessibilityNotes ?? '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatEmergencyContact(t.emergencyContact) || '—'}
                        </td>
                        {manifest.fields
                          .filter((f) => f.appliesTo === 'traveller')
                          .map((f) => (
                            <td key={f.id} className="max-w-[160px] px-3 py-2 text-muted-foreground">
                              {b.travellerResponses[t.id]?.[f.id] ?? '—'}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(manifest.fields.some((f) => f.appliesTo === 'booking' && b.bookingResponses[f.id]) ||
                b.notesInternal) && (
                <dl className="mt-3 space-y-0.5 border-t border-border pt-3 text-[12.5px] leading-relaxed text-muted-foreground">
                  {manifest.fields
                    .filter((f) => f.appliesTo === 'booking' && b.bookingResponses[f.id])
                    .map((f) => (
                      <div key={f.id}>
                        <dt className="inline font-medium text-foreground">{f.label}: </dt>
                        <dd className="inline">{b.bookingResponses[f.id]}</dd>
                      </div>
                    ))}
                  {b.notesInternal && (
                    <div>
                      <dt className="inline font-medium text-foreground">Internal notes: </dt>
                      <dd className="inline">{b.notesInternal}</dd>
                    </div>
                  )}
                </dl>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
