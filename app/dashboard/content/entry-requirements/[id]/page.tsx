import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getEntryRequirement, getEntrySettings, pairLabel } from '@/lib/admin/entryRequirements';
import EntryRequirementForm from '../EntryRequirementForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Entry requirement · Empiria Tour Admin' };

export default async function EntryRequirementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [record, settings] = await Promise.all([getEntryRequirement(id), getEntrySettings()]);
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
        </p>
      </div>
      <EntryRequirementForm record={record} settings={settings} preset={{ destination: null, passport: null }} />
    </>
  );
}
