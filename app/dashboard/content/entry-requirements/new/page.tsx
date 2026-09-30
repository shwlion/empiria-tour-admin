import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { isCountryCode } from '@/lib/countries';
import { countCommittedUpcoming, getEntrySettings } from '@/lib/admin/entryRequirements';
import EntryRequirementForm from '../EntryRequirementForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New entry requirement · Empiria Tour Admin' };

export default async function NewEntryRequirementPage({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string; passport?: string }>;
}) {
  const { destination, passport } = await searchParams;
  const [settings, committedUpcoming] = await Promise.all([getEntrySettings(), countCommittedUpcoming()]);
  return (
    <>
      <Link
        href="/dashboard/content/entry-requirements"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Entry requirements
      </Link>
      <EntryRequirementForm
        record={null}
        settings={settings}
        committedUpcoming={committedUpcoming}
        preset={{
          destination: isCountryCode(destination) ? destination : null,
          passport: isCountryCode(passport) ? passport : null,
        }}
      />
    </>
  );
}
