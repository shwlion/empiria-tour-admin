import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  countCommittedUpcoming,
  getEntryRequirement,
  getEntrySettings,
  listBookedTravellers,
  noticeTemplateReady,
  pairLabel,
} from '@/lib/admin/entryRequirements';
import EntryRequirementForm from '../EntryRequirementForm';
import BookedTravellers from '../BookedTravellers';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Entry requirement · Empiria Tour Admin' };

export default async function EntryRequirementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [record, settings, committedUpcoming, booked, templateReady] = await Promise.all([
    getEntryRequirement(id),
    getEntrySettings(),
    countCommittedUpcoming(),
    listBookedTravellers(id),
    noticeTemplateReady(),
  ]);
  if (!record) notFound();
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/content/entry-requirements"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Entry requirements
        </Link>
        <p className="text-[12px] text-muted-foreground">
          {pairLabel(record.destinationCountry, record.passportCountry)} · wording version {record.contentVersion}
          {record.noticeRevision > 0 && ` · ${record.noticeRevision} ${record.noticeRevision === 1 ? 'notice' : 'notices'} recorded`}
        </p>
      </div>
      <div className="flex flex-col gap-5">
        <EntryRequirementForm
          record={record}
          settings={settings}
          committedUpcoming={committedUpcoming}
          preset={{ destination: null, passport: null }}
        />
        <div className="max-w-5xl">
          <BookedTravellers
            record={record}
            rows={booked.rows}
            messages={booked.messages}
            error={booked.error}
            templateReady={templateReady}
          />
        </div>
      </div>
    </>
  );
}
