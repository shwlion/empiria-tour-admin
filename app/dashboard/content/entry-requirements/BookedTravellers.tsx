'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { RotateCcw, Send } from 'lucide-react';
import { Badge, Banner, Button, Card, Table } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import { formatDepartureDate } from '@/lib/money';
import { countryName } from '@/lib/countries';
import {
  CHANGE_TEMPLATE,
  noticeStatus,
  type BookedTraveller,
  type EntryRequirementRecord,
} from '@/lib/admin/entryRequirements';
import { notifyEntryRequirementAction, retryFailedNoticesAction } from './actions';

/**
 * The manual s.37 channel (spec §6): every booking advised for this row's
 * destination and passport that is still going, what it was shown, and where
 * its notice stands. Until the send run is scheduled and the change email is
 * on, nothing goes out, and this is the list staff contact by hand. Contact
 * made by hand is not recorded here.
 */
export default function BookedTravellers({
  record,
  rows,
  messages,
  error,
  templateReady,
}: {
  record: EntryRequirementRecord;
  rows: BookedTraveller[];
  /** Outbox status by dedupe key, for the current revision's notices. */
  messages: Record<string, string>;
  error: string | null;
  /** Whether the change email is on and written; null when unknown. */
  templateReady: boolean | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const statuses = rows.map((r) => noticeStatus(r, r.noticeKey ? messages[r.noticeKey] : undefined));
  // Advised under older wording, or under the other-passport text.
  const older = rows.filter((r) => !r.sawCurrent).length;
  // …of whom some have no notice coming under the current revision.
  const uncovered = rows.filter((r) => !r.sawCurrent && !r.noticeDue).length;
  const failed = statuses.filter((s) => s === 'failed').length;
  const destination = countryName(record.destinationCountry) ?? record.destinationCountry;
  const passport = countryName(record.passportCountry) ?? record.passportCountry;

  const run = (action: () => Promise<ActionResult>) => {
    setResult(null);
    startTransition(async () => setResult(await action()));
  };

  return (
    <Card
      title="Booked travellers"
      description={`Upcoming bookings advised for ${destination} on a ${passport} passport, including those shown the other-passport text before this row existed.`}
    >
      {result && <Banner tone={result.ok ? 'success' : 'error'}>{result.message}</Banner>}

      {templateReady === false && (
        <Banner tone="info">
          Notices wait until the{' '}
          <Link href={`/dashboard/content/emails/${CHANGE_TEMPLATE}`} className="font-medium underline underline-offset-2">
            “Entry requirements changed” email
          </Link>{' '}
          is written and switched on. Until then, contact the travellers below by hand.
        </Banner>
      )}

      {error ? (
        <Banner tone="error">The booked travellers could not be loaded just now: {error}</Banner>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No upcoming booking was advised for this destination and passport.</p>
      ) : (
        <Table head={['Booking', 'Lead', 'Departs', 'Passport from', 'Shown', 'Notice']}>
          {rows.map((r, i) => (
            <tr key={r.bookingId}>
              <td className="px-4 py-3">
                <Link href={`/dashboard/bookings/${r.bookingId}`} className="font-mono text-[12px] font-medium text-foreground hover:text-primary">
                  {r.reference}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span className="block text-foreground">{r.leadName}</span>
                <span className="block text-[12px] text-muted-foreground">{r.leadEmail}</span>
              </td>
              <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatDepartureDate(r.startsOn)}</td>
              <td className="px-4 py-3 text-muted-foreground">{r.passportSource === 'profile' ? 'Profile' : 'Default'}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {r.sawCurrent
                  ? 'This version'
                  : r.advisedVersion !== null
                    ? `An earlier one (version ${r.advisedVersion})`
                    : 'None — the other-passport text'}
              </td>
              <td className="px-4 py-3">{statuses[i] === 'none' ? <span className="text-muted-foreground">—</span> : <Badge value={statuses[i]} />}</td>
            </tr>
          ))}
        </Table>
      )}

      {!error && record.status === 'active' && (uncovered > 0 || failed > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {uncovered > 0 && (
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Record a notice? All ${older} booked ${older === 1 ? 'traveller' : 'travellers'} advised under older wording will be sent the current wording by the next send run, including any already sent an earlier notice.`)) return;
                run(() => notifyEntryRequirementAction(record.id));
              }}
            >
              <Send size={14} aria-hidden="true" />
              Send the current wording to the {older} booked {older === 1 ? 'traveller' : 'travellers'} advised under older wording
            </Button>
          )}
          {failed > 0 && (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => retryFailedNoticesAction(record.id))}>
              <RotateCcw size={14} aria-hidden="true" />
              Retry failed notices
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
