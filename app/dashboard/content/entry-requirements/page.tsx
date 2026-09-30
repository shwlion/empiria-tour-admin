import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge, Banner, Button, Card, EmptyState } from '@/components/ui';
import { formatDepartureDate } from '@/lib/money';
import { countryName } from '@/lib/countries';
import { REQUIREMENT_CAPTIONS } from '@/lib/entryAdvice';
import { listDestinations } from '@/lib/admin/destinations';
import { listEntryRequirements, type EntryRequirementRecord } from '@/lib/admin/entryRequirements';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Entry requirements · Empiria Tour Admin' };

const PATH = '/dashboard/content/entry-requirements';

/**
 * Entry requirements (0036), grouped by destination country: every country a
 * destination is coded with, plus any a row names. Canada's passport comes
 * first in each group, because it is TICO's online minimum and what anyone
 * without a profile country is shown.
 */
/** Canada first, then by the passport country's name. */
const byPassport = (a: EntryRequirementRecord, b: EntryRequirementRecord) =>
  Number(b.passportCountry === 'CA') - Number(a.passportCountry === 'CA') ||
  (countryName(a.passportCountry) ?? a.passportCountry).localeCompare(countryName(b.passportCountry) ?? b.passportCountry);

export default async function EntryRequirementsPage() {
  // A failed read is said out loud: an empty page here would read as "nothing
  // written", which is a different answer.
  const [loaded, destinations] = await Promise.all([
    listEntryRequirements().then(
      (rows) => ({ rows, error: null }),
      (e: unknown) => ({ rows: [] as EntryRequirementRecord[], error: (e as { message?: string } | null)?.message ?? 'unknown error' })
    ),
    listDestinations(),
  ]);
  const { rows, error: loadError } = loaded;

  const codes = new Set<string>();
  for (const d of destinations) if (d.countryCode) codes.add(d.countryCode);
  for (const r of rows) codes.add(r.destinationCountry);
  const countries = [...codes].sort((a, b) => (countryName(a) ?? a).localeCompare(countryName(b) ?? b));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-muted-foreground">
          What a traveller must arrange before arriving, for each destination country and passport. Empiria writes every
          word; the site picks the row for the traveller&rsquo;s passport and records what they were shown with the booking.
        </p>
        <Link href={`${PATH}/new`}>
          <Button>
            <Plus size={14} aria-hidden="true" />
            New row
          </Button>
        </Link>
      </div>

      {loadError && <Banner tone="error">The rows could not be loaded just now: {loadError}</Banner>}

      {countries.length === 0 ? (
        <EmptyState
          title="No destination countries yet"
          description="Give each country in Content → Destinations its code first. Every coded country gets a group here."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {countries.map((code) => {
            const group = rows.filter((r) => r.destinationCountry === code).sort(byPassport);
            const hasCanada = group.some((r) => r.passportCountry === 'CA' && r.status === 'active');
            return (
              <Card key={code} title={`${countryName(code) ?? code} (${code})`}>
                {code !== 'CA' && !hasCanada && (
                  <p className="mb-3 text-[12px] font-medium text-destructive">
                    No active row for Canadian passports — TICO&rsquo;s online minimum.
                  </p>
                )}
                {group.length === 0 ? (
                  <p className="mb-3 text-[13px] text-muted-foreground">
                    No rows yet. Every traveller sees the other-passport text from Settings.
                  </p>
                ) : (
                  <ul className="mb-3 flex flex-col divide-y divide-border">
                    {group.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <Link href={`${PATH}/${r.id}`} className="text-[13px] font-medium text-foreground transition-colors hover:text-primary">
                            {countryName(r.passportCountry) ?? r.passportCountry} passport
                          </Link>
                          <span className="ml-2 text-[12px] text-muted-foreground">{REQUIREMENT_CAPTIONS[r.requirement]}</span>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                          <span>{r.checkedOn ? `Checked ${formatDepartureDate(r.checkedOn)}` : 'Never checked'}</span>
                          <Badge value={r.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href={`${PATH}/new?destination=${code}`}>
                  <Button variant="secondary">
                    <Plus size={14} aria-hidden="true" />
                    Add a passport
                  </Button>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
