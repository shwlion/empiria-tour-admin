import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { listDestinations } from '@/lib/admin/destinations';
import DestinationForm from '../DestinationForm';

export const metadata: Metadata = { title: 'New destination · Empiria Tour Admin' };

export default async function NewDestinationPage() {
  const all = await listDestinations();
  return (
    <>
      <Link href="/dashboard/content/destinations" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} aria-hidden="true" />
        Destinations
      </Link>
      <DestinationForm destination={null} all={all} />
    </>
  );
}
